# Audit Preparation & Defense Guide — Ms. Ghostman

> **Purpose**: Canonical, item-by-item preparation guide and technical reference for the **Ms. Ghostman** project audit.
> This document provides complete, verified answers to every question in [`docs/audit.md`](audit.md), detailing the technical implementation in code, step-by-step verification commands, and Chrome DevTools defense procedures.
>
> **Verification basis**: All code references below were checked against the current `main` (`b7ea18b`) on 2026-08-04.

---

## 1. Executive Summary & Audit Readiness

### Project Identity & Core Architecture
**Ms. Ghostman** is a single-player, grid-based arcade action game built to strict modern (2026) Vanilla JavaScript standards. It strictly adheres to the following core constraints:

- **Tech Stack**: Modern Vanilla JavaScript (ES modules), HTML5, CSS3, and SVG.
- **Strict Prohibition**: Zero `<canvas>`, zero WebGL, zero rendering frameworks (React, Vue, Phaser, PixiJS).
- **Genre Alignment** ([`game-description.md`](game-description.md) header): Pac-Man-inspired maze chase (primary) with Bomberman-style bomb mechanics (secondary) — both genres appear on the pre-approved list in [`requirements.md`](requirements.md).
- **Architecture**: Data-oriented Entity Component System (ECS) with strict DOM isolation. Systems perform zero direct DOM mutations.
- **Game Loop**: `requestAnimationFrame` in `createGameRuntime` (`src/main.ecs.js`) with a fixed-step simulation accumulator. `SIMULATION_HZ = 60`, `FIXED_DT_MS = 1000/60 ≈ 16.67 ms`, catch-up clamped via `MAX_STEPS_PER_FRAME = 5` (`src/ecs/resources/constants.js:27-33`).
- **Memory & DOM Management**: Fixed object pooling for dynamic sprites (`sprite-pool-adapter.js`), recycled entity IDs, compositor-only transform animations, and a dev-mode DOM budget assertion of 500 elements (`assertDomElementBudget`, `src/main.ecs.js`).

---

## 2. Audit Execution & Verification Category Matrix

The 27 audit questions from [`docs/audit.md`](audit.md) are mapped across three execution categories per [`AGENTS.md`](../AGENTS.md):

| Execution Category | Count | Verification Strategy | Primary Test / Evidence Anchor |
|---|---|---|---|
| **Fully Automatable** | 20 (F-01…F-16, B-01…B-04) | Automated Vitest & Playwright E2E assertions | `tests/e2e/audit/audit.browser.spec.js` & `tests/e2e/audit/audit.e2e.test.js` |
| **Semi-Automatable** | 3 (F-17, F-18, B-05) | Performance API metrics sampled via Playwright `page.evaluate()` | `SEMI_AUTOMATABLE_THRESHOLDS` in `tests/e2e/audit/audit-question-map.js` + `AUDIT-F-17-F-18.performance.md` |
| **Manual-With-Evidence** | 4 (F-19, F-20, F-21, B-06) | Chrome DevTools traces & signed evidence artifacts | `docs/audit-reports/manual-evidence.manifest.json` & `docs/audit-reports/evidence/` |

Canonical assertion keys live in `tests/e2e/audit/audit-question-map.js` (e.g. `runtime-ready`, `raf-active`, `hud-contract`, `threshold-f17`).

---

## 3. Comprehensive Question-by-Question Audit & Defense Reference

---

### Functional Audit Questions (F-01 through F-21)

#### 1. AUDIT-F-01: Does the game run without crashing?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `runtime-ready`
- **Requirement Mapping**: REQ-01, REQ-14 (per `docs/implementation/audit-traceability-matrix.md:75`)
- **Defense Answer**:
  Yes. The game initializes cleanly via [`src/main.ecs.js`](../src/main.ecs.js) → `bootstrapApplication()` (`src/game/bootstrap.js`), which establishes the ECS `World`, loads level maps, registers systems in explicit execution order, and launches the `requestAnimationFrame` loop. A global `window.addEventListener('unhandledrejection')` handler (`src/main.ecs.js:436`) catches unhandled promise rejections and renders a user-visible error overlay via `renderCriticalError()` (`src/main.ecs.js:401`). Startup exceptions are routed through the same `renderCriticalError` overlay. Per-frame system errors are caught at the dispatch boundary in `src/ecs/world/world.js` (`#recordSystemFailure`, world.js:407) and quarantine the faulting system instead of crashing the loop.
- **Code Implementation**:
  - `src/main.ecs.js`: `installUnhandledRejectionHandler()` (line 436), `renderCriticalError()` (line 401), startup try/catch (line 381).
  - `src/ecs/world/world.js`: per-system try/catch dispatch boundary with quarantine (`#recordSystemFailure`, lines 407-410).
- **Verification Steps**:
  - **Automated**: Run `npm run test:audit:e2e` (asserts `runtime-ready`).
  - **Live App**: Run `npm run dev`, open `http://localhost:5173`, play for 2+ minutes, trigger explosions, move between screens. Confirm zero uncaught exceptions in browser console.

---

#### 2. AUDIT-F-02: Does animation run using RequestAnimationFrame?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `raf-active`
- **Requirement Mapping**: REQ-02
- **Defense Answer**:
  Yes. The game loop is driven exclusively by `window.requestAnimationFrame(step)` inside `createGameRuntime` in [`src/main.ecs.js`](../src/main.ecs.js). It uses high-resolution `performance.now()` timestamps to advance a fixed-step accumulator. `SIMULATION_HZ = 60` yields `FIXED_DT_MS = 1000 / 60 ≈ 16.67 ms` per step (`src/ecs/resources/constants.js:27-33`).
- **Code Implementation**:
  - `src/main.ecs.js`: `createGameRuntime()` — `scheduleFrame = window.requestAnimationFrame` and the `step()`/tick loop.
  - `src/ecs/resources/clock.js`: `tickClock(clock, now, maxStepsPerFrame, fixedDtMs)` — fixed-step accumulator, baseline resync, pause gating.
- **Verification Steps**:
  - **Automated**: `npx playwright test tests/e2e/audit/audit.browser.spec.js` (validates `raf-active`).
  - **DevTools / Live App**: Open Chrome DevTools -> Performance tab -> Record 5 seconds of play -> Observe `Animation Frame Fired` (`requestAnimationFrame`) events firing at constant 60 Hz.

---

#### 3. AUDIT-F-03: Is the game single player?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `single-player-contract`
- **Requirement Mapping**: REQ-13
- **Defense Answer**:
  Yes. The game model instantiates exactly one player entity. A single player store (`createPlayerStore`) holds exactly one `PLAYER_WITH_RENDERABLE_MASK` entity created via `world.createEntity(...)` in `syncPlayerEntityFromMap` (`src/game/bootstrap.js:558`).
- **Code Implementation**:
  - `src/game/bootstrap.js`: `syncPlayerEntityFromMap()` — single player entity creation + `createPlayerStore` resource (line 493).
  - `src/adapters/io/input-adapter.js`: Binds controls to a single keyboard player mapping (Arrow Keys / WASD, Space).
- **Verification Steps**:
  - **Automated**: `npx playwright test tests/e2e/audit/audit.browser.spec.js` (`single-player-contract`).
  - **Live App**: Inspect DOM/ECS state during play; verify only one controllable player sprite exists.

---

#### 4. AUDIT-F-04: Does the game avoid the use of canvas?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `no-canvas`
- **Requirement Mapping**: REQ-11
- **Defense Answer**:
  Yes. The game uses zero `<canvas>`, WebGL, or WebGPU APIs. All graphics, game boards, blocks, and entity sprites are rendered using standard HTML5 DOM elements (`<div>`) and inline SVG elements (`<svg>`).
- **Code Implementation**:
  - `src/adapters/dom/renderer-adapter.js`: Dynamically manages DOM container `#game-board` and tile grids.
  - `src/ecs/systems/render-dom-system.js`: Updates CSS transform attributes on dynamic sprite DOM nodes.
  - Policy Script: `scripts/policy-gate/check-forbidden.mjs` blocks any introduction of `<canvas>` tags or context calls.
- **Verification Steps**:
  - **Automated**: Run `npm run policy:forbidden` and `npx playwright test tests/e2e/audit/audit.browser.spec.js` (asserts `document.querySelectorAll('canvas').length === 0`).
  - **Live App**: Open DevTools Elements tab (`Ctrl+Shift+C`) -> Inspect board area -> Confirm structure consists of `div.board-tile` and `svg` elements, with zero canvas nodes.

---

#### 5. AUDIT-F-05: Does the game avoid the use of frameworks?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `no-framework-runtime`
- **Requirement Mapping**: REQ-12
- **Defense Answer**:
  Yes. The codebase uses modern Vanilla JavaScript (ES modules) and DOM APIs directly. No UI or rendering frameworks (React, Vue, Svelte, Phaser, PixiJS) are used.
- **Code Implementation**:
  - `package.json`: Zero production framework dependencies (`devDependencies` are strictly tooling: Vite, Vitest, Playwright, Biome, Ajv).
  - Pure native DOM methods (`document.createElement`, `element.style.transform`, `textContent`).
- **Verification Steps**:
  - **Automated**: `npm run policy:quality` checks `package.json`.
  - **Live App**: Inspect browser window object (`window.React`, `window.Vue` are `undefined`).

---

#### 6. AUDIT-F-06: Is the game chosen from the pre-approved list?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `project-identity`
- **Requirement Mapping**: REQ-14
- **Defense Answer**:
  Yes. The game is **Ms. Ghostman**, a Pac-Man-inspired maze chase (primary) with Bomberman-style bomb mechanics (secondary) — both **Pac-Man** and **Bomberman** are on the pre-approved list in [`requirements.md`](requirements.md). The full spec lives in [`docs/game-description.md`](game-description.md) and [`docs/requirements.md`](requirements.md).
- **Code Implementation**:
  - Grid-based tile map, destructible soft blocks, pellet collection, player bomb placement, cross-pattern flame explosions, ghost AI state machines, power-ups, countdown timer, scoring, and lives.
- **Verification Steps**:
  - **Automated**: `npx playwright test tests/e2e/audit/audit.browser.spec.js` (`assertionKey: 'project-identity'`).
  - **Live App**: Verify classic maze-chase + bomb-grid rules upon loading `http://localhost:5173`.

---

#### 7. AUDIT-F-07: Does the game display the pause menu, with the options: continue and restart?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `pause-controls-contract`
- **Requirement Mapping**: REQ-03, REQ-09, REQ-16
- **Defense Answer**:
  Yes. Pressing `P` (`KeyP`) or `Escape` opens the pause overlay (`data-screen="pause"`) rendering "Continue", "Settings", "High Scores", and "Restart" options (`index.html:83-94`). Keyboard focus is moved into the overlay on open and restored on close.
- **Code Implementation**:
  - `index.html`: `<section data-screen="pause">` with buttons `data-action="pause-continue"` and `data-action="pause-restart"` (lines 83-94).
  - `src/adapters/dom/screens-adapter.js`: routes `pause-continue` → `onResume`, `pause-restart` → `onRestart` (lines 252-261).
  - `src/adapters/io/input-adapter.js:54-55`: `Escape` / `KeyP` → `INPUT_INTENT.PAUSE`.
  - `src/ecs/systems/pause-system.js` + `src/game/game-flow.js`: FSM transition to `GAME_STATE.PAUSED` and overlay visibility/focus management.
- **Verification Steps**:
  - **Automated**: `npx vitest run tests/integration/adapters/screens-adapter.test.js` & `npx playwright test tests/e2e/c-05-screens-navigation.spec.js`.
  - **Live App**: Press `P` or `Escape` during play. Confirm pause modal appears with "Continue" and "Restart" buttons.

---

#### 8. AUDIT-F-08: Does continue resume gameplay from pause?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `pause-resume-transition`
- **Requirement Mapping**: REQ-03, REQ-09, REQ-16
- **Defense Answer**:
  Yes. Selecting "Continue" (or pressing `P`/`Escape` again) resumes simulation from the exact state it was paused. `game-flow.resumeGame()` transitions `PAUSED → PLAYING` and clears the clock pause flag. The clock baseline (`lastFrameTime`) is kept synchronized by `tickClock` on every frame — including paused frames — so no stale-baseline catch-up burst can occur on resume.
- **Code Implementation**:
  - `src/game/game-flow.js`: `resumeGame()` → `applyPauseFromState()` → `setPauseState(clock, false)` (lines 210-213).
  - `src/ecs/resources/clock.js`: `tickClock()` keeps `lastFrameTime` resynced even while paused (lines 79-87) and skips accumulator advancement when `clock.isPaused` (lines 91-96).
  - `src/ecs/systems/pause-system.js`: processes the resume intent via `tryTransition(gameStatus, GAME_STATE.PLAYING)`.
- **Verification Steps**:
  - **Automated**: `npx vitest run tests/unit/systems/pause-system.test.js` & `npx playwright test tests/e2e/game-loop.pause.spec.js`.
  - **Live App**: Pause game (`P`), wait 5 seconds, click "Continue". Verify gameplay continues instantly without teleporting or fast-forwarding.

---

#### 9. AUDIT-F-09: Does restart reset correctly from pause?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `pause-restart-transition`
- **Requirement Mapping**: REQ-03, REQ-09, REQ-16
- **Defense Answer**:
  Yes. Selecting "Restart" triggers `gameFlow.restartLevel()`, which schedules a full entity teardown (`destroyAllEntitiesDeferred()`), reloads the current level, and resets: the simulation clock (`resetClock`), frame counters, score state (`createDefaultScoreState`), the level timer (to the current level's canonical duration), player lives (3), ghost spawn state, collision intents, the event queue, and the sprite pool.
  > **Note on a doc nuance**: `game-description.md` §10 says "score preserved from previous levels", but the implemented restart path resets the score to 0 (see `bootstrap.js:958`). If the auditor asks, the code behavior is authoritative.
- **Code Implementation**:
  - `src/game/game-flow.js`: `restartLevel()` (lines 216-260) — teardown + `levelLoader.restartCurrentLevel()`.
  - `src/game/bootstrap.js`: `onRestart` callback (lines 940-1000) — clock/frame/score/timer/lives/spawn-state/pool resets.
  - `src/game/level-loader.js`: `restartCurrentLevel()` (lines 144-152).
- **Verification Steps**:
  - **Automated**: `npx vitest run tests/integration/gameplay/restart-flow.test.js`.
  - **Live App**: Destroy blocks, lose a life, pause (`P`), click "Restart". Verify level resets to the initial timer for that level (Level 1 = 2:00), 3 lives, 0 score, and full block layout.

---

#### 10. AUDIT-F-10: While paused, no dropped frames and requestAnimationFrame is able to run at the same rate unaffected?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `pause-freeze-raf-active`
- **Requirement Mapping**: REQ-02, REQ-09, REQ-16
- **Defense Answer**:
  Yes. The `requestAnimationFrame` loop remains running continuously at 60 FPS while paused. Pause is implemented by freezing the *simulation clock*: `tickClock` returns 0 simulation steps when `clock.isPaused` (clock.js:91-96), so simulation systems don't advance — while the render commit phase and the rAF loop itself keep running unaffected.
- **Code Implementation**:
  - `src/ecs/resources/clock.js`: `tickClock()` — `if (clock.isPaused) { clock.alpha = 0; return 0; }`.
  - `src/main.ecs.js`: `createGameRuntime()` — the rAF `step()` loop always reschedules the next frame, regardless of pause state.
  - `src/game/game-flow.js`: `applyPauseFromState()` → `setPauseState(clock, ...)`.
- **Verification Steps**:
  - **Automated**: `npx playwright test tests/e2e/game-loop.pause.spec.js`.
  - **DevTools / Live App**: Record Performance profile while pausing. Confirm frame rate remains at steady ~16.6 ms per frame with zero dropped frames.

---

#### 11. AUDIT-F-11: Does the player obey movement commands?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `input-contract-covered`
- **Requirement Mapping**: REQ-07
- **Defense Answer**:
  Yes. Controls (Arrow Keys / WASD) immediately move the player entity in the target direction, respecting grid wall and bomb collisions.
- **Code Implementation**:
  - `src/adapters/io/input-adapter.js`: Captures key state into a held-key set.
  - `src/ecs/systems/input-system.js`: Snapshots keys once per fixed step into the input-state component store.
  - `src/ecs/systems/player-move-system.js`: Applies direction vectors and updates `PositionComponent`.
- **Verification Steps**:
  - **Automated**: `npx playwright test tests/e2e/audit/audit.browser.spec.js` (`input-contract-covered`).
  - **Live App**: Press Arrow Up/Down/Left/Right. Player sprite moves instantly in requested direction.

---

#### 12. AUDIT-F-12: Does the player move without spamming the key to do so?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `hold-input-contract-covered`
- **Requirement Mapping**: REQ-07, REQ-08
- **Defense Answer**:
  Yes. Movement uses key-hold state tracking via `keydown` sets and `keyup` clears (`input-adapter.js`). Holding down a key continuously advances the player frame-by-frame without OS key-repeat stutter or spamming. The held-key set is cleared on `blur` and `visibilitychange` (`src/main.ecs.js:627-632`).
- **Code Implementation**:
  - `src/adapters/io/input-adapter.js`: Maintains held key set; clears set on `blur` or `visibilitychange`.
  - `src/ecs/systems/input-system.js`: Consumes input snapshot each fixed tick to calculate continuous movement.
- **Verification Steps**:
  - **Automated**: `npx playwright test tests/e2e/audit/audit.browser.spec.js` (sustained hold test holding key for 500ms).
  - **Live App**: Hold down Right Arrow key. Player glides continuously down the corridor until key is released.

---

#### 13. AUDIT-F-13: Does game behave like pre-approved genre, including deterministic ghost-house stagger/respawn timing from game-description.md §5.4?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `project-identity`
- **Requirement Mapping**: REQ-14, REQ-15, REQ-17
- **Defense Answer**:
  Yes. Ghost spawning follows exact [`game-description.md`](game-description.md) §5.4 rules: FIFO release queue, staggered initial entry intervals (`FALLBACK_GHOST_SPAWN_DELAYS = [0, 5000, 10000, 15000]` ms), map-driven active ghost cap enforcement, and a deterministic 5000 ms respawn delay (`FALLBACK_GHOST_RESPAWN_MS = 5000`) after ghost destruction.
- **Code Implementation**:
  - `src/ecs/systems/spawn-system.js`: Ghost house release queue, stagger timers, and 5000 ms respawn delays (constants at lines 39-40).
  - `src/ecs/systems/ghost-ai-system.js`: Drives ghost pathfinding and state machines.
  - REQ-17 (HUD bomb/fire power-up counts) is also anchored to this audit ID; HUD rendering is owned by `hud-system` (logic) + `hud-render-system` (render phase, sole HUD→DOM boundary).
- **Verification Steps**:
  - **Automated**: `npx vitest run tests/unit/systems/spawn-system.test.js` & `npx playwright test tests/e2e/audit/audit.browser.spec.js`.
  - **Live App**: Watch ghosts exit central spawn house one-by-one. Defeat a ghost with a bomb; observe it respawns at ghost house after exactly 5 seconds.

---

#### 14. AUDIT-F-14: Does the countdown/timer clock work?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `hud-contract`
- **Requirement Mapping**: REQ-04
- **Defense Answer**:
  Yes. The level timer is **per-level** and starts at the level's canonical duration — **Level 1: 120 s (2:00), Level 2: 180 s (3:00), Level 3: 240 s (4:00)** (`LEVEL_TIMERS = [120, 180, 240]`, `src/ecs/resources/constants.js:147`). It decrements by the fixed delta (60 steps/s) and updates the HUD timer in `M:SS` format (`formatTimer`, `hud-adapter.js:78-83`). Reaching 0 triggers `GAME_OVER` (`src/ecs/systems/timer-system.js:109-111`).
- **Code Implementation**:
  - `src/ecs/systems/timer-system.js`: `getLevelDurationSeconds(level)` (line 39) reads `LEVEL_TIMERS`; decrements `remainingSeconds` each tick; transitions to `GAME_OVER` at 0.
  - `src/ecs/systems/hud-system.js` (logic) + `src/adapters/dom/hud-adapter.js`: `formatTimer` and writes into `[data-hud="timer"] [data-hud-value]` (`index.html:22`).
- **Verification Steps**:
  - **Automated**: `npx vitest run tests/unit/systems/timer-system.test.js` & `npx vitest run tests/integration/adapters/hud-adapter.test.js`.
  - **Live App**: Observe the timer counting down second-by-second starting from `2:00` on Level 1.

---

#### 15. AUDIT-F-15: Does the score work by increasing at a certain action done by the player?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `hud-contract`
- **Requirement Mapping**: REQ-05
- **Defense Answer**:
  Yes. Points are awarded deterministically per [`game-description.md`](game-description.md) §6 and the constants in `src/ecs/systems/scoring-system.js:44-62`:

  | Action | Points |
  |---|---|
  | Eat a pellet | **+10** |
  | Eat a Power Pellet | **+50** |
  | Collect a power-up | **+100** |
  | Kill a ghost (normal) | **+200** |
  | Kill a ghost (stunned) | **+400** |
  | Combo kill (chain reaction) | **200 × 2^(n-1)** per ghost |
  | Level clear | **+1000 + remaining seconds × 10** |

- **Code Implementation**:
  - `src/ecs/systems/scoring-system.js`: `SCORE_PELLET = 10`, `SCORE_POWER_PELLET = 50`, `SCORE_POWER_UP = 100`, `SCORE_GHOST_KILL = 200`, `SCORE_STUNNED_GHOST_KILL = 400`, `SCORE_LEVEL_CLEAR = 1000`, `SCORE_TIME_BONUS_MULTIPLIER = 10` (lines 44-62).
  - `src/adapters/dom/hud-adapter.js`: `formatScore` (5-digit zero-padded) written into `[data-hud="score"] [data-hud-value]`.
- **Verification Steps**:
  - **Automated**: `npx vitest run tests/unit/systems/scoring-system.test.js` & `npx vitest run tests/integration/gameplay/c-01-level-clear-bonus.test.js`.
  - **Live App**: Eat a pellet (+10), collect a power-up (+100), or eliminate a ghost (+200). Observe score counter update immediately.

---

#### 16. AUDIT-F-16: Do player lives decrease on life-loss events?
- **Category**: Functional | **Execution Type**: Fully Automatable | **Assertion Key**: `hud-contract`
- **Requirement Mapping**: REQ-06
- **Defense Answer**:
  Yes. Colliding with a normal-state ghost or an explosion flame decrements player lives from the initial **3** (`PLAYER_START_LIVES = 3`, `src/ecs/resources/constants.js:38`) down to 0, updating the HUD lives indicator. At 0 lives, the FSM transitions to `GAME_OVER` (`life-system.js:189-190`).
- **Code Implementation**:
  - `src/ecs/systems/life-system.js`: Processes player hit events, manages invulnerability frames, and transitions to `GAME_OVER`.
  - `src/adapters/dom/hud-adapter.js`: Updates `[data-hud="lives"] [data-hud-value]` (`index.html:24`).
- **Verification Steps**:
  - **Automated**: `npx vitest run tests/unit/systems/life-system.test.js` & `npx vitest run tests/integration/adapters/hud-adapter.test.js`.
  - **Live App**: Touch a ghost or explosion. Player lives count decreases from 3 to 2, and player respawns at start position.

---

#### 17. AUDIT-F-17: Can you confirm that there are no frame drops?
- **Category**: Functional | **Execution Type**: Semi-Automatable | **Assertion Key**: `threshold-f17`
- **Requirement Mapping**: REQ-01, REQ-09
- **Defense Answer**:
  Yes. Performance analysis confirms `p95 frame time ≤ 16.7 ms` (sustained 60 FPS) and `p99 ≤ 34.0 ms`, sampled over ≥ 90 frames after a warmup window that excludes boot jank. Zero-allocation hot loops, compositor-only transform rendering, and DOM pooling eliminate stutter and dropped frames.
- **Code Implementation**:
  - Thresholds: `SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-17']` in `tests/e2e/audit/audit-question-map.js` — `minFrameSamples: 90`, `maxP95FrameTimeMs: 16.7`, `maxP99FrameTimeMs: 34.0`.
  - Data-oriented ECS iteration, compositor-only transform updates, element pooling in `sprite-pool-adapter.js`.
  - Performance evidence file: [`docs/audit-reports/evidence/AUDIT-F-17-F-18.performance.md`](../docs/audit-reports/evidence/AUDIT-F-17-F-18.performance.md).
- **Verification Steps**:
  - **Automated**: `npx playwright test tests/e2e/audit/audit.browser.spec.js` (evaluates performance probe metrics over 90+ frame samples against `SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-17']`).
  - **DevTools / Live App**:
    1. Open Chrome DevTools -> Performance tab -> Click record.
    2. Play game for 60 seconds (place bombs, detonate, move around).
    3. Stop recording. Inspect Frame Timeline: confirm 95% of frames take ≤ 16.7 ms and zero long tasks (> 50 ms) occur during gameplay.
    4. **Fail criterion** (AGENTS.md): any sustained period > 500 ms below 60 FPS is a failure.

---

#### 18. AUDIT-F-18: Does the game run at/or around 60fps? (from 50 to 60 or more)
- **Category**: Functional | **Execution Type**: Semi-Automatable | **Assertion Key**: `threshold-f18`
- **Requirement Mapping**: REQ-01
- **Defense Answer**:
  Yes. Sustained frame rate remains at/around 60 FPS (`p95 FPS ≥ 60`, sampled over ≥ 90 frames).
- **Code Implementation**:
  - `src/main.ecs.js`: Optimized rAF fixed-step execution pipeline.
  - Threshold configuration: `SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-18']` in `tests/e2e/audit/audit-question-map.js` — `minP95Fps: 60`.
- **Verification Steps**:
  - **Automated**: `npx playwright test tests/e2e/audit/audit.browser.spec.js` (asserts `p95 FPS >= 60`).
  - **DevTools / Live App**:
    1. Open Chrome DevTools (`Ctrl+Shift+I`) -> Press `Ctrl+Shift+P` -> Type "Show Rendering" -> Enable **Frame Rendering Stats**.
    2. Play game and observe real-time FPS counter on top left showing steady 60.0 FPS.

---

#### 19. AUDIT-F-19: Can you confirm that the paint is being used as little as possible?
- **Category**: Functional | **Execution Type**: Manual-With-Evidence | **Assertion Key**: `manual-evidence-obligation`
- **Requirement Mapping**: REQ-10
- **Defense Answer**:
  Yes. Repaints are minimized because all animated elements (player, ghosts, bombs, explosions) are updated using `transform: translate3d(x, y, 0)` (`src/ecs/systems/render-dom-system.js:319`). GPU composited transforms bypass main-thread paint and layout calculations (`AGENTS.md`).
- **Code Implementation**:
  - `src/ecs/systems/render-dom-system.js`: Applies `translate3d` transform strings exclusively.
  - Static map tiles are painted once during board initialization (`renderer-adapter.js`).
  - Evidence artifact: [`docs/audit-reports/evidence/AUDIT-F-19.paint.md`](../docs/audit-reports/evidence/AUDIT-F-19.paint.md).
- **Verification Steps**:
  - **DevTools / Live App**:
    1. Open Chrome DevTools -> Press `Ctrl+Shift+P` -> Type "Show Rendering" -> Enable **Paint Flashing**.
    2. Play the game. Observe that green paint highlights ONLY flash when HUD numbers change or elements are added/removed — NO green paint flashing occurs over the moving player or ghost sprites!

---

#### 20. AUDIT-F-20: Can you confirm that the layers are being used as little as possible?
- **Category**: Functional | **Execution Type**: Manual-With-Evidence | **Assertion Key**: `manual-evidence-obligation`
- **Requirement Mapping**: REQ-10
- **Defense Answer**:
  Yes. Layer creation is strictly managed to avoid layer explosion and GPU memory bloat. Steady-state layer inventory is **minimal** — root layer + the active player sprite + each active ghost sprite (measured 3–5 layers at steady state; see evidence below). Static tiles, bombs, and fire stay on the root layer and never receive individual layers.
- **Code Implementation**:
  - Layer promotion policy in `styles/grid.css` (`.sprite--player` and `.sprite--ghost-*` carry `will-change: transform`; bombs/fire explicitly do NOT — grid.css lines 171, 208, 359, 395-402).
  - Evidence artifact: [`docs/audit-reports/evidence/AUDIT-F-20.layers.md`](../docs/audit-reports/evidence/AUDIT-F-20.layers.md) (layer inventory table, counts across level loads/pause/explosions).
- **Verification Steps**:
  - **DevTools / Live App**:
    1. Open Chrome DevTools -> Press `Ctrl+Shift+P` -> Type "Show Rendering" -> Enable **Layer Borders** (or open **Layers** panel).
    2. Inspect layer tree during play. Confirm only the root layer, active player, and active ghost sprites have layer boundaries — tiles, bombs, and fire tiles do not.

---

#### 21. AUDIT-F-21: Is layer creation being promoted properly?
- **Category**: Functional | **Execution Type**: Manual-With-Evidence | **Assertion Key**: `manual-evidence-obligation`
- **Requirement Mapping**: REQ-10
- **Defense Answer**:
  Yes. `will-change: transform` is applied strictly and exclusively to active moving sprites — `.sprite--player` and `.sprite--ghost-*` — during active gameplay per `AGENTS.md`. Static tiles, bombs, and fire tiles do NOT carry `will-change` (bombs/fire are transient/short-lived; see comments in `styles/grid.css:359,395`).
- **Code Implementation**:
  - CSS layer promotion rules in **`styles/grid.css`** (lines 171, 208). Note: `src/adapters/dom/renderer-board-css.js` only syncs board dimension CSS variables (`--board-columns/rows`) — the `will-change` policy lives in the stylesheet.
  - Evidence artifact: [`docs/audit-reports/evidence/AUDIT-F-21.promotion.md`](../docs/audit-reports/evidence/AUDIT-F-21.promotion.md).
- **Verification Steps**:
  - **DevTools / Live App**:
    1. Inspect a `.wall-tile` in DevTools -> Confirm `will-change` is NOT present.
    2. Inspect `.sprite--player` (player sprite) -> Confirm `will-change: transform` is present.

---

### Bonus Audit Questions (B-01 through B-06)

#### 22. AUDIT-B-01: Does the project run quickly and effectively?
- **Category**: Bonus | **Execution Type**: Fully Automatable | **Assertion Key**: `raf-active`
- **Requirement Mapping**: REQ-01
- **Defense Answer**:
  Yes. Game simulation algorithms (grid collision, bomb ticks, ghost pathfinding) run efficiently with no redundant calculations or unnecessary network requests during gameplay ticks.
- **Code Implementation**:
  - `src/ecs/systems/collision-system.js`: Uses ECS component-query masks (`COLLISION_ENTITY_REQUIRED_MASK`) for O(1)-style entity membership checks.
  - Pre-decoded audio and pre-loaded assets eliminate runtime fetch latency.
- **Verification Steps**:
  - **Automated**: `npx playwright test tests/e2e/audit/audit.browser.spec.js`.
  - **DevTools**: Inspect Network tab during active gameplay — zero network requests are made during frame ticks.

---

#### 23. AUDIT-B-02: Does the code obey good practices?
- **Category**: Bonus | **Execution Type**: Fully Automatable | **Assertion Key**: `policy-script-contract`
- **Requirement Mapping**: REQ-12
- **Defense Answer**:
  Yes. The project follows all `AGENTS.md` standards (see [Security and Code Quality](../AGENTS.md#security-and-code-quality)):
  - **Zero `var`**: legacy-construct rule enforced by Biome + policy scripts.
  - **Private Package**: `package.json` includes `"private": true`.
  - **Safe DOM Sinks**: `textContent` and explicit attribute APIs used exclusively; zero unsafe `innerHTML` injection.
  - **CSP & Frame Busting**: strict CSP validated in `tests/e2e/production-csp.spec.js`; frame-busting via `public/frame-busting.js` (injected in `index.html`) and `tests/e2e/sec-01-csp-frame-busting.spec.js` (X-Frame-Options / frame-ancestors).
  - **Schema Validation**: Maps and audio manifests validated against JSON Schema 2020-12 (`scripts/validate-schema.mjs`).
  - **Code Quality**: Biome linting and formatting pass with zero errors.
- **Verification Steps**:
  - **Automated**: Run `npm run policy` (executes lint, security checks, header scans, schema validation).
  - Evidence artifact: [`docs/audit-reports/evidence/AUDIT-B-01-B-04.quality.md`](../docs/audit-reports/evidence/AUDIT-B-01-B-04.quality.md).

---

#### 24. AUDIT-B-03: Does the program reuse memory to avoid jank?
- **Category**: Bonus | **Execution Type**: Fully Automatable | **Assertion Key**: `pooling-contract`
- **Requirement Mapping**: REQ-01
- **Defense Answer**:
  Yes. High-churn visual entities (bombs, explosions, ghosts, power-ups) use fixed DOM element pooling via [`src/adapters/dom/sprite-pool-adapter.js`](../src/adapters/dom/sprite-pool-adapter.js). Unused elements are stashed offscreen with `transform: translate(-9999px, -9999px)` (`OFFSCREEN_TRANSFORM`, `sprite-pool-adapter.js:30`) without triggering layout recalculations. Total DOM nodes are asserted ≤ 500 in dev-mode startup (`assertDomElementBudget`, `src/main.ecs.js`).
- **Code Implementation**:
  - `src/adapters/dom/sprite-pool-adapter.js`: Manages element allocation, checkout, and checkin.
  - `src/main.ecs.js`: `DOM_ELEMENT_BUDGET = 500` + `assertDomElementBudget()`.
- **Verification Steps**:
  - **Automated**: `npx vitest run tests/integration/adapters/sprite-pool-adapter.test.js`.
  - **DevTools / Live App**: Take Heap Snapshots before and after 2 minutes of intense gameplay. Verify flat heap memory timeline with no GC spikes.

---

#### 25. AUDIT-B-04: Does the game use SVG?
- **Category**: Bonus | **Execution Type**: Fully Automatable | **Assertion Key**: `svg-asset-contract`
- **Requirement Mapping**: REQ-14
- **Defense Answer**:
  Yes. All gameplay sprites (player, ghosts, bomb items, flame effects, power-ups) are vector SVG elements with path complexity strictly under 50 elements per sprite.
- **Code Implementation**:
  - Clean inline SVG templates rendered in DOM pools.
- **Verification Steps**:
  - **Automated**: `npx playwright test tests/e2e/audit/audit.browser.spec.js` (`svg-asset-contract`).
  - **Live App**: Inspect player element in DOM (`Ctrl+Shift+C`) -> Verify `<svg>` markup.

---

#### 26. AUDIT-B-05: Is the code using asynchronicity to increase performance?
- **Category**: Bonus | **Execution Type**: Semi-Automatable | **Assertion Key**: `threshold-b05`
- **Requirement Mapping**: REQ-01
- **Defense Answer**:
  Yes. Audio assets (SFX and music) are loaded asynchronously via `fetch()` and pre-decoded off the main thread using the Web Audio API's `AudioContext.decodeAudioData()` (`src/adapters/io/audio-adapter.js:535,561`). Decoded `AudioBuffer` objects are cached in memory maps for instant zero-latency playback without blocking main-thread frame updates. A non-blocking loading indicator is shown when preload takes longer than `AUDIO_PRELOAD_INDICATOR_THRESHOLD_MS = 200` (`src/adapters/io/audio-integration.js:460`).
- **Code Implementation**:
  - `src/adapters/io/audio-adapter.js`: Async fetch + off-thread `decodeAudioData`.
  - `src/adapters/io/audio-integration.js`: `preloadWithIndicator()` + the 200 ms threshold constant.
  - `src/adapters/dom/audio-loading-indicator.js`: Show/hide of the indicator node (`aria-busy`, `aria-live`).
- **Verification Steps**:
  - **Automated**: `npx vitest run tests/integration/adapters/audio-adapter.test.js` & `npx playwright test tests/e2e/audit/audit.browser.spec.js`.
  - Evidence artifact: [`docs/audit-reports/evidence/AUDIT-B-05.preload-timing.md`](../docs/audit-reports/evidence/AUDIT-B-05.preload-timing.md).

---

#### 27. AUDIT-B-06: Do you think in general this project is well done?
- **Category**: Bonus | **Execution Type**: Manual-With-Evidence | **Assertion Key**: `manual-evidence-obligation`
- **Requirement Mapping**: REQ-01 through REQ-16
- **Defense Answer**:
  Yes. The project demonstrates exemplary engineering quality: pure modern JS ECS architecture, zero canvas/framework dependencies, rock-solid 60 FPS performance, complete keyboard-only accessibility, persistence (top-10 High Scores in `localStorage` via `storage-adapter.js`), customizable audio controls, clean vector visuals, and 100% test traceability across all requirements.
- **Verification Steps**:
  - Signed evidence manifest: [`docs/audit-reports/manual-evidence.manifest.json`](../docs/audit-reports/manual-evidence.manifest.json).
  - Summary evidence artifacts: [`docs/audit-reports/evidence/AUDIT-B-06.overall.md`](../docs/audit-reports/evidence/AUDIT-B-06.overall.md), [`docs/audit-reports/evidence/playthrough-report.md`](../docs/audit-reports/evidence/playthrough-report.md), and [`docs/audit-reports/evidence/playwright-trace.zip`](../docs/audit-reports/evidence/playwright-trace.zip).

---

## 4. Master Verification & Command Cheat Sheet

### Essential CLI Test Commands

```bash
# 1. Run full policy gate (lint, security, CSP, header, schema checks)
npm run policy

# 2. Run all unit and integration tests
npm run test

# 3. Run explicit audit test suite (Vitest + Playwright)
npm run test:audit

# 4. Run browser E2E tests specifically
npm run test:e2e

# 5. Run schema validation on audio manifest and maps
npm run validate:schema

# 6. Start local dev server for live manual testing
npm run dev
```

### DevTools Audit Checklist for Live Presentation

1. **FPS & Smoothness (F-17, F-18, B-01)**:
   - Open DevTools -> `Ctrl+Shift+P` -> Type "Show Rendering" -> Check **Frame Rendering Stats**.
   - Verify steady **60.0 FPS** during movement, bomb placement, and ghost movement.
   - **Fail criterion**: any sustained period > 500 ms below 60 FPS is a failure (AGENTS.md).
2. **Paint Flashing Check (F-19)**:
   - Check **Paint Flashing** in Rendering tab.
   - Verify green paint highlights do NOT appear over moving player/ghost sprites.
3. **Layer Borders & Promotion Check (F-20, F-21)**:
   - Check **Layer Borders** in Rendering tab (or open **Layers** panel).
   - Verify only dynamic sprites (`.sprite--player`, `.sprite--ghost-*`) have composited layer outlines; wall tiles stay on the root board layer; bombs/fire stay on the root layer.
4. **Canvas Check (F-04)**:
   - Open Console -> Run `document.querySelectorAll('canvas').length` -> Expect `0`.
5. **Memory & Pooling Check (B-03)**:
   - Take Memory Heap Snapshot before play vs after 2 minutes -> Confirm flat heap memory growth and zero DOM node leaks.

# Testing & Verification Guide by Phase

> **Purpose**: Step-by-step testing instructions and exit criteria for each implementation phase of the Ms. Ghostman project.
> **Source of truth**: `docs/audit.md`, `docs/requirements.md`, `docs/game-description.md`, `docs/implementation/implementation-plan.md`, `docs/implementation/audit-traceability-matrix.md`

---

## P0 — Foundation (A-01..A-03, B-01, D-01..D-04)

**Goal**: Deterministic ECS runtime boots and ticks.

### How to test

- **Unit tests**: Run `npm run test:unit` — verifies ECS world assembly, entity store, query matching, clock, RNG, event queue.
- **Integration tests**: Run `npm run test:integration` — verifies system ordering and cross-system event processing.
- **Manual smoke test**: Run `npm run dev` and verify app boots with rAF ticking without crashing (**AUDIT-F-01**).
- **Fixed-step loop**: Confirm `SIMULATION_HZ` (default 60) drives the accumulator-based simulation loop (**AUDIT-F-02**).
- **Resource contracts**: Verify map JSON loads, RNG seeds deterministically, clock advances only during PLAYING state.

### Exit criteria

- App boots, world ticks deterministically, map/resource contracts load, render intent pipeline defined.

---

## P1 — Visual Prototype (B-02..B-03, D-05..D-08)

**Goal**: First on-screen playable loop with visible board + movement.

### How to test

- **Maze renders**: Run `npm run dev` and verify the CSS Grid maze is visible on screen.
- **Player movement**: Use arrow keys — player sprite moves smoothly via `transform: translate()` (no key spam needed) (**AUDIT-F-11, F-12**).
- **Frame rate**: Open DevTools Performance tab → record 60s trace → verify p95 frame time ≤ 16.7ms (**AUDIT-F-17, F-18**).
- **Paint flashing**: Enable "Paint flashing" in DevTools Rendering panel → verify minimal repaint areas (**AUDIT-F-19**).
- **Layer count**: Enable "Layer borders" in DevTools Rendering panel → verify minimal but nonzero layers (**AUDIT-F-20, F-21**).
- **No layout thrashing**: Confirm no forced reflow loops in render commit (DevTools Performance → Layout section shows no interleaved read/write).

### Exit criteria

- Board renders, player movement visible, frame pipeline runs through render-collect → DOM commit.

---

## P2 — Playable MVP (B-04, C-01..C-05)

**Goal**: Core gameplay loop with scoring, timer, lives, pause, HUD.

### How to test

- **Start screen**: Press `Enter` → game starts from Start Screen.
- **Scoring**: Collect pellets → Score increases by 10 per pellet (**AUDIT-F-15**).
- **Lives**: Lose a life (ghost contact or explosion) → Lives decrement (**AUDIT-F-16**).
- **Pause menu**: Press `ESC`/`P` → Pause menu appears with Continue and Restart (**AUDIT-F-07**).
- **Continue**: Select Continue → game resumes exactly where paused (timer, positions, state preserved) (**AUDIT-F-08**).
- **Restart**: Select Restart → level resets, score preserved from previous levels (**AUDIT-F-09**).
- **HUD**: Verify timer counts down, score updates, lives display correctly (**AUDIT-F-14, F-15, F-16**).
- **Pause frame stability**: While paused, rAF stays active — no frame drops (**AUDIT-F-10**).
- **Playwright e2e**: Run `npm run test:e2e` — automated checks for pause, HUD, input (**AUDIT-F-07 through F-16**).

### Exit criteria

- Start/pause/continue/restart works, HUD updates, collision outcomes visible and testable.

---

## P3 — Feature Complete + Hardening (A-04..A-08, B-05..B-09, C-06..C-07, D-09)

**Goal**: Full gameplay depth — bombs, ghost AI, power-ups, audio, CI gates.

### How to test

- **Bomb mechanics**: Drop bomb (`Space`) → 3s fuse → cross-pattern explosion. Bomb destroys destructible walls, kills ghosts, triggers chain reactions.
- **Ghost AI**: Ghosts exhibit distinct behaviors — Blinky chases, Pinky ambushes, Inky flanks, Clyde is wildcard (**AUDIT-F-13**).
- **Power Pellet**: Stuns ghosts → they turn blue, flee slowly. Bomb kills during stun yield 400pts.
- **Power-ups**: Collect `💣+` (more bombs), `🔥+` (larger radius), `👟` (speed boost 1.5× for 10s) — all apply correctly.
- **Audio**: SFX/music plays via `AudioContext.decodeAudioData()` preload — no lag on first playback.
- **CI gates**: Run `npm run policy` → all gates pass (lint, test, coverage, schema validation, SBOM) (**AUDIT-B-02**).
- **Full test suite**: Run `npm run ci` — unit + integration + e2e + audit (**AUDIT-F-01 through F-21**).
- **Determinism**: Run seed-based replay tests — identical seed + input + timing produces identical outcomes.

### Exit criteria

- Bomb depth, ghost AI, power-ups, event contracts, audio integration, CI and automated test hardening.

---

## P4 — Polish & Validation (A-09, C-08..C-10, D-10..D-11)

**Goal**: Production quality, asset governance, audit-ready evidence.

### How to test

- **Full playthrough**: Play through all 3 levels → Victory screen shows Final Score, Ghosts Killed, Total Time.
- **Game Over**: Timer expires or lives depleted → Game Over screen with Play Again option.
- **High scores**: Persist in `localStorage` and validate on read (**AUDIT-B-01**).
- **SVG assets**: All visuals use SVG sprites under 50 path elements (**AUDIT-B-04**).
- **Memory reuse**: No GC jank after warm-up — verified via DevTools Memory tab (allocation timeline flat after initial allocation) (**AUDIT-B-03**).
- **Async performance**: `createImageBitmap` and `decodeAudioData` decode off main thread — verified via DevTools Performance (**AUDIT-B-05**).

### Manual evidence artifacts to collect

| Audit ID | Evidence Required | How to Capture |
|---|---|---|
| **AUDIT-F-19** | Paint flashing screenshot (minimal paints) | DevTools → More tools → Rendering → Paint flashing → screenshot during gameplay |
| **AUDIT-F-20** | Layer count screenshot (minimal layers) | DevTools → More tools → Rendering → Layer borders → screenshot |
| **AUDIT-F-21** | Layer promotion verification | DevTools → Rendering → confirm only player/ghost sprites have `will-change: transform` |
| **AUDIT-B-06** | Overall quality sign-off | Review of all evidence + code quality + review sign-off |

### Final audit run

- Run `npm run test:audit` — all 27 audit questions pass or have evidence attached.

### Exit criteria

- All levels playable start-to-finish, all tests green, audit evidence bundle complete.

---

## Full Verification Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Manual playtesting |
| `npm run test:unit` | Pure system/component tests |
| `npm run test:integration` | Cross-system + adapter tests |
| `npm run test:e2e` | Playwright browser tests (pause, input, HUD) |
| `npm run test:audit` | All audit questions (F-01..F-21, B-01..B-06) |
| `npm run policy` | CI gate (lint + test + coverage + schema + SBOM) |
| `npm run policy:repo` | Repo-wide policy check |
| `npm run ci` | Full local validation suite |

---

## Final Completion Checklist

The project is **complete** only when ALL of the following are true:

- [ ] All 39 tickets in `docs/implementation/ticket-tracker.md` marked `[x]` (Done).
- [ ] All audit questions in `docs/audit.md` pass (automated checks + manual evidence).
- [ ] `docs/implementation/audit-traceability-matrix.md` shows all rows as `Executable`.
- [ ] `npm run ci` and `npm run policy` pass cleanly.
- [ ] Performance evidence meets acceptance criteria (p95 ≥ 60 FPS, no sustained drops > 500ms).
- [ ] Game is playable from Start Menu → all 3 levels → Victory/Game Over.
- [ ] PR messages archived in `docs/pr-messages/` and audit reports in `docs/audit-reports/`.
- [ ] ECS boundaries remain intact (no forbidden DOM calls in simulation systems).
- [ ] Single-player gameplay preserved (pause: Continue/Restart, HUD: timer/score/lives).

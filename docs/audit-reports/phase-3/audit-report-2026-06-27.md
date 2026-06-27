# Codebase Analysis & Audit Report - P3 (Feature Complete + Hardening)

**Date:** 2026-06-27
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for P3 — 5 parallel analysis passes

---

## Methodology

Five parallel analysis passes were executed across the codebase:
1. **Bugs & Logic Errors** — runtime bugs, race conditions, state-machine transitions, clock/timing, entity lifecycle, event-queue ordering, error-handling paths under `src/`.
2. **Dead Code & Unused References** — unused exports/imports/branches across `src/`, `scripts/`, `package.json`, config files, and JSDoc drift (every claim grep-verified).
3. **Architecture, ECS Violations & Guideline Drift** — ECS invariants (deferral, opacity, DOM isolation, render separation, render-intent contract), ownership-policy mirror, audit-question structural coverage, asset-pipeline drift.
4. **Code Quality & Security** — unsafe sinks, forbidden tech, CSP/Trusted Types, validation trust boundaries, storage trust, error handling, policy-gate coverage.
5. **Tests & CI Gaps** — unit/integration/adapter/E2E coverage, audit-traceability sync, phase-report parity, CI/policy-gate enforcement, flakiness, performance-test gaps.

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations. The codebase has already passed P0/P1/P2 audit cycles; inline `BUG-XX`/`SEC-XX` comment markers refer to *prior* remediations and are independent of the new IDs below.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 0 |
| 🔴 Critical | 2 |
| 🟠 High | 5 |
| 🟡 Medium | 14 |
| 🟢 Low / Info | 18 |

**Top risks:**
1. **BUG-01 (Critical):** Bomb-killed ghosts never respawn — no runtime system writes `deadGhostIds`, so the C-03 respawn pipeline never fires. Directly violates the core chase loop and `game-description.md` §5.3/§5.4.
2. **CI-01 (Critical):** CI workflow runs unit tests only as named steps; coverage thresholds, integration, and Playwright E2E run only via a soft-fail orchestrator indirection — no visible, attributable enforcement.
3. **ARCH-01 (High):** Ownership policy in `policy-utils.mjs` omits 4 shipped systems (`hud-system`, `hud-render-system`, `screens-system`, `player-animation-system`) → PR ownership gate cannot govern them.
4. **CI-02/CI-03 (High):** Production CSP/Trusted Types are never exercised in a browser (E2E uses dev server only), and Playwright is Chromium-only while AGENTS.md mandates Chrome/Firefox/Safari.
5. **CI-04 (High) / BUG-09 (Medium):** `prefers-reduced-motion` (an AGENTS.md MUST) has zero implementation or test coverage; and a frame-perfect last-pellet-at-0:00 loses the level to a timer-vs-level-progress ordering race.

---

## 1) Bugs & Logic Errors

### BUG-01: Bomb-killed ghosts never respawn — `deadGhostIds` has no runtime writer ⬆ Critical
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: B (Tickets: B-08, B-09) + C (C-03); bridge wiring A-05/bootstrap
- `src/ecs/systems/collision-system.js` (~L877-885)
- `src/ecs/systems/spawn-system.js` (~L430-453, `consumeDeadGhostIds`)
- `src/game/bootstrap.js` (~L890, L933, L995 — only writers, all set `[]`)

**Problem:** A ghost killed by fire has its state flipped to `DEAD` directly in the collision system. The C-03 spawn system schedules respawn **only** when ghost ids appear in the `deadGhostIds` resource. A repo-wide grep confirms **no runtime system ever pushes ids into `deadGhostIds`** — it is only ever initialized to `[]`. So `scheduleRespawn` is never called, ghosts are never re-released, and the ghost-ai revive branch (`ghost-ai-system.js:852-861`, requires `releasedGhostSet.has(ghostId)`) never fires.
**Impact:** Bomb-killed ghosts stay permanently `DEAD` (eyes return home and freeze). On later levels this drains all ghosts permanently, breaking the core chase loop. Violates `game-description.md` §5.3/§5.4 ("respawn after a 5-second penalty delay").

**Fix:** Bridge ghost deaths into the spawn resource — append killed ids to a `deadGhostIds` accumulator in the collision system, or add a small logic-phase bridge before `spawn-system`:
```js
const deaths = collisionIntents.filter(i => i?.type === 'ghost-death').map(i => i.entityId);
if (deaths.length) world.setResource('deadGhostIds', deaths);
```

**Tests to add:** Integration — place bomb adjacent to a released ghost, run until fire hits it, assert `ghostSpawnState.respawnQueue` contains the id and that after `GHOST_RESPAWN_MS` the ghost returns to `NORMAL` at the spawn tile.

---

### BUG-09: Last-pellet-at-0:00 race — timer expiry beats level-clear in logic-phase ordering ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: C (Tickets: C-02, C-04) + A (A-05)
- `src/ecs/systems/timer-system.js` (~L122-131, L172-184)
- `src/ecs/systems/level-progress-system.js` (~L126-151)

**Problem:** Logic-phase order is collision → power-up → **timer** → scoring → life → **level-progress** → spawn (`bootstrap.js:377-423`). If the player eats the last pellet on the same step the timer hits 0, the timer system runs first and transitions `PLAYING → GAME_OVER`. When `level-progress-system` runs later in the same step it sees `GAME_OVER` (not `PLAYING`) and never fires `LEVEL_COMPLETE`.
**Impact:** A frame-perfect last-pellet-at-0:00 yields Game Over instead of Level Complete + bonus. Violates the intent that clearing all pellets completes the level (`game-description.md` §13).

**Fix:** Run `level-progress-system` (pellet-clear detection) **before** `timer-system`, or have the timer check `hasClearedAllPellets` before transitioning to GAME_OVER.

**Tests to add:** Integration — set `remainingSeconds` to one step's worth, place player on last pellet, step once, assert state is `LEVEL_COMPLETE`/`VICTORY` not `GAME_OVER`.

---

### BUG-03: Same-level Restart timer reset depends on a magic `activeLevel: -1` write in one code path ⬆ High
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: C (Tickets: C-02, C-04) + A (A-03)
- `src/ecs/systems/timer-system.js` (~L71-98, `ensureTimerResource`)
- `src/game/game-flow.js` (~L188-220, `restartLevel`)

**Problem:** `ensureTimerResource` resets `remainingSeconds` only when `activeLevel` changes. Same-level restart keeps the index, so reset relies entirely on the default bootstrap's `onRestart` (`bootstrap.js:925`) writing the sentinel `{ remainingSeconds: 0, activeLevel: -1 }`. The C-04 game-flow restart path does not itself force a timer reset; if `onRestart` is ever changed to preserve `levelTimer`, the countdown silently continues mid-level.
**Impact:** Fragile, undocumented coupling — a Pause→Restart that doesn't route through that exact sentinel write leaves the leftover countdown.

**Fix:** Make the reset explicit — have `restartLevel`/`onRestart` set `levelTimer.remainingSeconds = getLevelDurationSeconds(activeLevel)`, or add a `reset` flag the timer honors. Document that restart MUST refill the countdown.

**Tests to add:** Integration — start level, advance timer 30s, `gameFlow.restartLevel()`, assert `levelTimer.remainingSeconds === durationSeconds`.

---

### BUG-10: FSM has no `PAUSED → MENU` / `LEVEL_COMPLETE → MENU` path ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: A (Tickets: A-03) + C (C-04, C-05)
- `src/ecs/resources/game-status.js` (~L50-64, `VALID_TRANSITIONS`)
- `src/game/game-flow.js` (~L33-40, L99-103)

**Problem:** `VALID_TRANSITIONS` has no `PAUSED→MENU` or `LEVEL_COMPLETE→MENU`. `safeTransition` returns false silently (a "quit to menu" button does nothing); a direct `transitionTo` from any future quit handler would throw inside a system and quarantine it.
**Impact:** Quit-to-menu from Pause is impossible through the FSM; the only escape is Restart. Brittle for any future Pause-menu quit action.

**Fix:** If quit-to-menu from Pause is desired, add `PAUSED → MENU` (and optionally `LEVEL_COMPLETE → MENU`) to `VALID_TRANSITIONS`. Otherwise document that Pause offers no menu exit.

**Tests to add:** Assert the FSM supports the documented set of pause actions, or that quit-to-menu is intentionally absent.

---

### BUG-11: Restart rebuilds the prop pool but leaves stale `bombStore`/`fireStore` SoA lanes on recycled ids ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: A (Tickets: A-02) + B (B-06, B-08)
- `src/game/bootstrap.js` (~L906-948, `onRestart` → `ensurePooledPropEntities`)
- `src/game/runtime-bomb-explosion-wiring.js` (~L91-108)
- `src/ecs/world/entity-store.js` (~L58-70)

**Problem:** On restart, all entities (including the bomb/fire pool) are destroyed, then the pool is rebuilt with recycled ids. `createInactivePooledPropEntity` resets only `colliderStore.type = NONE`; it does **not** zero `bombStore.fuseMs/radius/ownerId` or `fireStore.burnTimerMs/sourceBombId/chainDepth`. Stale lanes persist until the next activation. The restart path (unlike level-transition) never calls `deactivateAllBombsAndFire`.
**Impact:** Latent — depends on a read that skips the active-check. Any such read would observe stale fuse/burn data.

**Fix:** Zero the bomb/fire SoA lanes for each pooled slot on restart (mirror `deactivateAllBombsAndFire`).

**Tests to add:** Restart mid-fuse, assert recycled bomb slots have `fuseMs === 0` and fire slots have `burnTimerMs === 0`.

---

### BUG-04: Power-pellet stun applied to ghosts still queued/inside the house ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: B (Tickets: B-07)
- `src/ecs/systems/power-up-system.js` (~L237-255, L393-394)

**Problem:** `applyPowerPellet` stuns every non-DEAD ghost matching the GHOST mask, including ghosts still exiting/inside the ghost house, and emits the `stunnedCount > 0` frenzy event for them.
**Impact:** Power pellet can "waste" frenzy on unreachable ghosts; HUD/audio frenzy window starts when no ghost is interactable. Low gameplay impact, inconsistent with §5.3.

**Fix:** Restrict stun to released ghosts outside the house (check `isInGhostHouse` false or `releasedGhostIds` membership), or accept and document current behavior.

**Tests to add:** Stun a level where ghosts 2/3/4 are still queued; assert only active ghosts are stunned.

---

### BUG-07: Explosion fire-pool exhaustion silently drops in-blast damage tiles ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: B (Tickets: B-06)
- `src/ecs/systems/explosion-system.js` (~L285-314, `ensureFireAtTile`)
- `src/ecs/systems/bomb-tick-system.js` (~L218-237, radius clamp)

**Problem:** `POOL_FIRE = 85`. Fire-radius power-ups raise radius beyond `MAX_FIRE_RADIUS=4` (player `fireRadius` is capped at 255, not `MAX_FIRE_RADIUS`), and chained detonations in one tick can exceed 85 simultaneous fire tiles. When the pool is exhausted, `ensureFireAtTile` returns silently, so that cell deals **no damage** despite being geometrically in the blast.
**Impact:** Upgraded bombs / large chains can fail to kill ghosts or destroy walls on some tiles — non-deterministic-feeling gameplay.

**Fix:** Either clamp player `fireRadius` to `MAX_FIRE_RADIUS` (so the pool is provably sufficient), or size `POOL_FIRE` from the real radius cap and assert in dev mode on exhaustion instead of dropping.

**Tests to add:** Stress test — max fire radius + multi-bomb chain; assert no in-blast tile is skipped (or radius is clamped to the pool budget).

---

### BUG-06: Level-clear time bonus uses fractional seconds while HUD shows whole seconds ⬆ Low
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: C (Tickets: C-01, C-02)
- `src/ecs/systems/timer-system.js` (~L50-56, L180-182)
- `src/ecs/systems/scoring-system.js` (~L84-89, L243-248)

**Problem:** `remainingSeconds` is a float; `computeLevelClearBonus` multiplies the raw float by 10 (e.g. 47.83 → 478) while the HUD displays whole seconds (`0:47`), producing a player-visible mismatch.
**Impact:** Minor scoring/HUD inconsistency; determinism preserved.

**Fix:** Use a consistent rounding between HUD and bonus, e.g. `computeLevelClearBonus(Math.floor(remainingSeconds))`.

**Tests to add:** Assert bonus equals `1000 + Math.floor(remaining) * 10` and matches the HUD-rendered seconds.

---

### BUG-02: Ghost revive gated on exact float position equality ⬆ Low
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: B (Tickets: B-08)
- `src/ecs/systems/ghost-ai-system.js` (~L697-712, L852-861)

**Problem:** The revive condition uses `positionStore.row[ghostId] === mapResource.ghostSpawnRow` exactly. Eyes are integer-snapped, so equality normally holds, but any sub-tile drift on the arrival frame strands the eyes oscillating at the spawn tile. (Compounded by BUG-01, which means the revive set is never repopulated.)
**Impact:** Fragile gating that can strand revived ghosts even after BUG-01 is fixed.

**Fix:** Gate on tile-level rounding: `Math.round(row) === ghostSpawnRow && Math.round(col) === ghostSpawnCol`.

**Tests to add:** Unit — drive a DEAD ghost one tile off spawn with fractional position; assert revive once in the released set.

---

### BUG-05: Dead per-system `MAX_DELTA_MS = 1000` clamp under fixed-step loop ⬆ Low
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: C (C-02), B (B-07, B-08), A (A-03)
- `src/ecs/systems/timer-system.js` (~L38, L100-107); `power-up-system.js` (~L49, L115-122); `ghost-ai-system.js` (~L74, L554-561); `life-system.js` (~L50, L84-91)

**Problem:** `dtMs` is always `FIXED_DT_MS` (catch-up is handled by `tickClock`'s `MAX_STEPS_PER_FRAME=5`), so the per-system clamp is dead. A future refactor passing variable `dtMs` would be silently capped at 1000ms (a 60× over-advance) instead of erroring.
**Impact:** No runtime bug; latent foot-gun.

**Fix:** Remove the dead clamp or replace with a dev-mode assertion that `dtMs === FIXED_DT_MS`.

**Tests to add:** Dev-mode assertion test that systems receive the fixed delta.

---

### BUG-08: Combo scoring only guaranteed for ≤ `MAX_DETONATIONS_PER_TICK` simultaneous roots ⬆ Low
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: B (Tickets: B-06)
- `src/ecs/systems/explosion-system.js` (~L664-682, `takeDetonationWorkQueue`)
- `src/ecs/systems/bomb-tick-system.js` (~L446-449)

**Problem:** The seed drain caps at `MAX_DETONATIONS_PER_TICK = 5`. After a quarantine backlog, >5 fuse expiries carry to the next tick, so two bombs that should chain in one tick detonate a tick apart, breaking the single-tick combo multiplier.
**Impact:** Rare combo under-scoring post-quarantine.

**Fix:** Document the ≤5-roots guarantee, or raise the per-tick seed cap to `MAX_DETONATION_QUEUE`.

**Tests to add:** Queue >5 simultaneous detonations; assert combo matches the documented contract.

---

### BUG-12: Bomb edge-of-map radius cap is a misleading no-op ⬆ Low
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: B (B-06), D (D-03)
- `src/ecs/resources/map-resource.js` (~L855-862, `getCell` OOB → INDESTRUCTIBLE)
- `src/ecs/systems/bomb-tick-system.js` (~L218-237, `resolveMaxBombRadiusForMapTile`)

**Problem:** `resolveMaxBombRadiusForMapTile` caps radius to map bounds, but bordered indestructible walls stop propagation first, so the cap never engages — the name overstates its role.
**Impact:** None functionally.

**Fix:** Simplify or document that border walls are the real limiter.

**Tests to add:** None required (optional clarity test).

---

### BUG-13: `validateMapSchema` is skipped by default in the test environment (test fail-open) ⬆ Low
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: D (D-03), A (A-07)
- `src/ecs/resources/map-resource.js` (~L370-375)

**Problem:** When `NODE_ENV === 'test'` and `__testSchemaValidation__ !== true`, schema validation returns OK without checking. Tests can pass shapes production would reject; weakens the "validate JSON maps against JSON Schema" guarantee in test fixtures. Production (browser) is unaffected.
**Impact:** Tests may miss schema regressions.

**Fix:** Make the bypass opt-out rather than default, or always validate and have fixtures supply valid payloads.

**Tests to add:** Assert `createMapResource` rejects a schema-invalid map even under `NODE_ENV=test`.

---

### BUG-14: `tickClock` recomputes `alpha` on duplicate rAF timestamps ⬆ Low / Info
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: A (A-03), D (D-01)
- `src/ecs/resources/clock.js` (~L75-119)

**Problem:** When `now === lastFrameTime`, `frameTime = 0` and no step advances, but `alpha` is still recomputed each duplicate frame.
**Impact:** Negligible — clock is otherwise robust against NaN/regression.

**Fix:** Optional early-return when `frameTime === 0 && !isPaused`.

**Tests to add:** Feed two identical timestamps; assert `steps === 0` and state unchanged.

---

### BUG-15: Event-queue drain ownership is split; null-audio test runs accumulate events unbounded ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: D (D-01), C (C-07), A (loop)
- `src/ecs/resources/event-queue.js` (~L79-101)
- `src/adapters/io/audio-integration.js` (~L308, render-phase drain; ~L415-419, null-adapter early return)
- `src/main.ecs.js` (~L446-451, rAF-loop drain)

**Problem:** The audio runner drains in the render phase, and `main.ecs.js` drains again in the rAF loop (the second is always empty → dead in the wired runtime). But when the audio adapter is null, `runner.tick` early-returns **without draining**, so integration tests calling `stepFrame` directly (no rAF loop, null audio) never drain — `eventQueue.events` grows every step.
**Impact:** In headless/test runs with null audio and no manual drain, the queue grows unbounded (memory) and consumers peek stale cross-frame events. Production is fine.

**Fix:** Move the canonical per-frame drain into `bootstrap.stepFrame` (after render commit), independent of the audio runner; have the runner `peek` instead of `drain`, or guarantee exactly one drain owner.

**Tests to add:** Run `stepFrame` N times with null audio adapter; assert `eventQueue.events.length` stays bounded.

---

### BUG-16: Player respawn invincibility relies on collision-before-life cross-step sync ordering ⬆ Low / Info
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: C (C-02), B (B-04)
- `src/ecs/systems/life-system.js` (~L255-327, L169-171)
- `src/ecs/systems/collision-system.js` (~L805-889)

**Problem:** Respawn invincibility protection is correct under current ordering (life writes `playerStore.invincibilityMs` immediately on respawn; collision reads it next step). Residual risk only if `syncPlayerInvincibility` is skipped on a stale `playerEntity` handle.
**Impact:** Effectively none today; flagged as a fragile cross-system timing dependency.

**Fix:** No change strictly required (verified correct); add a regression test to lock ordering.

**Tests to add:** Two-bomb trap on the spawn tile; assert the player is not double-killed through the invincibility grant.

---

## 2) Dead Code & Unused References

### DEAD-01: Unreachable `if (processMode)` branch in `run-checks.mjs` ⬆ Medium
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: A (Tickets: A-07, A-13)
- `scripts/policy-gate/run-checks.mjs` (~L227-234; constant-`false` writes at L254-255)

**Problem:** `processMode` is a module-level `const` (L64), never reassigned; L190 returns unconditionally when it is true. The nested `if (processMode)` at L227-234 can never execute, and L254-255 always emit `false`.
**Impact:** Dead branch; misleading reported fields.

**Fix:** Remove L227-234; replace L254-255 with literal `false`.

---

### DEAD-02: Fully dead exported `getCurrentBranchName` ⬆ Medium
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: A (Tickets: A-07, A-13)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L899)

**Problem:** Grep across `scripts`/`tests` finds only the definition — zero callers.
**Impact:** Dead exported function.

**Fix:** Delete the function.

---

### DEAD-03: Orphaned exported PR-checklist constants ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: A (Tickets: A-07, A-13)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L25 `REQUIRED_SECTIONS`, L36 `REQUIRED_CHECKBOXES`, L48 `REQUIRED_LAYER_CHECKBOXES`)

**Problem:** Each symbol's only grep hit is its own `export const`; zero references.
**Impact:** Dead surface (likely orphaned from an unbuilt PR-checklist gate).

**Fix:** Remove the three constants, or wire them into the intended PR-checklist gate.

---

### DEAD-04: `policy-utils.mjs` helpers exported but used only internally ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: A (Tickets: A-07, A-13)
- `scripts/policy-gate/lib/policy-utils.mjs` — `TICKET_ID_PATTERN` (L152), `escapeRegex` (L528), `normalizePolicyPath` (L609), `extractTicketIds` (L633), `pathMatchesPattern` (L812), `commandSucceeded` (L888)

**Problem:** Each is referenced only within `policy-utils.mjs`; redundant public API.
**Impact:** Overstated module surface.

**Fix:** Drop the `export` keyword (keep module-private).

---

### DEAD-05: `src/` exports used only inside their own module (redundant public API) ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** per-symbol ownership below
- `startMoveTowardDirection` `src/ecs/systems/player-move-system.js:178` (B / B-03)
- `stopAtCurrentTarget` `src/ecs/systems/player-move-system.js:204` (B / B-03)
- `validateMapSchema` `src/ecs/resources/map-resource.js:370` (D / D-02, D-03)
- `createBombDetonationRequest` `src/ecs/systems/bomb-tick-system.js:384` (B / B-06)
- `formatLives` `src/adapters/dom/hud-adapter.js:74` (C / C-05)
- `formatScore` `src/adapters/dom/hud-adapter.js:82` (C / C-05)
- `formatTimer` `src/adapters/dom/hud-adapter.js:90` (C / C-05)
- `KEYBOARD_CODE_BINDINGS` `src/adapters/io/input-adapter.js:50` (B / B-02)
- `KEYBOARD_KEY_BINDINGS` `src/adapters/io/input-adapter.js:64` (B / B-02)
- `registerSystemsByPhase` `src/game/bootstrap.js:767` (A / A-03)

**Problem:** All are live (called internally) but have 0 importers across `src/` or `tests/`; the `export` keyword is unused.
**Impact:** Redundant API surface; several are even advertised as "Public API" in headers (see DEAD-09).

**Fix:** Drop the `export` keyword for each; keep the function bodies (they are exercised indirectly).

---

### DEAD-09: JSDoc "Public API" headers overstate real export surface ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: B (B-06, B-03), D (D-02/D-03), C (C-05)
- `src/ecs/systems/bomb-tick-system.js:13`, `src/ecs/resources/map-resource.js:34`, `src/adapters/dom/hud-adapter.js` header

**Problem:** "Public API" blocks list symbols with zero external importers (the DEAD-05 set).
**Impact:** Docstring drift.

**Fix:** When removing redundant `export`s (DEAD-05), also trim these symbols from the "Public API" header lines.

---

### DEAD-07: Truncated comment in `run-all.mjs` ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: A (Tickets: A-07, A-13)
- `scripts/policy-gate/run-all.mjs` (~L155)

**Problem:** `// The describePolicyResolution call was removed from here because run-checks.mjs` — sentence truncated; rationale lost.
**Impact:** Lost rationale.

**Fix:** Complete or delete the comment.

---

### DEAD-08: Redundant `prod` script in `package.json` ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: A (Tickets: A-01)
- `package.json` (~L16, `"prod": "npm run build && npm run preview"`)

**Problem:** Convenience alias not referenced by `ci`, any workflow, or other scripts.
**Impact:** Redundant script surface (low confidence — verify it is not a documented developer entrypoint).

**Fix:** Keep only if documented as a dev entrypoint; otherwise remove.

---

### DEAD-06 (Info): Test-only exports — intentional test seams, not removable
**Origin:** 2. Dead Code & Unused References
- `storage-adapter.js` (`HIGH_SCORE_STORAGE_KEY`, `AUDIO_SETTINGS_STORAGE_KEY`, `DEFAULT_AUDIO_SETTINGS`, `safeRead`, `safeWrite`, `saveAudioSettings`), `audio-integration.js` (`AUDIO_CUE_MAPPING`, `MUSIC_STATE_MAPPING`, `resolveCueForEvent`, `resolveMusicForState`, `AUDIO_PRELOAD_INDICATOR_THRESHOLD_MS`), `input-adapter.js` (`normalizeKeyboardIntent`), `main.ecs.js` (`renderCriticalError`) — each referenced only by tests. **No change required**; documented so they are not mistaken for dead code.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: Ownership policy omits 4 shipped systems (policy-utils.mjs diverges from track docs) ⬆ High
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** `implementation-plan.md` §3 "Ownership stays by track"; AGENTS.md Canonical Documentation Rule (docs/policy must stay in sync).
**Files:** Ownership: C (Tickets: C-05 — `hud-system.js`, `hud-render-system.js`, `screens-system.js`) + D (animation/D-10 — `player-animation-system.js`)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L382-399 Track C patterns; ~L416-435 Track D patterns)

**Problem:** Track C patterns omit `hud-system.js`, `hud-render-system.js`, `screens-system.js` (all C-05 deliverables per `track-c.md:124`, `ticket-tracker.md:139`). Track D patterns omit `player-animation-system.js` (Track D per `track-d.md:212,220`). Verified programmatically: `findOwnershipViolations` resolves these 4 files to **none** of A/B/C/D.
**Impact:** PR ownership gate cannot attribute or scope-check these files; any track touching them is flagged out-of-scope or silently ungoverned. Governance drift (not runtime).

**Fix:** Add to `policy-utils.mjs`: Track C `src/ecs/systems/hud-*.js`, `src/ecs/systems/screens-*.js`; Track D `src/ecs/systems/player-animation-*.js` (plus matching test globs).

---

### ARCH-02: Directory-structure doc drift — 8 shipped systems absent from implementation-plan §2 ⬆ Low
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** `implementation-plan.md` §10.3 "Keep documentation links synchronized"; AGENTS.md doc-sync expectation.
**Files:** Ownership: A (docs sync); affected tickets C-05, D-10
- `docs/implementation/implementation-plan.md` (~L265-280)

**Problem:** §2 omits `board-sync-system.js`, `ghost-animation-system.js`, `hud-system.js`, `hud-render-system.js`, `pause-input-system.js`, `player-animation-system.js`, `screens-system.js`, `collision-gameplay-events.js` — all present in `src/ecs/systems/`.
**Impact:** Plan no longer reflects as-built architecture.

**Fix:** Update the §2 listing to include the 8 systems with owning tickets.

---

### ARCH-03: Orphaned/duplicate assets and non-kebab-case naming under `assets/generated/visuals/` ⬆ Low
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** `assets-pipeline.md` §4 (visual naming = lower-kebab-case), §9.4 / `implementation-plan.md` §9.4 ("auditable source-to-export path"; "manifest-referenced assets exist").
**Files:** Ownership: D + A co-owned (D-11 / A-09 / visual-manifest governance); C (C-08 audio dup)
- `assets/generated/visuals/original/*.png`, `…/removed_background/*-removebg-preview.png`, `…/sheets/v1..v5/*` (~179 underscore-named dev artifacts, manifest-unreferenced)
- `assets/generated/ui/ui-confirm.mp3` (orphan; manifest references `sfx/ui-confirm.mp3`)

**Problem:** ~179 dev-iteration artifacts use underscores (not kebab-case) and are not manifest-referenced; one orphaned duplicate audio file.
**Impact:** No runtime/CI failure (all manifest entries resolve); repo hygiene / pipeline-auditability drift.

**Fix:** Remove dev-iteration artifacts or move under `assets/source/`; delete the duplicate `ui/ui-confirm.mp3`.

---

**Verified compliant (no findings):** structural deferral (`world.js:304-371`), opaque entities / frozen worldView (`world.js:126-143`), DOM isolation (only `render-dom-system.js` touches DOM), render-once-per-rAF (`bootstrap.js:1034-1064`), render-intent contract per impl-plan §5 (pre-allocated buffer `bootstrap.js:981`, `classBits` `Uint8Array` bitmask, `MAX_RENDER_INTENTS=445` ≥ entity capacity), pause invariants (`clock.js:94-97`, `main.ecs.js:401-403`), input contract (`input-system` in `meta`, cleared on blur/visibility), catch-up clamp (`MAX_STEPS_PER_FRAME=5`), DOM pooling (`translate(-9999px)`), event determinism (sort by `(frame, order)`), `will-change` scoped to player/ghost only. No audit question (F-01..F-21, B-01..B-06) is structurally unsatisfiable.

---

## 4) Code Quality & Security

### SEC-01: Production CSP `frame-ancestors` / Trusted Types delivered via `<meta>` only — ignored on static hosts ⬆ Medium
**Origin:** 4. Code Quality & Security
**Files:** Ownership: A (Tickets: A-01, A-08)
- `vite.config.js` (~L36-52 `PRODUCTION_CSP`, L88-104 `createCspMetaPlugin`, L118-122 preview headers)

**Problem:** The production build ships CSP only as an HTML `<meta http-equiv>` tag. `frame-ancestors` and `X-Frame-Options` are **not honored via `<meta>`** by browsers; on the GitHub Pages target (`base: '/make-your-game/'`, L111) there is no server to emit real headers, so clickjacking protection degrades. (Trusted Types via `<meta>` *is* honored by Chromium, so TT still works there.)
**Security impact:** No clickjacking protection on the static Pages deployment.

**Fix:** Document the static-host limitation, or add a deployment-time header mechanism (`_headers` file) and/or a JS frame-busting fallback (`if (self !== top) top.location = self.location`). Keep the `<meta>` CSP for meta-honored directives.

---

### SEC-03: Map size cap relies on `Content-Length`, absent under chunked transfer ⬆ Low
**Origin:** 4. Code Quality & Security
**Files:** Ownership: A (Tickets: A-03) + D (D-03)
- `src/main.ecs.js` (~L196-209 size guard, L176 `MAX_MAP_SIZE_BYTES`)

**Problem:** The oversized-payload guard only triggers `if (contentLengthHeader)`. Chunked transfer omits the header, so a huge map JSON proceeds to `response.json()` with no byte cap. Downstream schema validation bounds the parsed structure (≤100×100), so impact is a transient large allocation; maps are same-origin first-party (`connect-src 'self'`).
**Security impact:** Transient large-allocation DoS window before structural rejection; low real-world risk.

**Fix:** Measure body size (`response.clone().arrayBuffer().byteLength`) against `MAX_MAP_SIZE_BYTES` before `JSON.parse`; fail-closed if size is unknowable.

---

### SEC-02: Policy-gate `var` sink regex is line-anchored (defense-in-depth gap) ⬆ Low
**Origin:** 4. Code Quality & Security
**Files:** Ownership: A (Tickets: A-01, A-07)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L121-122)

**Problem:** The `var` rule uses `/^\s*var\s+.../m`, so a `var` not at line-start (`for (var i…)`, `;var x`) is not flagged. 0 real violations exist today — purely a future-coverage gap.
**Security impact:** Latent gate weakness; no current exposure.

**Fix:** Broaden to `/(^|[;{}\s])var\s+[A-Za-z_$]/m`.

---

**Confirmed-safe patterns (evidence):** 0 real `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` in `src/` (comments only); 0 `eval`/`new Function`/string-timer; 0 forbidden tech (canvas/WebGL/frameworks/`var`/`require`/`XMLHttpRequest`); 0 inline HTML handlers; strict Trusted Types default policy that throws (`trusted-types.js:17-30`, imported first in `main.js:12`); fail-closed storage trust boundary (`storage-adapter.js` `safeRead`/`safeWrite` + per-field clamping); fail-closed map/JSON validation (`map-resource.js:790-801` throws, `level-loader.js` returns null with no silent fallback, `validate-schema.mjs` `exit(1)` in CI); per-system + outer-frame try/catch with fault budget + quarantine; user-visible `renderCriticalError` (`role=alert`); `unhandledrejection` handler installed (`main.ecs.js:294-311`); policy-gate security scans are full-repo and CI-enforced (`--scope=repo`/`--scope=all`), with bugfix/integration branches bypassing **ownership only** (security/forbidden/sink scans still run). **No Blocking/Critical/High security findings.**

---

## 5) Tests & CI Gaps

### CI-01: CI workflow runs unit tests only as named steps; coverage/integration/E2E hidden behind a soft-fail orchestrator ⬆ Critical
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-07, A-13)
- `.github/workflows/policy-gate.yml` (~L64-67 runs only `test:unit`; L79-82 `policy --scope=all`)
- `scripts/policy-gate/run-all.mjs` (~L72-83 `runStep` swallows failures; L131 delegates to `policy:quality`)
- `scripts/policy-gate/run-project-gate.mjs` (~L23-40 where `test:coverage` + `test:e2e` live)

**Problem:** Named workflow steps run Biome, schema, and **unit tests only**. Coverage thresholds (vitest.config.js: branches 85/functions 85/lines 90/statements 90) and the entire Playwright E2E + audit-browser suite execute only indirectly inside `npm run policy`, via `runStep` which catches failures and continues. There is no explicit `test:integration` step; integration is only swept up transitively by coverage. A reviewer reading the workflow sees no coverage/e2e gate.
**Why it matters:** Coverage/E2E enforcement is buried two indirections deep behind a soft-fail wrapper — fragile and non-attributable.

**Fix:** Add explicit, hard-failing named steps: `npm run test:coverage`, `npm run test:integration`, `npm run test:e2e`.

---

### CI-02: E2E/audit suite runs only against the Vite **dev** server; production CSP/Trusted Types never browser-tested ⬆ High
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-06, A-09, A-01, A-07)
- `playwright.config.js` (~L43-47 `webServer.command: 'npm run dev'`); CSP/TT only unit-tested (`tests/unit/security/*`)

**Problem:** AGENTS.md:152 mandates strict CSP/Trusted Types in production builds, but all Playwright specs boot `npm run dev`, so the strict production CSP/TT is never validated in a real browser. A CSP regression that breaks the production build passes every gate.
**Why it matters:** Production-only security regressions are invisible to CI.

**Fix:** Add a Playwright project/spec whose `webServer` runs `npm run build && npm run preview` and asserts the strict CSP + Trusted Types are present and non-breaking.

---

### CI-03: Cross-browser gap — AGENTS.md requires Chrome/Firefox/Safari; Playwright is Chromium-only ⬆ High
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-06, A-09)
- `playwright.config.js` (~L34-42 single Chromium `use` block, no `projects`)
- `.github/workflows/policy-gate.yml` (~L69-72 installs `chromium` only); AGENTS.md:41

**Problem:** No `projects` array, no Firefox/WebKit config, CI installs Chromium only. Two of three mandated browser targets are untested.
**Why it matters:** Firefox/Safari rendering, input, or compositor regressions are never caught.

**Fix:** Add Playwright `projects` for `firefox` and `webkit` (functional/HUD/pause specs at minimum; keep perf specs Chromium-only with documented rationale). Install all three browsers in CI.

---

### CI-04: `prefers-reduced-motion` (AGENTS.md MUST) has zero implementation or test coverage ⬆ High
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: D (Tickets: D-05, D-08) + C (C-05)
- No matches for `prefers-reduced-motion`/`reduced-motion`/`reducedMotion` in `tests/` **or** `src/`; AGENTS.md:161

**Problem:** A hard MUST ("menus, transitions, overlays, decorative effects MUST be disabled or simplified under `prefers-reduced-motion`") is neither implemented nor tested.
**Why it matters:** Accessibility MUST violation, completely unguarded.

**Fix:** Add a Playwright spec using `page.emulateMedia({ reducedMotion: 'reduce' })` asserting menu/overlay/transition animations are disabled/simplified. If implementation is also missing, flag as a parallel implementation gap to the owning track.

---

### CI-05: Flaky fixed `waitForTimeout` waits instead of state-driven polling ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (A-06), D (D-08), C (C-04, C-05)
- `tests/e2e/render-desync-bugs.spec.js` (L115,171,230,276,460); `tests/e2e/stress/race-condition.spec.js` (L47,69,90); `tests/e2e/audit/audit.browser.spec.js` (L410,653,656,661); `tests/e2e/map-border-integrity.spec.js` (L104)

**Problem:** 13 fixed wall-clock waits (e.g. 3500ms explosion, 16ms "one frame"). Under CI throttling (~25-35 FPS per config comment) these flake or waste time. The rest of `audit.browser.spec.js` correctly uses `expect.poll`/`waitForFunction`.
**Why it matters:** Flaky/slow E2E gate.

**Fix:** Replace each with state-driven `page.waitForFunction` on the runtime snapshot (frame/state/explosion entity state), mirroring `waitForSpawnTime`/`waitForFrameSamples`.

---

### CI-06: `screens-audio-toggle.js` (C-11) has no dedicated test ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: C (Tickets: C-11)
- `src/adapters/dom/screens-audio-toggle.js` (no dedicated test; covered only transitively by `screens-settings.test.js`, `c-11-settings-navigation.spec.js`)

**Problem:** The only `src/adapters/**` file lacking a dedicated test. C-11 is marked Done, but the always-visible `aria-pressed` quick-toggle (a keyboard-only control surface, accessibility MUST AGENTS.md:158) has no focused test of toggle state / `aria-pressed` / keyboard activation.
**Why it matters:** Accessibility-bearing control only incidentally exercised.

**Fix:** Add `tests/integration/adapters/screens-audio-toggle.test.js` asserting render, `aria-pressed` reflects mute state, keyboard activation, and persistence wiring.

---

### CI-07: AGENTS.md "DOM ≤ 500, assert in dev-mode startup" not implemented as a startup assertion ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: D (D-08, D-09) + A (A-09)
- AGENTS.md:208; `src/main.ecs.js` has no dev-mode DOM-count startup assertion. Budget asserted only at runtime in `tests/e2e/audit/audit.browser.spec.js:380-391,608`.

**Problem:** The spec mandates a dev-mode startup assertion in the app so an over-budget level fails fast in development. It exists only as an external Playwright check.
**Why it matters:** Missing required in-app dev assertion.

**Fix:** Add an `import.meta.env.DEV`-gated post-level-load `document.querySelectorAll('*').length <= 500` assertion in `src/main.ecs.js`, plus a test asserting it triggers when exceeded.

---

### CI-08: Performance criteria only partially testable — no sustained-degradation / stutter / allocation-burst assertions ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (A-06, A-09) + D (D-08)
- `tests/e2e/audit/audit.browser.spec.js` (~L305-322 F-17/F-18 percentile checks; L393-424 coarse allocation heuristic); AGENTS.md:203-207

**Problem:** F-17/F-18 assert p95/p99 frame time + p95 FPS but **not** the sustained-degradation rule (>500ms continuous sub-60 FPS) nor stutter-burst detection. The allocation check is a coarse "<2 MB growth in 200ms" gated on Chromium-only `performance.memory` and does not detect *repeated burst* allocations.
**Why it matters:** Key performance acceptance criteria are unenforced.

**Fix:** Add a sustained-window analysis (max contiguous sub-60-FPS span < 500ms) and a longer warm-up multi-sample allocation-delta test asserting flat growth.

---

### CI-09: Audit "executable" matrix rows point at an inventory test rather than the behavioral spec ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-06, A-13)
- `tests/e2e/audit/audit.e2e.test.js` (~L45-155 inventory/contract assertions)
- `docs/implementation/audit-traceability-matrix.md` (~L51-66, REQ-01/02/09/10/11/12/13/14 cite `audit.e2e.test.js` as "Executable")

**Problem:** `audit.e2e.test.js` is a Vitest inventory/contract test (proves IDs/thresholds *exist*), not gameplay behavior. The real behavioral assertions live in `audit.browser.spec.js` (e.g. "no canvas" is asserted at `audit.browser.spec.js:374`, not the cited file). Several matrix rows overstate executable coverage.
**Why it matters:** Traceability matrix misrepresents which artifact actually verifies behavior.

**Fix:** Re-point behavior-bearing matrix rows to `audit.browser.spec.js`; reserve `audit.e2e.test.js` references for the inventory/category/threshold-declaration obligations it truly covers.

---

### CI-10: Phase report has hardcoded foreign absolute paths and stale phase-completion framing ⬆ Low
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-13, A-09)
- `docs/audit-reports/phase-testing-verification-report.md` (~L5 `file:///home/ertval/code/...` links; L26)
- `docs/implementation/ticket-tracker.md` (L66-77 P3 gated on open A-13; P4 not started)

**Problem:** (a) Hardcoded `/home/ertval/...` source-of-truth links are non-portable/broken for everyone else. (b) The report's completion checklist does not surface that P3 is gated on the still-open A-13 and P4 (A-09/A-14, C-09/C-10 `[-]`). Ticket↔phase parity otherwise holds (no `[x]` ticket shown pending, none vice-versa).
**Why it matters:** Broken canonical links; potential misreading of phase status.

**Fix:** Replace absolute `file:///home/ertval/...` links with repo-relative paths; add an explicit P3/P4 status line mirroring tracker L66-77.

---

### CI-11: Bugfix/integration ownership bypass is `console.warn`-only, never surfaced as a gate result ⬆ Low
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-01, A-07)
- `scripts/policy-gate/run-checks.mjs` (~L71-74, L167-178; L284-291, L327-334 early-return with `console.log` "skipped")

**Problem:** Any `<owner>/bugfix-*` or `<owner>/integration*` branch silently relaxes cross-track ownership to a warning. By design, but there is no test asserting bypass branches *still* run security/traceability/header/lockfile gates, and no CI mechanism flagging that a bypass occurred (buried `console.warn`).
**Why it matters:** A mislabeled branch could move cross-track files unreviewed.

**Fix:** Add a policy-utils unit test asserting bypass branches still execute forbidden-tech/header/traceability gates; emit the bypass as a GitHub Actions `::warning::` annotation.

---

**Verified adequately covered (no finding):** every `src/ecs/{systems,components,resources,world}`, `src/shared/*`, `src/security/*`, `src/debug/*`, `src/game/*` file has a dedicated unit test; coverage config scopes `include: ['src/**/*.js']` only (tests excluded); all `src/adapters/**` have dedicated integration tests except CI-06; bomb-chain/cross-system/pause integration covered; policy-gate ownership/lockfile/banned-framework/DOM-boundary/header/traceability checks genuinely enforced (throw → exit non-zero); audit.md ↔ matrix ↔ question-map count drift hard-fails.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track Ownership | Description |
|----------------|---------|---------|---------|---------|---------|-----------------|-------------|
| BUG-01 | BUG-01 | — | — | — | — | B / C | Bomb-killed ghosts never respawn (`deadGhostIds` unwired) |
| BUG-02 | BUG-02 | — | — | — | — | B | Ghost revive gated on exact float equality |
| BUG-03 | BUG-03 | — | — | — | — | C / A | Same-level restart timer reset coupling |
| BUG-04 | BUG-04 | — | — | — | — | B | Power-pellet stuns queued/in-house ghosts |
| BUG-05 | BUG-05 | — | — | — | — | C / B / A | Dead `MAX_DELTA_MS` clamp |
| BUG-06 | BUG-06 | — | — | — | — | C | Fractional time bonus vs whole-second HUD |
| BUG-07 | BUG-07 | — | — | — | — | B | Fire-pool exhaustion drops in-blast tiles |
| BUG-08 | BUG-08 | — | — | — | — | B | Combo split across ticks post-quarantine |
| BUG-09 | BUG-09 | — | — | — | — | C / A | Last-pellet-at-0:00 timer-vs-level-progress race |
| BUG-10 | BUG-10 | — | — | — | — | A / C | Missing FSM PAUSED→MENU / LEVEL_COMPLETE→MENU |
| BUG-11 | BUG-11 | — | — | — | — | A / B | Restart leaves stale bomb/fire SoA lanes |
| BUG-12 | BUG-12 | — | — | — | — | B / D | Misleading edge-of-map radius cap |
| BUG-13 | BUG-13 | — | — | — | — | D / A | Schema validation skipped in test env |
| BUG-14 | BUG-14 | — | — | — | — | A / D | `alpha` recompute on duplicate timestamps |
| BUG-15 | BUG-15 | — | — | — | — | D / C / A | Split event-queue drain; unbounded in null-audio tests |
| BUG-16 | BUG-16 | — | — | — | — | C / B | Respawn invincibility cross-step sync dependency |
| DEAD-01 | — | DEAD-01 | — | — | — | A | Unreachable `if (processMode)` branch |
| DEAD-02 | — | DEAD-02 | — | — | — | A | Dead exported `getCurrentBranchName` |
| DEAD-03 | — | DEAD-03 | — | — | — | A | Orphaned PR-checklist constants |
| DEAD-04 | — | DEAD-04 | — | — | — | A | Internal-only exported policy helpers |
| DEAD-05 | — | DEAD-05 | — | — | — | B / C / D / A | `src/` exports with no importers |
| DEAD-06 | — | DEAD-06 | — | — | — | C / B | Test-only exports (informational) |
| DEAD-07 | — | DEAD-07 | — | — | — | A | Truncated comment in `run-all.mjs` |
| DEAD-08 | — | DEAD-08 | — | — | — | A | Redundant `prod` npm script |
| DEAD-09 | — | DEAD-09 | — | — | — | B / D / C | "Public API" JSDoc overstates surface |
| ARCH-01 | — | — | ARCH-01 | — | — | C / D | Ownership policy omits 4 shipped systems |
| ARCH-02 | — | — | ARCH-02 | — | — | A | impl-plan §2 missing 8 systems |
| ARCH-03 | — | — | ARCH-03 | — | — | D / A / C | Orphaned/non-kebab assets + dup audio |
| SEC-01 | — | — | — | SEC-A1 | — | A | CSP/TT via `<meta>` only on static host |
| SEC-02 | — | — | — | SEC-A2 | — | A | Policy `var` regex line-anchored |
| SEC-03 | — | — | — | SEC-A3 | — | A / D | Map size cap trusts `Content-Length` |
| CI-01 | — | — | — | — | CI-01 | A | Coverage/integration/E2E hidden behind soft-fail |
| CI-02 | — | — | — | — | CI-02 | A | Production CSP/TT never browser-tested |
| CI-03 | — | — | — | — | CI-03 | A | Chromium-only vs Chrome/Firefox/Safari MUST |
| CI-04 | — | — | — | — | CI-04 | D / C | `prefers-reduced-motion` zero coverage |
| CI-05 | — | — | — | — | CI-05 | A / D / C | Flaky fixed `waitForTimeout` waits |
| CI-06 | — | — | — | — | CI-06 | C | `screens-audio-toggle.js` no dedicated test |
| CI-07 | — | — | — | — | CI-07 | D / A | DOM ≤ 500 dev-startup assertion missing |
| CI-08 | — | — | — | — | CI-08 | A / D | No sustained-degradation/allocation-burst tests |
| CI-09 | — | — | — | — | CI-09 | A | Matrix cites inventory test for behavior rows |
| CI-10 | — | — | — | — | CI-10 | A | Phase report foreign abs paths / stale framing |
| CI-11 | — | — | — | — | CI-11 | A | Ownership bypass warn-only, unsurfaced |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
1. **BUG-01**: Wire ghost deaths into `deadGhostIds` so the C-03 respawn pipeline fires; add respawn integration test (Track B / C).
2. **CI-01**: Add explicit hard-failing `test:coverage`, `test:integration`, `test:e2e` steps to `policy-gate.yml` (Track A).

### Phase 2 — High Severity (immediate follow-up)
3. **ARCH-01**: Add the 4 missing system patterns to `policy-utils.mjs` ownership rules + test globs (Track C / D).
4. **CI-02**: Add a Playwright project that builds+previews and asserts strict production CSP/Trusted Types (Track A).
5. **CI-03**: Add Firefox/WebKit Playwright projects; install all three browsers in CI (Track A).
6. **CI-04**: Implement + test `prefers-reduced-motion` handling for menus/overlays/transitions (Track D / C).
7. **BUG-03**: Make same-level restart explicitly refill the level timer; add test (Track C / A).

### Phase 3 — Medium Severity
8. **BUG-09**: Reorder `level-progress-system` before `timer-system` (or guard timer on pellet-clear) (Track C / A).
9. **BUG-04 / BUG-07 / BUG-10 / BUG-11 / BUG-15**: Restrict stun to active ghosts; clamp fire radius / guard pool exhaustion; add FSM menu edges (if desired); zero recycled prop lanes on restart; single-owner event drain in `stepFrame` (Tracks B / C / D / A).
10. **SEC-01**: Document or mitigate CSP `frame-ancestors`/TT static-host gap (Track A).
11. **DEAD-01 / DEAD-02**: Remove unreachable policy branch and dead `getCurrentBranchName` (Track A).
12. **CI-05 / CI-06 / CI-07 / CI-08 / CI-09**: Convert fixed waits to state-driven; add `screens-audio-toggle` test; add DOM-budget dev assertion; add sustained-degradation/allocation tests; re-anchor matrix rows (Tracks A / C / D).

### Phase 4 — Low Severity (maintenance)
13. **BUG-02 / BUG-05 / BUG-06 / BUG-08 / BUG-12 / BUG-13 / BUG-14 / BUG-16**: Robustness/clarity hardening (tile-level revive gating, remove dead clamp, consistent rounding, document combo guarantee, clarify radius cap, test-env schema, optional clock early-return, lock invincibility ordering with a test).
14. **DEAD-03 / DEAD-04 / DEAD-05 / DEAD-07 / DEAD-08 / DEAD-09**: Drop redundant exports/constants, fix truncated comment, evaluate `prod` script, sync "Public API" headers (Tracks A / B / C / D).
15. **ARCH-02 / ARCH-03**: Update impl-plan §2 system listing; remove orphaned/non-kebab assets + duplicate audio (Tracks A / D / C).
16. **SEC-02 / SEC-03 / CI-10 / CI-11**: Broaden `var` regex; measure body size instead of trusting `Content-Length`; fix phase-report foreign paths/framing; add bypass-branch gate test + `::warning::` annotation (Track A).

---

## Notes

- **Overall posture is strong.** The ECS engine is unusually disciplined: structural deferral, opaque entities, DOM isolation, render-once-per-rAF, render-intent contract (impl-plan §5), pause invariants, input snapshotting, event determinism, and DOM pooling all verified compliant. No audit question (F-01..F-21, B-01..B-06) is structurally unsatisfiable.
- **Security is clean.** No Blocking/Critical/High security findings — only residual defense-in-depth items. Unsafe sinks, forbidden tech, and inline handlers are at 0 occurrences in `src/`; Trusted Types, fail-closed validation, fault-budget quarantine, and full-repo CI-enforced scans are all in place.
- **The two Critical items are integration/CI, not core-engine:** BUG-01 (a missing one-line resource bridge that disables ghost respawn) and CI-01 (coverage/E2E enforcement buried behind a soft-fail orchestrator). Both are high-leverage, low-risk fixes.
- **Ownership-policy drift (ARCH-01)** is the most important governance fix before phase closure: 4 shipped systems are ungoverned by the PR ownership gate.
- Track attributions are derived from `ticket-tracker.md`, `implementation-plan.md`, and `track-a..d.md`; where a finding spans a bridge/wiring seam, both the owning track and the integrating track (usually A) are listed.

---

*End of report.*

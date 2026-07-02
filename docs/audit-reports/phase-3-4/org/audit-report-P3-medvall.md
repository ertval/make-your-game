# Codebase Analysis & Audit Report - P3

**Date:** 2026-06-19
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review — 5 analysis passes (Bugs, Dead Code, Architecture, Security, Tests/CI)

> **Execution note:** The canonical `code-analysis-audit` workflow specifies 5 parallel subagents. Subagent capacity was rate-limited at run time, so the five domain passes were run sequentially by the orchestrator inline. Evidence standard (file:line refs, read-only) and report format are unchanged. State audited: `main` after merge of PR #220 (`integration-D11-powerups-bomb`).

---

## Methodology

Five evidence-driven, read-only passes:
1. **Bugs & Logic Errors** — state machine, entity lifecycle, level-transition resets, numeric bounds.
2. **Dead Code & Unused References** — unused exports, dead CSS, shipped-but-unwired assets, deprecated hatches, duplicated constants.
3. **Architecture, ECS Violations & Guideline Drift** — DOM isolation, adapter injection, render-intent contract, hot-path allocations, ownership-policy mirror.
4. **Code Quality & Security** — unsafe sinks, forbidden tech, CSP/Trusted Types, storage trust, error visibility.
5. **Tests & CI Gaps** — coverage config, e2e determinism, audit traceability.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 0 |
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 4 |
| 🟢 Low / Info | 5 |

**Top risks:**
1. **BUG-01** — Power-up upgrades (`maxBombs`/`fireRadius`) are wiped on every level transition by a blanket `resetPlayer()`.
2. **ARCH-01** — `world.query()` allocates a fresh array on every call (~17 calls/fixed-step) — sustained GC pressure in the hot path.
3. **SEC-01** — No Content-Security-Policy declared (Trusted Types *is* installed; CSP is missing defense-in-depth).
4. **CI-01** — 13 fixed `waitForTimeout` calls across 4 e2e specs cause the known non-deterministic flake cluster.

The codebase is **mature and disciplined** — no Blocking/Critical/High findings, full green suite, and the ECS/security boundaries are correctly enforced (verified, not assumed — see Notes).

> **Calibration note:** This pass surfaced 4 Medium + 5 Low. DEAD-01 alone bundles **13 individual unused exports**; itemized, the Low count is ~17. A parallel pass by another auditor may classify some of these (CSP, query allocation, the export cluster) at different severities — differences are granularity/calibration, not disagreement on the underlying evidence. I deliberately did **not** pad with speculative findings; every item below has a file:line and was verified against the code.

---

## 1) Bugs & Logic Errors

### BUG-01: Power-up upgrades reset on every level transition ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Track Ownership + Ticket IDs:** Track B (power-ups, B-05) / Track A boundary (level-transition wiring, A-05)
- `src/game/bootstrap.js` (~L558 — `syncPlayerEntityFromMap` → `resetPlayer`)
- `src/ecs/components/actors.js` (~L86–87 — `resetPlayer` writes defaults)

**Problem:** Each level load runs `resetPlayer()`, which resets `maxBombs`, `fireRadius`, and speed to defaults. The reset was intended for *transient sim state* (position/velocity/input on recycled slots) but also clobbers *persistent progression*. `docs/game-description.md §4.4` is silent on cross-level persistence.

**Impact:** Player loses bomb/fire upgrades the instant a level is cleared — atypical for the genre. Gameplay/balance, not a crash.

**Fix:** Preserve `maxBombs`/`fireRadius` across level transitions while still resetting on new-game/restart (snapshot before `resetPlayer`, restore unless it's a fresh game). Speed boost (10s timed buff) may stay reset.

**Tests to add:** Extend `tests/integration/gameplay/level-transition-spawn-reset.test.js` to assert upgrades survive a transition but reset on a new game.

---

## 2) Dead Code & Unused References

### DEAD-01: 13 exported symbols are never imported anywhere ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Track Ownership + Ticket IDs:** Mixed — Track A (`bootstrap.js`, `replay.js`, `input-adapter.js`), Track B (`bomb-tick-system.js`, `player-move-system.js`), Track C (`hud-adapter.js`), Track D (`map-resource.js`)
Each verified with 0 references across `src/` and `tests/`:
- `registerSystemsByPhase` — `src/game/bootstrap.js`
- `serializeWorldState`, `hashWorldState`, `ReplayInputAdapter` — `src/debug/replay.js` _(debug module — confirm whether intended as a kept dev API before removing)_
- `validateMapSchema` — `src/ecs/resources/map-resource.js` _(superseded by `validateMapSemantic` + the JSON-schema validator)_
- `createBombDetonationRequest` — `src/ecs/systems/bomb-tick-system.js`
- `startMoveTowardDirection`, `stopAtCurrentTarget` — `src/ecs/systems/player-move-system.js`
- `KEYBOARD_CODE_BINDINGS`, `KEYBOARD_KEY_BINDINGS` — `src/adapters/io/input-adapter.js` _(confirm not a public config surface)_
- `formatLives`, `formatScore`, `formatTimer` — `src/adapters/dom/hud-adapter.js` _(HUD formats values without them — likely genuinely dead)_

**Impact:** Audit/maintenance surface; implies API that nothing consumes; risks bit-rot.
**Fix:** Remove, or down-scope from `export` to module-private. For `replay.js`/keyboard bindings, confirm dev/public-API intent first; the `hud-adapter` formatters and `validateMapSchema` are the strongest removal candidates.

### DEAD-02: `sprite--explosion--*` CSS classes are never applied ⬆ Low
**Track Ownership:** Track D (styles, D-11)
- `styles/grid.css` — `.sprite--explosion--flash` / `--x-bright` / `--x-fade` / `--embers`

**Problem:** Defined with `background-image`, but no JS applies them (`grep "sprite--explosion--" src/` → empty). The live fire animation uses `sprite--fire--0N` (same explosion webps). **Fix:** remove the four rules or wire a dedicated explosion path.

### DEAD-03: 22 visual-manifest assets are shipped but unwired (`className: null`) ⬆ Info
**Track Ownership:** Track D (D-10/D-11)
- `assets/manifests/visual-manifest.json` + `assets/generated/visuals/128px/`

**Problem:** 22/84 entries are produced but bound to no render class (documented convention in `assets-pipeline.md §8.1`): forward-looking frames (`ghost-*-walk-01/02`, `*-stunned-0N`, `wall-destruct-*`, `power-pellet-0N`, `player-death`, `fire-tile-center`) + text-rendered HUD icons. **Fix:** wire the intended frames or prune to trim payload; not a release blocker.

### DEAD-04: Deprecated test-only escape hatches retained in production modules ⬆ Low
**Track Ownership:** Track A/B
- `src/ecs/resources/event-queue.js` (~L18, L139 — `resetOrderCounter`, `@deprecated test-only`)
- `src/game/bootstrap.js` (~L180 — `@deprecated Legacy option fallback`)

**Problem:** `@deprecated` shims kept in shipping code. **Fix:** migrate the few callers and delete, or gate behind a test-only import.

### DEAD-05: Tile size `32` duplicated instead of a single source of truth ⬆ Low
**Track Ownership:** Track D
- `src/ecs/systems/render-dom-system.js` (~L35 — `const TILE_SIZE_PX = 32`)
- `src/adapters/dom/renderer-adapter.js` (`FIT_DEFAULTS.tileSize = 32`)
- `styles/variables.css` (`--tile-size: 32px`)

**Problem:** The 32px tile is hardcoded in ≥3 places (JS const, adapter fallback, CSS var) with no shared constant. **Fix:** export `TILE_SIZE_PX` from `constants.js` and import it; keep the CSS var as the styling mirror.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: `world.query()` allocates a new array on every call (hot path) ⬆ Medium
**Origin:** 3. Architecture / Performance
**Violated rule:** AGENTS.md performance — "reuse memory to avoid jank; avoid per-frame allocations in hot paths."
**Track Ownership:** Track A (ECS core, A-02)
- `src/ecs/world/query.js` (~L31 — `const matches = []` per `match()`)
- `src/ecs/world/world.js` (~L299–301 — `query()` delegates to `match()` each call)

**Problem:** `QueryIndex.match()` allocates a fresh array and `push()`es matches every invocation. Systems call `world.query()` **17 times across 10 systems per fixed step** (`render-collect-system` alone calls it 4×). At 60Hz that is ~1,000+ short-lived arrays/sec.

**Impact:** Sustained minor-GC pressure → periodic jank, working against the 60 FPS / no-dropped-frame audit criteria (F-17/F-18).

**Fix:** Reuse a per-`QueryIndex` scratch buffer (clear-and-refill), return a count + shared buffer, or expose an iterator; cache query results per frame where masks are stable. Add a micro-benchmark or allocation assertion.

> **Confirmed-safe (verified, no findings):** DOM isolation (only `render-dom-system.js` touches DOM in `src/ecs/systems/`); no adapter imports in `src/ecs/`; render-intent buffer pre-allocated + reused with `classBits` `Uint8Array` bitmask (`render-intent.js`); structural mutations deferred with `#assertNotDispatching` guards (`world.js`); generation-based stale-handle protection (`entity-store.js`); DOM pooling uses `translate(-9999px)` not `display:none`; `will-change` applied only to continuously-moving sprites (explicitly off for transient bombs/fire/explosions); ownership policy mirror (`policy-utils.mjs`) matches the track docs including `board-sync-*`/`ghost-animation-*`.

---

## 4) Code Quality & Security

### SEC-01: No Content-Security-Policy declared (Trusted Types present) ⬆ Medium
**Origin:** 4. Code Quality & Security
**Track Ownership:** Track A (`index.html` + security infra, A-01)
- `index.html` (`<head>` ~L3–15 — no CSP meta; no build-time CSP header)

**Problem:** No CSP. The agentic guide §8 / AGENTS.md call for "CSP and Trusted Types where deployment allows." Trusted Types **is** installed at startup (`src/main.js:12` → `src/security/trusted-types.js`), closing the primary script-injection sink path, so residual risk is limited.

**Impact:** Missing defense-in-depth against injected resource loads / inline execution.

**Fix:** Add a CSP `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'">` (or a deploy header), and verify Vite module loading still works.

> **Confirmed-safe (verified):** no `innerHTML`/`eval`/`document.write`/string-timers in `src/` (matches are docstrings or the TT allowlist); no canvas/WebGL/framework/`var`/`require`/`XMLHttpRequest`; no inline HTML handlers; `unhandledrejection` handler installed (`main.ecs.js:309`); critical errors are user-visible via `#overlay-error` (`main.ecs.js:280`); `storage-adapter` validates `JSON.parse` + object shape and returns defaults on bad data (untrusted-read discipline).

---

## 5) Tests & CI Gaps

### CI-01: Fixed `waitForTimeout` in e2e drives the non-deterministic flake cluster ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Track Ownership:** Track A (QA owns `tests/**`, A-07) + per-spec authors (B/C/D)
- `tests/e2e/render-desync-bugs.spec.js` (5), `tests/e2e/audit/audit.browser.spec.js` (4), `tests/e2e/stress/race-condition.spec.js` (3), `tests/e2e/map-border-integrity.spec.js` (1) — **13 total**

**Problem:** Fixed `page.waitForTimeout(...)` instead of state-driven waits → timing windows are non-deterministic under parallel workers (the documented cluster: different specs fail per run, all pass serial). The `policy:quality` run this phase failed once on exactly this cluster and passed on retry.

**Impact:** Flaky CI masks real regressions and wastes rerun time.

**Fix:** Replace with `page.waitForFunction(...)` polling real state via `window.__MS_GHOSTMAN_RUNTIME__.getWorld()` (as the `#107` ghost-AI spec already does). Prioritize `race-condition` and `render-desync`. Consider a lint rule banning `waitForTimeout` in new specs.

> **Confirmed-safe (verified):** every `src/` file (excluding `main`/`debug`/`security`) has a matching `*.test.js`; coverage is scoped to `src/**/*.js` with enforced thresholds (branches/functions 85, lines/statements 90, `all: true`); `validate:schema` gates manifests (shape, on-disk existence, naming, size, duplicate-id); 1293 vitest + 60 e2e green on the audited commit; all generated assets are kebab-case.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track | Description |
|---|---|---|---|---|---|---|---|
| BUG-01 | BUG-01 | — | (arch dim.) | — | — | B / A | Power-up upgrades reset on level transition |
| ARCH-01 | — | — | ARCH-01 | — | (perf) | A | `world.query()` per-call array allocation |
| SEC-01 | — | — | — | SEC-01 | — | A | No CSP (Trusted Types present) |
| CI-01 | — | — | — | — | CI-01 | A | Fixed `waitForTimeout` e2e flakiness |
| DEAD-01 | — | DEAD-01 | — | — | — | A/B/C/D | 13 unused exports |
| DEAD-02 | — | DEAD-02 | — | — | — | D | Unused `sprite--explosion--*` CSS |
| DEAD-03 | — | DEAD-03 | — | — | — | D | 22 shipped-but-unwired assets |
| DEAD-04 | — | DEAD-04 | — | — | — | A/B | Deprecated test-only hatches in prod modules |
| DEAD-05 | — | DEAD-05 | ARCH | — | — | D | Tile size `32` duplicated, no single source |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical
- _None._

### Phase 2 — High
- _None._

### Phase 3 — Medium
1. **ARCH-01**: Eliminate per-call allocation in `world.query()` (reuse scratch buffer). (Track A)
2. **BUG-01**: Decide + implement power-up cross-level persistence. (Track B / A)
3. **CI-01**: Convert 13 fixed `waitForTimeout` waits to state-driven waits. (Track A)
4. **SEC-01**: Add CSP to complement Trusted Types. (Track A)

### Phase 4 — Low / Maintenance
5. **DEAD-01**: Remove/down-scope the 13 unused exports (verify `replay.js` + keyboard-binding intent first). (All tracks)
6. **DEAD-05**: Centralize `TILE_SIZE_PX` in `constants.js`. (Track D)
7. **DEAD-04**: Delete deprecated test-only hatches. (Track A/B)
8. **DEAD-02**: Remove unused `sprite--explosion--*` CSS. (Track D)
9. **DEAD-03**: Wire or prune the 22 `className: null` assets. (Track D)

---

## Notes

- Strong shape for a final phase: **no Blocking/Critical/High**, full green suite, intact security/ECS boundaries.
- The only player-facing behavioral item (BUG-01) is genuinely a **product decision** — the design spec is silent on cross-level persistence.
- ARCH-01 is the highest-value *engineering* cleanup (the only verified hot-path allocation); CI-01 is the highest-value *process* cleanup (kills rerun noise).
- A final extended pass also reviewed the audio adapter/cue-runner, scoring/timer, HUD systems, and game-flow state machine: all confirmed-safe (complete transition table that throws on invalid transitions, shape-validated high-score `localStorage` reads, loop-trim + visibility-suspend audio handling). No additional findings.
- This report is the medvall / Track D per-owner pass; it should be deduplicated with the other owners' `org/audit-report-P3-*.md` files by Track A's `phase-deduplicate-track-audits` step.

---

*End of report.*

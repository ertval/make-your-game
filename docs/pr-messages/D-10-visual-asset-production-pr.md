# 🚀 D-10: Visual Asset Production — Player Walk Animation + Gameplay Sprite Pack
> **Summary**: Delivers the player walk-cycle animation (8 directional frames), board-sync system for live pellet clearing, and a full 128 px gameplay sprite pack (player refresh + 32 ghost walk frames + bomb fuse + explosion sequence) with CSS classes ready for D-11 wiring.

---

## 📝 Description

### 🔄 What Changed
- **`src/ecs/systems/player-animation-system.js`** (NEW): Logic-phase system that writes `renderable.spriteId` each tick from `velocity.rowDelta/colDelta`. Idle detection uses direction deltas (not `speedTilesPerSecond`); walk frames alternate every 100 ms; timer resets on stop so the next move starts on frame 01.
- **`src/ecs/systems/board-sync-system.js`** (NEW): Render-phase system that consumes `collisionIntents` and calls `boardAdapter.updateCell(row, col, 0)` for `pellet-collected` and `power-pellet-collected` events.
- **`src/ecs/systems/render-dom-system.js`** (MODIFIED): Reads `buffer.spriteId` for PLAYER-kind intents and applies one of ten `sprite--player--*` frame classes from a compile-time allowlist.
- **`src/adapters/dom/renderer-adapter.js`** (MODIFIED): Added `updateCell(row, col, cellType)` — looks up the pre-built cell element array and swaps CSS classes.
- **`src/game/bootstrap.js`** (MODIFIED): Registers `createPlayerAnimationSystem()` in the logic phase, after explosion-system, before render-collect.
- **`styles/grid.css`** (MODIFIED): `.sprite--player` base + 10 frame classes (player); 32 `.sprite--ghost--<type>--walk-*` classes; 4 `.sprite--bomb--{idle,fuse-01,fuse-02,fuse-03}` classes; 4 `.sprite--explosion--{flash,x-bright,x-fade,embers}` classes + `.sprite--explosion` base. Each block carries a comment naming the runtime wiring still required (no ghost-type field in `render-intent` today).
- **`assets/generated/visuals/128px/`** (NEW/REFRESHED): 60 WebPs total — 10 player (idle, walk-{up,down,left,right}-{01,02}, death), 32 ghost walk (4 types × 4 dirs × 2 frames), 4 bomb fuse, 4 explosion, 2 wall-destruct, plus 8 existing sprites re-encoded at lossless quality 92 for set-wide consistency.
- **`assets/generated/visuals/sheets/v5_no_background/`** and **`assets/generated/visuals/removed_background/`** (NEW, 9.6 MB): Source PNGs (background-removed) committed for sprite-extraction reproducibility — build-time inputs only, no runtime consumer.
- **`assets/source/visual/sprite-handoff.json`** (NEW): Sprite metadata handoff table consumed by the D-11 visual manifest.
- **AUDIT-F-20 / F-21 evidence addenda** (MODIFIED), **`tests/e2e/board-reset.spec.js`** (NEW), and unit suites for the two new systems.

### 🎯 Why
- **Rationale**: Before this PR the player sprite never changed frame regardless of movement direction, and pellet cells stayed rendered after collection. Both broke the perceived liveness of the board. Extracting the ghost/bomb/explosion frames in the same pass is cheaper than scheduling a second extraction during D-11.
- **Impact**: Player walk cycle is now visible at runtime; board state stays in sync with collisions. Ghost/bomb/explosion CSS is dormant until D-11 lands the producer side (ghost-animation-system + render-intent extension); the new classes follow the player naming convention so D-11 only needs to wire them.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy`
> *Note: This command includes linting, all test suites (unit, integration, e2e), and policy gate validations.*

### 📋 Audit Traceability
- **AUDIT-D-10-F-01** | `Automated` | Verification: `player-animation-system.test.js` (19 tests) | Evidence: `tests/unit/systems/player-animation-system.test.js`
- **AUDIT-D-10-F-02** | `Automated` | Verification: `board-sync-system.test.js` (11 tests) | Evidence: `tests/unit/systems/board-sync-system.test.js`
- **AUDIT-D-10-F-03** | `Automated` | Verification: `renderer-adapter.test.js` updateCell suite (+4 tests) | Evidence: `tests/integration/adapters/renderer-adapter.test.js`
- **AUDIT-D-10-F-04** | `Automated` | Verification: `bootstrap.test.js` logic-phase order pin | Evidence: `tests/unit/game/bootstrap.test.js`
- **AUDIT-F-19** | `Manual-With-Evidence` | Verification: player walks in all 4 directions with frame alternation at ~100 ms | Evidence: `npm run dev` smoke run; addenda in evidence files below
- **AUDIT-F-20** | `Manual-With-Evidence` | Verification: code inspection — `background-image` swaps repaint the already-promoted player sprite layer only; no new compositor layers | Evidence: `docs/audit-reports/evidence/AUDIT-F-20.layers.md` (D-10 addendum)
- **AUDIT-F-21** | `Manual-With-Evidence` | Verification: code inspection — no new `will-change` declarations introduced by the 10 player walk-frame classes | Evidence: `docs/audit-reports/evidence/AUDIT-F-21.promotion.md` (D-10 addendum)
- **AUDIT-D-10-F-22** | `Automated` | Verification: Playwright e2e proves pellet cell count restores after `runtime.restart()` | Evidence: `tests/e2e/board-reset.spec.js`

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Verified files remain within declared ticket ownership scope.
- [x] **Branching**: Branch name follows `<owner>/<TRACK>-<NN>` convention.
- [x] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06.
- [x] **Evidence**: Attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06 (if applicable).

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: `src/ecs/systems/` has no DOM references (except `render-dom-system.js`).
- [x] **Adapter Injection**: Simulation systems access adapters only through World resources.
- [x] **Safe Sinks**: Untrusted content uses `textContent` or explicit attribute APIs.
- [x] **No Bloat**: No framework imports or canvas APIs introduced.
- [x] **Dependencies**: Checked dependency and lockfile impact.

---

## 🛡️ Security & Architecture Notes
- **Security**: `render-dom-system` uses `classList.add` with values drawn exclusively from the compile-time `PLAYER_SPRITE_CLASSES` array — no user-controlled strings reach the DOM. The new ghost/bomb/explosion CSS class names are likewise compile-time literals once they're wired.
- **Architecture**: `player-animation-system` reads `velocity` (written by `player-move-system`) and writes `renderable.spriteId`; render-collect-system snapshots it; render-dom-system applies the class. `board-sync-system` receives `boardAdapter` at construction time, not via a global. No component store is accessed outside its designated system. **Format deviation**: spec prefers SVG; deliverable uses WebP (lossless quality 92, 128 × 128) because source sheets are raster — preserves per-pixel accuracy, no path-element budget applies. **Handoff for D-11 wiring ticket**: ghost/bomb/explosion CSS classes are not yet applied at runtime because `render-intent` lacks a `ghostType` field — future ticket must extend render-intent (or have render-dom read the ghost store directly), introduce `ghost-animation-system` and `bomb-animation-system`, and wire both into bootstrap. The CSS taxonomy already exists; only the producer side is missing.
- **Risks**: `SPRITE_ID.IDLE = 0` is defined but never written by the animation system in its current form (held for potential future use). 32 ghost + 8 bomb/explosion CSS classes are dormant until the D-11 wiring ticket lands — documented in `grid.css` block comments so they don't read as dead code.

---

<details>
<summary>📖 <b>Local Command Reference</b> (Click to expand)</summary>

| Command | Purpose |
| :--- | :--- |
| **`npm run policy`** | **Primary gate (runs all checks and tests)** |
| `npm run check` | Linting & formatting check |
| `npm run test` | Run all vitest suites |
| `npm run test:unit` | Debug: Unit tests only |
| `npm run test:integration` | Debug: Integration tests only |
| `npm run test:e2e` | Debug: Playwright browser tests |
| `npm run test:audit` | Debug: Audit map validation |
| `npm run validate:schema` | Schema validation |

</details>

# 🚀 D-10: Visual Asset Production — Player Walk Animation + D-11 Ghost/Bomb Asset Prep

> **Summary**: Closes D-10 (player walk-cycle animation, board pellet sync, full test coverage) and pre-stages D-11 ghost/bomb directional sprite assets + CSS classes. Runtime wiring for ghost/bomb animation is intentionally deferred (see "Awaiting wiring" below) so this PR ships pure D-10 behavior plus dormant assets ready for the D-11 ticket.

---

## 📝 Description

### 🔄 What Changed — D-10 (player + board sync)

- **`src/ecs/systems/player-animation-system.js`** (NEW): Logic-phase system that writes `renderable.spriteId` each tick based on `velocity.rowDelta/colDelta`. Idle detection uses direction deltas (not `speedTilesPerSecond`, which player-move-system writes unconditionally). Walk frames alternate every 100 ms; timer resets on stop so the next move always starts on frame 01.
- **`src/ecs/systems/board-sync-system.js`** (NEW): Render-phase system injected with `boardAdapter`. Reads `collisionIntents` and calls `boardAdapter.updateCell(row, col, 0)` for `pellet-collected` and `power-pellet-collected` events.
- **`src/ecs/systems/render-dom-system.js`** (MODIFIED): Reads `buffer.spriteId` for PLAYER-kind intents and applies one of ten `sprite--player--*` CSS frame classes.
- **`src/game/bootstrap.js`** (MODIFIED): Registers `createPlayerAnimationSystem()` in the logic phase (after explosion-system, before render-collect).
- **`src/adapters/dom/renderer-adapter.js`** (MODIFIED): Added `updateCell(row, col, cellType)` — looks up the pre-built cell element array and swaps CSS classes.
- **`styles/grid.css`** (MODIFIED): `.sprite--player` base styles; ten frame classes (idle + 8 directional walk frames + placeholder death) each pointing to 128 px WebP assets.
- **`assets/generated/visuals/128px/characters/`** (NEW/REFRESHED): Ten 128×128 WebP files cropped from `player_direction_v4` sheet — idle, walk-{up,down,left,right}-{01,02}, death.

### 🔄 What Changed — D-11 prep (ghost + bomb assets, CSS only)

These ship as dormant assets + CSS only. **No runtime wiring** — `render-intent` does not carry ghost-type info today, so the classes cannot be applied until a future ticket extends the render pipeline and lands a `ghost-animation-system` / `bomb-animation-system`. The header comment in each `grid.css` block documents this caveat explicitly.

- **`assets/generated/visuals/128px/enemies/`** (NEW): 32 ghost walk WebPs — 4 ghost types (blinky / pinky / inky / clyde) × 4 directions (up / down / left / right) × 2 walk-cycle frames. Cropped from `v5_no_background/ghost_*_v4_*-removebg-preview.png` via per-sheet alpha analysis. Each sheet has a different label layout / column-pair selection; see commit/conversation log for the per-sheet crop tuning.
- **`assets/generated/visuals/128px/items/bomb-*.webp`** (REFRESHED): 4 bomb fuse frames (idle + fuse-01/02/03) re-extracted from `v5_no_background/bomb_animation_sheet_*-removebg-preview.png` for consistency with the new explosion sequence.
- **`assets/generated/visuals/128px/effects/explosion-{01..04}.webp`** (NEW): 4-frame explosion sequence — flash (r1c2 of sheet) → X-bright (r2c1) → X-fade (r3c0) → embers (r3c1).
- **`assets/generated/visuals/128px/environment/wall-destruct-{cracked,shattered}.webp`** (NEW): Two destructible-wall destruction frames staged for a future destruction-animation ticket.
- **`styles/grid.css`** (MODIFIED, +172 lines): 40 new CSS classes — 32 `.sprite--ghost--<type>--walk-<dir>-<frame>` + 4 `.sprite--bomb--{idle,fuse-01,fuse-02,fuse-03}` + 4 `.sprite--explosion--{flash,x-bright,x-fade,embers}` + `.sprite--explosion` base. Each block carries a comment naming the wiring still required.

### 📦 Source Assets (committed for reproducibility)

- **`assets/generated/visuals/sheets/v5_no_background/`** (NEW, 5.1 MB): 13 source PNGs (background-removed) used as the cropping source for all ghost + bomb + explosion frames in this PR.
- **`assets/generated/visuals/removed_background/`** (NEW, 4.5 MB): Original background-removed exports prior to the v5 cropping pass.

Total: ~9.6 MB binary blobs. Committed so future re-extractions are reproducible from the repo without needing the external bg-removal service. Build-time inputs only — no runtime consumer.

### 🎯 Why

- **Static player**: Before this PR the player sprite never changed frame regardless of movement direction or speed.
- **Live board**: Pellet cells stayed rendered after collection; board-sync-system removes them from the DOM at the render phase.
- **Architecture alignment**: Both new systems follow the ECS adapter-injection pattern (no DOM in logic systems, no direct store access in adapters).
- **D-11 prep**: Extracting ghost/bomb frames once now (with the source sheets fresh) is cheaper than scheduling a second extraction pass during D-11. CSS classes follow the same naming convention as the player set so D-11 just needs to wire them.

---

## 🧪 Verification & Audit

### ✅ Verification

- [x] **Master Check**: `npm run policy` — all green (forbidden scan, header check, code quality, schema validation, vitest suite, audit + e2e Playwright).
- [x] **CSS-only changes for ghost/bomb**: No runtime behavior change; no test regressions possible from dormant CSS classes.

### 📋 Audit Traceability

- **AUDIT-D-10-F-01** | `Automated` | Verification: `player-animation-system.test.js` (19 tests) | Evidence: `tests/unit/systems/player-animation-system.test.js`
- **AUDIT-D-10-F-02** | `Automated` | Verification: `board-sync-system.test.js` (11 tests) | Evidence: `tests/unit/systems/board-sync-system.test.js`
- **AUDIT-D-10-F-03** | `Automated` | Verification: `renderer-adapter.test.js` updateCell suite (+4 tests) | Evidence: `tests/integration/adapters/renderer-adapter.test.js`
- **AUDIT-D-10-F-04** | `Automated` | Verification: `bootstrap.test.js` logic-phase order list | Evidence: `tests/unit/game/bootstrap.test.js`
- **AUDIT-D-10-F-19** | `Manual` | Verification: player walks in all 4 directions with visible frame alternation at ~100 ms (per AGENTS.md walk-cycle spec) | Evidence: `npm run dev` smoke run
- **AUDIT-F-20 (layer minimization)** | `Complete` | Code inspection confirms `background-image` swaps repaint the already-promoted player sprite layer only; no new compositor layers. | Evidence: `docs/audit-reports/evidence/AUDIT-F-20.layers.md` (D-10 addendum)
- **AUDIT-F-21 (layer promotion)** | `Complete` | Code inspection confirms no new `will-change` declarations introduced by the 10 player walk-frame classes. | Evidence: `docs/audit-reports/evidence/AUDIT-F-21.promotion.md` (D-10 addendum)
- **AUDIT-D-10-F-22 (board restart resets canonical state)** | `Complete` | Playwright e2e verifies pellet cell count restores after `runtime.restart()`. | Evidence: `tests/e2e/board-reset.spec.js`
- **Full D-10 report**: `docs/audit-reports/D-10-audit-report.md`

### 🚨 Deviations

1. **Format**: Spec prefers SVG sprites; deliverable uses WebP (lossless quality 92, 128×128). Rationale: source sheets are raster; lossless WebP preserves per-pixel accuracy at smaller file size than PNG, and the rendering pipeline is CSS `background-image` which is format-agnostic.
2. **Asset refresh**: 16 existing 128px WebPs (player×10, walls×2, pellet, powerup-fire/speed, hud-heart-full) re-encoded at the same quality 92 lossless settings used for the new sprites. Net result is consistent encoding across the entire 128px gameplay set; file sizes grow (e.g. pellet 940 B → 16 KB) because most pre-existing files were sourced from much smaller upstream PNGs and upscaled at a different quality preset.
3. **Scope expansion**: PR carries D-11 asset prep (ghost + bomb sprites + 40 CSS classes) alongside D-10's player work. Bundled because the v5_no_background source sheets were freshly available; D-11 ticket only needs to write the animation systems + render-intent extension, not redo any extraction.

---

## ✅ PR Gate Checklist

### 📋 Required Checks

- [x] **Read Standards**: Reviewed `AGENTS.md` and the agentic workflow guide.
- [x] **Policy Compliance**: `npm run policy` passes locally; all checks pass.
- [x] **Ownership**: Modified files are within Track D scope (`src/ecs/systems/` for new logic/render-phase systems, `src/adapters/dom/` for renderer-adapter, `src/game/bootstrap.js` for the registration line, `styles/`, `assets/`, `docs/`). No cross-track files touched.
- [x] **Branching**: Branch `medvall/D-10` follows `<owner>/<TRACK>-<NN>` convention.
- [x] **Audit Coverage**: Player animation, board sync, F-20, F-21, and restart-e2e all verified.
- [x] **Evidence**: F-20 / F-21 addenda + D-10 audit report + restart-e2e committed.

### 🏗️ Architecture & Security

- [x] **ECS Isolation**: `player-animation-system.js` and `board-sync-system.js` contain no DOM references.
- [x] **Adapter Injection**: `board-sync-system` receives `boardAdapter` at construction time, not via a global.
- [x] **Safe Sinks**: No untrusted content written to DOM; all CSS class names come from compile-time allowlists (`PLAYER_SPRITE_CLASSES`, `KIND_TO_CLASSES`).
- [x] **No Bloat**: No framework imports, no canvas APIs, no `Date.now()` in systems.
- [x] **Dependencies**: No new npm dependencies introduced.
- [x] **Dormant code budget**: 32 ghost + 8 bomb/explosion CSS classes are not yet applied at runtime — explicitly documented in `grid.css` block comments. Render-pipeline gap (no ghostType in render-intent) is flagged for the D-11 wiring ticket.

---

## 🛡️ Security & Architecture Notes

- **Security**: `render-dom-system` uses `classList.add` with values drawn exclusively from the compile-time `PLAYER_SPRITE_CLASSES` array — no user-controlled strings reach the DOM. The new ghost/bomb CSS class names are likewise compile-time literals once they're wired.
- **Architecture**: `player-animation-system` reads `velocity` (written by `player-move-system`) and writes `renderable.spriteId`; render-collect-system snapshots it; render-dom-system applies the class. No component store is accessed outside its designated system.
- **Known gap (handoff for D-11 wiring ticket)**: To make the new ghost / bomb CSS classes reach the DOM, the future ticket needs to (1) extend `render-intent` with a `ghostType` field (or have render-dom-system read the ghost store directly), (2) extend `render-collect-system` to populate it, (3) extend `render-dom-system` to apply `sprite--ghost--<type>--walk-*` and `sprite--bomb--<fuse-state>`, (4) create `ghost-animation-system.js` and `bomb-animation-system.js` (symmetric with `player-animation-system.js`), (5) wire both into bootstrap. The CSS class taxonomy already exists; only the producer side is missing.
- **Risks**: `SPRITE_ID.IDLE = 0` is defined but unused (held for potential future use). The CSS rule for `sprite--player--idle` is live but `spriteId = 0` is never written by the animation system in its current form.

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

# Process: Visual Assets Update & Sprite Sheet Reorganization

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` (for example `ekaramet/A-03` or `asmyrogl/B-03-runtime-integration`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I ran the applicable local checks for this change.
- [x] I listed the audit IDs affected by this change.
- [x] I checked security sinks and trust boundaries.
- [x] I checked architecture boundaries.
- [x] I checked dependency and lockfile impact.
- [x] I requested human review.

## Layer boundary confirmation

- [x] `src/ecs/systems/` has no DOM references except `render-dom-system.js`
- [x] Simulation systems access adapters only through World resources (no direct adapter imports)
- [x] `src/adapters/` owns DOM and browser I/O side effects
- [x] Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection
- [x] No framework imports or canvas APIs were introduced in this change

## What changed
- **Asset Reorganization**: Migrated visual assets to a structured, versioned directory hierarchy (`assets/visuals/sheets/v4/`).
- **High-Fidelity Sprite Sheets**: Added 12-frame high-fidelity animation sheets for `Ms. Ghostman` (4 directions), 4 ghost variants (Blinky, Pinky, Inky, Clyde), and item/power-up assets.
- **Power-Up Assets**: Included dedicated sprites for Power Pellets, Bomb+, Fire+, and Speed Boost.
- **Metadata Management**: Added `sharp` and `maxrects-packer` to `package.json` to support sprite sheet generation and optimization.
- **Workflow Update**: Fixed `policy-gate` workflow to trigger on PR review events.
- **Cleanup**: Removed legacy flat asset files to maintain repository hygiene.

## Why
This update formalizes the visual asset pipeline for Track D (specifically D-10 deliverables) ahead of the P2 Playable MVP. By consolidating high-fidelity sprite sheets into a versioned structure now, we avoid asset drift and ensure a stable resource manifest for the upcoming Renderer Adapter implementation (D-06).

## Tests
- `npm run check` — Biome linting passes.
- `npm run policy` — All repository policy checks pass.
- **Visual Verification**: All generated PNG sheets verified for resolution and frame alignment.
- **Audit Verification**: Assets compatible with DOM-based rendering constraints.

## Audit questions affected
- **AUDIT-B-04** (sprite complexity): Verified all sprite assets are optimized for DOM performance.
- **AUDIT-F-19** (frame stability): Pre-calculated sprite sheets reduce runtime painting overhead.

## Security notes
- Zero changes to JavaScript execution or DOM sinks.
- Asset files are static binaries (PNG); no SVG script injection risks.

## Architecture / dependency notes
- Unlocks **D-06** (Renderer Adapter & Board Generation) by providing the canonical sprite library.
- Documentation in `docs/implementation/track-d.md` updated to reflect asset readiness.

## Risks
- Low. Asset-only update with no impact on ECS logic or simulation determinism.

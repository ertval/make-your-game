# Asset Pipeline Guide

This document defines the visual and audio asset creation workflow for this ECS DOM/SVG game.

## 1. Goals

1. Keep assets quality-consistent and production-ready.
2. Preserve frame stability (60 FPS target) and low-jank runtime behavior.
3. Keep the authoring process deterministic and auditable in CI.

## 2. Directory Convention

```text
assets/
  source/
    visual/
    audio/
  generated/
    sprites/
    ui/
    sfx/
    music/
  manifests/
    visual-manifest.json
    audio-manifest.json
```

Notes:

1. `source/` is for editable originals.
2. `generated/` is for game-consumable exports.
3. `manifests/` is the only source referenced by runtime loaders.

## 3. Visual Asset Creation Steps

1. Author vectors first where possible (SVG for sprites/icons/UI).
2. Remove editor metadata and collapse unnecessary groups/paths.
3. Keep viewBox and coordinate system stable across animation variants.
4. Export raster only when vector is not practical.
5. For raster exports, generate only required resolutions used by the game.
6. Record width and height in manifest for each visual asset.
7. Add placeholder fallback entries for in-progress assets so development can continue.

## 4. Visual Naming Rules

Use lower-kebab-case and role-oriented names:

1. `player-idle.svg`
2. `player-run-01.svg`
3. `ghost-blinky-normal.svg`
4. `ghost-blinky-stunned.svg`
5. `hud-heart-full.svg`

## 5. Visual Optimization Rules

1. Favor static SVG for scalable UI and grid sprites.
2. Keep raster alpha edges tight to reduce overdraw.
3. Avoid large transparent margins in texture exports.
4. Reserve dimensions/aspect ratio at render targets to prevent CLS.
5. Keep gameplay animation updates on `transform` and `opacity`.

## 6. Audio Asset Creation Steps

1. Produce clean masters from DAW/editor source files.
2. Trim leading/trailing silence for all SFX.
3. Export music and ambience loops with loop-safe boundaries.
4. Normalize loudness by category before encoding.
5. Encode at least one compatibility format and optionally one open/high-efficiency format.

Recommended baseline formats:

1. Compatibility: `.mp3` or `.m4a`.
2. Optional open variant: `.ogg` (Opus).

## 7. Audio Naming Rules

1. `ui-confirm.mp3`
2. `ui-pause-open.mp3`
3. `sfx-bomb-place.mp3`
4. `sfx-bomb-explode.mp3`
5. `music-level-01-loop.mp3`

## 8. Runtime Integration Rules

1. Runtime loads assets from manifests only.
2. Critical startup assets are preloaded.
3. Non-critical assets are deferred or prefetched between phases/levels.
4. Pool visual instances for high-churn entities (bombs, fire, effects).
5. Keep decode/start timing constraints explicit for latency-sensitive SFX.

## 9. CI Validation Rules

CI should fail if any of the following occurs:

1. Asset referenced in manifest does not exist.
2. Required manifest fields are missing (`id`, `path`, `width`, `height`, `kind` for visuals; `id`, `path`, `category`, `durationMs` for audio).
3. File exceeds configured size budget.
4. Naming convention check fails.
5. Duplicate IDs exist in manifests.

Schema sources:

1. `docs/schemas/visual-manifest.schema.json`
2. `docs/schemas/audio-manifest.schema.json`

Manifest targets:

1. `assets/manifests/visual-manifest.json`
2. `assets/manifests/audio-manifest.json`

Validation wiring (to be connected to CI when project scripts are scaffolded):

```bash
npx ajv-cli validate -s docs/schemas/visual-manifest.schema.json -d assets/manifests/visual-manifest.json --spec=draft2020
npx ajv-cli validate -s docs/schemas/audio-manifest.schema.json -d assets/manifests/audio-manifest.json --spec=draft2020
```

## 10. Suggested Tooling

1. SVG optimization: svgo.
2. Audio conversion and batch processing: ffmpeg.
3. Optional loudness pass: ffmpeg loudnorm filter.

Example commands:

```bash
svgo assets/source/visual -f assets/generated/sprites
ffmpeg -i assets/source/audio/sfx-bomb-explode.wav -c:a libmp3lame -b:a 192k assets/generated/sfx/sfx-bomb-explode.mp3
ffmpeg -i assets/source/audio/music-level-01.wav -c:a libopus -b:a 128k assets/generated/music/music-level-01-loop.ogg
```

## 11. References

1. MDN Web audio codec guide: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs
2. MDN SVG docs: https://developer.mozilla.org/en-US/docs/Web/SVG
3. web.dev browser-level image lazy loading: https://web.dev/articles/browser-level-image-lazy-loading
4. web.dev optimize CLS: https://web.dev/articles/optimize-cls

## 12. Detailed Asset Tickets (Execution Board)

Follow the same ticket style as the implementation plan and assign ownership strictly.

### Visual Lane (Dev 4)

#### V-01: Visual Schema Contract
**Priority**: 🔴 Critical  
**Estimate**: 2h

- [ ] Validate schema fields and enums in `docs/schemas/visual-manifest.schema.json`.
- [ ] Ensure all visual manifest IDs are unique and kebab-case.

#### V-02: Character and Enemy Sprite Set
**Priority**: 🔴 Critical  
**Estimate**: 3h

- [ ] Create/export player sprite states (idle, move).
- [ ] Create/export four ghost state variants (normal, stunned, dead-eyes).
- [ ] Register every sprite in `assets/manifests/visual-manifest.json`.

#### V-03: Gameplay Prop Set
**Priority**: 🔴 Critical  
**Estimate**: 2h

- [ ] Create/export bomb, fire, pellet, power pellet, and power-up visuals.
- [ ] Confirm dimension metadata for each asset entry.

#### V-04: HUD and Menu Visuals
**Priority**: 🟡 Medium  
**Estimate**: 2h

- [ ] Create/export HUD icons (lives, timer, score accents).
- [ ] Create/export pause menu visual assets.

#### V-05: Visual Optimization and QA
**Priority**: 🟡 Medium  
**Estimate**: 3h

- [ ] Run SVG optimization pass.
- [ ] Verify no oversized visual artifacts violate size budgets.
- [ ] Verify reserved dimensions/aspect behavior for deferred images.

### Audio Lane (Dev 3)

#### A-01: Audio Schema Contract
**Priority**: 🔴 Critical  
**Estimate**: 2h

- [ ] Validate schema fields and enums in `docs/schemas/audio-manifest.schema.json`.
- [ ] Ensure all audio manifest IDs are unique and kebab-case.

#### A-02: UI and Interaction SFX Set
**Priority**: 🔴 Critical  
**Estimate**: 3h

- [ ] Create/export UI cues (confirm, cancel, pause open/close).
- [ ] Create/export interaction cues (pickup, hit, life loss).

#### A-03: Core Gameplay SFX Set
**Priority**: 🔴 Critical  
**Estimate**: 2h

- [ ] Create/export bomb place and bomb explode cues.
- [ ] Create/export ghost defeat and player defeat cues.

#### A-04: Music and Ambience Set
**Priority**: 🟡 Medium  
**Estimate**: 2h

- [ ] Create/export at least one loop-safe level music track.
- [ ] Optionally create/export ambience loop for menus.

#### A-05: Loudness and Loop QA
**Priority**: 🟡 Medium  
**Estimate**: 3h

- [ ] Normalize loudness across categories with consistent headroom.
- [ ] Validate loop boundaries and remove click artifacts.
- [ ] Capture duration/sample-rate/channel metadata in manifest.

### Shared Integration and Validation (Dev 1 with Dev 3 + Dev 4 input)

#### X-01: Schema and Path Validation in CI
**Priority**: 🔴 Critical  
**Estimate**: 2h

- [ ] Add schema validation checks for both manifests.
- [ ] Add file existence checks for all manifest paths.

#### X-02: Asset Budget Guardrails
**Priority**: 🟡 Medium  
**Estimate**: 1h

- [ ] Add checks for per-file max bytes.
- [ ] Document PR override procedure for justified exceptions.

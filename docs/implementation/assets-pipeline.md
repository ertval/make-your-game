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
    alternatives/
    visuals/
    sprites/
    ui/
    sfx/
    music/
    ambience/ (optional)
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

Bootstrap contract:

1. `createBootstrap({ assetPipeline })` registers a World resource named `assetPipeline`.
2. `assetPipeline` includes immutable `visualManifest` and `audioManifest` objects.
3. Runtime lookups use `assetPipeline.getAssetById(id)` and `assetPipeline.hasAsset(id)`.
4. Duplicate IDs across manifests are rejected during bootstrap to fail fast.

## 9. CI Validation Rules

CI should fail if any of the following occurs:

1. Asset referenced in manifest does not exist.
2. Required manifest fields are missing (`id`, `path`, `kind`, `format`, `width`, `height`, `tags`, `critical` for visuals; `id`, `path`, `category`, `format`, `durationMs`, `critical`, `loop` for audio).
3. File exceeds configured size budget.
4. Naming convention check fails.
5. Duplicate IDs exist in manifests.

Schema sources:

1. `../schemas/visual-manifest.schema.json`
2. `../schemas/audio-manifest.schema.json`

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

## 12. Asset Implementation Reference (Track Integration)

Asset implementation tasks are integrated into the canonical implementation tracks. Follow the verification gates in each track file:

### [Track D — Resources, Map, Rendering & Visual Assets](track-d.md) (Dev 4) (Visual assets co-owned with Track A)

- **D-04 (Render Data Contracts)**: Includes `V-01 (Visual Schema Contract)`.
- **D-10 (Visual Asset Production — Gameplay Sprites)**: Includes `V-02 (Character Set)` and `V-03 (Gameplay Props)`.
- **D-11 (Visual Assets UI/Screens + Visual Manifest/Validation)**: Includes `V-04 (HUD/Menu Visuals)` and `V-05 (Optimization/QA)`.

### [Track C — Scoring, Game Flow UI, Audio & Runtime Feedback](track-c.md) (Dev 3)

- **C-08 (Sound Effects & Music Production)**: Includes `C-ASSET-02 (UI SFX)`, `C-ASSET-03 (Core Gameplay SFX)`, and `C-ASSET-04 (Music/Ambience)`.
- **C-10 (Audio Manifest Schema & Validation)**: Includes `C-ASSET-01 (Audio Schema Contract)`.
- **QA/Normalization**: Integrated into `C-08`, `C-09`, and `C-10`.

### [Track A — World, Game Flow, Scaffolding, Testing & QA](track-a.md) (Dev 1)

- **A-07 (CI, Schema Validation & Asset Gates)**: Includes `X-01 (Path Validation)` and `X-02 (Budget Guardrails)`.

---

# 🚀 C-10: Audio Manifest Schema & Validation
> **Summary**: Finalizes the audio-manifest contract and the CI gate that enforces it — a strict JSON Schema 2020-12 schema, the shipped manifest of all C-08 audio assets, a new fail-closed `DUPLICATE_ID` semantic check in the schema validator, and a subprocess-driven test that locks every valid/invalid case.

---

## 📝 Description

### 🔄 What Changed
- **Schema (`docs/schemas/audio-manifest.schema.json`)**: Tightened `format` and the `path` extension from `mp3|m4a|ogg` to **`mp3` only** — the project ships no fallback decoder, so non-mp3 entries must be rejected. Required fields (`id`, `path`, `category`, `format`, `durationMs`, `critical`, `loop`), optional fields (`channels`, `sampleRateHz`, `loudnessLufs`, `maxBytes`, `notes`), the `category` enum (`sfx`/`music`/`ambience`/`ui`), and `additionalProperties: false` at both manifest and per-asset level were already in place.
- **Manifest (`assets/manifests/audio-manifest.json`)**: Already complete — 12 shipped C-08 assets (10 gameplay SFX `critical: true`, 1 looping gameplay music `critical: false`, 1 UI confirm). Every `path` exists on disk; no entries for missing files. No change required.
- **Validator (`scripts/validate-schema.mjs`)**: Added a fail-closed `DUPLICATE_ID` semantic gate. JSON Schema cannot express uniqueness on a *derived* key (`uniqueItems` only compares whole objects), so unique cue `id`s are enforced in the validator alongside the existing file-existence / kebab-case naming / `maxBytes` gates. The new code emits a violation through the existing reporting path (sets non-zero exit) and is counted in the JSON report (`duplicateIds`).
- **Tests (`tests/integration/gameplay/c-10-audio-manifest-schema.test.js`, new)**: Drives the real validator as a subprocess against fixture repos — proving both the happy path and each failure class.
- **Docs (`docs/implementation/track-c.md`)**: Ticked the four C-10 checkboxes with the concrete contract details.

### 🎯 Why
- **Rationale**: C-10 requires a strict, CI-enforced contract keeping shipped audio assets, runtime cue ids, and validation rules consistent. The schema shape and wiring existed; the gaps were (a) format breadth wider than the project actually supports and (b) no duplicate-id protection — a collision would silently map two manifest rows to the same runtime cue id.
- **Impact**: `npm run validate:schema` (and `npm run ci`) now reject any malformed or duplicate audio manifest entry. No playback, adapter API, or runtime audio logic was touched; no existing schema rule was weakened (the format change is a strengthening).

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy -- --require-approval=false` → **ALL CLEAR**.
> *Includes linting, all vitest suites, schema validation, and the policy gate.*

| Gate | Result |
| :--- | :--- |
| `npm run validate:schema` | ✅ real audio manifest passes |
| `npm run policy -- --require-approval=false` | ✅ ALL CLEAR (all scope) |
| Full vitest suite | ✅ 1255 / 1255 (95 files) |
| C-10 contract test | ✅ 11 / 11 |
| `npm run check` (Biome) | ✅ 228 files, no fixes |
| Existing A-07 asset-gate test | ✅ 5 / 5 (unchanged) |

Live proof of the new gate (schema-valid rows, duplicate id) — fails closed:
```
[DUPLICATE_ID] assets/generated/sfx/dup-b.mp3 (audio:sfx-dup) - Manifest contains a duplicate asset id. expected=Unique asset id within the manifest; actual=Duplicate id "sfx-dup"
exit=1
```

### 📋 Audit Traceability
- **AUDIT-A-07** | `Automatable` | Verification: `tests/unit/policy-gate/validate-schema-asset-gates.test.js` (unchanged) + `tests/integration/gameplay/c-10-audio-manifest-schema.test.js` | Evidence: `npm run validate:schema`, `.policy-runtime/a07-asset-gate-report.json`

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: Reviewed `AGENTS.md` and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: `audio-manifest.json` and `audio-manifest.schema.json` are Track C-owned; `scripts/validate-schema.mjs` is Track A but allowed here — branch `chbaikas/integration-C-10` matches the integration ownership-bypass pattern, and the validator edit is the C-10 "wire validation into CI" deliverable.
- [x] **Branching**: `chbaikas/integration-C-10` (ticket extractable; integration alias of bugfix mode).
- [~] **Audit Coverage**: C-10 scope is the audio-manifest contract (A-07 asset gate). Full F-01..F-21 / B-01..B-06 coverage is out of scope for this ticket.
- [x] **Evidence**: Validator report + subprocess test output above.

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: No `src/ecs/` changes; no DOM references introduced.
- [x] **Adapter Injection**: No runtime/adapter changes.
- [x] **Safe Sinks**: N/A — build-time validator and JSON data only; no DOM sinks.
- [x] **No Bloat**: No framework/canvas imports; validator reuses the existing Ajv 2020 setup.
- [x] **Dependencies**: No dependency or lockfile change.

---

## 🛡️ Security & Architecture Notes
- **Security**: Strengthens the build-time supply-chain gate — manifest entries pointing outside `assets/generated/<category>/`, to non-mp3 files, oversized files, or duplicate ids are now rejected before they can reach the runtime loader. `additionalProperties: false` blocks unknown fields.
- **Architecture**: Uniqueness is enforced in the validator (not the schema) because JSON Schema's `uniqueItems` cannot key on a derived field; the check fits the validator's existing semantic-gate model (`MISSING_FILE` / `NAMING_RULE` / `SIZE_BUDGET` → `DUPLICATE_ID`).
- **Risks**: Low. The format tightening rejects `m4a`/`ogg`, which the project does not currently ship or decode; if a fallback decoder is added later, the enum and path pattern must be widened in lockstep.

---

<details>
<summary>📖 <b>Local Command Reference</b> (Click to expand)</summary>

| Command | Purpose |
| :--- | :--- |
| **`npm run policy`** | **Primary gate (runs all checks and tests)** |
| `npm run validate:schema` | Schema + asset-gate validation (includes the audio manifest) |
| `npm run check` | Linting & formatting check |
| `npm run test` | Run all vitest suites |

</details>

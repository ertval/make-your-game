# PLAN-A-07

## Ticket
Track A Phase 2 ticket A-07: CI, schema validation, and asset governance gates.

## Source Context
This plan is grounded in the required sources:
- AGENTS.md
- docs/requirements.md
- docs/game-description.md
- docs/audit.md
- docs/implementation/track-a.md (A-07 section)
- docs/implementation/ticket-tracker.md
- docs/implementation/audit-traceability-matrix.md
- docs/implementation/assets-pipeline.md

Baseline repo reality relevant to A-07:
- `npm run validate:schema` already validates map/audio/visual JSON schema shape via `scripts/validate-schema.mjs`.
- `npm run policy` already runs project quality gates through `scripts/policy-gate/run-all.mjs` -> `policy:quality` -> `scripts/policy-gate/run-project-gate.mjs`.
- Strict production CSP/Trusted Types are already defined in `vite.config.js` and asserted in `tests/unit/security/csp-policy.test.js`.
- Missing A-07 gaps are the fail-closed checks for manifest file existence and deterministic generated-asset naming/size-budget enforcement.

## 1) Ticket Summary (In Scope / Out Of Scope)

### In Scope
- Enforce JSON Schema 2020-12 validation in CI for:
  - `assets/maps/*.json` against `docs/schemas/map.schema.json`
  - `assets/manifests/visual-manifest.json` against `docs/schemas/visual-manifest.schema.json`
  - `assets/manifests/audio-manifest.json` against `docs/schemas/audio-manifest.schema.json`
- Add fail-closed checks that every manifest asset `path` exists on disk.
- Enforce deterministic naming and size-budget checks for generated assets referenced by manifests.
- Keep strict production CSP/Trusted Types validated in test/CI flow.
- Keep all behavior deterministic (stable ordering, stable error formatting, non-random outputs).
- Keep implementation within Track A ownership.

### Out Of Scope
- Creating/updating game runtime assets, map content, or gameplay systems.
- Changing Track C or Track D feature ownership contracts.
- Rewriting manifest schemas beyond what is required to support deterministic gating.
- Modifying gameplay, ECS simulation ordering, adapters, or rendering behavior.

## 2) Component Schema (Data Definitions + Storage Choices)

A-07 is a policy/CI contract ticket, so its "components" are deterministic validation data structures in Node scripts.

### 2.1 Validation Target Schema
```json
{
  "id": "map|visual-manifest|audio-manifest",
  "dataPath": "assets/maps/level-1.json",
  "schemaPath": "docs/schemas/map.schema.json",
  "kind": "map|manifest"
}
```
Storage:
- `Array<ValidationTarget>` sorted lexicographically by `dataPath`.
- Deterministic iteration order prevents flaky CI logs.

### 2.2 Normalized Manifest Asset Entry
```json
{
  "manifestType": "visual|audio",
  "id": "player-idle",
  "path": "assets/generated/sprites/player-idle.svg",
  "format": "svg",
  "maxBytes": 32768,
  "categoryOrKind": "sprite"
}
```
Storage:
- `Map<string, NormalizedEntry>` keyed by `manifestType + ':' + id` for O(1) duplicate checks.
- Secondary `Map<string, string[]>` keyed by normalized path for duplicate-path diagnostics.

### 2.3 Asset File Snapshot
```json
{
  "path": "assets/generated/sprites/player-idle.svg",
  "exists": true,
  "sizeBytes": 1042,
  "baseName": "player-idle.svg"
}
```
Storage:
- `Map<string, AssetFileSnapshot>` keyed by normalized repo-relative path.
- Path normalization uses `/` separators to keep Linux/CI deterministic.

### 2.4 Violation Contract
```json
{
  "code": "MISSING_FILE|NAMING_RULE|SIZE_BUDGET|SCHEMA",
  "severity": "error",
  "manifestType": "visual",
  "assetId": "player-idle",
  "path": "assets/generated/sprites/player-idle.svg",
  "message": "Asset file does not exist",
  "expected": "File present on disk",
  "actual": "Missing"
}
```
Storage:
- `Array<Violation>` appended in deterministic validation phase order.
- Sorted output by `(code, path, assetId)` before final logging.

### 2.5 A-07 Report Envelope (Policy Artifact)
```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-04-18T00:00:00.000Z",
  "summary": {
    "targetsChecked": 0,
    "assetsChecked": 0,
    "violations": 0,
    "status": "pass|fail"
  },
  "violations": []
}
```
Storage target:
- `.policy-runtime/a07-asset-gate-report.json`
- JSON output is stable and machine-readable for CI debugging and future aggregation.

## 3) System Hook (Exact CI / Policy / Workflow Integration Points)

### Existing Hook Chain (Must Remain)
1. `package.json` script `validate:schema` runs `node scripts/validate-schema.mjs`.
2. `scripts/policy-gate/run-project-gate.mjs` auto-detects and runs `validate:schema` as part of `npm run policy:quality`.
3. `scripts/policy-gate/run-all.mjs` runs `policy:quality` before PR/repo policy checks.
4. `.github/workflows/policy-gate.yml` runs `npm run policy -- --mode=ci --scope=all --require-approval=false`.
5. `package.json` script `ci` also runs `npm run validate:schema`.
6. `tests/unit/security/csp-policy.test.js` runs through `npm run test` and policy quality gate.

### A-07 Integration Decision
- Keep a single authoritative validation entrypoint through `validate:schema`.
- Extend the validation scope to include:
  - manifest path existence checks
  - generated-asset naming checks
  - generated-asset size-budget checks (`maxBytes`)
- Keep failure mode fail-closed (`process.exit(1)` on any violation).
- Keep policy orchestration unchanged unless a separate script is needed for maintainability.

### Determinism Requirements For Hooks
- Use stable file discovery order (`sort()` after discovery).
- Normalize all paths to repo-relative POSIX form before comparison/logging.
- Emit stable violation ordering.
- No timestamp-dependent pass/fail behavior (timestamps only informational in report).

## 4) Event Contracts (JSON Shapes Used By Policy Checks / Reporting)

### 4.1 Existing Policy Metadata Event: `.policy-pr-meta.json`
Produced by `scripts/policy-gate/prepare-context.mjs` and consumed by `run-all.mjs`/`run-checks.mjs`.

Contract shape:
```json
{
  "number": 0,
  "author": "",
  "body": "",
  "baseSha": "",
  "headSha": "",
  "branchName": "owner/A-07-slug",
  "reviewsUrl": "",
  "baseRef": "origin/main",
  "headRef": "HEAD",
  "mergeBase": "<sha>",
  "commitMessages": "...",
  "ticketIds": ["A-07"],
  "processMode": false,
  "trackCodes": ["A"],
  "trackCode": "A"
}
```

### 4.2 Existing Manual Evidence Contract
`docs/audit-reports/manual-evidence.manifest.json` shape is policy-enforced by `run-checks.mjs`.

Contract shape:
```json
{
  "schemaVersion": "1.0.0",
  "updatedAt": "YYYY-MM-DD",
  "entries": [
    {
      "auditId": "AUDIT-F-19",
      "executionType": "Manual-With-Evidence",
      "requiredArtifacts": [
        {
          "path": "docs/audit-reports/evidence/AUDIT-F-19.paint.md",
          "description": "..."
        }
      ],
      "signOff": {
        "reviewer": "",
        "date": "",
        "notes": "..."
      }
    }
  ]
}
```

### 4.3 Existing Asset Manifest Input Contracts
- `assets/manifests/visual-manifest.json`
- `assets/manifests/audio-manifest.json`

Both include optional `maxBytes` per asset. A-07 treats this as the per-file budget source of truth when present.

### 4.4 Proposed A-07 Runtime Report Contract
New JSON report artifact (policy-runtime, not committed):
```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "ISO-8601",
  "summary": {
    "schemaTargetsChecked": 0,
    "manifestAssetsChecked": 0,
    "missingFiles": 0,
    "namingViolations": 0,
    "budgetViolations": 0,
    "status": "pass|fail"
  },
  "violations": [
    {
      "code": "MISSING_FILE|NAMING_RULE|SIZE_BUDGET|SCHEMA",
      "manifestType": "visual|audio|map",
      "assetId": "",
      "path": "",
      "expected": "",
      "actual": "",
      "message": ""
    }
  ]
}
```

## 5) Adapter Interface

No ECS/runtime adapter interface is required for A-07.

Justification:
- A-07 executes entirely in Node-based CI/policy scripts.
- It does not cross the ECS simulation/DOM boundary.
- It has no runtime browser side effects and no adapter injection requirement.

Public interface scope is CLI-only (`npm run validate:schema` and policy workflow invocations).

## 6) Validation Gate Checklist (A-07 Verification + Relevant Audit IDs)

Primary audit impact: `AUDIT-B-02` (good practices / policy governance).
Secondary maintained guarantees from existing gates: `AUDIT-F-04`, `AUDIT-F-05`.

Checklist:
1. Schema Gate: maps + visual manifest + audio manifest all validate against JSON Schema 2020-12.
2. Path Gate: every manifest asset `path` exists (fail if any missing).
3. Naming Gate: manifest-referenced generated assets follow lower-kebab-case filename rules and allowed extensions.
4. Size Gate: if `maxBytes` is present, on-disk file size must be `<= maxBytes`.
5. Deterministic Output Gate: violations are sorted and stable between runs.
6. CSP/Trusted Types Gate: production config retains strict directives and tests assert them.
7. CI Wiring Gate: policy workflow still executes the full policy chain fail-closed.
8. Ownership Gate: changed files stay within Track A ownership patterns.

Definition of pass for A-07:
- CI fails on schema mismatch, missing manifest file, naming-rule violation, or budget overrun.
- Production CSP/Trusted Types checks remain executable and passing.

## 7) Test-First Strategy And Command Loop

### Test-First Plan
1. Add/extend unit tests for asset-governance validation logic with red-first fixtures:
   - missing file path
   - naming mismatch
   - over-budget size
   - pass case with valid manifest entries
2. Keep CSP strictness test as regression guard.
3. Implement minimal script changes to make failing tests pass.
4. Re-run targeted tests, then full policy gate.

### Deterministic Command Loop
1. `npm run test:unit -- tests/unit/security/csp-policy.test.js`
2. `npm run test:unit -- tests/unit/policy-gate/*.test.js`
3. `npm run validate:schema`
4. `npm run policy:checks:local`
5. `npm run policy`

Loop rule:
- Do not proceed to the next command until the current command is green.
- If step 4 or 5 fails, capture exact failure path/code and add/adjust focused tests before code changes.

## 8) Risk Register

1. Risk: Existing generated files outside manifest conventions create noisy failures.
   - Mitigation: Gate only manifest-referenced assets for fail-closed checks in A-07.

2. Risk: Cross-track ownership conflicts if Phase 2 edits C/D-owned schema contracts.
   - Mitigation: Keep A-07 changes inside Track A-owned scripts/tests/workflow paths; treat C/D files as read-only inputs.

3. Risk: Non-deterministic file ordering causes flaky CI logs.
   - Mitigation: Normalize and sort all discovered paths and emitted violations.

4. Risk: Path normalization differences across OS runners.
   - Mitigation: Normalize to POSIX-style relative paths before comparisons.

5. Risk: CSP hardening accidentally breaks dev HMR workflow.
   - Mitigation: Preserve split policy model (strict production, practical development) and verify both via existing tests.

6. Risk: Duplicate source-of-truth for asset limits (manifest vs script constants).
   - Mitigation: Use `maxBytes` from manifest as authoritative per-asset budget where present.

## 9) File Touch Map For Phase 2

Planned touch set (Track A-compliant):
- `scripts/validate-schema.mjs`
  - Extend from schema-only to schema + path + naming + size checks.
- `tests/unit/policy-gate/` (new focused test file for asset-gate behavior)
  - Add red/green unit tests for manifest existence/naming/budget logic.
- `tests/unit/security/csp-policy.test.js` (only if assertion hardening is needed)
  - Keep strict production CSP/Trusted Types guarantees explicit.
- `package.json` (only if script factoring is needed)
  - Optional: introduce explicit `validate:assets` script while preserving `validate:schema` as canonical gate.
- `.github/workflows/policy-gate.yml` (only if an explicit extra gate step is needed)
  - Keep policy execution deterministic and fail-closed.

Read-only dependencies (no planned edits in A-07 Phase 2):
- `assets/manifests/visual-manifest.json`
- `assets/manifests/audio-manifest.json`
- `docs/schemas/map.schema.json`
- `docs/schemas/visual-manifest.schema.json`
- `docs/schemas/audio-manifest.schema.json`
- `vite.config.js`

## Blockers
None identified for Phase 1 planning. The policy baseline currently passes, and required A-07 scope gaps are well-defined for Phase 2 implementation.

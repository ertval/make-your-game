# 🚀 Track A: Resolve issues #161, #159, #175
> **Summary**: Implemented runtime JSON Schema validation for maps, documented raster-to-WebP deviation, and verified render-desync E2E test unskipping.

---

## 📝 Description

### 🔄 What Changed
- [Map-Resource]: Implemented the `validateMapSchema(rawMap)` validation function strictly matching the map schema in `docs/schemas/map.schema.json`.
- [Map-Resource]: Integrated runtime schema validation in `createMapResource` to reject invalid map schemas.
- [Map-Resource-Tests]: Added unit tests verifying schema validation and correct throwing of exceptions for out-of-range or incorrect keys.
- [Assets-Pipeline]: Documented raster-to-WebP asset deviation in `docs/implementation/assets-pipeline.md` §9.2 with explanation and rationale.
- [Tests]: Verified that E2E tests for render-desync bugs (#84, #85, #104) are unskipped and running successfully.

### 🎯 Why
- [Rationale]: The game resource initialization should validate the JSON Schema format at runtime in the browser to fail-closed on corrupted maps. Player sprites deviation needs documentation per project requirements. E2E desync checks confirm the rendering pipeline's correctness under browser simulation.
- [Impact]: High safety runtime boundaries for map loader and robust verification gates.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy`

### 📋 Audit Traceability
- **AUDIT-F-01** | `[Fully Automatable]` | Verification: `vitest run tests/unit/resources/map-resource.test.js` | Evidence: `Passing test suite`

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
- **Security**: Strict JSON Schema enforcement checks at runtime create a robust trust boundary for level map loading.
- **Architecture**: Separated schema validation layer from semantic logic check.
- **Risks**: None.

---

Closes #161, Closes #159, Closes #175

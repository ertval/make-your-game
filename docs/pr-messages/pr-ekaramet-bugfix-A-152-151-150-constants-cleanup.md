# 🚀 fix(A-12): resolve DEAD-40, DEAD-41, DEAD-42 constants cleanup

> **Summary**: Cleans up 3 dead-code/documentation issues in constants.js: stale JSDoc on used ghost-AI constants, and removal of 3 unused exports. Closes #150, Closes #151, Closes #152.

---

## 📝 Description

### 🔄 What Changed
- **`src/ecs/resources/constants.js`**:
  - **DEAD-40**: Updated stale JSDoc on `CLYDE_DISTANCE_THRESHOLD`, `PINKY_TARGET_OFFSET`, `INKY_REFERENCE_OFFSET` — previously said "Reserved for ghost-AI system (DEAD-06)" but they are actively used by `ghost-ai-system.js`
  - **DEAD-41**: Removed unused exports `LEVEL_MAX_GHOSTS` and `LEVEL_GHOST_SPEED` — never imported by any production module
  - **DEAD-42**: Removed unused export `GHOST_INTERSECTION_MIN_EXITS` — never imported by any production module
- **`tests/unit/resources/constants.test.js`**: Removed dead constant imports/assertions; fixed `POOL_GHOSTS` assertion to hardcoded value (`4`)

### 🎯 Why
- **Rationale**: Dead exports bloat the module surface area and create maintenance overhead. Stale JSDoc misleads developers. These cleanups match the A-12 consolidation mandate.
- **Impact**: ~20 lines removed. Cleaner constants surface area. No runtime behavior changes.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy` — ALL CLEAR (exit=0)
- Tests: 1047/1047 passing across all suites
- Lint: Biome clean
- Schema: All manifests pass validation

### 📋 Audit Traceability
- **DEAD-40 (#150)** | Automated | Updated JSDoc, verified via existing ghost-ai-system tests
- **DEAD-41 (#151)** | Automated | Removal verified via 1047 passing tests
- **DEAD-42 (#152)** | Automated | Removal verified via 1047 passing tests

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: Reviewed AGENTS.md and workflow guide
- [x] **Policy Compliance**: `npm run policy` passes (exit=0)
- [x] **Ownership**: All changed files are Track A scope (A-12)
- [x] **Branching**: `ekaramet/bugfix-A-152-151-150-constants-cleanup`
- [x] **Audit Coverage**: No AUDIT gate changes

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: No ECS system changes
- [x] **Adapter Injection**: No adapter changes
- [x] **Safe Sinks**: No sink changes
- [x] **No Bloat**: No new dependencies

---

Closes #150, Closes #151, Closes #152

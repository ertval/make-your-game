# 🚀 feat(c04): implement pause & level progression systems

> **Summary**: Implement ECS systems for pause handling, level completion detection, level flow, and deferred level loading with deterministic input → intent → FSM pipeline.

---

## 📝 Description

### 🔄 What Changed

* Added `pause-input-system` (keyboard → pauseIntent)
* Added `pause-system` (FSM transitions PLAYING ↔ PAUSED)
* Added `level-progress-system` (pellet completion → LEVEL_COMPLETE)
* Added `level-flow-system` (LEVEL_COMPLETE → next level / VICTORY)
* Added `level-loader-system` (deferred map loading)
* Wired systems in `bootstrap` with deterministic ordering
* Extended input handling for pause/restart edge-triggered intents
* Added unit and integration test coverage

---

### 🎯 Why

* Enable deterministic pause behavior with keyboard-only flow
* Support level completion and multi-level progression
* Maintain strict ECS separation (input → intent → FSM → systems)
* Prepare resource contracts for future UI (C-05)

---

## 🧪 Verification & Audit

### ✅ Verification

* [x] `npm run policy`
* [x] `npm run check`
* [x] Unit tests (pause, level systems)
* [x] Integration tests (input adapter + flow)

### 📋 Audit Traceability

* **AUDIT-F-07** | Fully Automatable | pause input → FSM transition
* **AUDIT-F-08** | Fully Automatable | pause continue behavior
* **AUDIT-F-09** | Fully Automatable | paused-only restart behavior
* **AUDIT-F-10** | Fully Automatable | pause-state clock/simulation freeze integration

---

## 🏁 Behavior Summary

### Pause Flow

* `ESC / P` → toggle pause
* `R` (while paused) → restart
* Simulation fully frozen while paused

### Level Flow

* All pellets consumed → `LEVEL_COMPLETE`
* Non-final level → next level loaded
* Final level → `VICTORY`

---

## 🏗️ Architecture Notes

* Systems are fully isolated (no DOM access)
* All communication via World resources
* Deterministic system ordering:

  ```js
  input → pauseIntent → pause-system → level systems → loader
  ```
* `level-loader-system` runs last in logic phase

---

## 🛡️ Security Notes

* No unsafe sinks (`innerHTML`, `eval`, etc.)
* No framework or rendering coupling
* Systems operate strictly on ECS resources

---

## ⚠️ Risks / Scope Notes

* Pause UI / overlays are not included (handled in C-05)
* No rendering changes introduced in this PR

---

## ✅ PR Gate Checklist

* [x] Read AGENTS.md and workflow guide
* [x] Ran `npm run policy`
* [x] Verified ownership scope
* [x] Audit coverage maintained (F-01 → F-21, B-01 → B-06)
* [x] Security and architecture boundaries checked
* [x] No dependency changes
* [x] Ready for review

---

## 🏁 Final Status

* Tests: ✅ PASS
* Policy: ✅ PASS
* Audit: ✅ PASS
* **READY_FOR_MAIN: YES**

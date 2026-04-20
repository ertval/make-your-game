# PLAN-A10-FOLLOWUP-POSTMERGE

## Ticket
Track A Phase 0 unblocked follow-up: restore strict post-merge expectations in compatibility tests and remove level-loader compatibility fallback.

## Source Context
- Trigger condition met: B-02, D-01, D-03 marked done in tracker.
- Ledger note source: docs/implementation/ticket-tracker.md line 50.

## 1) Component Schema

### GameStatus Resource Contract
- File: src/ecs/resources/game-status.js
- Storage: plain object with scalar string fields:
  - currentState: string enum value from GAME_STATE
  - previousState: string|null
- Strict expectation to enforce in tests:
  - PLAYING -> PLAYING remains invalid.
  - Transition map shape matches canonical FSM adjacency.

### MapResource Contract
- File: src/ecs/resources/map-resource.js
- Storage types:
  - grid: Uint8Array (hot path O(1) lookup)
  - grid2D: Array<number[]> (row iteration helpers)
  - scalar numeric metadata: rows, cols, spawn coordinates, counts, level metadata
  - activeGhostTypes: Array
- Strict expectation to enforce:
  - Runtime map-resource guard is exported and always used by level-loader for non-raw payloads.

## 2) System Hook
- No world schedule/order changes.
- Scope is load-time validation at level-load boundary via:
  - src/game/level-loader.js normalizeLoadedMapPayload
- Effects propagate into existing game-flow start/advance/restart paths without changing order.

## 3) Event Contracts
- No event-queue payload or ordering contract changes.
- No new events introduced.

## 4) Adapter Interface
- No DOM adapter API changes.
- ECS boundary unchanged: loader/resource remain pure data boundary logic.

## 5) Validation Gate (Pass/Fail)

### Track A Verification Alignment
- A-04 core/resource tests remain green for:
  - tests/unit/resources/game-status.test.js
  - tests/unit/resources/map-resource.test.js
- A-03 level-loader orchestration behavior remains non-regressed in integration.

### Relevant Audit IDs
- AUDIT-F-01: fail-closed load path avoids crash-prone malformed world resource injection.
- AUDIT-F-09: restart/load behavior preserved.
- AUDIT-B-02: good-practice gates upheld via check + policy.

## 6) Implementation Plan
1. Add/export strict runtime map-resource guard in src/ecs/resources/map-resource.js (if missing).
2. Remove optional guard fallback in src/game/level-loader.js and call guard unconditionally for non-raw payload.
3. Tighten tests:
   - tests/unit/resources/map-resource.test.js: remove compatibility branch and assert strict guard contract.
   - tests/unit/resources/game-status.test.js: replace temporary compatibility wording and verify canonical transition map exactly.
4. Run verification commands:
   - npm run test:unit -- tests/unit/resources/game-status.test.js tests/unit/resources/map-resource.test.js tests/unit/game/level-loader.test.js
   - npm run test:integration -- tests/integration/gameplay/game-flow.level-loader.test.js
   - npm run check
   - npm run policy

## 7) Done Criteria for This Follow-up
- Loader compatibility fallback removed.
- Strict test expectations restored for both listed test files.
- No regression in level loading integration flow.
- Lint/check and policy gates pass for changed scope.

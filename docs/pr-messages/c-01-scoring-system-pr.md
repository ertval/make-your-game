# C-01: Scoring System

## What changed

* Implemented `src/ecs/systems/scoring-system.js` as the single authority for gameplay scoring logic.
* Introduced canonical scoring constants:

  * Pellet: +10
  * Power pellet: +50
  * Power-up pickup: +100
  * Ghost kill (normal): base 200 with chain multiplier
  * Ghost kill (stunned): fixed +400
  * Level clear bonus: `1000 + remainingSeconds * 10` (exposed as helper)
* Added a dedicated world resource `scoreState` with:

  * `totalPoints`
  * `comboCounter`
  * `lastProcessedFrame` (duplicate-frame guard)
* Implemented deterministic scoring from `collisionIntents` (B-04):

  * Supports pellet, power pellet, power-up, and ghost-death intents
  * Ignores non-scoring intents safely
* Implemented same-frame ghost chain scoring:

  * Non-stunned ghost kills: 200, 400, 800, ...
  * Stunned ghost kills: fixed +400, do not advance chain
* Added a frame-based guard to prevent double scoring within the same update frame
* Added pure helper `computeLevelClearBonus` (runtime consumption pending C-04)

## Why

* C-01 establishes the core gameplay scoring model required for HUD (C-05) and gameplay feedback.
* Scoring is implemented as a pure ECS system to maintain deterministic behavior and separation from rendering/adapters.
* The implementation intentionally uses existing `collisionIntents` instead of introducing new event infrastructure prematurely.

## Tests

* Added `tests/unit/systems/scoring-system.test.js`
* Covered:

  * All canonical scoring values
  * Ghost chain multiplier logic
  * Stunned vs normal ghost behavior
  * Frame duplicate guard
  * Resource sanitization
  * Safe handling of malformed inputs
  * Level-clear bonus helper

Run:

* `npx vitest run tests/unit/systems/scoring-system.test.js`

## Audit questions affected

* `AUDIT-F-15 | Execution type: Fully Automatable | Verification: scoring logic covered by unit tests | Evidence: tests/unit/systems/scoring-system.test.js`

## Notes

* This ticket covers **scoring logic only**.
* HUD-visible score rendering is implemented in C-05.
* Level-clear bonus is implemented as a helper and will be triggered by C-04 once level-complete events are available.

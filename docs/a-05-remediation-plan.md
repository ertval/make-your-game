# A-05 Remediation Plan

Issues found during critical audit of A-05 implementation. 315/315 tests pass but coverage gaps exist.

---

## P1: Must Fix

### 1. `renderer-dom.test.js` — Dead Code + Missing DOM Safety Checks

**File**: `tests/integration/adapters/renderer-dom.test.js`
**Problem**: Tests cover LEGACY `renderer-dom.js` that throws at runtime (`__MS_GHOSTMAN_RUNTIME__` guard). Neither `innerHTML` guard nor `createElementNS` requirement from `track-a.md` is satisfied.

**Fix**:
- Either replace the legacy renderer test with tests for the active `render-dom-system.js` verifying:
  - `innerHTML` write count = 0 after `runRenderCommit()`
  - No `innerHTML` anywhere in the actual system code
- Or strip the dead renderer test and update `track-a.md` to match reality

### 2. `renderer-adapter.test.js` — No `innerHTML` Writes Tracking

**File**: `tests/integration/adapters/renderer-adapter.test.js`, mock at line 16
**Problem**: `innerHTML: ''` is a plain property, not a setter. Writes silently go undetected. `hud-adapter.test.js` shows the correct pattern (counter setter + assert 0).

**Fix**: Replace plain property with tracked setter. Add `it('does not write through innerHTML')` test asserting 0 writes after `generateBoard`.

### 3. Event Tests — No Payload Schema Verification

**File**: `tests/integration/gameplay/a-05-integration.test.js:377`
**Problem**: Tests check event `type` but never verify `payload` shape. Schema drift between event producers and consumers would go undetected.

**Fix**: Add `expect(events[0].payload).toMatchObject({...})` assertions for known event types (`player-death`, `GhostDefeated`, etc.).

---

## P2: Should Fix

### 4. Pause Test — Timer/Fuse Not Frozen

**File**: `tests/integration/gameplay/a-05-integration.test.js:336`
**Problem**: Checks `simTimeMs` and `world.frame` frozen, but not individual timers (bomb `fuseMs`, `levelTimer.remainingSeconds`, fire `burnTimerMs`).

**Fix**: Place a bomb before pausing, record its `fuseMs`, advance 15 paused frames, assert `fuseMs` unchanged. Similarly check `levelTimer.remainingSeconds`.

### 5. Pause Test — No HUD Interaction

**File**: `tests/integration/gameplay/a-05-integration.test.js:336`
**Problem**: "HUD responsive" requirement not tested.

**Fix**: Call `bootstrap.world.getResource('scoreState')`, `playerLife`, `levelTimer` during paused frames and assert they return consistent values.

### 6. Multi-System Pipeline — Ghost Pinning Masks AI Gap

**File**: `tests/integration/gameplay/a-05-integration.test.js:466-509`
**Problem**: Ghost manually repositioned every frame — bypasses AI, pathfinding, movement. Title says "full multi-system pipeline" but exercises only bomb→explosion→collision→scoring with a static target.

**Fix**: Add a second test where ghost AI moves naturally toward the player and the bomb explosion catches it in real pathfinding. Use a small map with predictable ghost behavior.

### 7. Replay Trace — Missing Edge Cases

**File**: `tests/integration/gameplay/a-05-replay-determinism.test.js`
**Problem**: Only one trace type (single bomb press, 190 frames, seeds 42/99). Missing empty traces, dense input, held keys across frames, pause in trace, very long traces.

**Fix**: Add test cases:
- Empty trace (no inputs) → deterministic zero-progression
- Dense inputs (movement + bomb every frame for 300 frames)
- Trace with held keys persisted across multiple frames
- Trace containing pause → resume sequence

---

## P3: Nice To Have

### 8. Sync `track-a.md` with Implementation Reality

**File**: `docs/implementation/track-a.md:145`
**Problem**: Lists `createElementNS` as requirement for `renderer-dom.js` but implementation uses `createElement('div')`. Adapter boundary tests don't match spec.

**Fix**: Update requirement to match the actual implementation, or implement missing features then add tests.

### 9. Sticky-Ghost Deterministic Pipeline Test

Go beyond synthetic pinning: design a tiny map (5×5) where the ghost AI's first move reliably heads toward a tile where the player places a bomb, producing a deterministic collision without frame-by-frame intervention.

---

## Verification Gate

After each fix, run:
```sh
vitest run tests/integration/
biome check --fix .
```

All 315+ existing tests must stay green. New tests must assert real behavioral contracts, not just no-throw.

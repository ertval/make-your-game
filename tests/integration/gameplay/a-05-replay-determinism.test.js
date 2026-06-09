/**
 * Replay determinism and state serialization integration tests.
 *
 * This test suite verifies the replay and determinism capabilities of Ms. Ghostman:
 * 1. An identical input trace run on the same seed produces identical state hashes.
 * 2. An identical input trace run on a different seed produces different state hashes
 *    due to divergent PRNG generation (e.g. wall drops, pathfinding, or rng state drift).
 */

import { describe, expect, it } from 'vitest';
import { ReplayRecorder, runReplay } from '../../../src/debug/replay.js';
import { FIXED_DT_MS } from '../../../src/ecs/resources/constants.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import { createBootstrap } from '../../../src/game/bootstrap.js';

// --- Harness Setup ---

/**
 * Creates a raw map layout for testing determinism.
 * The layout has a destructible wall (2) next to the player's starting point (6)
 * so that bomb explosions trigger RNG drop checks.
 */
function createDeterminismRawMap() {
  return {
    level: 1,
    metadata: {
      activeGhostTypes: [],
      ghostSpeed: 0,
      maxGhosts: 0,
      name: 'Determinism Harness Map',
      timerSeconds: 120,
    },
    dimensions: { columns: 5, rows: 5 },
    grid: [
      [1, 1, 1, 1, 1],
      [1, 6, 2, 0, 1], // Player at (1,1), destructible wall at (1,2)
      [1, 0, 0, 0, 1],
      [1, 0, 5, 5, 1], // Row 3 with ghost house cell types (5) at col 2 and 3
      [1, 1, 1, 1, 1],
    ],
    spawn: {
      ghostHouse: {
        bottomRow: 3,
        leftCol: 2,
        rightCol: 3,
        topRow: 3,
      },
      ghostSpawnPoint: { col: 2, row: 3 },
      player: { col: 1, row: 1 },
    },
  };
}

function createDeterminismMapResource() {
  return createMapResource(createDeterminismRawMap());
}

/**
 * Simple input adapter stub that allows manual simulation of keys pressed/held.
 */
function createInputAdapterStub() {
  const pressed = new Set();
  const held = new Set();

  return {
    getHeldKeys() {
      return held;
    },
    drainPressedKeys() {
      const drained = new Set(pressed);
      pressed.clear();
      return drained;
    },
    press(key) {
      pressed.add(key);
    },
    hold(key) {
      held.add(key);
    },
    release(key) {
      held.delete(key);
    },
    clearHeldKeys() {
      held.clear();
      pressed.clear();
    },
    destroy() {},
  };
}

describe('Replay Determinism Integration', () => {
  it('guarantees identical state hashes for identical seed and input trace', () => {
    // 1. Record an input trace
    const bootstrapRecord = createBootstrap({
      loadMapForLevel: () => createDeterminismMapResource(),
      now: 0,
      seed: 42,
    });

    const stub = createInputAdapterStub();
    const recorder = new ReplayRecorder(stub);
    bootstrapRecord.setInputAdapter(recorder);

    bootstrapRecord.gameFlow.startGame();

    // Player presses 'bomb' on frame 5, ticks past bomb fuse of 3000ms.
    // Let's run 190 frames at ~60fps to let the bomb explode and resolve.
    let timeMs = 0;
    for (let f = 0; f < 190; f += 1) {
      timeMs += FIXED_DT_MS;

      // On frame 5, press 'bomb'
      if (f === 5) {
        stub.press('bomb');
      }

      bootstrapRecord.stepFrame(timeMs);
    }

    const trace = recorder.trace;
    expect(trace.length).toBe(191);

    // 2. Play back trace on a fresh world with the same seed (bootstrap A)
    const bootstrapA = createBootstrap({
      loadMapForLevel: () => createDeterminismMapResource(),
      now: 0,
      seed: 42,
    });
    const stepsA = runReplay(bootstrapA, trace);

    // 3. Play back trace on a fresh world with the same seed (bootstrap B)
    const bootstrapB = createBootstrap({
      loadMapForLevel: () => createDeterminismMapResource(),
      now: 0,
      seed: 42,
    });
    const stepsB = runReplay(bootstrapB, trace);

    // 4. Assert both runs are exactly matching step-by-step
    expect(stepsA.length).toBe(stepsB.length);
    for (let i = 0; i < stepsA.length; i += 1) {
      expect(stepsA[i].frame).toBe(stepsB[i].frame);
      expect(stepsA[i].hash).toBe(stepsB[i].hash);
    }
  });

  it('produces different state hashes when running with a different seed', () => {
    // 1. Record an input trace
    const bootstrapRecord = createBootstrap({
      loadMapForLevel: () => createDeterminismMapResource(),
      now: 0,
      seed: 42,
    });

    const stub = createInputAdapterStub();
    const recorder = new ReplayRecorder(stub);
    bootstrapRecord.setInputAdapter(recorder);

    bootstrapRecord.gameFlow.startGame();

    let timeMs = 0;
    for (let f = 0; f < 190; f += 1) {
      timeMs += FIXED_DT_MS;
      if (f === 5) {
        stub.press('bomb');
      }
      bootstrapRecord.stepFrame(timeMs);
    }

    const trace = recorder.trace;

    // 2. Run replay on seed 42
    const bootstrapA = createBootstrap({
      loadMapForLevel: () => createDeterminismMapResource(),
      now: 0,
      seed: 42,
    });
    const stepsA = runReplay(bootstrapA, trace);

    // 3. Run replay on seed 99 (different seed)
    const bootstrapC = createBootstrap({
      loadMapForLevel: () => createDeterminismMapResource(),
      now: 0,
      seed: 99,
    });
    const stepsC = runReplay(bootstrapC, trace);

    // 4. Assert that they end up with different final state hashes because
    // the RNG seed divergence affects wall drop results or RNG state.
    expect(stepsA.length).toBe(stepsC.length);
    const finalStepA = stepsA[stepsA.length - 1];
    const finalStepC = stepsC[stepsC.length - 1];

    expect(finalStepA.hash).not.toBe(finalStepC.hash);

    // Direct RNG state divergence verification
    const rngA = bootstrapA.world.getResource('rng');
    const rngC = bootstrapC.world.getResource('rng');
    expect(rngA.state).not.toBe(rngC.state);
  });
});

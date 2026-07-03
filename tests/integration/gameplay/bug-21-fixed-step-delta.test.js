/**
 * Integration test: every logic-phase system receives exactly `FIXED_DT_MS`
 * as `context.dtMs` on each simulation step, regardless of real-world frame
 * timing (irregular `stepFrame` call gaps, multi-step catch-up frames).
 *
 * This is the guarantee that makes the per-system `Math.min(dtMs, MAX_DELTA_MS)`
 * clamps in timer-system.js, power-up-system.js, ghost-ai-system.js, and
 * life-system.js dead code: `dtMs` can never exceed `FIXED_DT_MS` in the real
 * game loop, so the clamp can never activate.
 */

import { describe, expect, it } from 'vitest';

import { FIXED_DT_MS } from '../../../src/ecs/resources/constants.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import { createBootstrap } from '../../../src/game/bootstrap.js';

function createProbeMapResource() {
  return createMapResource({
    level: 1,
    metadata: {
      name: 'BUG-21 Fixed Step Harness',
      timerSeconds: 120,
      maxGhosts: 1,
      ghostSpeed: 4.0,
      activeGhostTypes: [0],
    },
    dimensions: { rows: 5, columns: 5 },
    grid: [
      [1, 1, 1, 1, 1],
      [1, 3, 3, 3, 1],
      [1, 3, 6, 3, 1],
      [1, 3, 5, 3, 1],
      [1, 1, 1, 1, 1],
    ],
    spawn: {
      player: { row: 1, col: 1 },
      ghostHouse: { topRow: 3, bottomRow: 3, leftCol: 2, rightCol: 2 },
      ghostSpawnPoint: { row: 3, col: 2 },
    },
  });
}

describe('BUG-21 fixed-step delta invariant', () => {
  it('always passes FIXED_DT_MS to logic-phase systems, even across irregular real-time frame gaps', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createProbeMapResource(),
      now: 0,
    });
    bootstrap.gameFlow.startGame();

    const observedDeltas = [];
    bootstrap.world.registerSystem({
      name: 'bug-21-dtms-probe',
      phase: 'logic',
      resourceCapabilities: { read: [], write: [] },
      update(context) {
        observedDeltas.push(context.dtMs);
      },
    });

    // Irregular real-time gaps, including a large spike that would previously
    // have produced multiple catch-up steps and/or exercised the MAX_DELTA_MS
    // clamp if dtMs itself scaled with wall-clock time.
    const frameTimestamps = [0, 16, 33, 500, 516, 5000, 5017];
    for (const timestamp of frameTimestamps) {
      bootstrap.stepFrame(timestamp);
    }

    expect(observedDeltas.length).toBeGreaterThan(0);
    for (const dtMs of observedDeltas) {
      expect(dtMs).toBe(FIXED_DT_MS);
    }
  });
});

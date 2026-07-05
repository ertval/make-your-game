/**
 * Integration test: eating the last pellet on the same fixed step the level
 * timer expires must result in LEVEL_COMPLETE (or VICTORY), not GAME_OVER.
 *
 * level-progress-system now runs before timer-system in the logic phase
 * (bootstrap.js), so a last-pellet clear wins the race: the PLAYING ->
 * LEVEL_COMPLETE transition happens before timer-system can transition
 * PLAYING -> GAME_OVER on the same frame. This test mirrors that order
 * directly instead of relying on bootstrap.js to catch a future regression.
 */

import { describe, expect, it } from 'vitest';

import { createClock } from '../../../src/ecs/resources/clock.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createLevelProgressSystem } from '../../../src/ecs/systems/level-progress-system.js';
import { createTimerSystem } from '../../../src/ecs/systems/timer-system.js';
import { World } from '../../../src/ecs/world/world.js';

function createLevelLoaderStub(levelIndex = 0) {
  return {
    getCurrentLevelIndex() {
      return levelIndex;
    },
  };
}

function makeClearedMap(level = 1) {
  // Empty grid → countPellets/countPowerPellets both return 0, which is the
  // exact signal level-progress-system uses to fire LEVEL_COMPLETE.
  return { level, grid: [] };
}

describe('BUG-09 last-pellet-at-0:00 race', () => {
  it('reaches LEVEL_COMPLETE (not GAME_OVER) when the last pellet is cleared the same step the timer expires', () => {
    const world = new World();
    // Bootstrap registers level-progress-system before timer-system in the
    // logic phase — mirror that order exactly so this test reflects real
    // runtime scheduling.
    const timerSystem = createTimerSystem();
    const levelProgressSystem = createLevelProgressSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('levelLoader', createLevelLoaderStub(0));
    world.setResource('eventQueue', { events: [] });
    // remainingSeconds already at 0: the very next step will expire it.
    world.setResource('levelTimer', {
      activeLevel: 1,
      durationSeconds: 120,
      remainingSeconds: 0,
    });
    // The map is already cleared (last pellet eaten this same step, prior to
    // this logic-phase running) — this is the frame-perfect win condition.
    world.setResource('mapResource', makeClearedMap(1));

    levelProgressSystem.update({ world, dtMs: 0, frame: 0 });
    timerSystem.update({ world, dtMs: 0, frame: 0 });

    const finalState = world.getResource('gameStatus').currentState;
    expect([GAME_STATE.LEVEL_COMPLETE, GAME_STATE.VICTORY]).toContain(finalState);
    expect(finalState).not.toBe(GAME_STATE.GAME_OVER);
  });
});

/**
 * C-01 level-clear scoring runtime integration.
 *
 * Verifies the PLAYING → LEVEL_COMPLETE level-clear bonus award by running the
 * level-progress-system and scoring-system together against a minimal ECS
 * world. The pure helper (computeLevelClearBonus) already covers value math;
 * these tests cover the runtime hookup contract:
 *
 *  - bonus is awarded exactly once per LEVEL_COMPLETE transition
 *  - bonus value matches `1000 + remainingSeconds * 10`
 *  - subsequent frames in LEVEL_COMPLETE do not double-award
 *  - the one-shot guard re-arms when gameplay returns to PLAYING
 */

import { describe, expect, it } from 'vitest';

import {
  createGameStatus,
  GAME_STATE,
  transitionTo,
} from '../../../src/ecs/resources/game-status.js';
import { createLevelProgressSystem } from '../../../src/ecs/systems/level-progress-system.js';
import {
  computeLevelClearBonus,
  createDefaultScoreState,
  createScoringSystem,
} from '../../../src/ecs/systems/scoring-system.js';
import { World } from '../../../src/ecs/world/world.js';

function makeClearedMap(level = 1) {
  // Empty grid → countPellets/countPowerPellets both return 0, which is the
  // exact signal level-progress-system uses to fire LEVEL_COMPLETE.
  return { level, grid: [] };
}

function buildWorld({ remainingSeconds, level = 1 } = {}) {
  const world = new World();
  world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
  world.setResource('scoreState', createDefaultScoreState());
  world.setResource('levelTimer', {
    activeLevel: level,
    durationSeconds: 120,
    remainingSeconds,
  });
  world.setResource('mapResource', makeClearedMap(level));
  world.setResource('collisionIntents', []);
  world.setResource('levelFlow', {});
  return world;
}

function stepLogic({ scoringSystem, levelProgressSystem, world, frame }) {
  // Bootstrap registers level-progress-system AFTER scoring-system in the
  // logic phase, so we mirror that order to keep the test honest. The
  // scoring-system observes LEVEL_COMPLETE on the NEXT frame.
  scoringSystem.update({ world, frame });
  levelProgressSystem.update({ world, frame });
}

describe('C-01 level-clear scoring runtime integration', () => {
  it('awards 1000 + remainingSeconds * 10 once when LEVEL_COMPLETE is observed', () => {
    const world = buildWorld({ remainingSeconds: 73 });
    const scoringSystem = createScoringSystem();
    const levelProgressSystem = createLevelProgressSystem();
    const expectedBonus = computeLevelClearBonus(73);

    // Frame 0: level-progress-system transitions PLAYING → LEVEL_COMPLETE
    // (scoring-system still sees PLAYING because it runs first this frame).
    stepLogic({ scoringSystem, levelProgressSystem, world, frame: 0 });
    expect(world.getResource('gameStatus').currentState).toBe(GAME_STATE.LEVEL_COMPLETE);
    expect(world.getResource('scoreState').totalPoints).toBe(0);
    expect(world.getResource('scoreState').levelClearBonusAwarded).toBe(false);

    // Frame 1: scoring-system now observes LEVEL_COMPLETE and awards the bonus.
    stepLogic({ scoringSystem, levelProgressSystem, world, frame: 1 });
    expect(world.getResource('scoreState').totalPoints).toBe(expectedBonus);
    expect(world.getResource('scoreState').levelClearBonusAwarded).toBe(true);
    expect(expectedBonus).toBe(1000 + 73 * 10);
  });

  it('does not double-award across additional frames in LEVEL_COMPLETE', () => {
    const world = buildWorld({ remainingSeconds: 30 });
    const scoringSystem = createScoringSystem();
    const levelProgressSystem = createLevelProgressSystem();

    stepLogic({ scoringSystem, levelProgressSystem, world, frame: 0 });
    stepLogic({ scoringSystem, levelProgressSystem, world, frame: 1 });
    const afterFirstAward = world.getResource('scoreState').totalPoints;

    for (let frame = 2; frame <= 5; frame += 1) {
      stepLogic({ scoringSystem, levelProgressSystem, world, frame });
    }

    expect(world.getResource('scoreState').totalPoints).toBe(afterFirstAward);
    expect(world.getResource('scoreState').levelClearBonusAwarded).toBe(true);
  });

  it('falls back to a zero remainingSeconds bonus when the timer resource is missing', () => {
    const world = buildWorld({ remainingSeconds: 42 });
    world.setResource('levelTimer', null);
    const scoringSystem = createScoringSystem();
    const levelProgressSystem = createLevelProgressSystem();

    stepLogic({ scoringSystem, levelProgressSystem, world, frame: 0 });
    stepLogic({ scoringSystem, levelProgressSystem, world, frame: 1 });

    expect(world.getResource('scoreState').totalPoints).toBe(1000);
    expect(world.getResource('scoreState').levelClearBonusAwarded).toBe(true);
  });

  it('re-arms the one-shot when gameplay transitions back to PLAYING', () => {
    const world = buildWorld({ remainingSeconds: 50 });
    const scoringSystem = createScoringSystem();
    const levelProgressSystem = createLevelProgressSystem();

    stepLogic({ scoringSystem, levelProgressSystem, world, frame: 0 });
    stepLogic({ scoringSystem, levelProgressSystem, world, frame: 1 });
    expect(world.getResource('scoreState').levelClearBonusAwarded).toBe(true);

    // Simulate the loader advancing to the next level: status returns to
    // PLAYING with a fresh map and timer. The scoring-system should re-arm
    // its one-shot so the next level can also award a bonus.
    const gameStatus = world.getResource('gameStatus');
    transitionTo(gameStatus, GAME_STATE.PLAYING);
    world.setResource('mapResource', { level: 2, grid: [[1]] }); // non-empty: not cleared
    world.setResource('levelTimer', {
      activeLevel: 2,
      durationSeconds: 180,
      remainingSeconds: 180,
    });

    stepLogic({ scoringSystem, levelProgressSystem, world, frame: 2 });
    expect(world.getResource('scoreState').levelClearBonusAwarded).toBe(false);
  });
});

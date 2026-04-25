/**
 * Unit tests for the C-01 scoring system.
 *
 * These checks verify deterministic score initialization, collision-intent
 * consumption, explicit stunned-vs-chain ghost scoring rules, duplicate-frame
 * guards, and the pure level-clear helper without any DOM-facing dependencies.
 */

import { describe, expect, it } from 'vitest';

import { GHOST_STATE } from '../../../src/ecs/resources/constants.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import {
  computeChainGhostScore,
  computeLevelClearBonus,
  createDefaultScoreState,
  createScoringSystem,
  ensureScoreState,
} from '../../../src/ecs/systems/scoring-system.js';
import { World } from '../../../src/ecs/world/world.js';

function updateScore(scoringSystem, world, frame = 0) {
  scoringSystem.update({ world, frame });
}

describe('scoring-system', () => {
  it('creates a canonical default score state', () => {
    expect(createDefaultScoreState()).toEqual({
      totalPoints: 0,
      comboCounter: 0,
      lastProcessedFrame: null,
    });
  });

  it('sanitizes malformed score state values', () => {
    expect(
      ensureScoreState({
        totalPoints: Number.NaN,
        comboCounter: 'x',
        lastProcessedFrame: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      totalPoints: 0,
      comboCounter: 0,
      lastProcessedFrame: null,
    });
  });

  it('computes canonical ghost chain scores', () => {
    expect(computeChainGhostScore(1)).toBe(200);
    expect(computeChainGhostScore(2)).toBe(400);
    expect(computeChainGhostScore(3)).toBe(800);
  });

  it('computes the canonical level-clear bonus as a pure helper', () => {
    expect(computeLevelClearBonus(0)).toBe(1000);
    expect(computeLevelClearBonus(12.5)).toBe(1125);
    expect(computeLevelClearBonus(-3)).toBe(1000);
  });

  it('initializes the score resource when missing', () => {
    const world = new World();
    const scoringSystem = createScoringSystem();

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', []);

    updateScore(scoringSystem, world, 0);

    expect(world.getResource('scoreState')).toEqual({
      totalPoints: 0,
      comboCounter: 0,
      lastProcessedFrame: 0,
    });
  });

  it('ignores malformed collision intents resources safely', () => {
    const world = new World();
    const scoringSystem = createScoringSystem();

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', null);

    updateScore(scoringSystem, world, 0);

    expect(world.getResource('scoreState')).toEqual({
      totalPoints: 0,
      comboCounter: 0,
      lastProcessedFrame: 0,
    });
  });

  it('awards points for pellet, power pellet, and power-up pickups', () => {
    const world = new World();
    const scoringSystem = createScoringSystem();

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', [
      { type: 'pellet-collected' },
      { type: 'power-pellet-collected' },
      { type: 'power-up-collected' },
      { type: 'player-death' },
    ]);

    updateScore(scoringSystem, world, 0);

    expect(world.getResource('scoreState')).toEqual({
      totalPoints: 160,
      comboCounter: 0,
      lastProcessedFrame: 0,
    });
  });

  it('applies deterministic same-frame chain scoring for non-stunned ghost deaths', () => {
    const world = new World();
    const scoringSystem = createScoringSystem();

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', [
      { type: 'ghost-death', ghostState: GHOST_STATE.NORMAL },
      { type: 'ghost-death', ghostState: GHOST_STATE.NORMAL },
      { type: 'ghost-death', ghostState: GHOST_STATE.NORMAL },
    ]);

    updateScore(scoringSystem, world, 0);

    expect(world.getResource('scoreState')).toEqual({
      totalPoints: 1400,
      comboCounter: 3,
      lastProcessedFrame: 0,
    });
  });

  it('awards a fixed bonus for stunned ghost deaths and does not advance the normal chain', () => {
    const world = new World();
    const scoringSystem = createScoringSystem();

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', [
      { type: 'ghost-death', ghostState: GHOST_STATE.NORMAL },
      { type: 'ghost-death', ghostState: GHOST_STATE.STUNNED },
      { type: 'ghost-death', ghostState: GHOST_STATE.NORMAL },
    ]);

    updateScore(scoringSystem, world, 0);

    expect(world.getResource('scoreState')).toEqual({
      totalPoints: 1000,
      comboCounter: 2,
      lastProcessedFrame: 0,
    });
  });

  it('falls back to normal ghost scoring when ghostState is missing or malformed', () => {
    const world = new World();
    const scoringSystem = createScoringSystem();

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', [
      { type: 'ghost-death' },
      { type: 'ghost-death', ghostState: 'invalid' },
    ]);

    updateScore(scoringSystem, world, 0);

    expect(world.getResource('scoreState')).toEqual({
      totalPoints: 600,
      comboCounter: 2,
      lastProcessedFrame: 0,
    });
  });

  it('does not score the same frame twice when the system is invoked again', () => {
    const world = new World();
    const scoringSystem = createScoringSystem();

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', [{ type: 'pellet-collected' }]);

    updateScore(scoringSystem, world, 0);
    updateScore(scoringSystem, world, 0);

    expect(world.getResource('scoreState')).toEqual({
      totalPoints: 10,
      comboCounter: 0,
      lastProcessedFrame: 0,
    });
  });

  it('scores a new collision-intent batch on the next frame', () => {
    const world = new World();
    const scoringSystem = createScoringSystem();

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', [{ type: 'pellet-collected' }]);

    updateScore(scoringSystem, world, 0);
    world.setResource('collisionIntents', [{ type: 'power-up-collected' }]);
    updateScore(scoringSystem, world, 1);

    expect(world.getResource('scoreState')).toEqual({
      totalPoints: 110,
      comboCounter: 0,
      lastProcessedFrame: 1,
    });
  });

  it('does not score while gameplay is not in the PLAYING state', () => {
    const world = new World();
    const scoringSystem = createScoringSystem();

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PAUSED));
    world.setResource('collisionIntents', [{ type: 'pellet-collected' }]);
    world.setResource('scoreState', {
      totalPoints: 50,
      comboCounter: 3,
      lastProcessedFrame: null,
    });

    updateScore(scoringSystem, world, 0);

    expect(world.getResource('scoreState')).toEqual({
      totalPoints: 50,
      comboCounter: 0,
      lastProcessedFrame: null,
    });
  });

  it('falls back to context.world.frame when no explicit frame is provided', () => {
    const world = new World();
    const scoringSystem = createScoringSystem();

    world.frame = 7;
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', [{ type: 'pellet-collected' }]);

    scoringSystem.update({ world });

    expect(world.getResource('scoreState')).toEqual({
      totalPoints: 10,
      comboCounter: 0,
      lastProcessedFrame: 7,
    });
  });

  it('keeps safe behavior when neither context.frame nor world.frame is available', () => {
    const scoringSystem = createScoringSystem();
    const worldView = {
      resources: new Map([
        ['gameStatus', createGameStatus(GAME_STATE.PLAYING)],
        ['collisionIntents', [{ type: 'pellet-collected' }]],
      ]),
      getResource(key) {
        return this.resources.get(key);
      },
      setResource(key, value) {
        this.resources.set(key, value);
      },
    };

    scoringSystem.update({ world: worldView });
    scoringSystem.update({ world: worldView });

    expect(worldView.getResource('scoreState')).toEqual({
      totalPoints: 20,
      comboCounter: 0,
      lastProcessedFrame: null,
    });
  });
});

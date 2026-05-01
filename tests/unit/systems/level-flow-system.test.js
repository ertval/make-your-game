/**
 * Unit tests for the C-04 level flow system.
 *
 * These checks verify deterministic resolution of LEVEL_COMPLETE into either
 * deferred next-level advancement or terminal victory using only ECS
 * resources and FSM-safe transitions.
 */

import { describe, expect, it } from 'vitest';

import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import {
  createDefaultLevelFlow,
  createLevelFlowSystem,
} from '../../../src/ecs/systems/level-flow-system.js';
import { World } from '../../../src/ecs/world/world.js';

function updateSystem(system, world) {
  system.update({ world });
}

describe('level-flow-system', () => {
  it('transitions to PLAYING and arms pending level advance on non-final levels', () => {
    const world = new World();
    const system = createLevelFlowSystem();
    const gameStatus = createGameStatus(GAME_STATE.LEVEL_COMPLETE);

    world.setResource('gameStatus', gameStatus);
    world.setResource('mapResource', { level: 2 });

    updateSystem(system, world);

    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
    expect(gameStatus.previousState).toBe(GAME_STATE.LEVEL_COMPLETE);
    expect(world.getResource('levelFlow')).toEqual({
      nextLevel: 3,
      pendingLevelAdvance: true,
    });
  });

  it('transitions to VICTORY on the final level', () => {
    const world = new World();
    const system = createLevelFlowSystem();
    const gameStatus = createGameStatus(GAME_STATE.LEVEL_COMPLETE);

    world.setResource('gameStatus', gameStatus);
    world.setResource('mapResource', { level: 3 });

    updateSystem(system, world);

    expect(gameStatus.currentState).toBe(GAME_STATE.VICTORY);
    expect(gameStatus.previousState).toBe(GAME_STATE.LEVEL_COMPLETE);
    expect(world.getResource('levelFlow')).toEqual(createDefaultLevelFlow());
  });

  it('does nothing when the game is not in LEVEL_COMPLETE', () => {
    const world = new World();
    const system = createLevelFlowSystem();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);

    world.setResource('gameStatus', gameStatus);
    world.setResource('mapResource', { level: 1 });

    updateSystem(system, world);

    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
    expect(world.getResource('levelFlow')).toBeUndefined();
  });

  it('does not re-trigger while a level advance is already pending', () => {
    const world = new World();
    const system = createLevelFlowSystem();
    const gameStatus = createGameStatus(GAME_STATE.LEVEL_COMPLETE);

    world.setResource('gameStatus', gameStatus);
    world.setResource('mapResource', { level: 1 });
    world.setResource('levelFlow', {
      nextLevel: 2,
      pendingLevelAdvance: true,
    });

    updateSystem(system, world);

    expect(gameStatus.currentState).toBe(GAME_STATE.LEVEL_COMPLETE);
    expect(world.getResource('levelFlow')).toEqual({
      nextLevel: 2,
      pendingLevelAdvance: true,
    });
  });

  it('defaults missing map level to 1 when computing nextLevel', () => {
    const world = new World();
    const system = createLevelFlowSystem();
    const gameStatus = createGameStatus(GAME_STATE.LEVEL_COMPLETE);

    world.setResource('gameStatus', gameStatus);
    world.setResource('mapResource', {});

    updateSystem(system, world);

    expect(world.getResource('levelFlow')).toEqual({
      nextLevel: 2,
      pendingLevelAdvance: true,
    });
    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
  });
});

/**
 * Unit tests for the C-04 deferred level loader system.
 *
 * These checks verify deterministic consumption of the level-flow advance
 * trigger, safe fallback on invalid or failed loads, and value-style world
 * resource replacement with no direct FSM handling.
 */

import { describe, expect, it, vi } from 'vitest';

import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import {
  createDefaultLevelFlow,
  createLevelLoaderSystem,
  resolveNextLevel,
} from '../../../src/ecs/systems/level-loader-system.js';
import { World } from '../../../src/ecs/world/world.js';

function updateSystem(system, world) {
  system.update({ world });
}

describe('level-loader-system', () => {
  it('loads the pending next level and clears the levelFlow trigger', () => {
    const world = new World();
    const system = createLevelLoaderSystem();
    const nextMap = { level: 2, id: 'level-2-map' };
    const levelLoader = {
      loadLevel: vi.fn(() => nextMap),
    };

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('mapResource', { level: 1, id: 'level-1-map' });
    world.setResource('levelFlow', {
      nextLevel: 2,
      pendingLevelAdvance: true,
    });
    world.setResource('levelLoader', levelLoader);

    updateSystem(system, world);

    expect(levelLoader.loadLevel).toHaveBeenCalledTimes(1);
    expect(levelLoader.loadLevel).toHaveBeenCalledWith(1, {
      reason: 'level-flow-advance',
    });
    expect(world.getResource('mapResource')).toBe(nextMap);
    expect(world.getResource('levelFlow')).toEqual(createDefaultLevelFlow());
  });

  it('does nothing when no level advance is pending', () => {
    const world = new World();
    const system = createLevelLoaderSystem();
    const levelLoader = {
      loadLevel: vi.fn(),
    };
    const currentMap = { level: 1, id: 'current-map' };

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('mapResource', currentMap);
    world.setResource('levelFlow', createDefaultLevelFlow());
    world.setResource('levelLoader', levelLoader);

    updateSystem(system, world);

    expect(levelLoader.loadLevel).not.toHaveBeenCalled();
    expect(world.getResource('mapResource')).toBe(currentMap);
    expect(world.getResource('levelFlow')).toEqual(createDefaultLevelFlow());
  });

  it('clears levelFlow safely when nextLevel is invalid', () => {
    const world = new World();
    const system = createLevelLoaderSystem();
    const levelLoader = {
      loadLevel: vi.fn(),
    };

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('mapResource', { level: 1 });
    world.setResource('levelFlow', {
      nextLevel: Number.NaN,
      pendingLevelAdvance: true,
    });
    world.setResource('levelLoader', levelLoader);

    updateSystem(system, world);

    expect(levelLoader.loadLevel).not.toHaveBeenCalled();
    expect(world.getResource('levelFlow')).toEqual(createDefaultLevelFlow());
  });

  it('preserves the pending trigger when map loading fails', () => {
    const world = new World();
    const system = createLevelLoaderSystem();
    const levelLoader = {
      loadLevel: vi.fn(() => null),
    };
    const currentMap = { level: 1, id: 'current-map' };
    const pendingFlow = {
      nextLevel: 2,
      pendingLevelAdvance: true,
    };

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('mapResource', currentMap);
    world.setResource('levelFlow', pendingFlow);
    world.setResource('levelLoader', levelLoader);

    updateSystem(system, world);

    expect(levelLoader.loadLevel).toHaveBeenCalledTimes(1);
    expect(world.getResource('mapResource')).toBe(currentMap);
    expect(world.getResource('levelFlow')).toEqual(pendingFlow);
  });

  it('resolveNextLevel normalizes valid values and rejects invalid ones', () => {
    expect(resolveNextLevel({ nextLevel: 3.9 })).toBe(3);
    expect(resolveNextLevel({ nextLevel: 0 })).toBeNull();
    expect(resolveNextLevel({ nextLevel: Number.NaN })).toBeNull();
    expect(resolveNextLevel(null)).toBeNull();
  });
});

/**
 * Unit tests for the C-04 level progression system.
 *
 * These checks verify deterministic pellet-clear detection and FSM-safe
 * progression flow using only world resources with no DOM or entity mutation
 * dependencies. Scoring is intentionally excluded here because score
 * integration is owned by a later ticket.
 */

import { describe, expect, it } from 'vitest';

import { CELL_TYPE } from '../../../src/ecs/resources/constants.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createMapResource, setCell } from '../../../src/ecs/resources/map-resource.js';
import { createLevelProgressSystem } from '../../../src/ecs/systems/level-progress-system.js';
import { World } from '../../../src/ecs/world/world.js';

function createTestMapResource(level = 1) {
  return createMapResource({
    level,
    metadata: {
      name: `Level ${level}`,
      timerSeconds: 120,
      maxGhosts: 2,
      ghostSpeed: 4,
      activeGhostTypes: [0, 1],
    },
    dimensions: { columns: 5, rows: 5 },
    grid: [
      [1, 1, 1, 1, 1],
      [1, 3, 2, 4, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 5, 0, 1],
      [1, 1, 1, 1, 1],
    ],
    spawn: {
      player: { row: 2, col: 2 },
      ghostHouse: {
        topRow: 3,
        bottomRow: 3,
        leftCol: 2,
        rightCol: 2,
      },
      ghostSpawnPoint: { row: 3, col: 2 },
    },
  });
}

function clearAllCollectibles(mapResource) {
  for (let row = 0; row < mapResource.rows; row += 1) {
    for (let col = 0; col < mapResource.cols; col += 1) {
      if (
        mapResource.grid2D[row][col] === CELL_TYPE.PELLET ||
        mapResource.grid2D[row][col] === CELL_TYPE.POWER_PELLET
      ) {
        setCell(mapResource, row, col, CELL_TYPE.EMPTY);
      }
    }
  }
}

function updateSystem(system, world) {
  system.update({ world });
}

describe('level-progress-system', () => {
  it('does not transition when pellets remain', () => {
    const world = new World();
    const system = createLevelProgressSystem();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);

    world.setResource('gameStatus', gameStatus);
    world.setResource('mapResource', createTestMapResource(1));

    updateSystem(system, world);

    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
  });

  it('transitions to LEVEL_COMPLETE when all pellets and power pellets are consumed', () => {
    const world = new World();
    const system = createLevelProgressSystem();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const mapResource = createTestMapResource(1);

    clearAllCollectibles(mapResource);

    world.setResource('gameStatus', gameStatus);
    world.setResource('mapResource', mapResource);

    updateSystem(system, world);

    expect(gameStatus.currentState).toBe(GAME_STATE.LEVEL_COMPLETE);
    expect(gameStatus.previousState).toBe(GAME_STATE.PLAYING);
  });

  it('does nothing when the state is not PLAYING or LEVEL_COMPLETE', () => {
    const world = new World();
    const system = createLevelProgressSystem();
    const gameStatus = createGameStatus(GAME_STATE.PAUSED);
    const mapResource = createTestMapResource(1);

    clearAllCollectibles(mapResource);

    world.setResource('gameStatus', gameStatus);
    world.setResource('mapResource', mapResource);

    updateSystem(system, world);

    expect(gameStatus.currentState).toBe(GAME_STATE.PAUSED);
  });

  it('does not re-trigger progression work while already LEVEL_COMPLETE', () => {
    const world = new World();
    const system = createLevelProgressSystem();
    const gameStatus = createGameStatus(GAME_STATE.LEVEL_COMPLETE);
    const mapResource = createTestMapResource(1);

    clearAllCollectibles(mapResource);

    world.setResource('gameStatus', gameStatus);
    world.setResource('mapResource', mapResource);

    updateSystem(system, world);

    expect(gameStatus.currentState).toBe(GAME_STATE.LEVEL_COMPLETE);
    expect(world.getResource('levelFlow')).toEqual({
      pendingLevelAdvance: true,
    });
  });

  it('sets pendingLevelAdvance when LEVEL_COMPLETE is reached on a non-final level', () => {
    const world = new World();
    const system = createLevelProgressSystem({ totalLevels: 3 });
    const gameStatus = createGameStatus(GAME_STATE.LEVEL_COMPLETE);
    const mapResource = createTestMapResource(1);

    world.setResource('gameStatus', gameStatus);
    world.setResource('mapResource', mapResource);

    updateSystem(system, world);

    expect(gameStatus.currentState).toBe(GAME_STATE.LEVEL_COMPLETE);
    expect(gameStatus.previousState).toBeNull();
    expect(world.getResource('levelFlow')).toEqual({
      pendingLevelAdvance: true,
    });
  });

  it('transitions to VICTORY when LEVEL_COMPLETE is reached on the final level', () => {
    const world = new World();
    const system = createLevelProgressSystem({ totalLevels: 3 });
    const gameStatus = createGameStatus(GAME_STATE.LEVEL_COMPLETE);
    const mapResource = createTestMapResource(3);

    world.setResource('gameStatus', gameStatus);
    world.setResource('mapResource', mapResource);

    updateSystem(system, world);

    expect(gameStatus.currentState).toBe(GAME_STATE.VICTORY);
    expect(gameStatus.previousState).toBe(GAME_STATE.LEVEL_COMPLETE);
    expect(world.getResource('levelFlow')).toBeUndefined();
  });
});

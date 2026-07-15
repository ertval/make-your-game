import { describe, expect, it } from 'vitest';
import { COLLIDER_TYPE } from '../../../src/ecs/components/spatial.js';
import {
  DEFAULT_FIRE_RADIUS,
  FIXED_DT_MS,
  PLAYER_START_MAX_BOMBS,
} from '../../../src/ecs/resources/constants.js';
import { GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createBootstrap } from '../../../src/game/bootstrap.js';

describe('level-transition-spawn-reset', () => {
  it('should reset ghostSpawnState, deadGhostIds, and bombCellOccupancy immediately after level transition', () => {
    const mockMap1 = {
      level: 1,
      metadata: {
        name: 'Test Level 1',
        timerSeconds: 60,
        maxGhosts: 4,
        ghostSpeed: 1,
        activeGhostTypes: [0, 1, 2, 3],
      },
      dimensions: { rows: 5, columns: 5 },
      grid: [
        [1, 1, 1, 1, 1],
        [1, 0, 3, 0, 1], // has 1 pellet
        [1, 0, 5, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
      ],
      spawn: {
        player: { row: 1, col: 1 },
        ghostHouse: { topRow: 2, bottomRow: 2, leftCol: 2, rightCol: 2 },
        ghostSpawnPoint: { row: 2, col: 2 },
      },
    };

    const mockMap2 = {
      level: 2,
      metadata: {
        name: 'Test Level 2',
        timerSeconds: 60,
        maxGhosts: 4,
        ghostSpeed: 1,
        activeGhostTypes: [0, 1, 2, 3],
      },
      dimensions: { rows: 5, columns: 5 },
      grid: [
        [1, 1, 1, 1, 1],
        [1, 0, 3, 0, 1],
        [1, 0, 5, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
      ],
      spawn: {
        player: { row: 1, col: 1 },
        ghostHouse: { topRow: 2, bottomRow: 2, leftCol: 2, rightCol: 2 },
        ghostSpawnPoint: { row: 2, col: 2 },
      },
    };

    let currentTime = 0;
    const bootstrap = createBootstrap({
      now: 0,
      nowProvider: () => currentTime,
      loadMapForLevel: (levelIndex) => {
        return levelIndex === 0 ? mockMap1 : mockMap2;
      },
    });

    const world = bootstrap.world;
    const gameFlow = world.getResource('gameFlow');

    gameFlow.startGame();

    // Step frame to advance clock and release first ghost
    currentTime = FIXED_DT_MS * 2;
    bootstrap.stepFrame(currentTime);

    // Verify spawn state advanced
    const spawnState = world.getResource('ghostSpawnState');
    expect(spawnState.elapsedMs).toBeGreaterThan(0);

    // Set dirty states
    world.setResource('deadGhostIds', [0]);
    world.getResource('bombCellOccupancy').add(5);

    // Transition: trigger level complete by setting state (normally collision system does this)
    gameFlow.setState(GAME_STATE.LEVEL_COMPLETE);

    // Transition to next level (which calls advanceLevel -> loadLevel -> onLevelLoaded)
    gameFlow.startGame();

    // Verify clean slate immediately after transition
    const postTransitionSpawnState = world.getResource('ghostSpawnState');
    expect(postTransitionSpawnState.elapsedMs).toBe(0);
    expect(postTransitionSpawnState.releasedGhostIds).toEqual([]);
    expect(world.getResource('deadGhostIds')).toEqual([]);
    expect(world.getResource('bombCellOccupancy').size).toBe(0);
  });

  it('deactivates a bomb still live at the exit so it cannot detonate on the next level', () => {
    const makeMap = (level) => ({
      level,
      metadata: {
        name: `Test Level ${level}`,
        timerSeconds: 60,
        maxGhosts: 4,
        ghostSpeed: 1,
        activeGhostTypes: [0, 1, 2, 3],
      },
      dimensions: { rows: 5, columns: 5 },
      grid: [
        [1, 1, 1, 1, 1],
        [1, 0, 3, 0, 1],
        [1, 0, 5, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
      ],
      spawn: {
        player: { row: 1, col: 1 },
        ghostHouse: { topRow: 2, bottomRow: 2, leftCol: 2, rightCol: 2 },
        ghostSpawnPoint: { row: 2, col: 2 },
      },
    });

    const currentTime = 0;
    const bootstrap = createBootstrap({
      now: 0,
      nowProvider: () => currentTime,
      loadMapForLevel: (levelIndex) => makeMap(levelIndex === 0 ? 1 : 2),
    });

    const world = bootstrap.world;
    const gameFlow = world.getResource('gameFlow');
    gameFlow.startGame();

    // Simulate a bomb live on the board at the moment the level is cleared by
    // activating the first pooled bomb slot with a fuse still counting down.
    const colliderStore = world.getResource('collider');
    const bombStore = world.getResource('bomb');
    const bombPool = world.getResource('bombEntityPool');
    const bombId = bombPool[0].id;
    colliderStore.type[bombId] = COLLIDER_TYPE.BOMB;
    bombStore.fuseMs[bombId] = 1000;

    // Advance to the next level.
    gameFlow.setState(GAME_STATE.LEVEL_COMPLETE);
    gameFlow.startGame();

    // The pooled slot must be inactive on the new level — no carried-over fuse.
    expect(colliderStore.type[bombId]).toBe(COLLIDER_TYPE.NONE);
    expect(bombStore.fuseMs[bombId]).toBe(0);
    expect(world.getResource('bombAudioActive')).toBe(false);
  });

  const makeProgressionMap = (level) => ({
    level,
    metadata: {
      name: `Test Level ${level}`,
      timerSeconds: 60,
      maxGhosts: 4,
      ghostSpeed: 1,
      activeGhostTypes: [0, 1, 2, 3],
    },
    dimensions: { rows: 5, columns: 5 },
    grid: [
      [1, 1, 1, 1, 1],
      [1, 0, 3, 0, 1],
      [1, 0, 5, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 1, 1, 1, 1],
    ],
    spawn: {
      player: { row: 1, col: 1 },
      ghostHouse: { topRow: 2, bottomRow: 2, leftCol: 2, rightCol: 2 },
      ghostSpawnPoint: { row: 2, col: 2 },
    },
  });

  it('BUG-15: preserves maxBombs and fireRadius upgrades across a level transition', () => {
    const currentTime = 0;
    const bootstrap = createBootstrap({
      now: 0,
      nowProvider: () => currentTime,
      loadMapForLevel: (levelIndex) => makeProgressionMap(levelIndex === 0 ? 1 : 2),
    });

    const world = bootstrap.world;
    const gameFlow = world.getResource('gameFlow');
    gameFlow.startGame();

    const playerStore = world.getResource('player');
    const playerId = world.getResource('playerEntity').id;

    // Simulate collecting bomb/fire power-ups partway through level 1.
    playerStore.maxBombs[playerId] = 5;
    playerStore.fireRadius[playerId] = 4;

    // Clear the level and advance to level 2 (reason 'level-complete').
    gameFlow.setState(GAME_STATE.LEVEL_COMPLETE);
    gameFlow.startGame();

    const nextPlayerId = world.getResource('playerEntity').id;
    // Permanent progression survives the transition; only transient status resets.
    expect(playerStore.maxBombs[nextPlayerId]).toBe(5);
    expect(playerStore.fireRadius[nextPlayerId]).toBe(4);
  });

  it('BUG-15: still resets maxBombs and fireRadius on a same-level restart', () => {
    const currentTime = 0;
    const bootstrap = createBootstrap({
      now: 0,
      nowProvider: () => currentTime,
      loadMapForLevel: () => makeProgressionMap(1),
    });

    const world = bootstrap.world;
    const gameFlow = world.getResource('gameFlow');
    gameFlow.startGame();

    const playerStore = world.getResource('player');
    playerStore.maxBombs[world.getResource('playerEntity').id] = 5;
    playerStore.fireRadius[world.getResource('playerEntity').id] = 4;

    // A restart is a fresh attempt: progression must fall back to defaults.
    gameFlow.restartLevel();

    const restartedPlayerId = world.getResource('playerEntity').id;
    expect(playerStore.maxBombs[restartedPlayerId]).toBe(PLAYER_START_MAX_BOMBS);
    expect(playerStore.fireRadius[restartedPlayerId]).toBe(DEFAULT_FIRE_RADIUS);
  });
});

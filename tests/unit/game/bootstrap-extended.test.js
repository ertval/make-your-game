import { describe, expect, it, vi } from 'vitest';
import { FIXED_DT_MS } from '../../../src/ecs/resources/constants.js';
import { enqueue } from '../../../src/ecs/resources/event-queue.js';
import { GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createBootstrap } from '../../../src/game/bootstrap.js';

describe('Bootstrap extended coverage', () => {
  it('covers normalizeManifest fallbacks and duplicate asset IDs', () => {
    // Missing manifest
    const bootstrap1 = createBootstrap({ now: 0 });
    const pipeline1 = bootstrap1.world.getResource('assetPipeline');
    expect(pipeline1.visualManifest.version).toBe('v0');

    // Duplicate ID
    expect(() => {
      createBootstrap({
        now: 0,
        assetPipeline: {
          visualManifest: { version: 'v1', assets: [{ id: 'dup' }, { id: 'dup' }] },
        },
      });
    }).toThrow('Duplicate asset id');

    // Invalid asset ID types
    const bootstrap2 = createBootstrap({
      now: 0,
      assetPipeline: {
        visualManifest: { version: 'v1', assets: [null, { id: '   ' }, { id: 'valid' }] },
      },
    });
    const pipeline2 = bootstrap2.world.getResource('assetPipeline');
    expect(pipeline2.getAssetById(null)).toBeNull();
    expect(pipeline2.hasAsset(null)).toBe(false);
  });

  it('covers syncPlayerEntityFromMap and clearPlayerEntity branches', async () => {
    const levelLoaderModule = await import('../../../src/game/level-loader.js');
    const spy = vi.spyOn(levelLoaderModule, 'createLevelLoader').mockImplementation((opts) => {
      return {
        triggerLoad: (map) => opts.onLevelLoaded(map),
      };
    });

    const bootstrap = createBootstrap({ now: 0 });
    const world = bootstrap.world;
    const ll = world.getResource('levelLoader');

    // Valid mapResource
    const validMap = {
      playerSpawnRow: 1,
      playerSpawnCol: 3,
      rows: 10,
      cols: 10,
    };
    ll.triggerLoad(validMap);

    const playerHandle = world.getResource('playerEntity');
    const positionStore = world.getResource('position');
    expect(playerHandle).not.toBeNull();
    expect(world.isEntityAlive(playerHandle)).toBe(true);
    expect(positionStore.row[playerHandle.id]).toBe(validMap.playerSpawnRow);
    expect(positionStore.col[playerHandle.id]).toBe(validMap.playerSpawnCol);

    // Call again to hit setEntityMask
    const movedMap = {
      ...validMap,
      playerSpawnRow: 2,
      playerSpawnCol: 4,
    };
    ll.triggerLoad(movedMap);
    expect(world.getResource('playerEntity')).toStrictEqual(playerHandle);
    expect(positionStore.row[playerHandle.id]).toBe(movedMap.playerSpawnRow);
    expect(positionStore.col[playerHandle.id]).toBe(movedMap.playerSpawnCol);

    // Call with invalid spawn to hit clearPlayerEntity
    ll.triggerLoad({ playerSpawnRow: null });
    expect(world.getResource('playerEntity')).toBeNull();

    spy.mockRestore();
  });

  it('resets frame counters on restart', () => {
    const bootstrap = createBootstrap({ now: 0 });
    expect(bootstrap.gameFlow.setState(GAME_STATE.PLAYING)).toBe(true);

    bootstrap.stepFrame(FIXED_DT_MS + 1);
    bootstrap.stepFrame(FIXED_DT_MS * 2 + 1);

    expect(bootstrap.world.frame).toBeGreaterThan(0);
    expect(bootstrap.world.renderFrame).toBeGreaterThan(0);

    const restarted = bootstrap.gameFlow.restartLevel();
    expect(restarted).toBe(true);
    expect(bootstrap.world.frame).toBe(0);
    expect(bootstrap.world.renderFrame).toBe(0);
  });

  it('resets frame counters across level transitions', () => {
    const mockMap = {
      level: 1,
      metadata: {
        name: 'Test Level',
        timerSeconds: 60,
        maxGhosts: 1,
        ghostSpeed: 1,
        activeGhostTypes: ['red'],
      },
      dimensions: { rows: 5, columns: 5 },
      grid: [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
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
      loadMapForLevel: () => mockMap,
    });
    const world = bootstrap.world;
    const gameFlow = world.getResource('gameFlow');

    gameFlow.startGame();
    currentTime = FIXED_DT_MS;
    bootstrap.stepFrame(currentTime);
    currentTime = FIXED_DT_MS * 2;
    bootstrap.stepFrame(currentTime);

    expect(world.frame).toBeGreaterThan(0);

    // Transition to next level
    gameFlow.setState(GAME_STATE.LEVEL_COMPLETE);
    gameFlow.startGame();

    expect(world.frame).toBe(0);
    expect(world.renderFrame).toBe(0);
  });

  it('covers system registration edge cases', () => {
    expect(() => {
      createBootstrap({
        now: 0,
        systemsByPhase: {
          logic: [{ phase: 'input', update: () => {} }],
        },
      });
    }).toThrow('declares phase "input" but is registered under "logic"');

    expect(() => {
      createBootstrap({
        now: 0,
        systemsByPhase: {
          logic: [null],
        },
      });
    }).toThrow('Invalid system registration');

    // Function shorthand registration
    const bootstrap = createBootstrap({
      now: 0,
      systemsByPhase: {
        logic: [() => {}],
      },
    });
    expect(bootstrap).toBeDefined();
  });

  it('covers resyncTime', () => {
    const bootstrap = createBootstrap({ now: 0 });
    bootstrap.resyncTime(100);
    expect(bootstrap.clock.realTimeMs).toBe(100);

    // Test toFiniteTimestamp fallback
    bootstrap.resyncTime(NaN);
  });

  it('resets spritePool on restart if spritePool exists and has reset function', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const mockSpritePool = {
      reset: vi.fn(),
    };
    bootstrap.world.setResource('spritePool', mockSpritePool);
    bootstrap.gameFlow.setState(GAME_STATE.PLAYING);
    bootstrap.gameFlow.restartLevel();
    expect(mockSpritePool.reset).toHaveBeenCalledTimes(1);
  });

  it('does not throw on restart if spritePool exists but lacks reset function', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const invalidSpritePool = {};
    bootstrap.world.setResource('spritePool', invalidSpritePool);
    bootstrap.gameFlow.setState(GAME_STATE.PLAYING);
    expect(() => bootstrap.gameFlow.restartLevel()).not.toThrow();
  });

  it('clears eventQueue on restart (BUG-16)', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const world = bootstrap.world;
    const eventQueue = world.getResource(bootstrap.eventQueueResourceKey);

    enqueue(eventQueue, 'TestEvent', { value: 42 }, 0);
    enqueue(eventQueue, 'AnotherEvent', { value: 99 }, 0);

    expect(eventQueue.events.length).toBe(2);

    bootstrap.gameFlow.setState(GAME_STATE.PLAYING);
    bootstrap.gameFlow.restartLevel();

    const freshQueue = world.getResource(bootstrap.eventQueueResourceKey);
    expect(freshQueue.events.length).toBe(0);
  });

  it('exports eventQueueResourceKey for runtime drain (BUG-01)', () => {
    const bootstrap = createBootstrap({ now: 0 });

    expect(typeof bootstrap.eventQueueResourceKey).toBe('string');
    expect(bootstrap.eventQueueResourceKey.length).toBeGreaterThan(0);
    expect(bootstrap.world.hasResource(bootstrap.eventQueueResourceKey)).toBe(true);
  });
});

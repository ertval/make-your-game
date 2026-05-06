import { describe, expect, it, vi } from 'vitest';
import { FIXED_DT_MS } from '../../../src/ecs/resources/constants.js';
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
});

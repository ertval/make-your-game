import { describe, expect, it, vi } from 'vitest';
import { createBootstrap } from '../../../src/game/bootstrap.js';
import { World } from '../../../src/ecs/world/world.js';
import { PLAYER_MOVE_REQUIRED_MASK } from '../../../src/ecs/systems/player-move-system.js';

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
          visualManifest: { version: 'v1', assets: [{ id: 'dup' }, { id: 'dup' }] }
        }
      });
    }).toThrow('Duplicate asset id');

    // Invalid asset ID types
    const bootstrap2 = createBootstrap({
      now: 0,
      assetPipeline: {
        visualManifest: { version: 'v1', assets: [null, { id: '   ' }, { id: 'valid' }] }
      }
    });
    const pipeline2 = bootstrap2.world.getResource('assetPipeline');
    expect(pipeline2.getAssetById(null)).toBeNull();
    expect(pipeline2.hasAsset(null)).toBe(false);
  });

  it('covers system registration edge cases', () => {
    expect(() => {
      createBootstrap({
        now: 0,
        systemsByPhase: {
          logic: [{ phase: 'input', update: () => {} }]
        }
      });
    }).toThrow('declares phase "input" but is registered under "logic"');

    expect(() => {
      createBootstrap({
        now: 0,
        systemsByPhase: {
          logic: [null]
        }
      });
    }).toThrow('Invalid system registration');
    
    // Function shorthand registration
    const bootstrap = createBootstrap({
      now: 0,
      systemsByPhase: {
        logic: [() => {}]
      }
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

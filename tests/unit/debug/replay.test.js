/**
 * Test: replay.test.js
 * Purpose: Dedicated unit tests for src/debug/replay.js.
 * Public API: N/A (test module).
 */

import { describe, expect, it, vi } from 'vitest';
import { ReplayRecorder, runReplay } from '../../../src/debug/replay.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { World } from '../../../src/ecs/world/world.js';

/**
 * Helper to dynamically extract the private ReplayInputAdapter class constructor
 * by invoking runReplay on a dummy bootstrap and intercepting the adapter set.
 */
function getReplayInputAdapterConstructor() {
  let adapterCtor = null;
  const mockWorld = new World();
  const mockBootstrap = {
    setInputAdapter: (adapter) => {
      adapterCtor = adapter.constructor;
    },
    gameFlow: {
      startGame: () => {},
    },
    stepFrame: () => {},
    world: mockWorld,
  };
  runReplay(mockBootstrap, []);
  return adapterCtor;
}

/**
 * Helper to compute the world state hash by executing runReplay with a 1-step empty trace.
 * This runs the private hashWorldState/serializeWorldState functions internally.
 */
function getHashForWorld(world) {
  const mockBootstrap = {
    setInputAdapter: () => {},
    gameFlow: {
      startGame: () => {},
    },
    stepFrame: () => {},
    world: world,
  };
  const steps = runReplay(mockBootstrap, [{}]);
  return steps[0].hash;
}

describe('replay.js dedicated unit tests', () => {
  describe('serializeWorldState & hashWorldState (tested indirectly via runReplay)', () => {
    it('hashes a world with no active entities and no resources without error', () => {
      const world = new World();
      world.frame = 42;
      world.renderFrame = 120;

      const hash = getHashForWorld(world);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    it('hashes all game resources correctly and detects changes', () => {
      const world = new World();

      // Clock
      world.setResource('clock', {
        accumulator: 10,
        alpha: 0.5,
        isPaused: false,
        simTimeMs: 1000,
      });

      // Game Status
      world.setResource('gameStatus', {
        currentState: 'PLAYING',
      });

      // Score State
      world.setResource('scoreState', {
        comboCounter: 2,
        levelClearBonusAwarded: true,
        totalPoints: 1500,
      });

      // Level Timer
      world.setResource('levelTimer', {
        activeLevel: 1,
        remainingSeconds: 60,
      });

      // Player Life
      world.setResource('playerLife', {
        invincibilityRemainingMs: 1500,
        isInvincible: true,
        lives: 3,
      });

      // Ghost Spawn State
      world.setResource('ghostSpawnState', {
        activeGhostCap: 4,
        elapsedMs: 25000,
        queuedGhostIds: [1, 2],
        releasedGhostIds: [3],
        respawnQueue: [{ ghostId: 1, readyAtMs: 30000 }],
      });

      // Event Queue
      world.setResource('eventQueue', {
        events: [{ frame: 10, order: 0, type: 'BOMB_PLACED', payload: { x: 1 } }],
      });

      // RNG
      world.setResource('rng', {
        state: 123456,
      });

      // Map Resource
      world.setResource('mapResource', {
        level: 1,
        grid: new Uint8Array([1, 2, 3]),
      });

      const baseHash = getHashForWorld(world);
      expect(baseHash).toBeDefined();

      // 1. Modify clock simTimeMs and assert hash changes
      world.getResource('clock').simTimeMs = 1001;
      const hashAfterClockChange = getHashForWorld(world);
      expect(hashAfterClockChange).not.toBe(baseHash);

      // 2. Modify gameStatus and assert hash changes
      world.getResource('gameStatus').currentState = 'PAUSED';
      const hashAfterStatusChange = getHashForWorld(world);
      expect(hashAfterStatusChange).not.toBe(hashAfterClockChange);

      // 3. Modify scoreState and assert hash changes
      world.getResource('scoreState').totalPoints = 2000;
      const hashAfterScoreChange = getHashForWorld(world);
      expect(hashAfterScoreChange).not.toBe(hashAfterStatusChange);

      // 4. Modify levelTimer and assert hash changes
      world.getResource('levelTimer').remainingSeconds = 59;
      const hashAfterTimerChange = getHashForWorld(world);
      expect(hashAfterTimerChange).not.toBe(hashAfterScoreChange);

      // 5. Modify playerLife and assert hash changes
      world.getResource('playerLife').lives = 2;
      const hashAfterLifeChange = getHashForWorld(world);
      expect(hashAfterLifeChange).not.toBe(hashAfterTimerChange);

      // 6. Modify ghostSpawnState and assert hash changes
      world.getResource('ghostSpawnState').activeGhostCap = 5;
      const hashAfterSpawnChange = getHashForWorld(world);
      expect(hashAfterSpawnChange).not.toBe(hashAfterLifeChange);

      // 7. Modify eventQueue and assert hash changes
      world
        .getResource('eventQueue')
        .events.push({ frame: 11, order: 1, type: 'EXPLOSION', payload: {} });
      const hashAfterEventChange = getHashForWorld(world);
      expect(hashAfterEventChange).not.toBe(hashAfterSpawnChange);

      // 8. Modify rng and assert hash changes
      world.getResource('rng').state = 654321;
      const hashAfterRngChange = getHashForWorld(world);
      expect(hashAfterRngChange).not.toBe(hashAfterEventChange);

      // 9. Modify mapResource grid and assert hash changes
      world.getResource('mapResource').grid = new Uint8Array([1, 2, 4]);
      const hashAfterMapChange = getHashForWorld(world);
      expect(hashAfterMapChange).not.toBe(hashAfterRngChange);
    });

    it('handles eventQueue, ghostSpawnState, mapResource with missing/empty properties safely', () => {
      const world = new World();
      world.setResource('ghostSpawnState', {});
      world.setResource('eventQueue', {});
      world.setResource('mapResource', { level: 2, grid: [] });

      const hash = getHashForWorld(world);
      expect(hash).toBeDefined();
    });

    it('serializes entities and their components correctly in stable entity ID order', () => {
      const world = new World();

      // Create multiple entities
      const handle1 = world.createEntity(
        COMPONENT_MASK.PLAYER |
          COMPONENT_MASK.GHOST |
          COMPONENT_MASK.BOMB |
          COMPONENT_MASK.FIRE |
          COMPONENT_MASK.POWER_UP |
          COMPONENT_MASK.PELLET,
      );
      const handle2 = world.createEntity(
        COMPONENT_MASK.POSITION |
          COMPONENT_MASK.VELOCITY |
          COMPONENT_MASK.COLLIDER |
          COMPONENT_MASK.RENDERABLE |
          COMPONENT_MASK.VISUAL_STATE,
      );

      // Register component stores on the world
      world.setResource('position', {
        col: { [handle2.id]: 2 },
        prevCol: { [handle2.id]: 1 },
        prevRow: { [handle2.id]: 3 },
        row: { [handle2.id]: 4 },
        targetCol: { [handle2.id]: 5 },
        targetRow: { [handle2.id]: 6 },
      });

      world.setResource('velocity', {
        colDelta: { [handle2.id]: 0.1 },
        rowDelta: { [handle2.id]: 0.2 },
        speedTilesPerSecond: { [handle2.id]: 4.0 },
      });

      world.setResource('collider', {
        type: { [handle2.id]: 1 },
      });

      world.setResource('renderable', {
        kind: { [handle2.id]: 'ghost' },
        spriteId: { [handle2.id]: 'blinky' },
      });

      world.setResource('visualState', {
        classBits: { [handle2.id]: 7 },
      });

      world.setResource('player', {
        fireRadius: { [handle1.id]: 3 },
        invincibilityMs: { [handle1.id]: 1000 },
        isSpeedBoosted: { [handle1.id]: true },
        lives: { [handle1.id]: 5 },
        maxBombs: { [handle1.id]: 2 },
        speedBoostMs: { [handle1.id]: 200 },
      });

      world.setResource('ghost', {
        speed: { [handle1.id]: 2.5 },
        state: { [handle1.id]: 'FRIGHTENED' },
        timerMs: { [handle1.id]: 5000 },
        type: { [handle1.id]: 0 },
      });

      world.setResource('bomb', {
        col: { [handle1.id]: 10 },
        fuseMs: { [handle1.id]: 3000 },
        ownerId: { [handle1.id]: 9 },
        radius: { [handle1.id]: 4 },
        row: { [handle1.id]: 12 },
      });

      world.setResource('fire', {
        burnTimerMs: { [handle1.id]: 800 },
        chainDepth: { [handle1.id]: 2 },
        col: { [handle1.id]: 11 },
        row: { [handle1.id]: 12 },
        sourceBombId: { [handle1.id]: 99 },
      });

      world.setResource('powerUp', {
        type: { [handle1.id]: 'speed' },
      });

      world.setResource('pellet', {
        isPowerPellet: { [handle1.id]: true },
      });

      const baseHash = getHashForWorld(world);
      expect(baseHash).toBeDefined();

      // Verify stable sorting by checking that overriding getActiveEntityHandles
      // to return the entities in reverse order still produces the same hash.
      const originalGetActive = world.getActiveEntityHandles;
      world.getActiveEntityHandles = () => [handle2, handle1];

      const reorderedHash = getHashForWorld(world);
      expect(reorderedHash).toBe(baseHash);

      // Clean up override
      world.getActiveEntityHandles = originalGetActive;
    });

    it('generates a stable hexadecimal hash code', () => {
      const world = new World();
      const hash1 = getHashForWorld(world);
      const hash2 = getHashForWorld(world);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(/^[0-9a-f]+$/i.test(hash1)).toBe(true);

      // Verify that changes to world state changes hash
      world.frame = 1;
      const hash3 = getHashForWorld(world);
      expect(hash1).not.toBe(hash3);
    });
  });

  describe('ReplayInputAdapter', () => {
    it('returns keys from the trace at each step', () => {
      const ReplayInputAdapter = getReplayInputAdapterConstructor();
      expect(ReplayInputAdapter).not.toBeNull();

      const trace = [
        { held: ['up'], pressed: [] },
        { held: ['up', 'right'], pressed: ['bomb'] },
      ];
      const adapter = new ReplayInputAdapter(trace);

      // Frame 0
      expect(adapter.getHeldKeys()).toEqual(new Set(['up']));
      expect(adapter.drainPressedKeys()).toEqual(new Set([]));

      // Frame 1
      expect(adapter.getHeldKeys()).toEqual(new Set(['up', 'right']));
      expect(adapter.drainPressedKeys()).toEqual(new Set(['bomb']));

      // Frame 2 (out of bounds)
      expect(adapter.getHeldKeys()).toEqual(new Set([]));
      expect(adapter.drainPressedKeys()).toEqual(new Set([]));

      // Destroy and clear verification
      expect(adapter.clearHeldKeys()).toBeUndefined();
      expect(adapter.destroy()).toBeUndefined();
    });
  });

  describe('ReplayRecorder', () => {
    it('records inputs flowing from an original adapter', () => {
      const original = {
        getHeldKeys: () => new Set(['left']),
        drainPressedKeys: () => new Set(['bomb']),
        clearHeldKeys: vi.fn(),
        destroy: vi.fn(),
      };

      const recorder = new ReplayRecorder(original);

      expect(recorder.getHeldKeys()).toEqual(new Set(['left']));
      const pressed = recorder.drainPressedKeys();
      expect(pressed).toEqual(new Set(['bomb']));

      // Verify trace records
      expect(recorder.trace).toEqual([
        {
          frame: 0,
          held: ['left'],
          pressed: ['bomb'],
        },
      ]);
      expect(recorder.currentFrame).toBe(1);

      recorder.clearHeldKeys();
      expect(original.clearHeldKeys).toHaveBeenCalled();

      recorder.destroy();
      expect(original.destroy).toHaveBeenCalled();
    });

    it('safely handles missing original adapter or missing delegate methods', () => {
      const recorderEmpty = new ReplayRecorder(null);
      expect(recorderEmpty.getHeldKeys()).toEqual(new Set());
      expect(recorderEmpty.drainPressedKeys()).toEqual(new Set());
      expect(() => recorderEmpty.clearHeldKeys()).not.toThrow();
      expect(() => recorderEmpty.destroy()).not.toThrow();

      const originalStub = {};
      const recorderStub = new ReplayRecorder(originalStub);
      expect(() => recorderStub.clearHeldKeys()).not.toThrow();
      expect(() => recorderStub.destroy()).not.toThrow();
    });
  });

  describe('runReplay', () => {
    it('executes the replay trace step by step', () => {
      const mockWorld = new World();
      mockWorld.frame = 0;

      const mockBootstrap = {
        setInputAdapter: vi.fn(),
        gameFlow: {
          startGame: vi.fn(),
        },
        stepFrame: vi.fn((_nowMs) => {
          mockWorld.frame += 1;
        }),
        world: mockWorld,
      };

      const trace = [
        { held: ['up'], pressed: [] },
        { held: ['down'], pressed: ['bomb'] },
      ];

      const steps = runReplay(mockBootstrap, trace);

      expect(mockBootstrap.setInputAdapter).toHaveBeenCalled();
      expect(mockBootstrap.gameFlow.startGame).toHaveBeenCalled();
      expect(mockBootstrap.stepFrame).toHaveBeenCalledTimes(2);

      expect(steps.length).toBe(2);
      expect(steps[0].frame).toBe(1);
      expect(steps[1].frame).toBe(2);
      expect(typeof steps[0].hash).toBe('string');
    });
  });
});

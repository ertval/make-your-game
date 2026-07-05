/**
 * Test: replay.test.js
 * Purpose: Dedicated unit tests for src/debug/replay.js.
 * Public API: N/A (test module).
 */

import { describe, expect, it, vi } from 'vitest';
import {
  hashWorldState,
  ReplayInputAdapter,
  ReplayRecorder,
  runReplay,
  serializeWorldState,
} from '../../../src/debug/replay.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { World } from '../../../src/ecs/world/world.js';

describe('replay.js dedicated unit tests', () => {
  describe('serializeWorldState & hashWorldState', () => {
    it('serializes a world with no active entities and no resources', () => {
      const world = new World();
      world.frame = 42;
      world.renderFrame = 120;

      const state = serializeWorldState(world);

      expect(state.frame).toBe(42);
      expect(state.renderFrame).toBe(120);
      expect(state.resources).toEqual({});
      expect(state.entities).toEqual([]);
    });

    it('serializes all game resources correctly when present', () => {
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

      const state = serializeWorldState(world);

      expect(state.resources.clock).toEqual({
        accumulator: 10,
        alpha: 0.5,
        isPaused: false,
        simTimeMs: 1000,
      });
      expect(state.resources.gameStatus).toEqual({
        currentState: 'PLAYING',
      });
      expect(state.resources.scoreState).toEqual({
        comboCounter: 2,
        levelClearBonusAwarded: true,
        totalPoints: 1500,
      });
      expect(state.resources.levelTimer).toEqual({
        activeLevel: 1,
        remainingSeconds: 60,
      });
      expect(state.resources.playerLife).toEqual({
        invincibilityRemainingMs: 1500,
        isInvincible: true,
        lives: 3,
      });
      expect(state.resources.ghostSpawnState).toEqual({
        activeGhostCap: 4,
        elapsedMs: 25000,
        queuedGhostIds: [1, 2],
        releasedGhostIds: [3],
        respawnQueue: [{ ghostId: 1, readyAtMs: 30000 }],
      });
      expect(state.resources.eventQueue.events[0]).toEqual({
        frame: 10,
        order: 0,
        payload: { x: 1 },
        type: 'BOMB_PLACED',
      });
      expect(state.resources.rng).toEqual({
        state: 123456,
      });
      expect(state.resources.mapResource).toEqual({
        level: 1,
        grid: [1, 2, 3],
      });
    });

    it('handles eventQueue, ghostSpawnState, mapResource with missing/empty properties safely', () => {
      const world = new World();
      world.setResource('ghostSpawnState', {});
      world.setResource('eventQueue', {});
      world.setResource('mapResource', { level: 2, grid: [] });

      const state = serializeWorldState(world);
      expect(state.resources.ghostSpawnState).toEqual({
        activeGhostCap: undefined,
        elapsedMs: undefined,
        queuedGhostIds: [],
        releasedGhostIds: [],
        respawnQueue: [],
      });
      expect(state.resources.eventQueue).toEqual({
        events: [],
      });
      expect(state.resources.mapResource).toEqual({
        level: 2,
        grid: [],
      });
    });

    it('serializes entities and their components correctly in stable entity ID order', () => {
      const world = new World();

      // Create multiple entities out of order to verify sorting
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

      // Verify IDs
      expect(handle1.id).toBeLessThan(handle2.id);

      // Register stores
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

      const state = serializeWorldState(world);

      expect(state.entities.length).toBe(2);

      // Verify handle1 is first due to sorted entity ID order
      expect(state.entities[0].id).toBe(handle1.id);
      expect(state.entities[0].player).toEqual({
        fireRadius: 3,
        invincibilityMs: 1000,
        isSpeedBoosted: true,
        lives: 5,
        maxBombs: 2,
        speedBoostMs: 200,
      });
      expect(state.entities[0].ghost).toEqual({
        speed: 2.5,
        state: 'FRIGHTENED',
        timerMs: 5000,
        type: 0,
      });
      expect(state.entities[0].bomb).toEqual({
        col: 10,
        fuseMs: 3000,
        ownerId: 9,
        radius: 4,
        row: 12,
      });
      expect(state.entities[0].fire).toEqual({
        burnTimerMs: 800,
        chainDepth: 2,
        col: 11,
        row: 12,
        sourceBombId: 99,
      });
      expect(state.entities[0].powerUp).toEqual({
        type: 'speed',
      });
      expect(state.entities[0].pellet).toEqual({
        isPowerPellet: true,
      });

      // Verify handle2 is second
      expect(state.entities[1].id).toBe(handle2.id);
      expect(state.entities[1].position).toEqual({
        col: 2,
        prevCol: 1,
        prevRow: 3,
        row: 4,
        targetCol: 5,
        targetRow: 6,
      });
      expect(state.entities[1].velocity).toEqual({
        colDelta: 0.1,
        rowDelta: 0.2,
        speedTilesPerSecond: 4.0,
      });
      expect(state.entities[1].collider).toEqual({
        type: 1,
      });
      expect(state.entities[1].renderable).toEqual({
        kind: 'ghost',
        spriteId: 'blinky',
      });
      expect(state.entities[1].visualState).toEqual({
        classBits: 7,
      });
    });

    it('generates a stable hexadecimal hash code', () => {
      const world = new World();
      const hash1 = hashWorldState(world);
      const hash2 = hashWorldState(world);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(/^[0-9a-f]+$/i.test(hash1)).toBe(true);

      // Verify that changes to world state changes hash
      world.frame = 1;
      const hash3 = hashWorldState(world);
      expect(hash1).not.toBe(hash3);
    });
  });

  describe('ReplayInputAdapter', () => {
    it('returns keys from the trace at each step', () => {
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

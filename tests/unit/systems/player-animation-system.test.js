/**
 * D-10: Player Animation System Tests
 *
 * Validates the player walk-cycle animation: direction derivation from
 * velocity, frame alternation timing, idle hold, and missing-resource safety.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { createVelocityStore } from '../../../src/ecs/components/spatial.js';
import { createRenderableStore } from '../../../src/ecs/components/visual.js';
import { createPlayerAnimationSystem } from '../../../src/ecs/systems/player-animation-system.js';
import { World } from '../../../src/ecs/world/world.js';

const MAX_ENTITIES = 8;

// IDs match sprite-handoff.json array order. Mirrored here so the test fails
// loudly if the system or manifest order ever drifts.
const SPRITE_ID = {
  WALK_UP_01: 2,
  WALK_UP_02: 3,
  WALK_DOWN_01: 4,
  WALK_DOWN_02: 5,
  WALK_LEFT_01: 6,
  WALK_LEFT_02: 7,
  WALK_RIGHT_01: 8,
  WALK_RIGHT_02: 9,
};

function createHarness() {
  const world = new World();
  const velocity = createVelocityStore(MAX_ENTITIES);
  const renderable = createRenderableStore(MAX_ENTITIES);
  const playerHandle = world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.RENDERABLE);

  world.setResource('velocity', velocity);
  world.setResource('renderable', renderable);
  world.setResource('playerEntity', playerHandle);

  const system = createPlayerAnimationSystem();

  function setVelocity({ rowDelta = 0, colDelta = 0, speed = 4 } = {}) {
    velocity.rowDelta[playerHandle.id] = rowDelta;
    velocity.colDelta[playerHandle.id] = colDelta;
    // speedTilesPerSecond is irrelevant to the animation system but mirrors
    // the production setup where player-move-system writes it every tick.
    velocity.speedTilesPerSecond[playerHandle.id] = speed;
  }

  function tick(dtMs) {
    system.update({ world, dtMs });
  }

  function getSpriteId() {
    return renderable.spriteId[playerHandle.id];
  }

  return { world, velocity, renderable, playerHandle, system, setVelocity, tick, getSpriteId };
}

describe('player-animation-system', () => {
  describe('phase and resource config', () => {
    let system;
    beforeEach(() => {
      system = createPlayerAnimationSystem();
    });

    it('runs in the logic phase (before render-collect)', () => {
      expect(system.phase).toBe('logic');
    });

    it('declares read access to playerEntity and velocity', () => {
      expect(system.resourceCapabilities.read).toEqual(
        expect.arrayContaining(['playerEntity', 'velocity']),
      );
    });

    it('declares write access to renderable', () => {
      expect(system.resourceCapabilities.write).toContain('renderable');
    });

    it('exposes a stable name', () => {
      expect(system.name).toBe('player-animation-system');
    });
  });

  describe('direction derivation while moving', () => {
    it.each([
      ['right', { rowDelta: 0, colDelta: 1 }, SPRITE_ID.WALK_RIGHT_01],
      ['left', { rowDelta: 0, colDelta: -1 }, SPRITE_ID.WALK_LEFT_01],
      ['down', { rowDelta: 1, colDelta: 0 }, SPRITE_ID.WALK_DOWN_01],
      ['up', { rowDelta: -1, colDelta: 0 }, SPRITE_ID.WALK_UP_01],
    ])('selects the %s frame from velocity delta', (_label, deltas, expectedSpriteId) => {
      const { setVelocity, tick, getSpriteId } = createHarness();
      setVelocity(deltas);
      tick(16);
      expect(getSpriteId()).toBe(expectedSpriteId);
    });
  });

  describe('frame alternation', () => {
    it('alternates frames after WALK_FRAME_INTERVAL_MS (100ms) of accumulated time', () => {
      const { setVelocity, tick, getSpriteId } = createHarness();
      setVelocity({ colDelta: 1 });

      tick(50);
      expect(getSpriteId()).toBe(SPRITE_ID.WALK_RIGHT_01);

      tick(60); // total 110ms — crossed the 100ms threshold
      expect(getSpriteId()).toBe(SPRITE_ID.WALK_RIGHT_02);

      tick(100); // another 100ms — flips back
      expect(getSpriteId()).toBe(SPRITE_ID.WALK_RIGHT_01);
    });

    it('does not flip frames within a single sub-threshold tick', () => {
      const { setVelocity, tick, getSpriteId } = createHarness();
      setVelocity({ colDelta: 1 });

      tick(30);
      tick(30);
      tick(30);
      expect(getSpriteId()).toBe(SPRITE_ID.WALK_RIGHT_01);
    });
  });

  describe('idle behavior', () => {
    it('holds the last direction (frame 01) when both deltas drop to zero', () => {
      const { setVelocity, tick, getSpriteId } = createHarness();

      setVelocity({ colDelta: -1 });
      tick(16);
      expect(getSpriteId()).toBe(SPRITE_ID.WALK_LEFT_01);

      setVelocity({ colDelta: 0 });
      tick(16);
      expect(getSpriteId()).toBe(SPRITE_ID.WALK_LEFT_01);
    });

    it('idle check is independent of speedTilesPerSecond (which stays nonzero)', () => {
      // player-move-system writes the configured base speed every tick, so the
      // animation system must not treat nonzero speed as "moving" — only
      // armed direction deltas count.
      const { setVelocity, tick, getSpriteId } = createHarness();
      setVelocity({ rowDelta: 0, colDelta: 0, speed: 4 });
      tick(500); // would advance multiple walk frames if speed-driven
      expect(getSpriteId()).toBe(SPRITE_ID.WALK_RIGHT_01);
    });

    it('defaults to right-facing on the very first idle tick before any movement', () => {
      const { setVelocity, tick, getSpriteId } = createHarness();
      setVelocity({});
      tick(16);
      expect(getSpriteId()).toBe(SPRITE_ID.WALK_RIGHT_01);
    });

    it('resets the walk timer when stopping so the next move starts on frame 01', () => {
      const { setVelocity, tick, getSpriteId } = createHarness();

      setVelocity({ colDelta: 1 });
      tick(90); // just under the 100ms threshold

      setVelocity({ colDelta: 0 });
      tick(16); // stop — should reset timer

      setVelocity({ colDelta: 1 });
      tick(30); // well under 100ms — should still be frame 01
      expect(getSpriteId()).toBe(SPRITE_ID.WALK_RIGHT_01);
    });
  });

  describe('safe handling of missing or invalid resources', () => {
    it('does nothing when playerEntity resource is null', () => {
      const world = new World();
      world.setResource('playerEntity', null);
      world.setResource('velocity', createVelocityStore(MAX_ENTITIES));
      world.setResource('renderable', createRenderableStore(MAX_ENTITIES));
      const system = createPlayerAnimationSystem();
      expect(() => system.update({ world, dtMs: 16 })).not.toThrow();
    });

    it('does nothing when player entity has been destroyed', () => {
      const { world, playerHandle, renderable, tick } = createHarness();
      const before = renderable.spriteId[playerHandle.id];
      world.destroyEntity(playerHandle);
      tick(16);
      expect(renderable.spriteId[playerHandle.id]).toBe(before);
    });

    it('does nothing when velocity resource is missing', () => {
      const world = new World();
      const playerHandle = world.createEntity(COMPONENT_MASK.PLAYER);
      world.setResource('playerEntity', playerHandle);
      world.setResource('renderable', createRenderableStore(MAX_ENTITIES));
      const system = createPlayerAnimationSystem();
      expect(() => system.update({ world, dtMs: 16 })).not.toThrow();
    });

    it('does nothing when renderable resource is missing', () => {
      const world = new World();
      const playerHandle = world.createEntity(COMPONENT_MASK.PLAYER);
      world.setResource('playerEntity', playerHandle);
      world.setResource('velocity', createVelocityStore(MAX_ENTITIES));
      const system = createPlayerAnimationSystem();
      expect(() => system.update({ world, dtMs: 16 })).not.toThrow();
    });

    it('treats missing dtMs as zero (no flip)', () => {
      const { setVelocity, tick, getSpriteId } = createHarness();
      setVelocity({ colDelta: 1 });
      tick(undefined);
      expect(getSpriteId()).toBe(SPRITE_ID.WALK_RIGHT_01);
    });
  });
});

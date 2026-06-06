/**
 * Unit tests for the player visual-state mirror system.
 *
 * These checks verify that `playerStore.isSpeedBoosted[playerId]` is mirrored
 * into the SPEED_BOOST bit of `visualState.classBits[playerId]` so render-dom-system
 * can emit the `.is-speed-boosted` CSS class on the player sprite. They also
 * cover the bit-isolation contract: only the SPEED_BOOST bit is touched, and
 * bits owned by other systems (STUNNED, DEAD, INVINCIBLE) survive untouched.
 */

import { describe, expect, it } from 'vitest';

import { createPlayerStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { createVisualStateStore } from '../../../src/ecs/components/visual.js';
import { VISUAL_FLAGS } from '../../../src/ecs/resources/constants.js';
import { createPlayerVisualStateSystem } from '../../../src/ecs/systems/player-visual-state-system.js';
import { World } from '../../../src/ecs/world/world.js';

function setupHarness({
  withVisualState = true,
  withPlayerStore = true,
  withPlayerEntity = true,
} = {}) {
  const world = new World();
  const playerStore = createPlayerStore(16);
  const visualState = createVisualStateStore(16);
  const playerHandle = world.createEntity(COMPONENT_MASK.PLAYER);

  if (withPlayerStore) {
    world.setResource('player', playerStore);
  }
  if (withVisualState) {
    world.setResource('visualState', visualState);
  }
  if (withPlayerEntity) {
    world.setResource('playerEntity', playerHandle);
  }

  return { playerHandle, playerStore, visualState, world };
}

function runUpdate(system, world, { dtMs = 0 } = {}) {
  system.update({ world, dtMs });
}

describe('player-visual-state-system', () => {
  describe('phase and resource config', () => {
    it('runs in the logic phase (after power-up-system, before render-collect)', () => {
      const system = createPlayerVisualStateSystem();
      expect(system.phase).toBe('logic');
    });

    it('declares read access to player and playerEntity', () => {
      const system = createPlayerVisualStateSystem();
      expect(system.resourceCapabilities.read).toEqual(
        expect.arrayContaining(['player', 'playerEntity']),
      );
    });

    it('declares write access to visualState', () => {
      const system = createPlayerVisualStateSystem();
      expect(system.resourceCapabilities.write).toContain('visualState');
    });

    it('honors resource key overrides', () => {
      const system = createPlayerVisualStateSystem({
        playerResourceKey: 'p',
        visualStateResourceKey: 'vs',
        playerEntityResourceKey: 'pe',
      });
      expect(system.resourceCapabilities.read).toEqual(expect.arrayContaining(['p', 'pe']));
      expect(system.resourceCapabilities.write).toContain('vs');
    });
  });

  describe('SPEED_BOOST bit mirroring', () => {
    it('leaves classBits at 0 when isSpeedBoosted is 0 (initial state)', () => {
      const { playerHandle, visualState, world } = setupHarness();
      const system = createPlayerVisualStateSystem();

      runUpdate(system, world);

      expect(visualState.classBits[playerHandle.id]).toBe(0);
    });

    it('sets the SPEED_BOOST bit when isSpeedBoosted is 1 (boost-on)', () => {
      const { playerHandle, playerStore, visualState, world } = setupHarness();
      playerStore.isSpeedBoosted[playerHandle.id] = 1;

      const system = createPlayerVisualStateSystem();
      runUpdate(system, world);

      expect(visualState.classBits[playerHandle.id] & VISUAL_FLAGS.SPEED_BOOST).toBe(
        VISUAL_FLAGS.SPEED_BOOST,
      );
    });

    it('clears the SPEED_BOOST bit when isSpeedBoosted drops back to 0 (timer expired)', () => {
      const { playerHandle, playerStore, visualState, world } = setupHarness();
      // Pre-seed the bit to mimic a previous frame where the boost was active.
      visualState.classBits[playerHandle.id] = VISUAL_FLAGS.SPEED_BOOST;
      // Then mark the player store as no longer boosted.
      playerStore.isSpeedBoosted[playerHandle.id] = 0;

      const system = createPlayerVisualStateSystem();
      runUpdate(system, world);

      expect(visualState.classBits[playerHandle.id] & VISUAL_FLAGS.SPEED_BOOST).toBe(0);
    });
  });

  describe('bit isolation (other visual bits preserved)', () => {
    it('preserves a pre-existing STUNNED bit when toggling SPEED_BOOST on', () => {
      const { playerHandle, playerStore, visualState, world } = setupHarness();
      visualState.classBits[playerHandle.id] = VISUAL_FLAGS.STUNNED;
      playerStore.isSpeedBoosted[playerHandle.id] = 1;

      const system = createPlayerVisualStateSystem();
      runUpdate(system, world);

      const bits = visualState.classBits[playerHandle.id];
      expect(bits & VISUAL_FLAGS.STUNNED).toBe(VISUAL_FLAGS.STUNNED);
      expect(bits & VISUAL_FLAGS.SPEED_BOOST).toBe(VISUAL_FLAGS.SPEED_BOOST);
    });

    it('preserves STUNNED | DEAD | INVINCIBLE bits when toggling SPEED_BOOST off', () => {
      const { playerHandle, playerStore, visualState, world } = setupHarness();
      const PRESET = VISUAL_FLAGS.STUNNED | VISUAL_FLAGS.DEAD | VISUAL_FLAGS.INVINCIBLE;
      visualState.classBits[playerHandle.id] = PRESET | VISUAL_FLAGS.SPEED_BOOST;
      playerStore.isSpeedBoosted[playerHandle.id] = 0;

      const system = createPlayerVisualStateSystem();
      runUpdate(system, world);

      const bits = visualState.classBits[playerHandle.id];
      expect(bits & VISUAL_FLAGS.STUNNED).toBe(VISUAL_FLAGS.STUNNED);
      expect(bits & VISUAL_FLAGS.DEAD).toBe(VISUAL_FLAGS.DEAD);
      expect(bits & VISUAL_FLAGS.INVINCIBLE).toBe(VISUAL_FLAGS.INVINCIBLE);
      // Speed boost is the one bit that must have been cleared.
      expect(bits & VISUAL_FLAGS.SPEED_BOOST).toBe(0);
    });

    it('preserves the HIDDEN bit (owned by another system)', () => {
      const { playerHandle, playerStore, visualState, world } = setupHarness();
      visualState.classBits[playerHandle.id] = VISUAL_FLAGS.HIDDEN | VISUAL_FLAGS.SPEED_BOOST;
      playerStore.isSpeedBoosted[playerHandle.id] = 1;

      const system = createPlayerVisualStateSystem();
      runUpdate(system, world);

      const bits = visualState.classBits[playerHandle.id];
      expect(bits & VISUAL_FLAGS.HIDDEN).toBe(VISUAL_FLAGS.HIDDEN);
      expect(bits & VISUAL_FLAGS.SPEED_BOOST).toBe(VISUAL_FLAGS.SPEED_BOOST);
    });
  });

  describe('safe handling of missing or invalid resources', () => {
    it('does not throw when playerEntity resource is null', () => {
      const { visualState, world } = setupHarness({ withPlayerEntity: false });
      const system = createPlayerVisualStateSystem();

      expect(() => runUpdate(system, world)).not.toThrow();
      // No classBits slot was written because there is no player to write for.
      expect(visualState.classBits.every((value) => value === 0)).toBe(true);
    });

    it('does not throw when playerEntity.id is not a valid integer', () => {
      const { playerStore, visualState, world } = setupHarness();
      world.setResource('playerEntity', { id: -1 });
      // Set the store flag to 1 so we can detect if it accidentally leaked
      // into a classBits slot somewhere.
      playerStore.isSpeedBoosted[0] = 1;

      const system = createPlayerVisualStateSystem();

      expect(() => runUpdate(system, world)).not.toThrow();
      // The visualState slot for slot 0 stays at 0.
      expect(visualState.classBits[0]).toBe(0);
    });

    it('does not throw when visualState resource is missing', () => {
      const { world } = setupHarness({ withVisualState: false });
      const system = createPlayerVisualStateSystem();

      expect(() => runUpdate(system, world)).not.toThrow();
    });

    it('does not throw when playerStore resource is missing', () => {
      const { world } = setupHarness({ withPlayerStore: false });
      const system = createPlayerVisualStateSystem();

      expect(() => runUpdate(system, world)).not.toThrow();
    });
  });
});

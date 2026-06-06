/**
 * Unit tests for the D-08 HUD rendering system.
 *
 * These checks verify that the system reads the canonical player store
 * (maxBombs / fireRadius) and the playerEntity resource, and propagates those
 * values to either the registered hudAdapter (preferred path) or the
 * fallback hudElements DOM nodes. They also lock in safe-default behavior
 * when those resources are missing so partial-bootstrap runs and unit tests
 * never throw from the render phase.
 */

import { describe, expect, it, vi } from 'vitest';

import { createPlayerStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import {
  DEFAULT_FIRE_RADIUS,
  PLAYER_START_MAX_BOMBS,
} from '../../../src/ecs/resources/constants.js';
import { createHudSystem } from '../../../src/ecs/systems/hud-system.js';
import { World } from '../../../src/ecs/world/world.js';

function createHudElement(initialText = '') {
  let textContent = initialText;
  return {
    get textContent() {
      return textContent;
    },
    set textContent(value) {
      textContent = value;
    },
  };
}

function setupHarness({
  withPlayerStore = true,
  withPlayerEntity = true,
  withHudAdapter = true,
  withHudElements = false,
  withLevelLoader = true,
  initialMaxBombs,
  initialFireRadius,
} = {}) {
  const world = new World();
  const playerStore = createPlayerStore(16);
  const playerEntity = world.createEntity(COMPONENT_MASK.PLAYER);

  if (withPlayerStore) {
    world.setResource('player', playerStore);
  }
  if (withPlayerEntity) {
    world.setResource('playerEntity', playerEntity);
  }
  if (withLevelLoader) {
    world.setResource('levelLoader', { getCurrentLevelIndex: () => 0 });
  }

  let hudAdapter;
  if (withHudAdapter) {
    hudAdapter = { update: vi.fn() };
    world.setResource('hudAdapter', hudAdapter);
  }

  let hudElements;
  if (withHudElements) {
    hudElements = {
      bombs: createHudElement('Bombs: 0'),
      fire: createHudElement('Fire: 0'),
      lives: createHudElement('Lives: 0'),
      score: createHudElement('Score: 00000'),
      timer: createHudElement('Timer: 0:00'),
    };
    world.setResource('hudElements', hudElements);
  }

  if (Number.isInteger(initialMaxBombs)) {
    playerStore.maxBombs[playerEntity.id] = initialMaxBombs;
  }
  if (Number.isInteger(initialFireRadius)) {
    playerStore.fireRadius[playerEntity.id] = initialFireRadius;
  }

  return { hudAdapter, hudElements, playerEntity, playerStore, world };
}

function runUpdate(system, world) {
  system.update({ world });
}

describe('hud-system', () => {
  describe('phase and resource config', () => {
    it('runs in the render phase', () => {
      const system = createHudSystem();
      expect(system.phase).toBe('render');
    });

    it('declares read access to player and playerEntity for bombs/fire wiring', () => {
      const system = createHudSystem();
      expect(system.resourceCapabilities.read).toEqual(
        expect.arrayContaining(['player', 'playerEntity']),
      );
    });

    it('honors player resource key overrides', () => {
      const system = createHudSystem({ playerResourceKey: 'p', playerEntityResourceKey: 'pe' });
      expect(system.resourceCapabilities.read).toEqual(expect.arrayContaining(['p', 'pe']));
    });
  });

  describe('adapter branch', () => {
    it('passes the player default maxBombs and fireRadius on the initial frame', () => {
      const { hudAdapter, world } = setupHarness();
      const system = createHudSystem();

      runUpdate(system, world);

      expect(hudAdapter.update).toHaveBeenCalledTimes(1);
      const payload = hudAdapter.update.mock.calls[0][0];
      expect(payload.bombs).toBe(PLAYER_START_MAX_BOMBS);
      expect(payload.fire).toBe(DEFAULT_FIRE_RADIUS);
    });

    it('propagates a bomb+ upgrade into the adapter payload', () => {
      const { hudAdapter, playerEntity, playerStore, world } = setupHarness();
      playerStore.maxBombs[playerEntity.id] = 2;
      const system = createHudSystem();

      runUpdate(system, world);

      const payload = hudAdapter.update.mock.calls[0][0];
      expect(payload.bombs).toBe(2);
    });

    it('propagates a fire+ upgrade into the adapter payload', () => {
      const { hudAdapter, playerEntity, playerStore, world } = setupHarness();
      playerStore.fireRadius[playerEntity.id] = DEFAULT_FIRE_RADIUS + 1;
      const system = createHudSystem();

      runUpdate(system, world);

      const payload = hudAdapter.update.mock.calls[0][0];
      expect(payload.fire).toBe(DEFAULT_FIRE_RADIUS + 1);
    });

    it('falls back to bombs=0 / fire=0 when the playerStore is missing', () => {
      const { hudAdapter, world } = setupHarness({ withPlayerStore: false });
      const system = createHudSystem();

      runUpdate(system, world);

      const payload = hudAdapter.update.mock.calls[0][0];
      expect(payload.bombs).toBe(0);
      expect(payload.fire).toBe(0);
    });

    it('falls back to bombs=0 / fire=0 when the playerEntity resource is missing', () => {
      const { hudAdapter, world } = setupHarness({ withPlayerEntity: false });
      const system = createHudSystem();

      runUpdate(system, world);

      const payload = hudAdapter.update.mock.calls[0][0];
      expect(payload.bombs).toBe(0);
      expect(payload.fire).toBe(0);
    });

    it('falls back to bombs=0 / fire=0 when playerEntity.id is invalid', () => {
      const world = new World();
      const playerStore = createPlayerStore(16);
      world.setResource('player', playerStore);
      world.setResource('playerEntity', { id: -1 });
      world.setResource('levelLoader', { getCurrentLevelIndex: () => 0 });
      const hudAdapter = { update: vi.fn() };
      world.setResource('hudAdapter', hudAdapter);

      const system = createHudSystem();
      runUpdate(system, world);

      const payload = hudAdapter.update.mock.calls[0][0];
      expect(payload.bombs).toBe(0);
      expect(payload.fire).toBe(0);
    });
  });

  describe('DOM fallback branch', () => {
    it('writes Bombs: and Fire: labels into the fallback hudElements', () => {
      const { hudElements, world } = setupHarness({
        withHudAdapter: false,
        withHudElements: true,
      });
      const system = createHudSystem();

      runUpdate(system, world);

      expect(hudElements.bombs.textContent).toBe(`Bombs: ${PLAYER_START_MAX_BOMBS}`);
      expect(hudElements.fire.textContent).toBe(`Fire: ${DEFAULT_FIRE_RADIUS}`);
    });

    it('reflects a bomb+ upgrade in the fallback hudElements', () => {
      const { hudElements, playerEntity, playerStore, world } = setupHarness({
        withHudAdapter: false,
        withHudElements: true,
      });
      playerStore.maxBombs[playerEntity.id] = 3;
      const system = createHudSystem();

      runUpdate(system, world);

      expect(hudElements.bombs.textContent).toBe('Bombs: 3');
    });

    it('reflects a fire+ upgrade in the fallback hudElements', () => {
      const { hudElements, playerEntity, playerStore, world } = setupHarness({
        withHudAdapter: false,
        withHudElements: true,
      });
      playerStore.fireRadius[playerEntity.id] = 4;
      const system = createHudSystem();

      runUpdate(system, world);

      expect(hudElements.fire.textContent).toBe('Fire: 4');
    });

    it('still writes Bombs: 0 / Fire: 0 when the playerStore is missing', () => {
      const { hudElements, world } = setupHarness({
        withPlayerStore: false,
        withHudAdapter: false,
        withHudElements: true,
      });
      const system = createHudSystem();

      runUpdate(system, world);

      expect(hudElements.bombs.textContent).toBe('Bombs: 0');
      expect(hudElements.fire.textContent).toBe('Fire: 0');
    });
  });

  describe('safe handling of missing resources', () => {
    it('does not throw when neither hudAdapter nor hudElements are registered', () => {
      const { world } = setupHarness({ withHudAdapter: false, withHudElements: false });
      const system = createHudSystem();

      expect(() => runUpdate(system, world)).not.toThrow();
    });

    it('does not throw when playerStore and playerEntity are both missing', () => {
      const world = new World();
      world.setResource('levelLoader', { getCurrentLevelIndex: () => 0 });
      const hudAdapter = { update: vi.fn() };
      world.setResource('hudAdapter', hudAdapter);

      const system = createHudSystem();

      expect(() => runUpdate(system, world)).not.toThrow();
      expect(hudAdapter.update).toHaveBeenCalledTimes(1);
      const payload = hudAdapter.update.mock.calls[0][0];
      expect(payload.bombs).toBe(0);
      expect(payload.fire).toBe(0);
    });
  });
});

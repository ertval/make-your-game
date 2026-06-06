/**
 * Unit tests for the D-08 HUD rendering system.
 *
 * These checks lock the bugfix where the HUD must surface the player's live
 * power-up stats (`maxBombs` / `fireRadius`) through the HUD adapter instead of
 * the previously hardcoded zeros, so that bomb/fire power-up pickups visibly
 * increment the `Bombs:` / `Fire:` counters.
 */

import { describe, expect, it, vi } from 'vitest';

import { createPlayerStore } from '../../../src/ecs/components/actors.js';
import { createHudSystem } from '../../../src/ecs/systems/hud-system.js';
import { World } from '../../../src/ecs/world/world.js';

function setupWorld({ playerEntity = { id: 0, generation: 0 }, configurePlayer } = {}) {
  const world = new World();
  const playerStore = createPlayerStore(world.getMaxEntities());

  if (typeof configurePlayer === 'function') {
    configurePlayer(playerStore);
  }

  world.setResource('player', playerStore);
  world.setResource('playerEntity', playerEntity);
  world.setResource('scoreState', { totalPoints: 0 });
  world.setResource('levelTimer', { remainingSeconds: 0 });
  world.setResource('playerLife', { lives: 3 });

  const updateSpy = vi.fn();
  world.setResource('hudAdapter', { update: updateSpy });

  return { world, playerStore, updateSpy };
}

describe('hud-system', () => {
  it('forwards the player canonical starting power-up stats to the adapter', () => {
    const { world, updateSpy } = setupWorld();
    const hudSystem = createHudSystem();

    hudSystem.update({ world });

    // PLAYER_START_MAX_BOMBS = 1, DEFAULT_FIRE_RADIUS = 2.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][0]).toMatchObject({ bombs: 1, fire: 2 });
  });

  it('reflects collected bomb and fire power-ups in the HUD payload', () => {
    const { world, playerStore, updateSpy } = setupWorld({
      configurePlayer(store) {
        // Simulate two bomb pickups and one fire pickup applied by power-up-system.
        store.maxBombs[0] += 2;
        store.fireRadius[0] += 1;
      },
    });
    const hudSystem = createHudSystem();

    hudSystem.update({ world });

    expect(playerStore.maxBombs[0]).toBe(3);
    expect(playerStore.fireRadius[0]).toBe(3);
    expect(updateSpy.mock.calls[0][0]).toMatchObject({ bombs: 3, fire: 3 });
  });

  it('falls back to zero stats when no live player entity is registered', () => {
    const { world, updateSpy } = setupWorld({ playerEntity: null });
    const hudSystem = createHudSystem();

    hudSystem.update({ world });

    expect(updateSpy.mock.calls[0][0]).toMatchObject({ bombs: 0, fire: 0 });
  });
});

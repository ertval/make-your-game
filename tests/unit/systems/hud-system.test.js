/**
 * Unit tests for the D-08 / ARCH-01 HUD data system.
 *
 * The HUD system is a logic-phase, DOM-free producer: it reads the gameplay
 * resources and writes a plain snapshot into the `hudState` buffer. These checks
 * lock the power-up stat surfacing (`maxBombs` / `fireRadius`) and assert the
 * system performs no DOM access — only buffer writes.
 */

import { describe, expect, it } from 'vitest';

import { createPlayerStore } from '../../../src/ecs/components/actors.js';
import { createHudState, createHudSystem } from '../../../src/ecs/systems/hud-system.js';
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
  world.setResource('hudState', createHudState());

  return { world, playerStore };
}

describe('hud-system', () => {
  it('writes the player canonical starting power-up stats into the hudState buffer', () => {
    const { world } = setupWorld();
    const hudSystem = createHudSystem();

    hudSystem.update({ world });

    // PLAYER_START_MAX_BOMBS = 1, DEFAULT_FIRE_RADIUS = 2.
    expect(world.getResource('hudState')).toMatchObject({ bombs: 1, fire: 2, lives: 3 });
  });

  it('writes ALL six HUD fields every update — never a partial snapshot (BUG-21 / #134)', () => {
    // REQ-17: the HUD snapshot must always carry lives, score, timer, bombs,
    // fire AND level together. A prior fallback path dropped bombs/fire/level;
    // this guard locks in that the data system emits the complete set in one
    // pass regardless of which downstream consumer (adapter or none) reads it.
    const { world } = setupWorld();
    world.setResource('scoreState', { totalPoints: 1500 });
    world.setResource('levelTimer', { remainingSeconds: 87.2 });
    world.setResource('levelLoader', { getCurrentLevelIndex: () => 2 });
    const hudSystem = createHudSystem();

    hudSystem.update({ world });

    expect(world.getResource('hudState')).toEqual({
      lives: 3,
      score: 1500,
      timer: 88, // Math.ceil(87.2)
      bombs: 1,
      fire: 2,
      level: 3, // levelIndex 2 + 1
    });
  });

  it('reflects collected bomb and fire power-ups in the hudState buffer', () => {
    const { world, playerStore } = setupWorld({
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
    expect(world.getResource('hudState')).toMatchObject({ bombs: 3, fire: 3 });
  });

  it('falls back to zero stats when no live player entity is registered', () => {
    const { world } = setupWorld({ playerEntity: null });
    const hudSystem = createHudSystem();

    hudSystem.update({ world });

    expect(world.getResource('hudState')).toMatchObject({ bombs: 0, fire: 0 });
  });

  it('lazily creates a hudState buffer when one is not pre-registered', () => {
    const { world } = setupWorld();
    world.setResource('hudState', undefined);
    const hudSystem = createHudSystem();

    hudSystem.update({ world });

    expect(world.getResource('hudState')).toMatchObject({ lives: 3, bombs: 1, fire: 2 });
  });

  it('reuses the existing hudState object reference across frames', () => {
    const { world } = setupWorld();
    const hudSystem = createHudSystem();

    hudSystem.update({ world });
    const firstBuffer = world.getResource('hudState');
    hudSystem.update({ world });

    expect(world.getResource('hudState')).toBe(firstBuffer);
  });

  it('declares no DOM resources and is a logic-phase system', () => {
    const hudSystem = createHudSystem();

    expect(hudSystem.phase).toBe('logic');
    expect(hudSystem.resourceCapabilities.write).toEqual(['hudState']);
    expect(hudSystem.resourceCapabilities.read).not.toContain('hudAdapter');
    expect(hudSystem.resourceCapabilities.read).not.toContain('hudElements');
  });
});

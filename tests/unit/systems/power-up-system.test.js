/**
 * Unit tests for the B-07 power-up effect system.
 *
 * These checks verify deterministic application of power pellet stun, bomb+,
 * fire+, and speed boost effects from canonical collision intents, plus the
 * parallel countdown timers and the duplicate-frame guard.
 */

import { describe, expect, it } from 'vitest';

import { createGhostStore, createPlayerStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import {
  GHOST_STATE,
  PLAYER_START_MAX_BOMBS,
  SPEED_BOOST_MS,
  STUN_MS,
} from '../../../src/ecs/resources/constants.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import {
  createDefaultPowerUpState,
  createPowerUpSystem,
} from '../../../src/ecs/systems/power-up-system.js';
import { World } from '../../../src/ecs/world/world.js';

function setupHarness({ ghostCount = 2 } = {}) {
  const world = new World();
  const playerStore = createPlayerStore(16);
  const ghostStore = createGhostStore(16);
  const playerEntity = world.createEntity(COMPONENT_MASK.PLAYER);

  const ghostEntities = [];
  for (let i = 0; i < ghostCount; i += 1) {
    const handle = world.createEntity(COMPONENT_MASK.GHOST);
    ghostStore.state[handle.id] = GHOST_STATE.NORMAL;
    ghostStore.timerMs[handle.id] = 0;
    ghostEntities.push(handle);
  }

  world.setResource('player', playerStore);
  world.setResource('ghost', ghostStore);
  world.setResource('playerEntity', playerEntity);
  world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
  world.setResource('collisionIntents', []);

  return { ghostEntities, ghostStore, playerEntity, playerStore, world };
}

function runUpdate(system, world, { dtMs = 0, frame = 0 } = {}) {
  system.update({ world, dtMs, frame });
}

describe('power-up-system', () => {
  it('creates a canonical default power-up state', () => {
    expect(createDefaultPowerUpState()).toEqual({
      stunRemainingMs: 0,
      speedBoostRemainingMs: 0,
      lastProcessedFrame: null,
    });
  });

  it('initializes the powerUpState resource when missing', () => {
    const { world } = setupHarness({ ghostCount: 0 });
    const system = createPowerUpSystem();

    runUpdate(system, world, { frame: 0 });

    expect(world.getResource('powerUpState')).toEqual({
      stunRemainingMs: 0,
      speedBoostRemainingMs: 0,
      lastProcessedFrame: 0,
    });
  });

  it('stuns every normal ghost for STUN_MS on a power-pellet intent', () => {
    const { ghostEntities, ghostStore, world } = setupHarness({ ghostCount: 3 });
    // Mark one ghost dead to confirm it is excluded.
    ghostStore.state[ghostEntities[2].id] = GHOST_STATE.DEAD;

    world.setResource('collisionIntents', [{ type: 'power-pellet-collected' }]);

    const system = createPowerUpSystem();
    runUpdate(system, world);

    expect(ghostStore.state[ghostEntities[0].id]).toBe(GHOST_STATE.STUNNED);
    expect(ghostStore.timerMs[ghostEntities[0].id]).toBe(STUN_MS);
    expect(ghostStore.state[ghostEntities[1].id]).toBe(GHOST_STATE.STUNNED);
    expect(ghostStore.timerMs[ghostEntities[1].id]).toBe(STUN_MS);
    // Dead ghost untouched.
    expect(ghostStore.state[ghostEntities[2].id]).toBe(GHOST_STATE.DEAD);
    expect(world.getResource('powerUpState').stunRemainingMs).toBe(STUN_MS);
  });

  it('refreshes an already-stunned ghost without stacking (non-stacking timer reset)', () => {
    const { ghostEntities, ghostStore, world } = setupHarness({ ghostCount: 1 });
    ghostStore.state[ghostEntities[0].id] = GHOST_STATE.STUNNED;
    ghostStore.timerMs[ghostEntities[0].id] = 200;

    world.setResource('collisionIntents', [{ type: 'power-pellet-collected' }]);

    const system = createPowerUpSystem();
    runUpdate(system, world);

    expect(ghostStore.timerMs[ghostEntities[0].id]).toBe(STUN_MS);
  });

  it('ticks the stun timer and restores ghosts to NORMAL when it expires', () => {
    const { ghostEntities, ghostStore, world } = setupHarness({ ghostCount: 1 });
    ghostStore.state[ghostEntities[0].id] = GHOST_STATE.STUNNED;
    ghostStore.timerMs[ghostEntities[0].id] = 300;

    const system = createPowerUpSystem();
    // First step decrements by 200ms, ghost stays stunned.
    runUpdate(system, world, { dtMs: 200, frame: 0 });
    expect(ghostStore.state[ghostEntities[0].id]).toBe(GHOST_STATE.STUNNED);
    expect(ghostStore.timerMs[ghostEntities[0].id]).toBe(100);

    // Second step drives the timer to zero, ghost flips back to NORMAL.
    runUpdate(system, world, { dtMs: 200, frame: 1 });
    expect(ghostStore.state[ghostEntities[0].id]).toBe(GHOST_STATE.NORMAL);
    expect(ghostStore.timerMs[ghostEntities[0].id]).toBe(0);
  });

  it('never overwrites a DEAD ghost when its stun timer would have expired', () => {
    const { ghostEntities, ghostStore, world } = setupHarness({ ghostCount: 1 });
    ghostStore.state[ghostEntities[0].id] = GHOST_STATE.DEAD;
    ghostStore.timerMs[ghostEntities[0].id] = 100;

    const system = createPowerUpSystem();
    runUpdate(system, world, { dtMs: 500 });

    expect(ghostStore.state[ghostEntities[0].id]).toBe(GHOST_STATE.DEAD);
  });

  it('applies a bomb+ power-up by incrementing maxBombs', () => {
    const { playerEntity, playerStore, world } = setupHarness({ ghostCount: 0 });
    world.setResource('collisionIntents', [
      { type: 'power-up-collected', powerUpType: 'bombPlus' },
    ]);

    const system = createPowerUpSystem();
    runUpdate(system, world);

    expect(playerStore.maxBombs[playerEntity.id]).toBe(PLAYER_START_MAX_BOMBS + 1);
  });

  it('applies a fire+ power-up by incrementing fireRadius', () => {
    const { playerEntity, playerStore, world } = setupHarness({ ghostCount: 0 });
    const startingRadius = playerStore.fireRadius[playerEntity.id];
    world.setResource('collisionIntents', [
      { type: 'power-up-collected', powerUpType: 'firePlus' },
    ]);

    const system = createPowerUpSystem();
    runUpdate(system, world);

    expect(playerStore.fireRadius[playerEntity.id]).toBe(startingRadius + 1);
  });

  it('applies a speed-boost power-up by setting the canonical window and flag', () => {
    const { playerEntity, playerStore, world } = setupHarness({ ghostCount: 0 });
    world.setResource('collisionIntents', [
      { type: 'power-up-collected', powerUpType: 'speedBoost' },
    ]);

    const system = createPowerUpSystem();
    runUpdate(system, world);

    expect(playerStore.speedBoostMs[playerEntity.id]).toBe(SPEED_BOOST_MS);
    expect(playerStore.isSpeedBoosted[playerEntity.id]).toBe(1);
    expect(world.getResource('powerUpState').speedBoostRemainingMs).toBe(SPEED_BOOST_MS);
  });

  it('treats a second speed-boost collection as a non-stacking reset', () => {
    const { playerEntity, playerStore, world } = setupHarness({ ghostCount: 0 });
    playerStore.speedBoostMs[playerEntity.id] = 1234;
    playerStore.isSpeedBoosted[playerEntity.id] = 1;

    world.setResource('collisionIntents', [
      { type: 'power-up-collected', powerUpType: 'speedBoost' },
    ]);

    const system = createPowerUpSystem();
    runUpdate(system, world);

    expect(playerStore.speedBoostMs[playerEntity.id]).toBe(SPEED_BOOST_MS);
  });

  it('ticks the player speed boost and clears the flag on expiry', () => {
    const { playerEntity, playerStore, world } = setupHarness({ ghostCount: 0 });
    playerStore.speedBoostMs[playerEntity.id] = 200;
    playerStore.isSpeedBoosted[playerEntity.id] = 1;

    const system = createPowerUpSystem();
    runUpdate(system, world, { dtMs: 100, frame: 0 });
    expect(playerStore.speedBoostMs[playerEntity.id]).toBe(100);
    expect(playerStore.isSpeedBoosted[playerEntity.id]).toBe(1);

    runUpdate(system, world, { dtMs: 200, frame: 1 });
    expect(playerStore.speedBoostMs[playerEntity.id]).toBe(0);
    expect(playerStore.isSpeedBoosted[playerEntity.id]).toBe(0);
  });

  it('does not advance timers or consume intents outside the PLAYING state', () => {
    const { ghostEntities, ghostStore, playerEntity, playerStore, world } = setupHarness({
      ghostCount: 1,
    });
    ghostStore.state[ghostEntities[0].id] = GHOST_STATE.STUNNED;
    ghostStore.timerMs[ghostEntities[0].id] = STUN_MS;
    playerStore.speedBoostMs[playerEntity.id] = SPEED_BOOST_MS;
    playerStore.isSpeedBoosted[playerEntity.id] = 1;

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PAUSED));
    world.setResource('collisionIntents', [
      { type: 'power-up-collected', powerUpType: 'bombPlus' },
    ]);

    const system = createPowerUpSystem();
    runUpdate(system, world, { dtMs: 1000 });

    expect(ghostStore.timerMs[ghostEntities[0].id]).toBe(STUN_MS);
    expect(playerStore.speedBoostMs[playerEntity.id]).toBe(SPEED_BOOST_MS);
    expect(playerStore.maxBombs[playerEntity.id]).toBe(PLAYER_START_MAX_BOMBS);
  });

  it('does not double-process the same frame even when called twice', () => {
    const { ghostEntities, ghostStore, playerEntity, playerStore, world } = setupHarness({
      ghostCount: 1,
    });
    ghostStore.state[ghostEntities[0].id] = GHOST_STATE.STUNNED;
    ghostStore.timerMs[ghostEntities[0].id] = 500;
    playerStore.speedBoostMs[playerEntity.id] = 500;
    playerStore.isSpeedBoosted[playerEntity.id] = 1;

    world.setResource('collisionIntents', [
      { type: 'power-up-collected', powerUpType: 'bombPlus' },
    ]);

    const system = createPowerUpSystem();
    runUpdate(system, world, { dtMs: 100, frame: 7 });
    runUpdate(system, world, { dtMs: 100, frame: 7 });

    // Intent applied exactly once.
    expect(playerStore.maxBombs[playerEntity.id]).toBe(PLAYER_START_MAX_BOMBS + 1);
    // Timers ticked exactly once (500 - 100 = 400), not twice.
    expect(ghostStore.timerMs[ghostEntities[0].id]).toBe(400);
    expect(playerStore.speedBoostMs[playerEntity.id]).toBe(400);
  });

  it('clamps spike deltas above the safety ceiling instead of underflowing timers', () => {
    const { ghostEntities, ghostStore, world } = setupHarness({ ghostCount: 1 });
    ghostStore.state[ghostEntities[0].id] = GHOST_STATE.STUNNED;
    ghostStore.timerMs[ghostEntities[0].id] = STUN_MS;

    const system = createPowerUpSystem();
    // A 60s spike (e.g. tab throttling) is clamped to the safety ceiling so
    // the timer drains predictably instead of underflowing in a single tick.
    runUpdate(system, world, { dtMs: 60_000, frame: 0 });

    expect(ghostStore.state[ghostEntities[0].id]).toBe(GHOST_STATE.STUNNED);
    expect(ghostStore.timerMs[ghostEntities[0].id]).toBe(STUN_MS - 1000);
  });

  it('does not refresh the HUD stun window when no ghosts were eligible', () => {
    const { ghostEntities, ghostStore, world } = setupHarness({ ghostCount: 1 });
    ghostStore.state[ghostEntities[0].id] = GHOST_STATE.DEAD;
    world.setResource('collisionIntents', [{ type: 'power-pellet-collected' }]);

    const system = createPowerUpSystem();
    runUpdate(system, world);

    expect(world.getResource('powerUpState').stunRemainingMs).toBe(0);
    expect(ghostStore.state[ghostEntities[0].id]).toBe(GHOST_STATE.DEAD);
  });

  it('ignores intent shapes that are not power-up related', () => {
    const { playerEntity, playerStore, world } = setupHarness({ ghostCount: 0 });
    world.setResource('collisionIntents', [
      { type: 'pellet-collected' },
      null,
      { type: 'power-up-collected', powerUpType: 'unknownType' },
    ]);

    const system = createPowerUpSystem();
    runUpdate(system, world);

    expect(playerStore.maxBombs[playerEntity.id]).toBe(PLAYER_START_MAX_BOMBS);
    expect(playerStore.isSpeedBoosted[playerEntity.id]).toBe(0);
  });
});

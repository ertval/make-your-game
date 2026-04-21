/**
 * Unit tests for the C-02 player life system.
 *
 * These checks verify deterministic life initialization, invincibility timing,
 * one-shot death intent consumption, explicit respawn signaling, and terminal
 * game-over transitions with no DOM-facing dependencies.
 */

import { describe, expect, it } from 'vitest';

import { createInputStateStore, createPlayerStore } from '../../../src/ecs/components/actors.js';
import { createPositionStore, createVelocityStore } from '../../../src/ecs/components/spatial.js';
import { createClock } from '../../../src/ecs/resources/clock.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createLifeSystem } from '../../../src/ecs/systems/life-system.js';
import { World } from '../../../src/ecs/world/world.js';

function updateLife(lifeSystem, world, dtMs = 0) {
  lifeSystem.update({ world, dtMs });
}

function createPlayerDeathIntent() {
  return { type: 'player-death' };
}

function setupRespawnHarness() {
  const world = new World();
  const playerStore = createPlayerStore(8);
  const positionStore = createPositionStore(8);
  const velocityStore = createVelocityStore(8);
  const inputState = createInputStateStore(8);
  const playerEntity = world.createEntity();

  world.setResource('player', playerStore);
  world.setResource('position', positionStore);
  world.setResource('velocity', velocityStore);
  world.setResource('inputState', inputState);
  world.setResource('playerEntity', playerEntity);
  world.setResource('mapResource', {
    playerSpawnRow: 4,
    playerSpawnCol: 7,
  });

  return {
    inputState,
    playerEntity,
    playerStore,
    positionStore,
    velocityStore,
    world,
  };
}

describe('life-system', () => {
  it('initializes the playerLife resource with canonical defaults', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', []);

    updateLife(lifeSystem, world);

    expect(world.getResource('playerLife')).toEqual({
      lives: 3,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });
    expect(world.getResource('respawnIntent')).toBe(false);
  });

  it('sanitizes malformed playerLife resource', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', []);
    world.setResource('playerLife', {
      lives: 'x',
      isInvincible: 'yes',
      invincibilityRemainingMs: Number.NaN,
    });

    updateLife(lifeSystem, world);

    expect(world.getResource('playerLife')).toEqual({
      lives: 3,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });
    expect(world.getResource('respawnIntent')).toBe(false);
  });

  it('decrements lives, sets respawnIntent, and grants invincibility on a valid death', () => {
    const { world } = setupRespawnHarness();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', [createPlayerDeathIntent()]);
    world.setResource('playerLife', {
      lives: 3,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });

    updateLife(lifeSystem, world);

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 2000,
    });
    expect(world.getResource('respawnIntent')).toBe(true);
  });

  it('respawns the player at the map spawn and clears movement state deterministically', () => {
    const { inputState, playerEntity, playerStore, positionStore, velocityStore, world } =
      setupRespawnHarness();
    const lifeSystem = createLifeSystem();
    const entityId = playerEntity.id;

    positionStore.row[entityId] = 11.5;
    positionStore.col[entityId] = 9.25;
    positionStore.prevRow[entityId] = 11;
    positionStore.prevCol[entityId] = 9;
    positionStore.targetRow[entityId] = 12;
    positionStore.targetCol[entityId] = 10;
    velocityStore.rowDelta[entityId] = -1;
    velocityStore.colDelta[entityId] = 1;
    velocityStore.speedTilesPerSecond[entityId] = 6;
    inputState.left[entityId] = 1;
    inputState.bomb[entityId] = 1;
    playerStore.speedBoostMs[entityId] = 900;
    playerStore.isSpeedBoosted[entityId] = 1;

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', [createPlayerDeathIntent()]);
    world.setResource('playerLife', {
      lives: 3,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });

    updateLife(lifeSystem, world);

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 2000,
    });
    expect(positionStore.row[entityId]).toBe(4);
    expect(positionStore.col[entityId]).toBe(7);
    expect(positionStore.prevRow[entityId]).toBe(4);
    expect(positionStore.prevCol[entityId]).toBe(7);
    expect(positionStore.targetRow[entityId]).toBe(4);
    expect(positionStore.targetCol[entityId]).toBe(7);
    expect(velocityStore.rowDelta[entityId]).toBe(0);
    expect(velocityStore.colDelta[entityId]).toBe(0);
    expect(velocityStore.speedTilesPerSecond[entityId]).toBe(0);
    expect(inputState.left[entityId]).toBe(0);
    expect(inputState.bomb[entityId]).toBe(0);
    expect(playerStore.speedBoostMs[entityId]).toBe(0);
    expect(playerStore.isSpeedBoosted[entityId]).toBe(0);
    expect(playerStore.invincibilityMs[entityId]).toBe(2000);
    expect(world.getResource('respawnIntent')).toBe(true);
  });

  it('does not decrement lives when player-death intents persist across invincibility frames', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();
    const clock = createClock(0);

    world.setResource('clock', clock);
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', [createPlayerDeathIntent()]);
    world.setResource('playerLife', {
      lives: 3,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });

    updateLife(lifeSystem, world);

    world.setResource('collisionIntents', [createPlayerDeathIntent()]);
    updateLife(lifeSystem, world, 16);

    expect(world.getResource('playerLife').lives).toBe(2);
    expect(world.getResource('playerLife').isInvincible).toBe(true);
    expect(world.getResource('respawnIntent')).toBe(false);
  });

  it('clears respawnIntent on the next tick after a respawn-triggering death', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', [createPlayerDeathIntent()]);
    world.setResource('playerLife', {
      lives: 3,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });

    updateLife(lifeSystem, world);
    expect(world.getResource('respawnIntent')).toBe(true);

    updateLife(lifeSystem, world);
    expect(world.getResource('respawnIntent')).toBe(false);
  });

  it('counts down invincibility and clears it when the timer expires', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', []);
    world.setResource('playerLife', {
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 250,
    });

    updateLife(lifeSystem, world, 500);

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });
    expect(world.getResource('respawnIntent')).toBe(false);
  });

  it('does not handle death while the player is invincible', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', [createPlayerDeathIntent()]);
    world.setResource('playerLife', {
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 2000,
    });

    updateLife(lifeSystem, world, 100);

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 1900,
    });
    expect(world.getResource('respawnIntent')).toBe(false);
  });

  it('treats zero invincibility time as not invincible', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', [createPlayerDeathIntent()]);
    world.setResource('playerLife', {
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 0,
    });

    updateLife(lifeSystem, world);

    expect(world.getResource('playerLife')).toEqual({
      lives: 1,
      isInvincible: true,
      invincibilityRemainingMs: 2000,
    });
    expect(world.getResource('respawnIntent')).toBe(true);
  });

  it('clamps negative invincibility to zero', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', []);
    world.setResource('playerLife', {
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: -100,
    });

    updateLife(lifeSystem, world);

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });
    expect(world.getResource('respawnIntent')).toBe(false);
  });

  it('does not handle death outside PLAYING state', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PAUSED));
    world.setResource('collisionIntents', [createPlayerDeathIntent()]);
    world.setResource('playerLife', {
      lives: 2,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });

    updateLife(lifeSystem, world);

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });
    expect(world.getResource('respawnIntent')).toBe(false);
  });

  it('does not count down invincibility while the game is paused', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PAUSED));
    world.setResource('collisionIntents', []);
    world.setResource('playerLife', {
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 750,
    });

    updateLife(lifeSystem, world, 500);

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 750,
    });
    expect(world.getResource('respawnIntent')).toBe(false);
  });

  it('ignores negative dtMs while invincibility is active', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', []);
    world.setResource('playerLife', {
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 750,
    });

    updateLife(lifeSystem, world, -250);

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 750,
    });
  });

  it('caps large dtMs spikes while counting down invincibility', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('collisionIntents', []);
    world.setResource('playerLife', {
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 1500,
    });

    updateLife(lifeSystem, world, 5000);

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 500,
    });
  });

  it('clamps lives at zero and transitions to GAME_OVER on terminal death', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', gameStatus);
    world.setResource('collisionIntents', [createPlayerDeathIntent()]);
    world.setResource('playerLife', {
      lives: 1,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });

    updateLife(lifeSystem, world);

    expect(world.getResource('playerLife')).toEqual({
      lives: 0,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });
    expect(gameStatus.currentState).toBe(GAME_STATE.GAME_OVER);
    expect(gameStatus.previousState).toBe(GAME_STATE.PLAYING);
    expect(world.getResource('respawnIntent')).toBe(false);
  });

  it('does not trigger multiple GAME_OVER transitions once already game over', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();
    const gameStatus = createGameStatus(GAME_STATE.GAME_OVER);

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', gameStatus);
    world.setResource('collisionIntents', [createPlayerDeathIntent()]);
    world.setResource('playerLife', {
      lives: 0,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });

    updateLife(lifeSystem, world);

    expect(gameStatus.currentState).toBe(GAME_STATE.GAME_OVER);
    expect(gameStatus.previousState).toBeNull();
    expect(world.getResource('playerLife').lives).toBe(0);
    expect(world.getResource('respawnIntent')).toBe(false);
  });
});

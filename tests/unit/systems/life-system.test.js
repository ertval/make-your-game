/**
 * Unit tests for the C-02 player life system.
 *
 * These checks verify deterministic life initialization, invincibility timing,
 * one-shot death intent consumption, and terminal game-over transitions with
 * no DOM-facing dependencies.
 */

import { describe, expect, it } from 'vitest';

import { createClock } from '../../../src/ecs/resources/clock.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createLifeSystem } from '../../../src/ecs/systems/life-system.js';
import { World } from '../../../src/ecs/world/world.js';

describe('life-system', () => {
  it('initializes the playerLife resource with canonical defaults', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('deathIntent', false);

    lifeSystem.update({ world });

    expect(world.getResource('playerLife')).toEqual({
      lives: 3,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });
  });

  it('sanitizes malformed playerLife resource', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('deathIntent', false);
    world.setResource('playerLife', {
      lives: 'x',
      isInvincible: 'yes',
      invincibilityRemainingMs: Number.NaN,
    });

    lifeSystem.update({ world });

    expect(world.getResource('playerLife')).toEqual({
      lives: 3,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });
  });

  it('decrements lives and grants invincibility on a valid death', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('deathIntent', true);
    world.setResource('playerLife', {
      lives: 3,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });

    lifeSystem.update({ world });

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 2000,
    });
    expect(world.getResource('deathIntent')).toBe(false);
  });

  it('does not decrement lives when deathIntent persists across invincibility frames', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();
    const clock = createClock(0);

    world.setResource('clock', clock);
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('deathIntent', true);
    world.setResource('playerLife', {
      lives: 3,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });

    lifeSystem.update({ world });

    clock.deltaMs = 16;
    world.setResource('deathIntent', true);
    lifeSystem.update({ world });

    expect(world.getResource('playerLife').lives).toBe(2);
    expect(world.getResource('playerLife').isInvincible).toBe(true);
    expect(world.getResource('deathIntent')).toBe(false);
  });

  it('counts down invincibility and clears it when the timer expires', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();
    const clock = createClock(0);

    clock.deltaMs = 500;

    world.setResource('clock', clock);
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('deathIntent', false);
    world.setResource('playerLife', {
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 250,
    });

    lifeSystem.update({ world });

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });
  });

  it('does not handle death while the player is invincible', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();
    const clock = createClock(0);

    clock.deltaMs = 100;

    world.setResource('clock', clock);
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('deathIntent', true);
    world.setResource('playerLife', {
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 2000,
    });

    lifeSystem.update({ world });

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 1900,
    });
    expect(world.getResource('deathIntent')).toBe(false);
  });

  it('treats zero invincibility time as not invincible', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('deathIntent', true);
    world.setResource('playerLife', {
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: 0,
    });

    lifeSystem.update({ world });

    expect(world.getResource('playerLife')).toEqual({
      lives: 1,
      isInvincible: true,
      invincibilityRemainingMs: 2000,
    });
  });

  it('clamps negative invincibility to zero', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('deathIntent', false);
    world.setResource('playerLife', {
      lives: 2,
      isInvincible: true,
      invincibilityRemainingMs: -100,
    });

    lifeSystem.update({ world });

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });
  });

  it('does not handle death outside PLAYING state', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PAUSED));
    world.setResource('deathIntent', true);
    world.setResource('playerLife', {
      lives: 2,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });

    lifeSystem.update({ world });

    expect(world.getResource('playerLife')).toEqual({
      lives: 2,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });
    expect(world.getResource('deathIntent')).toBe(false);
  });

  it('clamps lives at zero and transitions to GAME_OVER on terminal death', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', gameStatus);
    world.setResource('deathIntent', true);
    world.setResource('playerLife', {
      lives: 1,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });

    lifeSystem.update({ world });

    expect(world.getResource('playerLife')).toEqual({
      lives: 0,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });
    expect(gameStatus.currentState).toBe(GAME_STATE.GAME_OVER);
    expect(gameStatus.previousState).toBe(GAME_STATE.PLAYING);
    expect(world.getResource('deathIntent')).toBe(false);
  });

  it('does not trigger multiple GAME_OVER transitions once already game over', () => {
    const world = new World();
    const lifeSystem = createLifeSystem();
    const gameStatus = createGameStatus(GAME_STATE.GAME_OVER);

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', gameStatus);
    world.setResource('deathIntent', true);
    world.setResource('playerLife', {
      lives: 0,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    });

    lifeSystem.update({ world });

    expect(gameStatus.currentState).toBe(GAME_STATE.GAME_OVER);
    expect(gameStatus.previousState).toBeNull();
    expect(world.getResource('playerLife').lives).toBe(0);
    expect(world.getResource('deathIntent')).toBe(false);
  });
});

/**
 * Unit tests for D-01 constants resource.
 *
 * Verifies every exported constant value and cross-constant consistency
 * so that the "single source of truth" contract is fully guarded.
 */

import { describe, expect, it } from 'vitest';

import {
  BOMB_FUSE_MS,
  CELL_TYPE,
  CLYDE_DISTANCE_THRESHOLD,
  DEFAULT_FIRE_RADIUS,
  FIRE_DURATION_MS,
  FIXED_DT_MS,
  GHOST_INTERSECTION_MIN_EXITS,
  GHOST_RESPAWN_MS,
  GHOST_SPAWN_DELAYS,
  GHOST_STATE,
  GHOST_STUNNED_SPEED,
  GHOST_TYPE,
  INKY_REFERENCE_OFFSET,
  INVINCIBILITY_MS,
  LEVEL_GHOST_SPEED,
  LEVEL_MAX_GHOSTS,
  LEVEL_TIMERS,
  MAX_CHAIN_DEPTH,
  MAX_FIRE_RADIUS,
  MAX_RENDER_INTENTS,
  MAX_STEPS_PER_FRAME,
  PINKY_TARGET_OFFSET,
  PLAYER_BASE_SPEED,
  PLAYER_START_LIVES,
  PLAYER_START_MAX_BOMBS,
  POOL_FIRE,
  POOL_FIRE_PER_BOMB,
  POOL_GHOSTS,
  POOL_MAX_BOMBS,
  POOL_PELLETS,
  POWER_UP_DROP_CHANCES,
  POWER_UP_TYPE,
  SCORE_GHOST_KILL,
  SCORE_LEVEL_CLEAR,
  SCORE_PELLET,
  SCORE_POWER_PELLET,
  SCORE_POWER_UP,
  SCORE_STUNNED_GHOST_KILL,
  SCORE_TIME_BONUS_MULTIPLIER,
  SIMULATION_HZ,
  SPEED_BOOST_MS,
  SPEED_BOOST_MULTIPLIER,
  STUN_MS,
  TOTAL_LEVELS,
  VISUAL_FLAGS,
} from '../../../src/ecs/resources/constants.js';

describe('constants', () => {
  it('defines correct simulation timestep', () => {
    expect(SIMULATION_HZ).toBe(60);
    expect(FIXED_DT_MS).toBeCloseTo(1000 / 60, 4);
    expect(MAX_STEPS_PER_FRAME).toBe(5);
  });

  it('defines correct player constants', () => {
    expect(PLAYER_START_LIVES).toBe(3);
    expect(PLAYER_START_MAX_BOMBS).toBe(1);
    expect(PLAYER_BASE_SPEED).toBe(5.0);
    expect(INVINCIBILITY_MS).toBe(2000);
    expect(SPEED_BOOST_MULTIPLIER).toBe(1.5);
    expect(SPEED_BOOST_MS).toBe(10000);
  });

  it('defines correct bomb and fire constants', () => {
    expect(BOMB_FUSE_MS).toBe(3000);
    expect(FIRE_DURATION_MS).toBe(500);
    expect(DEFAULT_FIRE_RADIUS).toBe(2);
    expect(MAX_FIRE_RADIUS).toBe(4);
    expect(MAX_CHAIN_DEPTH).toBe(10);
  });

  it('defines correct ghost constants', () => {
    expect(STUN_MS).toBe(5000);
    expect(GHOST_RESPAWN_MS).toBe(5000);
    expect(GHOST_TYPE.BLINKY).toBe(0);
    expect(GHOST_TYPE.PINKY).toBe(1);
    expect(GHOST_TYPE.INKY).toBe(2);
    expect(GHOST_TYPE.CLYDE).toBe(3);
    expect(GHOST_STATE.NORMAL).toBe(0);
    expect(GHOST_STATE.STUNNED).toBe(1);
    expect(GHOST_STATE.DEAD).toBe(2);
    expect(GHOST_STUNNED_SPEED).toBe(2.0);
  });

  it('defines correct ghost pathfinding offsets', () => {
    expect(CLYDE_DISTANCE_THRESHOLD).toBe(8);
    expect(PINKY_TARGET_OFFSET).toBe(4);
    expect(INKY_REFERENCE_OFFSET).toBe(2);
    expect(GHOST_INTERSECTION_MIN_EXITS).toBe(3);
  });

  it('defines correct level progression constants', () => {
    expect(LEVEL_TIMERS).toEqual([120, 180, 240]);
    expect(LEVEL_MAX_GHOSTS).toEqual([2, 3, 4]);
    expect(LEVEL_GHOST_SPEED).toEqual([4.0, 4.5, 5.0]);
    expect(TOTAL_LEVELS).toBe(3);
  });

  it('defines correct scoring constants', () => {
    expect(SCORE_PELLET).toBe(10);
    expect(SCORE_POWER_PELLET).toBe(50);
    expect(SCORE_GHOST_KILL).toBe(200);
    expect(SCORE_STUNNED_GHOST_KILL).toBe(400);
    expect(SCORE_POWER_UP).toBe(100);
    expect(SCORE_LEVEL_CLEAR).toBe(1000);
    expect(SCORE_TIME_BONUS_MULTIPLIER).toBe(10);
  });

  it('defines power-up drop chances that sum to 1.0', () => {
    const total =
      POWER_UP_DROP_CHANCES.NONE +
      POWER_UP_DROP_CHANCES.BOMB +
      POWER_UP_DROP_CHANCES.FIRE +
      POWER_UP_DROP_CHANCES.SPEED;
    expect(total).toBeCloseTo(1.0, 10);
  });

  it('defines power-up type IDs', () => {
    expect(POWER_UP_TYPE.NONE).toBe(0);
    expect(POWER_UP_TYPE.BOMB).toBe(1);
    expect(POWER_UP_TYPE.FIRE).toBe(2);
    expect(POWER_UP_TYPE.SPEED).toBe(3);
  });

  it('defines visual flags as distinct power-of-two values', () => {
    const flags = Object.values(VISUAL_FLAGS);
    for (const flag of flags) {
      expect(flag & (flag - 1)).toBe(0);
    }
    expect(new Set(flags).size).toBe(flags.length);
  });

  it('defines cell types with sequential IDs', () => {
    expect(CELL_TYPE.EMPTY).toBe(0);
    expect(CELL_TYPE.INDESTRUCTIBLE).toBe(1);
    expect(CELL_TYPE.DESTRUCTIBLE).toBe(2);
    expect(CELL_TYPE.PELLET).toBe(3);
    expect(CELL_TYPE.POWER_PELLET).toBe(4);
    expect(CELL_TYPE.GHOST_HOUSE).toBe(5);
    expect(CELL_TYPE.PLAYER_START).toBe(6);
    expect(CELL_TYPE.POWER_UP_BOMB).toBe(7);
    expect(CELL_TYPE.POWER_UP_FIRE).toBe(8);
    expect(CELL_TYPE.POWER_UP_SPEED).toBe(9);
  });

  it('defines pool sizes consistent with constants', () => {
    expect(POOL_FIRE_PER_BOMB).toBe(MAX_FIRE_RADIUS * 4 + 1);
    expect(POOL_FIRE_PER_BOMB).toBeGreaterThan(DEFAULT_FIRE_RADIUS * 4 + 1);
    expect(POOL_FIRE).toBe(POOL_MAX_BOMBS * POOL_FIRE_PER_BOMB);
  });

  it('defines correct player bomb capacity', () => {
    expect(PLAYER_START_MAX_BOMBS).toBe(1);
  });

  it('defines ghost spawn delays for all 4 ghosts', () => {
    expect(GHOST_SPAWN_DELAYS).toHaveLength(4);
    expect(GHOST_SPAWN_DELAYS).toEqual([0, 5000, 10000, 15000]);
  });

  it('defines POOL_GHOSTS matching max level ghost count', () => {
    expect(POOL_GHOSTS).toBe(LEVEL_MAX_GHOSTS[LEVEL_MAX_GHOSTS.length - 1]);
  });

  it('defines POOL_PELLETS as upper bound for a 15x11 map', () => {
    expect(POOL_PELLETS).toBe(15 * 11);
  });

  it('defines MAX_RENDER_INTENTS as a positive upper bound', () => {
    expect(MAX_RENDER_INTENTS).toBeGreaterThan(0);
    // Must accommodate all pool types plus wall cells.
    expect(MAX_RENDER_INTENTS).toBeGreaterThanOrEqual(
      POOL_GHOSTS + POOL_MAX_BOMBS + POOL_FIRE + POOL_PELLETS + 1,
    );
  });
});

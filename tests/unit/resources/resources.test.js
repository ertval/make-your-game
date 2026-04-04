/**
 * Unit tests for D-01 Resources.
 *
 * Covers: constants, clock, rng, event-queue, game-status.
 * Verifies deterministic RNG sequences, event ordering, pause-safe
 * simulation clock progression, and FSM transition rules.
 */

import { describe, expect, it } from 'vitest';

// --- Constants ---
import {
  BOMB_FUSE_MS,
  CELL_TYPE,
  DEFAULT_FIRE_RADIUS,
  FIRE_DURATION_MS,
  FIXED_DT_MS,
  GHOST_SPAWN_DELAYS,
  GHOST_STATE,
  GHOST_STUNNED_SPEED,
  GHOST_TYPE,
  INVINCIBILITY_MS,
  LEVEL_GHOST_SPEED,
  LEVEL_MAX_GHOSTS,
  LEVEL_TIMERS,
  MAX_CHAIN_DEPTH,
  MAX_STEPS_PER_FRAME,
  PLAYER_START_LIVES,
  PLAYER_START_MAX_BOMBS,
  POOL_FIRE,
  POOL_FIRE_PER_BOMB,
  POOL_GHOSTS,
  POOL_MAX_BOMBS,
  POWER_UP_DROP_CHANCES,
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
    expect(INVINCIBILITY_MS).toBe(2000);
    expect(SPEED_BOOST_MULTIPLIER).toBe(1.5);
    expect(SPEED_BOOST_MS).toBe(10000);
  });

  it('defines correct bomb and fire constants', () => {
    expect(BOMB_FUSE_MS).toBe(3000);
    expect(FIRE_DURATION_MS).toBe(500);
    expect(DEFAULT_FIRE_RADIUS).toBe(2);
    expect(MAX_CHAIN_DEPTH).toBe(10);
  });

  it('defines correct ghost constants', () => {
    expect(STUN_MS).toBe(5000);
    expect(GHOST_TYPE.BLINKY).toBe(0);
    expect(GHOST_TYPE.PINKY).toBe(1);
    expect(GHOST_TYPE.INKY).toBe(2);
    expect(GHOST_TYPE.CLYDE).toBe(3);
    expect(GHOST_STATE.CHASING).toBe(0);
    expect(GHOST_STATE.FLEEING).toBe(1);
    expect(GHOST_STATE.DEAD).toBe(2);
    expect(GHOST_STUNNED_SPEED).toBe(2.0);
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

  it('defines visual flags as distinct power-of-two values', () => {
    const flags = Object.values(VISUAL_FLAGS);
    // Each flag should be a unique power of two.
    for (const flag of flags) {
      expect(flag & (flag - 1)).toBe(0); // Power-of-two check.
    }
    // All flags should be unique.
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
  });

  it('defines pool sizes consistent with constants', () => {
    // POOL_FIRE_PER_BOMB = radius * 4 arms + center.
    expect(POOL_FIRE_PER_BOMB).toBe(DEFAULT_FIRE_RADIUS * 4 + 1);
    // POOL_FIRE = max bombs * fire per bomb.
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
    // Pool must accommodate the maximum ghosts from any level.
    expect(POOL_GHOSTS).toBe(LEVEL_MAX_GHOSTS[LEVEL_MAX_GHOSTS.length - 1]);
  });
});

// --- Clock ---
import {
  advanceSimTime,
  createClock,
  resetClock,
  setPauseState,
  tickClock,
} from '../../../src/ecs/resources/clock.js';

describe('clock', () => {
  it('creates a clock with zeroed initial state', () => {
    const clock = createClock(0);
    expect(clock.lastFrameTime).toBe(0);
    expect(clock.simTimeMs).toBe(0);
    expect(clock.accumulator).toBe(0);
    expect(clock.alpha).toBe(0);
    expect(clock.isPaused).toBe(false);
  });

  it('returns 1 step for a single fixed timestep', () => {
    const clock = createClock(0);
    const now = FIXED_DT_MS;
    const steps = tickClock(clock, now);
    expect(steps).toBe(1);
    expect(clock.lastFrameTime).toBe(now);
  });

  it('returns 0 steps when paused', () => {
    const clock = createClock(0);
    setPauseState(clock, true);
    const steps = tickClock(clock, FIXED_DT_MS);
    expect(steps).toBe(0);
    expect(clock.alpha).toBe(0);
  });

  it('advances simulation time correctly', () => {
    const clock = createClock(0);
    advanceSimTime(clock);
    expect(clock.simTimeMs).toBeCloseTo(FIXED_DT_MS, 4);
    advanceSimTime(clock);
    expect(clock.simTimeMs).toBeCloseTo(FIXED_DT_MS * 2, 4);
  });

  it('does not advance sim time while paused', () => {
    const clock = createClock(0);
    setPauseState(clock, true);
    // Tick while paused — should return 0 steps.
    tickClock(clock, FIXED_DT_MS);
    expect(clock.simTimeMs).toBe(0);
  });

  it('clamps catch-up to MAX_STEPS_PER_FRAME after a large gap', () => {
    const clock = createClock(0);
    // Simulate a 500ms gap (much larger than 5 * FIXED_DT_MS).
    const steps = tickClock(clock, 500);
    expect(steps).toBe(MAX_STEPS_PER_FRAME);
  });

  it('resets baseline to prevent burst after unpause', () => {
    const clock = createClock(0);
    // Simulate some frames.
    tickClock(clock, 100);
    advanceSimTime(clock);
    // Reset after unpause.
    resetClock(clock, 200);
    expect(clock.lastFrameTime).toBe(200);
    expect(clock.accumulator).toBe(0);
    expect(clock.alpha).toBe(0);
  });

  it('handles negative or zero delta gracefully', () => {
    const clock = createClock(100);
    // Pass a time that would produce negative delta.
    const steps = tickClock(clock, 50);
    expect(steps).toBeGreaterThanOrEqual(0);
  });

  it('computes correct alpha after partial step', () => {
    const clock = createClock(0);
    // 1.5 fixed steps in the accumulator.
    tickClock(clock, FIXED_DT_MS * 1.5);
    expect(clock.alpha).toBeCloseTo(0.5, 4);
  });
});

// --- RNG ---
import {
  createRNG,
  nextChance,
  nextFloat,
  nextInt,
  pick,
  reseed,
} from '../../../src/ecs/resources/rng.js';

describe('rng', () => {
  it('produces deterministic sequences for the same seed', () => {
    const rng1 = createRNG(12345);
    const rng2 = createRNG(12345);

    for (let i = 0; i < 100; i++) {
      expect(nextFloat(rng1)).toBe(nextFloat(rng2));
    }
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createRNG(1);
    const rng2 = createRNG(2);

    let matchCount = 0;
    for (let i = 0; i < 100; i++) {
      if (nextFloat(rng1) === nextFloat(rng2)) {
        matchCount += 1;
      }
    }
    // It's extremely unlikely to have many matches with different seeds.
    expect(matchCount).toBeLessThan(5);
  });

  it('returns floats in [0, 1)', () => {
    const rng = createRNG(42);
    for (let i = 0; i < 1000; i++) {
      const val = nextFloat(rng);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('returns integers in [min, max] inclusive', () => {
    const rng = createRNG(42);
    for (let i = 0; i < 100; i++) {
      const val = nextInt(rng, 5, 10);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThanOrEqual(10);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('nextChance returns values in [0, 1)', () => {
    const rng = createRNG(42);
    for (let i = 0; i < 100; i++) {
      const val = nextChance(rng);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('pick returns an element from the array', () => {
    const rng = createRNG(42);
    const arr = ['a', 'b', 'c', 'd', 'e'];
    for (let i = 0; i < 50; i++) {
      const val = pick(rng, arr);
      expect(arr).toContain(val);
    }
  });

  it('pick returns undefined for empty array', () => {
    const rng = createRNG(42);
    expect(pick(rng, [])).toBeUndefined();
  });

  it('reseed changes the sequence', () => {
    const rng = createRNG(1);
    const beforeReseed = nextFloat(rng);
    reseed(rng, 999);
    const afterReseed = nextFloat(rng);
    // The value after reseed should be deterministic for the new seed.
    const rngFresh = createRNG(999);
    expect(afterReseed).toBe(nextFloat(rngFresh));
    // And different from the pre-reseed value (statistically).
    // We just verify the reseed mechanism works by checking determinism.
    expect(typeof beforeReseed).toBe('number');
    expect(typeof afterReseed).toBe('number');
  });
});

// --- Event Queue ---
import {
  clear,
  createEventQueue,
  drain,
  enqueue,
  peek,
  resetOrderCounter,
} from '../../../src/ecs/resources/event-queue.js';

describe('event-queue', () => {
  it('enqueues and drains events in deterministic order', () => {
    const queue = createEventQueue();
    enqueue(queue, 'BombDetonated', { bombId: 1 }, 5);
    enqueue(queue, 'GhostKilled', { ghostId: 2 }, 5);
    enqueue(queue, 'PelletCollected', { pelletId: 3 }, 4);

    const events = drain(queue);
    expect(events).toHaveLength(3);
    // Sorted by frame first, then order.
    expect(events[0].type).toBe('PelletCollected'); // frame 4
    expect(events[1].type).toBe('BombDetonated'); // frame 5, enqueued first
    expect(events[2].type).toBe('GhostKilled'); // frame 5, enqueued second
  });

  it('clears the queue after drain', () => {
    const queue = createEventQueue();
    enqueue(queue, 'Test', {}, 1);
    drain(queue);
    expect(queue.events).toHaveLength(0);
  });

  it('peek returns events without clearing', () => {
    const queue = createEventQueue();
    enqueue(queue, 'Test', {}, 1);
    const events = peek(queue);
    expect(events).toHaveLength(1);
    expect(queue.events).toHaveLength(1); // Still there.
  });

  it('clear discards all events and resets order counter', () => {
    const queue = createEventQueue();
    enqueue(queue, 'Test', {}, 1);
    enqueue(queue, 'Test', {}, 1);
    clear(queue);
    expect(queue.events).toHaveLength(0);
    expect(queue.orderCounter).toBe(0);
  });

  it('assigns monotonic order values', () => {
    const queue = createEventQueue();
    enqueue(queue, 'A', {}, 1);
    enqueue(queue, 'B', {}, 1);
    enqueue(queue, 'C', {}, 1);
    expect(queue.orderCounter).toBe(3);
  });

  it('resetOrderCounter resets the counter without affecting events', () => {
    const queue = createEventQueue();
    enqueue(queue, 'Test', {}, 1);
    resetOrderCounter(queue);
    expect(queue.orderCounter).toBe(0);
    expect(queue.events).toHaveLength(1);
  });
});

// --- Game Status ---
import {
  GAME_STATE,
  VALID_TRANSITIONS,
  canTransition,
  createGameStatus,
  isMenu,
  isPaused,
  isPlaying,
  isTerminal,
  transitionTo,
} from '../../../src/ecs/resources/game-status.js';

describe('game-status', () => {
  it('creates with MENU as default state', () => {
    const status = createGameStatus();
    expect(status.currentState).toBe(GAME_STATE.MENU);
    expect(status.previousState).toBeNull();
  });

  it('allows MENU → PLAYING transition', () => {
    const status = createGameStatus();
    expect(canTransition(status, GAME_STATE.PLAYING)).toBe(true);
    transitionTo(status, GAME_STATE.PLAYING);
    expect(status.currentState).toBe(GAME_STATE.PLAYING);
    expect(status.previousState).toBe(GAME_STATE.MENU);
  });

  it('allows PLAYING ↔ PAUSED transitions', () => {
    const status = createGameStatus(GAME_STATE.PLAYING);
    transitionTo(status, GAME_STATE.PAUSED);
    expect(status.currentState).toBe(GAME_STATE.PAUSED);
    transitionTo(status, GAME_STATE.PLAYING);
    expect(status.currentState).toBe(GAME_STATE.PLAYING);
  });

  it('allows PLAYING → LEVEL_COMPLETE → PLAYING', () => {
    const status = createGameStatus(GAME_STATE.PLAYING);
    transitionTo(status, GAME_STATE.LEVEL_COMPLETE);
    expect(status.currentState).toBe(GAME_STATE.LEVEL_COMPLETE);
    transitionTo(status, GAME_STATE.PLAYING);
    expect(status.currentState).toBe(GAME_STATE.PLAYING);
  });

  it('allows LEVEL_COMPLETE → VICTORY when all levels done', () => {
    const status = createGameStatus(GAME_STATE.LEVEL_COMPLETE);
    transitionTo(status, GAME_STATE.VICTORY);
    expect(status.currentState).toBe(GAME_STATE.VICTORY);
  });

  it('allows VICTORY → MENU and GAME_OVER → MENU', () => {
    const victoryStatus = createGameStatus(GAME_STATE.VICTORY);
    transitionTo(victoryStatus, GAME_STATE.MENU);
    expect(victoryStatus.currentState).toBe(GAME_STATE.MENU);

    const gameOverStatus = createGameStatus(GAME_STATE.GAME_OVER);
    transitionTo(gameOverStatus, GAME_STATE.MENU);
    expect(gameOverStatus.currentState).toBe(GAME_STATE.MENU);
  });

  it('rejects invalid transitions', () => {
    const status = createGameStatus(GAME_STATE.MENU);
    expect(() => transitionTo(status, GAME_STATE.PAUSED)).toThrow();
    expect(() => transitionTo(status, GAME_STATE.GAME_OVER)).toThrow();
  });

  it('predicates return correct values', () => {
    const menuStatus = createGameStatus(GAME_STATE.MENU);
    expect(isMenu(menuStatus)).toBe(true);
    expect(isPlaying(menuStatus)).toBe(false);
    expect(isPaused(menuStatus)).toBe(false);
    expect(isTerminal(menuStatus)).toBe(false);

    const playingStatus = createGameStatus(GAME_STATE.PLAYING);
    expect(isPlaying(playingStatus)).toBe(true);

    const pausedStatus = createGameStatus(GAME_STATE.PAUSED);
    expect(isPaused(pausedStatus)).toBe(true);

    const victoryStatus = createGameStatus(GAME_STATE.VICTORY);
    expect(isTerminal(victoryStatus)).toBe(true);

    const gameOverStatus = createGameStatus(GAME_STATE.GAME_OVER);
    expect(isTerminal(gameOverStatus)).toBe(true);
  });

  it('defines all expected transitions in the map', () => {
    // Verify every state has at least one valid outgoing transition.
    for (const state of Object.values(GAME_STATE)) {
      expect(VALID_TRANSITIONS[state]).toBeDefined();
      expect(VALID_TRANSITIONS[state].length).toBeGreaterThan(0);
    }
  });
});

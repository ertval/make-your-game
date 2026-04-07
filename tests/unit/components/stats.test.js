/**
 * Unit tests for the B-01 stats component stores.
 *
 * These checks protect the score, timer, and health data contract so later
 * systems can rely on stable defaults and reset behavior.
 */

import { describe, expect, it } from 'vitest';

import {
  createHealthStore,
  createScoreStore,
  createTimerStore,
  resetHealth,
  resetScore,
  resetTimer,
} from '../../../src/ecs/components/stats.js';
import { PLAYER_START_LIVES } from '../../../src/ecs/resources/constants.js';

describe('stats component stores', () => {
  it('creates and resets a score store with zeroed defaults', () => {
    const store = createScoreStore(3);

    expect(store.totalPoints).toBeInstanceOf(Uint32Array);
    expect(store.comboCounter).toBeInstanceOf(Uint16Array);

    store.totalPoints[1] = 1200;
    store.comboCounter[1] = 4;

    resetScore(store, 1);

    expect(store.totalPoints[1]).toBe(0);
    expect(store.comboCounter[1]).toBe(0);
  });

  it('creates and resets a timer store with zeroed defaults', () => {
    const store = createTimerStore(2);

    expect(store.remainingMs).toBeInstanceOf(Float64Array);
    expect(store.levelDurationMs).toBeInstanceOf(Float64Array);

    store.remainingMs[0] = 60000;
    store.levelDurationMs[0] = 120000;

    resetTimer(store, 0);

    expect(store.remainingMs[0]).toBe(0);
    expect(store.levelDurationMs[0]).toBe(0);
  });

  it('creates and resets a health store with canonical defaults', () => {
    const store = createHealthStore(4);
    const entityId = 2;

    expect(store.livesRemaining).toBeInstanceOf(Uint8Array);
    expect(store.isInvincible).toBeInstanceOf(Uint8Array);

    expect(store.livesRemaining[entityId]).toBe(PLAYER_START_LIVES);
    expect(store.isInvincible[entityId]).toBe(0);

    store.livesRemaining[entityId] = 1;
    store.isInvincible[entityId] = 1;

    resetHealth(store, entityId);

    expect(store.livesRemaining[entityId]).toBe(PLAYER_START_LIVES);
    expect(store.isInvincible[entityId]).toBe(0);
  });
});

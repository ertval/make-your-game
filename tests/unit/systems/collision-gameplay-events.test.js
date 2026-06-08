/**
 * Unit tests for the B-09 gameplay event surface (collision-gameplay-events.js).
 *
 * These tests exercise the Track B event-surface module in isolation — the
 * canonical constant tables, the payload-validation guards, and the
 * emit-through-queue helper — without booting the World dispatcher. Coverage is
 * grouped into the three required areas:
 *   - event emission: emitGameplayEvent validates, enqueues, and reports the
 *     stored envelope with a monotonic order.
 *   - one-shot guards: validation rejects malformed payloads before they reach
 *     the queue, so a rejected emit writes nothing and a valid emit writes once.
 *   - terminal state: GameOver / Victory / LevelCleared lifecycle transitions
 *     that intentionally carry no owning entity or tile.
 */

import { describe, expect, it } from 'vitest';

import { GHOST_STATE } from '../../../src/ecs/resources/constants.js';
import { createEventQueue } from '../../../src/ecs/resources/event-queue.js';
import {
  emitGameplayEvent,
  GAME_OVER_CAUSE,
  GAMEPLAY_EVENT_SOURCE,
  GAMEPLAY_EVENT_TYPE,
  validateGameplayEventPayload,
} from '../../../src/ecs/systems/collision-gameplay-events.js';

/** Build a minimal valid spatial payload (entityId + tile + sourceSystem). */
function spatialPayload(overrides = {}) {
  return {
    entityId: 4,
    sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
    tile: { row: 2, col: 3 },
    ...overrides,
  };
}

/** Assert a (type, payload) pair is rejected by the validation guards. */
function expectInvalid(type, payload) {
  expect(() => validateGameplayEventPayload(type, payload)).toThrow(TypeError);
}

/** Assert a (type, payload) pair passes the validation guards. */
function expectValid(type, payload) {
  expect(validateGameplayEventPayload(type, payload)).toBe(true);
}

describe('collision-gameplay-events canonical tables', () => {
  it('freezes the event-type, source, and game-over-cause tables', () => {
    expect(Object.isFrozen(GAMEPLAY_EVENT_TYPE)).toBe(true);
    expect(Object.isFrozen(GAMEPLAY_EVENT_SOURCE)).toBe(true);
    expect(Object.isFrozen(GAME_OVER_CAUSE)).toBe(true);
  });

  it('exposes the canonical string values consumers key off', () => {
    expect(GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED).toBe('PelletCollected');
    expect(GAMEPLAY_EVENT_TYPE.GAME_OVER).toBe('GameOver');
    expect(GAMEPLAY_EVENT_TYPE.VICTORY).toBe('Victory');
    expect(GAMEPLAY_EVENT_SOURCE.COLLISION).toBe('collision-system');
    expect(GAME_OVER_CAUSE.TIME).toBe('time');
    expect(GAME_OVER_CAUSE.LIVES).toBe('lives');
  });
});

describe('emitGameplayEvent — event emission', () => {
  it('returns null without mutating state when no usable queue is registered', () => {
    const payload = spatialPayload();

    expect(emitGameplayEvent(null, GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, payload, 0)).toBeNull();
    expect(
      emitGameplayEvent(undefined, GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, payload, 0),
    ).toBeNull();
    // An object missing the `events` array is not a usable queue.
    expect(emitGameplayEvent({}, GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, payload, 0)).toBeNull();
  });

  it('validates then enqueues a valid event and returns the stored envelope', () => {
    const queue = createEventQueue();
    const payload = spatialPayload();

    const event = emitGameplayEvent(queue, GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, payload, 7);

    expect(event).toEqual({
      type: GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED,
      frame: 7,
      order: 0,
      payload,
    });
    expect(queue.events).toHaveLength(1);
    expect(queue.events[0]).toBe(event);
  });

  it('assigns a monotonic order across successive emissions and preserves each frame', () => {
    const queue = createEventQueue();

    emitGameplayEvent(queue, GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, spatialPayload(), 1);
    emitGameplayEvent(queue, GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, spatialPayload(), 1);
    const third = emitGameplayEvent(
      queue,
      GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED,
      spatialPayload(),
      5,
    );

    expect(queue.events.map((e) => e.order)).toEqual([0, 1, 2]);
    expect(queue.events.map((e) => e.frame)).toEqual([1, 1, 5]);
    expect(third.order).toBe(2);
  });

  it('coerces a non-finite frame to 0 in the stored envelope', () => {
    const queue = createEventQueue();

    const event = emitGameplayEvent(
      queue,
      GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED,
      spatialPayload(),
      Number.NaN,
    );

    expect(event.frame).toBe(0);
  });
});

describe('one-shot emission guards', () => {
  it('rejects a malformed payload before anything reaches the queue (no partial write)', () => {
    const queue = createEventQueue();

    expect(() =>
      emitGameplayEvent(
        queue,
        GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED,
        spatialPayload({ entityId: -1 }),
        0,
      ),
    ).toThrow(TypeError);

    // The guard fires before enqueue, so a rejected emit is a no-op.
    expect(queue.events).toHaveLength(0);
    expect(queue.orderCounter).toBe(0);
  });

  it('writes exactly one event per accepted emit', () => {
    const queue = createEventQueue();

    emitGameplayEvent(queue, GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, spatialPayload(), 0);

    expect(queue.events).toHaveLength(1);
  });

  it('guards the base envelope: type string, object payload, and sourceSystem', () => {
    expectInvalid('', spatialPayload());
    expectInvalid(GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, null);
    expectInvalid(GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, 'not-an-object');
    expectInvalid(GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, spatialPayload({ sourceSystem: '' }));
  });

  it('requires a non-negative integer entityId and a finite tile for spatial events', () => {
    expectInvalid(GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, spatialPayload({ entityId: 1.5 }));
    expectInvalid(GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, spatialPayload({ entityId: -1 }));
    expectInvalid(GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, spatialPayload({ tile: undefined }));
    expectInvalid(
      GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED,
      spatialPayload({ tile: { row: Number.NaN, col: 1 } }),
    );
    expectValid(GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, spatialPayload());
    expectValid(GAMEPLAY_EVENT_TYPE.POWER_PELLET_COLLECTED, spatialPayload());
  });

  it('guards the per-type required fields of each spatial event', () => {
    // PowerUpCollected: known powerUpType enum.
    expectInvalid(GAMEPLAY_EVENT_TYPE.POWER_UP_COLLECTED, spatialPayload());
    expectInvalid(
      GAMEPLAY_EVENT_TYPE.POWER_UP_COLLECTED,
      spatialPayload({ powerUpType: 'unknown' }),
    );
    expectValid(
      GAMEPLAY_EVENT_TYPE.POWER_UP_COLLECTED,
      spatialPayload({ powerUpType: 'speedBoost' }),
    );

    // PlayerGhostContact: ghost source id + finite ghost state.
    expectInvalid(
      GAMEPLAY_EVENT_TYPE.PLAYER_GHOST_CONTACT,
      spatialPayload({ ghostState: GHOST_STATE.NORMAL }),
    );
    expectInvalid(GAMEPLAY_EVENT_TYPE.PLAYER_GHOST_CONTACT, spatialPayload({ sourceEntityId: 2 }));
    expectValid(
      GAMEPLAY_EVENT_TYPE.PLAYER_GHOST_CONTACT,
      spatialPayload({ sourceEntityId: 2, ghostState: GHOST_STATE.NORMAL }),
    );

    // PlayerPositionChanged: previous + current tiles.
    expectInvalid(
      GAMEPLAY_EVENT_TYPE.PLAYER_POSITION_CHANGED,
      spatialPayload({ position: { row: 1, col: 1 } }),
    );
    expectValid(
      GAMEPLAY_EVENT_TYPE.PLAYER_POSITION_CHANGED,
      spatialPayload({ previousTile: { row: 0, col: 0 }, position: { row: 1, col: 1 } }),
    );

    // BombPlaced: owner + radius. BombDetonated: chainDepth.
    expectInvalid(GAMEPLAY_EVENT_TYPE.BOMB_PLACED, spatialPayload({ ownerId: 1 }));
    expectValid(GAMEPLAY_EVENT_TYPE.BOMB_PLACED, spatialPayload({ ownerId: 1, radius: 2 }));
    expectInvalid(GAMEPLAY_EVENT_TYPE.BOMB_DETONATED, spatialPayload());
    expectValid(GAMEPLAY_EVENT_TYPE.BOMB_DETONATED, spatialPayload({ chainDepth: 0 }));

    // GhostDefeated: fire source + chainDepth + finite ghost state.
    expectInvalid(
      GAMEPLAY_EVENT_TYPE.GHOST_DEFEATED,
      spatialPayload({ sourceEntityId: 3, chainDepth: 0 }),
    );
    expectValid(
      GAMEPLAY_EVENT_TYPE.GHOST_DEFEATED,
      spatialPayload({ sourceEntityId: 3, chainDepth: 0, ghostState: GHOST_STATE.STUNNED }),
    );

    // LifeLost: non-negative livesRemaining.
    expectInvalid(GAMEPLAY_EVENT_TYPE.LIFE_LOST, spatialPayload({ livesRemaining: -1 }));
    expectValid(GAMEPLAY_EVENT_TYPE.LIFE_LOST, spatialPayload({ livesRemaining: 0 }));
  });

  it('does not impose the spatial entityId/tile guard on lifecycle broadcast events', () => {
    // GhostStunned is a world-level broadcast: no entityId/tile, but it does
    // require a positive count and duration.
    expectInvalid(GAMEPLAY_EVENT_TYPE.GHOST_STUNNED, {
      sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
      stunnedCount: 0,
      durationMs: 1000,
    });
    expectInvalid(GAMEPLAY_EVENT_TYPE.GHOST_STUNNED, {
      sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
      stunnedCount: 2,
      durationMs: 0,
    });
    expectValid(GAMEPLAY_EVENT_TYPE.GHOST_STUNNED, {
      sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
      stunnedCount: 2,
      durationMs: 1000,
    });
  });

  it('rejects an unsupported event type', () => {
    expect(() =>
      validateGameplayEventPayload('NotAnEvent', {
        sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
      }),
    ).toThrow(/Unsupported gameplay event type/);
  });
});

describe('terminal & lifecycle state events', () => {
  it('accepts GameOver for every canonical cause and rejects unknown causes', () => {
    expectValid(GAMEPLAY_EVENT_TYPE.GAME_OVER, {
      sourceSystem: GAMEPLAY_EVENT_SOURCE.TIMER,
      cause: GAME_OVER_CAUSE.TIME,
    });
    expectValid(GAMEPLAY_EVENT_TYPE.GAME_OVER, {
      sourceSystem: GAMEPLAY_EVENT_SOURCE.LIFE,
      cause: GAME_OVER_CAUSE.LIVES,
    });
    expectInvalid(GAMEPLAY_EVENT_TYPE.GAME_OVER, {
      sourceSystem: GAMEPLAY_EVENT_SOURCE.TIMER,
    });
    expectInvalid(GAMEPLAY_EVENT_TYPE.GAME_OVER, {
      sourceSystem: GAMEPLAY_EVENT_SOURCE.TIMER,
      cause: 'paused',
    });
  });

  it('treats Victory as a pure world-level transition requiring only sourceSystem', () => {
    expectValid(GAMEPLAY_EVENT_TYPE.VICTORY, {
      sourceSystem: GAMEPLAY_EVENT_SOURCE.LEVEL_PROGRESS,
    });
    expectInvalid(GAMEPLAY_EVENT_TYPE.VICTORY, { sourceSystem: '' });
  });

  it('requires a positive integer level for LevelCleared', () => {
    expectInvalid(GAMEPLAY_EVENT_TYPE.LEVEL_CLEARED, {
      sourceSystem: GAMEPLAY_EVENT_SOURCE.LEVEL_PROGRESS,
      level: 0,
    });
    expectInvalid(GAMEPLAY_EVENT_TYPE.LEVEL_CLEARED, {
      sourceSystem: GAMEPLAY_EVENT_SOURCE.LEVEL_PROGRESS,
      level: 1.5,
    });
    expectValid(GAMEPLAY_EVENT_TYPE.LEVEL_CLEARED, {
      sourceSystem: GAMEPLAY_EVENT_SOURCE.LEVEL_PROGRESS,
      level: 1,
    });
  });

  it('emits terminal events as broadcast envelopes carrying no entityId or tile', () => {
    const queue = createEventQueue();
    const payload = { sourceSystem: GAMEPLAY_EVENT_SOURCE.LIFE, cause: GAME_OVER_CAUSE.LIVES };

    const event = emitGameplayEvent(queue, GAMEPLAY_EVENT_TYPE.GAME_OVER, payload, 42);

    expect(event).toEqual({
      type: GAMEPLAY_EVENT_TYPE.GAME_OVER,
      frame: 42,
      order: 0,
      payload,
    });
    expect(event.payload).not.toHaveProperty('entityId');
    expect(event.payload).not.toHaveProperty('tile');
  });
});

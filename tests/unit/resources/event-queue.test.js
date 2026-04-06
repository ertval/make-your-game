/**
 * Unit tests for D-01 event-queue resource.
 *
 * Verifies deterministic insertion-order event queuing, sorted draining,
 * and queue lifecycle operations.
 */

import { describe, expect, it } from 'vitest';

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
    expect(events[0].type).toBe('PelletCollected');
    expect(events[1].type).toBe('BombDetonated');
    expect(events[2].type).toBe('GhostKilled');
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
    expect(queue.events).toHaveLength(1);
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

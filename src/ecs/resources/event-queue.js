/**
 * D-01: Event Queue Resource
 *
 * Deterministic insertion-order event queue for cross-system communication.
 * Systems emit events (bomb detonated, ghost killed, pellet collected, etc.)
 * into this queue, and consuming systems process them in a deterministic
 * order based on the frame index and monotonic insertion counter.
 *
 * This ensures that when multiple systems react to the same frame's events,
 * they all see the same ordering — critical for determinism and replay.
 *
 * Public API:
 *   - createEventQueue() — factory that returns a mutable event queue record.
 *   - enqueue(queue, type, payload, frame) — add an event with auto-assigned order.
 *   - drain(queue) — return all events in insertion order and clear the queue.
 *   - peek(queue) — return all events without clearing (for read-only inspection).
 *   - clear(queue) — discard all pending events (used on level reset).
 *   - resetOrderCounter(queue) — @deprecated test-only; drain() auto-resets.
 *
 * Implementation notes:
 *   - The queue is a plain object with an internal array and order counter.
 *   - Events are sorted by (frame, order) to guarantee deterministic processing
 *     even if systems enqueue out of order during the same frame.
 *   - The queue is drained once per frame at a defined sync point so that
 *     consumers always see a stable snapshot of the previous frame's events.
 */

/**
 * Create a new event queue record.
 * @returns {EventQueue}
 */
export function createEventQueue() {
  return {
    /** Internal buffer of pending events. */
    events: [],
    /** Monotonic insertion counter for deterministic ordering. */
    orderCounter: 0,
  };
}

/**
 * Enqueue a new event with auto-assigned monotonic order index.
 *
 * @param {EventQueue} queue — Mutable event queue record.
 * @param {string} type — Event discriminator (e.g., 'BombDetonated', 'GhostKilled').
 * @param {Object} payload — Event-specific data.
 * @param {number} frame — Fixed-step frame index for temporal ordering.
 */
export function enqueue(queue, type, payload, frame) {
  // BUG-15: silently skip when no queue is registered (e.g., test harnesses
  // running systems without the resource). Throwing here would break callers
  // that legitimately operate without an event queue.
  if (!queue) return;

  // Validate frame is a finite number (BUG-10).
  const validFrame = Number.isFinite(frame) ? frame : 0;

  queue.events.push({
    type,
    frame: validFrame,
    order: queue.orderCounter,
    payload,
  });
  queue.orderCounter += 1;
}

/**
 * Return all events sorted by (frame, order) and clear the queue.
 * This is the primary consumption method — systems call this at their
 * designated event-processing point to get a deterministic snapshot.
 *
 * BUG-12: The returned array IS the previous internal buffer (ownership swap)
 * rather than a copy. This avoids per-frame spread allocation. Callers MUST
 * NOT retain references across frames — process the events and discard.
 *
 * @param {EventQueue} queue — Mutable event queue record.
 * @returns {GameEvent[]} Sorted array of events, queue is cleared.
 */
export function drain(queue) {
  if (queue.events.length === 0) {
    queue.orderCounter = 0;
    return _EMPTY_DRAIN;
  }

  // Sort by frame first, then by insertion order within the same frame.
  // This ensures deterministic processing even if systems enqueued
  // events in different orders during the same simulation step.
  queue.events.sort((a, b) => {
    if (a.frame !== b.frame) {
      return a.frame - b.frame;
    }
    return a.order - b.order;
  });

  const result = queue.events;
  queue.events = [];
  // Auto-reset counter on drain (BUG-10).
  queue.orderCounter = 0;

  return result;
}

/** Frozen singleton returned for empty drains to avoid the [] allocation. */
const _EMPTY_DRAIN = Object.freeze([]);

/**
 * Return all events sorted by (frame, order) without clearing the queue.
 * Used for read-only inspection (e.g., debug replay systems).
 *
 * @internal Used for tests and debug inspection.
 * @param {EventQueue} queue — Mutable event queue record.
 * @returns {GameEvent[]} Sorted array of events, queue is NOT cleared.
 */
export function peek(queue) {
  return queue.events.slice().sort((a, b) => {
    if (a.frame !== b.frame) {
      return a.frame - b.frame;
    }
    return a.order - b.order;
  });
}

/**
 * Discard all pending events and reset the order counter.
 * Used on level reset or game restart to prevent stale events
 * from leaking into the new game state.
 *
 * @param {EventQueue} queue — Mutable event queue record.
 */
export function clear(queue) {
  queue.events.length = 0;
  queue.orderCounter = 0;
}

/**
 * Reset the monotonic order counter without draining events.
 *
 * @deprecated Test-only escape hatch. Production code should use drain(),
 * which auto-resets the counter. Calling this with undrained events can
 * produce order-index collisions across frames (ARCH-07, DEAD-04).
 *
 * @internal
 * @param {EventQueue} queue — Mutable event queue record.
 */
export function resetOrderCounter(queue) {
  if (queue.events.length > 0) {
    // Surface misuse: resetting the counter while events are still queued
    // means subsequent enqueues will collide with existing order indices.
    try {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[event-queue] resetOrderCounter called with undrained events. Use drain() instead.',
        );
      }
    } catch {
      /* process not defined in browser bundle — ignore */
    }
  }
  queue.orderCounter = 0;
}

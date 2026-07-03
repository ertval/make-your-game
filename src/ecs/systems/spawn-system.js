/*
 * C-03 ghost spawn timing system.
 *
 * This module establishes the deterministic world-resource contract for ghost
 * release timing and dead-ghost respawn scheduling. It owns only spawn-related
 * queue state and intentionally avoids mutating ghost entities until a later
 * integration step wires in a stable ordered ghost list resource.
 *
 * Public API:
 * - DEFAULT_SPAWN_RESOURCE_KEY
 * - DEFAULT_DEAD_GHOST_IDS_RESOURCE_KEY
 * - getGhostReleaseDelayMs(index)
 * - getRespawnDelayMs()
 * - scheduleRespawn(spawnState, ghostId)
 * - resolveDeterministicGhostOrder(ghostIds, activeGhostCap)
 * - createInitialSpawnState()
 * - sanitizeSpawnState(value)
 * - createSpawnSystem(options)
 *
 * Implementation notes:
 * - The system uses a dedicated `ghostSpawnState` resource so Track C can own
 *   timing/queue bookkeeping without changing ghost components prematurely.
 * - `elapsedMs` advances only while gameplay is in the PLAYING state, matching
 *   the pause-safe timing pattern used by other logic systems.
 * - Dead ghost ids are treated as edge-triggered intents and cleared after
 *   consumption so stale resource data cannot schedule duplicate respawns.
 * - Release and respawn mutation are deliberately deferred until a later step
 *   provides a deterministic ghost entity ordering resource.
 */

import { peek } from '../resources/event-queue.js';
import {
  GHOST_RESPAWN_MS as CANONICAL_GHOST_RESPAWN_MS,
  GHOST_SPAWN_DELAYS as CANONICAL_GHOST_SPAWN_DELAYS,
} from '../resources/constants.js';
import { GAME_STATE } from '../resources/game-status.js';
import { GAMEPLAY_EVENT_TYPE } from './collision-gameplay-events.js';

const FALLBACK_GHOST_SPAWN_DELAYS = Object.freeze([0, 5000, 10000, 15000]);
const FALLBACK_GHOST_RESPAWN_MS = 5000;
const MAX_DELTA_MS = 1000;

// Resource-key defaults. These are consumed only inside this module
// (`createSpawnSystem` falls back to them), so they are intentionally not
// exported — every other system declares its own local copy. (DEAD-33)
const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_MAP_RESOURCE_KEY = 'mapResource';
const DEFAULT_GHOST_IDS_RESOURCE_KEY = 'ghostIds';
const DEFAULT_EVENT_QUEUE_RESOURCE_KEY = 'eventQueue';
export const DEFAULT_DEAD_GHOST_IDS_RESOURCE_KEY = 'deadGhostIds';
export const DEFAULT_SPAWN_RESOURCE_KEY = 'ghostSpawnState';

/**
 * Allocate the per-system scratch membership sets.
 *
 * These sets are reused frame-to-frame as scratch space for membership tests
 * (queued / released / respawning ghost ids). They MUST be owned by each
 * `createSpawnSystem()` instance rather than living at module scope: module
 * globals are shared by every World, so two Worlds running concurrently (e.g.
 * parallel test runners) would corrupt each other's spawn bookkeeping. (BUG-11)
 *
 * @returns {{ queued: Set<number>, released: Set<number>, respawning: Set<number> }}
 */
function createSpawnScratch() {
  return {
    queued: new Set(),
    released: new Set(),
    respawning: new Set(),
    // BUG-01: highest (frame, order) GhostDefeated event already bridged into
    // deadGhostIds, so peeking the same still-undrained event on a later tick
    // never re-schedules a respawn for a ghost that has already returned.
    lastSeenGhostDefeated: { frame: -1, order: -1 },
    // Identity of the eventQueue object the watermark above was computed
    // against. Restart replaces eventQueue with a brand new instance whose
    // frame/order counters restart from zero (see bootstrap.js's onRestart),
    // so a stale watermark from the previous run would reject every
    // post-restart event as "not newer". Detecting the identity swap lets the
    // watermark reset alongside it.
    lastSeenEventQueue: null,
  };
}

function toFiniteNonNegativeInteger(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function cloneDeterministicIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = [];

  for (const entry of value) {
    if (!Number.isFinite(entry)) {
      continue;
    }

    ids.push(Math.floor(entry));
  }

  return ids;
}

function sanitizeRespawnQueue(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const queue = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const ghostId = Number(entry.ghostId);
    const readyAtMs = Number(entry.readyAtMs);
    if (!Number.isFinite(ghostId) || !Number.isFinite(readyAtMs)) {
      continue;
    }

    queue.push({
      ghostId: Math.floor(ghostId),
      readyAtMs: Math.max(0, Math.floor(readyAtMs)),
    });
  }

  // Deterministic ordering is required once FIFO release starts consuming this.
  queue.sort((left, right) => {
    if (left.readyAtMs !== right.readyAtMs) {
      return left.readyAtMs - right.readyAtMs;
    }

    return left.ghostId - right.ghostId;
  });

  return queue;
}

export function getGhostReleaseDelayMs(index) {
  const delays =
    Array.isArray(CANONICAL_GHOST_SPAWN_DELAYS) && CANONICAL_GHOST_SPAWN_DELAYS.length > 0
      ? CANONICAL_GHOST_SPAWN_DELAYS
      : FALLBACK_GHOST_SPAWN_DELAYS;
  const normalizedIndex = toFiniteNonNegativeInteger(index, 0);

  if (normalizedIndex >= delays.length) {
    return delays[delays.length - 1];
  }

  const delay = Number(delays[normalizedIndex]);
  if (!Number.isFinite(delay) || delay < 0) {
    return FALLBACK_GHOST_SPAWN_DELAYS[
      Math.min(normalizedIndex, FALLBACK_GHOST_SPAWN_DELAYS.length - 1)
    ];
  }

  return Math.floor(delay);
}

export function getRespawnDelayMs() {
  const delay = Number(CANONICAL_GHOST_RESPAWN_MS);
  if (!Number.isFinite(delay) || delay < 0) {
    return FALLBACK_GHOST_RESPAWN_MS;
  }

  return Math.floor(delay);
}

export function scheduleRespawn(spawnState, ghostId) {
  const normalizedGhostId = Number(ghostId);
  if (!Number.isFinite(normalizedGhostId)) {
    return false;
  }

  const nextGhostId = Math.floor(normalizedGhostId);
  for (const entry of spawnState.respawnQueue) {
    if (entry.ghostId === nextGhostId) {
      return false;
    }
  }

  spawnState.respawnQueue.push({
    ghostId: nextGhostId,
    readyAtMs: spawnState.elapsedMs + getRespawnDelayMs(),
  });
  spawnState.respawnQueue.sort((left, right) => {
    if (left.readyAtMs !== right.readyAtMs) {
      return left.readyAtMs - right.readyAtMs;
    }

    return left.ghostId - right.ghostId;
  });
  return true;
}

// Internal-only: consumed solely by `createSpawnSystem`'s update loop. (DEAD-33)
function resolveActiveGhostCap(mapResource) {
  const cap = Number(mapResource?.maxGhosts);
  if (!Number.isFinite(cap) || cap <= 0) {
    return 0;
  }

  return Math.floor(cap);
}

export function resolveDeterministicGhostOrder(ghostIds, activeGhostCap) {
  const normalizedIds = cloneDeterministicIdList(ghostIds);
  if (normalizedIds.length > 0) {
    return normalizedIds;
  }

  const fallbackCount = toFiniteNonNegativeInteger(activeGhostCap, 0);
  const fallbackIds = [];

  for (let ghostId = 0; ghostId < fallbackCount; ghostId += 1) {
    fallbackIds.push(ghostId);
  }

  return fallbackIds;
}

export function createInitialSpawnState() {
  return {
    elapsedMs: 0,
    releasedGhostIds: [],
    queuedGhostIds: [],
    respawnQueue: [],
    activeGhostCap: 0,
  };
}

export function sanitizeSpawnState(value) {
  if (!value || typeof value !== 'object') {
    return createInitialSpawnState();
  }

  return {
    elapsedMs: toFiniteNonNegativeInteger(value.elapsedMs, 0),
    releasedGhostIds: cloneDeterministicIdList(value.releasedGhostIds),
    queuedGhostIds: cloneDeterministicIdList(value.queuedGhostIds),
    respawnQueue: sanitizeRespawnQueue(value.respawnQueue),
    activeGhostCap: toFiniteNonNegativeInteger(value.activeGhostCap, 0),
  };
}

function getDeltaMs(context) {
  const deltaMs = Number(context.dtMs ?? 0);
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return 0;
  }

  return Math.min(deltaMs, MAX_DELTA_MS);
}

function refillMembershipSet(targetSet, ids) {
  targetSet.clear();

  for (const ghostId of cloneDeterministicIdList(ids)) {
    targetSet.add(ghostId);
  }

  return targetSet;
}

/**
 * Refill `targetSet` with the ghost ids currently in the respawn queue.
 *
 * Centralizing this keeps every caller reading the membership snapshot from the
 * live `respawnQueue`, which is what guards BUG-09: once `processRespawns` has
 * removed ready ghosts from the queue, a refreshed set no longer reports them as
 * "still respawning", so they are re-queued instead of being silently dropped.
 *
 * @param {Set<number>} targetSet - Scratch set to refill in place.
 * @param {{ respawnQueue: Array<{ ghostId: number }> }} spawnState - Spawn state.
 * @returns {Set<number>} The refilled set (same reference as `targetSet`).
 */
function refillRespawningSet(targetSet, spawnState) {
  targetSet.clear();

  for (const entry of spawnState.respawnQueue) {
    targetSet.add(entry.ghostId);
  }

  return targetSet;
}

function pruneRespawningGhostsFromReleasedIds(spawnState, scratch) {
  if (spawnState.respawnQueue.length === 0 || spawnState.releasedGhostIds.length === 0) {
    return;
  }

  const respawningGhostIds = refillRespawningSet(scratch.respawning, spawnState);

  spawnState.releasedGhostIds = spawnState.releasedGhostIds.filter(
    (ghostId) => !respawningGhostIds.has(ghostId),
  );
}

function countActiveReleasedGhosts(spawnState, scratch) {
  const respawningGhostIds = refillRespawningSet(scratch.respawning, spawnState);

  let activeCount = 0;

  for (const ghostId of spawnState.releasedGhostIds) {
    if (!respawningGhostIds.has(ghostId)) {
      activeCount += 1;
    }
  }

  return activeCount;
}

function enqueueUniqueGhostIds(
  targetQueue,
  ghostIds,
  releasedSet,
  respawningGhostIds,
  queuedScratch,
) {
  const queuedSet = refillMembershipSet(queuedScratch, targetQueue);

  for (const ghostId of ghostIds) {
    if (queuedSet.has(ghostId) || releasedSet.has(ghostId) || respawningGhostIds.has(ghostId)) {
      continue;
    }

    targetQueue.push(ghostId);
    queuedSet.add(ghostId);
  }
}

function processRespawns(spawnState) {
  const readyGhostIds = [];
  const pendingQueue = [];

  for (const entry of spawnState.respawnQueue) {
    if (entry.readyAtMs <= spawnState.elapsedMs) {
      readyGhostIds.push(entry.ghostId);
      continue;
    }

    pendingQueue.push(entry);
  }

  spawnState.respawnQueue = pendingQueue;
  return readyGhostIds;
}

function releaseEligibleGhosts(spawnState, scratch) {
  const releasedSet = refillMembershipSet(scratch.released, spawnState.releasedGhostIds);
  const respawningGhostIds = refillRespawningSet(scratch.respawning, spawnState);

  let activeGhostCount = countActiveReleasedGhosts(spawnState, scratch);
  const activeGhostCap = toFiniteNonNegativeInteger(spawnState.activeGhostCap, 0);
  const remainingQueue = [];

  for (const ghostId of spawnState.queuedGhostIds) {
    if (activeGhostCount >= activeGhostCap) {
      remainingQueue.push(ghostId);
      continue;
    }

    if (releasedSet.has(ghostId) || respawningGhostIds.has(ghostId)) {
      continue;
    }

    if (!releasedSet.has(ghostId)) {
      spawnState.releasedGhostIds.push(ghostId);
      releasedSet.add(ghostId);
      activeGhostCount += 1;
    }
  }

  spawnState.queuedGhostIds = remainingQueue;
}

function enqueueNewlyEligibleInitialGhosts(spawnState, ghostOrder, scratch) {
  const releasedSet = refillMembershipSet(scratch.released, spawnState.releasedGhostIds);
  const respawningGhostIds = refillRespawningSet(scratch.respawning, spawnState);

  const eligibleGhostIds = [];

  for (let index = 0; index < ghostOrder.length; index += 1) {
    const ghostId = ghostOrder[index];
    if (spawnState.elapsedMs < getGhostReleaseDelayMs(index)) {
      continue;
    }

    eligibleGhostIds.push(ghostId);
  }

  enqueueUniqueGhostIds(
    spawnState.queuedGhostIds,
    eligibleGhostIds,
    releasedSet,
    respawningGhostIds,
    scratch.queued,
  );
}

function consumeDeadGhostIds(spawnState, deadGhostIds) {
  if (!Array.isArray(deadGhostIds) || deadGhostIds.length === 0) {
    return;
  }

  for (const ghostId of deadGhostIds) {
    scheduleRespawn(spawnState, ghostId);
  }
}

function isNewerEventEnvelope(event, watermark) {
  const frame = Number(event?.frame);
  const order = Number(event?.order);
  if (!Number.isFinite(frame) || !Number.isFinite(order)) {
    return false;
  }

  // frame is monotonically increasing for the queue's lifetime, but order
  // resets to 0 on every drain() — so frame must dominate the comparison, or
  // a fresh low-order event after a drain would look "older" than a stale
  // high-order event from before it.
  if (frame !== watermark.frame) {
    return frame > watermark.frame;
  }

  return order > watermark.order;
}

/**
 * Read GhostDefeated gameplay events not yet bridged into deadGhostIds,
 * without draining the shared queue (BUG-01).
 *
 * collision-system marks a fire-killed ghost DEAD and emits GhostDefeated on
 * the shared eventQueue, but nothing wrote that ghost's id into deadGhostIds
 * for spawn-system's respawn pipeline to pick up — the kill never scheduled a
 * respawn. `peek()` is deliberately used instead of `drain()`: the queue's
 * single canonical drain point is the render-phase audio-cue-system (see
 * event-queue.js's D-01 contract), and this system runs earlier in the logic
 * phase, so draining here would delete events other consumers still need to
 * see this frame.
 *
 * Peeking alone is not enough: an event lingers in the queue until that
 * later drain happens, so a naive peek would re-schedule the same ghost's
 * respawn on every subsequent tick until the drain runs — including after
 * the ghost has already come back, incorrectly resetting its respawn timer
 * (observed as `readyAtMs` jumping forward well past `GHOST_RESPAWN_MS`).
 * `scratch.lastSeenGhostDefeated` tracks the highest (frame, order) envelope
 * already bridged so the same event is only ever consumed once, regardless
 * of how many ticks pass before the shared queue is actually drained.
 *
 * @param {{ events: Array<{ frame: number, order: number, type: string, payload: object }> } | null | undefined} eventQueue - Shared gameplay event queue.
 * @param {{ frame: number, order: number }} watermark - Highest (frame, order) envelope already bridged; mutated in place.
 * @returns {number[]} Newly observed ghost entity ids from GhostDefeated events.
 */
function peekGhostDefeatedIds(eventQueue, watermark) {
  if (!eventQueue) {
    return [];
  }

  const ghostIds = [];
  for (const event of peek(eventQueue)) {
    if (!isNewerEventEnvelope(event, watermark)) {
      continue;
    }

    watermark.frame = event.frame;
    watermark.order = event.order;

    if (event.type !== GAMEPLAY_EVENT_TYPE.GHOST_DEFEATED) {
      continue;
    }

    const ghostId = Number(event.payload?.entityId);
    if (Number.isFinite(ghostId)) {
      ghostIds.push(Math.floor(ghostId));
    }
  }

  return ghostIds;
}

export function createSpawnSystem(options = {}) {
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const ghostIdsResourceKey = options.ghostIdsResourceKey || DEFAULT_GHOST_IDS_RESOURCE_KEY;
  const deadGhostIdsResourceKey =
    options.deadGhostIdsResourceKey || DEFAULT_DEAD_GHOST_IDS_RESOURCE_KEY;
  const eventQueueResourceKey = options.eventQueueResourceKey || DEFAULT_EVENT_QUEUE_RESOURCE_KEY;
  const mapResourceKey = options.mapResourceKey || DEFAULT_MAP_RESOURCE_KEY;
  const spawnResourceKey = options.spawnResourceKey || DEFAULT_SPAWN_RESOURCE_KEY;

  // World-local scratch space. Owned by this system instance so concurrent
  // Worlds never share membership state through a module global. (BUG-11)
  const scratch = createSpawnScratch();

  return {
    name: 'spawn-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [
        gameStatusResourceKey,
        ghostIdsResourceKey,
        deadGhostIdsResourceKey,
        eventQueueResourceKey,
        mapResourceKey,
        spawnResourceKey,
      ],
      // `deadGhostIds` is consumed as an event queue, so the system clears it
      // after reading to avoid replaying stale death intents on later ticks.
      // eventQueue is read-only here (peeked, never drained) — see
      // peekGhostDefeatedIds for why.
      write: [deadGhostIdsResourceKey, spawnResourceKey],
    },
    update(context) {
      const world = context.world;
      const gameStatus = world.getResource(gameStatusResourceKey);
      const ghostIds = world.getResource(ghostIdsResourceKey);
      const deadGhostIds = world.getResource(deadGhostIdsResourceKey) || [];
      const eventQueue = world.getResource(eventQueueResourceKey);
      const mapResource = world.getResource(mapResourceKey);
      const existingSpawnState = world.getResource(spawnResourceKey);

      const spawnState = sanitizeSpawnState(existingSpawnState);
      // Keep the spawn cap synchronized with the current map so persisted
      // spawn state cannot carry a stale level-specific ghost limit forward.
      spawnState.activeGhostCap = resolveActiveGhostCap(mapResource);
      const ghostOrder = resolveDeterministicGhostOrder(ghostIds, spawnState.activeGhostCap);

      if (gameStatus?.currentState === GAME_STATE.PLAYING) {
        spawnState.elapsedMs += getDeltaMs(context);
      }

      // BUG-01: collision-system marks fire-killed ghosts DEAD but never
      // writes their ids into deadGhostIds itself; bridge that gap here from
      // the GhostDefeated events it already emits on the shared queue.
      if (eventQueue !== scratch.lastSeenEventQueue) {
        // A new eventQueue instance (restart) resets frame/order to zero, so
        // a watermark from the previous instance must not carry over.
        scratch.lastSeenEventQueue = eventQueue;
        scratch.lastSeenGhostDefeated.frame = -1;
        scratch.lastSeenGhostDefeated.order = -1;
      }
      const bridgedDeadGhostIds = peekGhostDefeatedIds(eventQueue, scratch.lastSeenGhostDefeated);
      const allDeadGhostIds =
        bridgedDeadGhostIds.length > 0 ? deadGhostIds.concat(bridgedDeadGhostIds) : deadGhostIds;

      if (allDeadGhostIds.length > 0) {
        consumeDeadGhostIds(spawnState, allDeadGhostIds);
        // Death intents are edge-triggered. Clear them once consumed so the
        // same death cannot be re-applied after the queued respawn releases.
        world.setResource(deadGhostIdsResourceKey, []);
      }

      // Ghosts waiting out the dead-return penalty are not currently active and
      // must leave the released list so they can be re-queued deterministically.
      pruneRespawningGhostsFromReleasedIds(spawnState, scratch);

      const respawnReadyIds = processRespawns(spawnState);
      if (respawnReadyIds.length > 0) {
        // BUG-09: `processRespawns` has just removed the ready ghosts from
        // `respawnQueue`, so the respawning membership set must be rebuilt from
        // the *current* queue. Reusing the pre-prune snapshot would still list
        // the just-readied ghosts as "respawning" and `enqueueUniqueGhostIds`
        // would skip them — silently dropping them from the spawn flow forever.
        enqueueUniqueGhostIds(
          spawnState.queuedGhostIds,
          respawnReadyIds,
          refillMembershipSet(scratch.released, spawnState.releasedGhostIds),
          refillRespawningSet(scratch.respawning, spawnState),
          scratch.queued,
        );
      }

      enqueueNewlyEligibleInitialGhosts(spawnState, ghostOrder, scratch);
      releaseEligibleGhosts(spawnState, scratch);

      world.setResource(spawnResourceKey, spawnState);
    },
  };
}

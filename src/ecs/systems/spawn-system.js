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
 * - DEFAULT_GHOST_IDS_RESOURCE_KEY
 * - getGhostReleaseDelayMs(index)
 * - getRespawnDelayMs()
 * - scheduleRespawn(spawnState, ghostId)
 * - resolveActiveGhostCap(mapResource)
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
 * - Release and respawn mutation are deliberately deferred until a later step
 *   provides a deterministic ghost entity ordering resource.
 */

import {
  GHOST_RESPAWN_MS as CANONICAL_GHOST_RESPAWN_MS,
  GHOST_SPAWN_DELAYS as CANONICAL_GHOST_SPAWN_DELAYS,
  POOL_GHOSTS,
} from '../resources/constants.js';
import { GAME_STATE } from '../resources/game-status.js';

const FALLBACK_GHOST_SPAWN_DELAYS = Object.freeze([0, 5000, 10000, 15000]);
const FALLBACK_GHOST_RESPAWN_MS = 5000;
const MAX_DELTA_MS = 1000;

export const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
export const DEFAULT_MAP_RESOURCE_KEY = 'mapResource';
export const DEFAULT_GHOST_IDS_RESOURCE_KEY = 'ghostIds';
export const DEFAULT_DEAD_GHOST_IDS_RESOURCE_KEY = 'deadGhostIds';
export const DEFAULT_SPAWN_RESOURCE_KEY = 'ghostSpawnState';

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

export function resolveActiveGhostCap(mapResource) {
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

  const fallbackCount = Math.max(toFiniteNonNegativeInteger(activeGhostCap, 0), POOL_GHOSTS);
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

function createMembershipSet(ids) {
  return new Set(cloneDeterministicIdList(ids));
}

function pruneRespawningGhostsFromReleasedIds(spawnState) {
  if (spawnState.respawnQueue.length === 0 || spawnState.releasedGhostIds.length === 0) {
    return;
  }

  const respawningGhostIds = new Set();

  for (const entry of spawnState.respawnQueue) {
    respawningGhostIds.add(entry.ghostId);
  }

  spawnState.releasedGhostIds = spawnState.releasedGhostIds.filter(
    (ghostId) => !respawningGhostIds.has(ghostId),
  );
}

function countActiveReleasedGhosts(spawnState) {
  const respawningGhostIds = new Set();

  for (const entry of spawnState.respawnQueue) {
    respawningGhostIds.add(entry.ghostId);
  }

  let activeCount = 0;

  for (const ghostId of spawnState.releasedGhostIds) {
    if (!respawningGhostIds.has(ghostId)) {
      activeCount += 1;
    }
  }

  return activeCount;
}

function enqueueUniqueGhostIds(targetQueue, ghostIds, releasedSet, respawningGhostIds) {
  const queuedSet = createMembershipSet(targetQueue);

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

function releaseEligibleGhosts(spawnState) {
  const releasedSet = createMembershipSet(spawnState.releasedGhostIds);
  const respawningGhostIds = new Set();

  for (const entry of spawnState.respawnQueue) {
    respawningGhostIds.add(entry.ghostId);
  }

  let activeGhostCount = countActiveReleasedGhosts(spawnState);
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

function enqueueNewlyEligibleInitialGhosts(spawnState, ghostOrder) {
  const releasedSet = createMembershipSet(spawnState.releasedGhostIds);
  const respawningGhostIds = new Set();

  for (const entry of spawnState.respawnQueue) {
    respawningGhostIds.add(entry.ghostId);
  }

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

export function createSpawnSystem(options = {}) {
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const ghostIdsResourceKey = options.ghostIdsResourceKey || DEFAULT_GHOST_IDS_RESOURCE_KEY;
  const deadGhostIdsResourceKey =
    options.deadGhostIdsResourceKey || DEFAULT_DEAD_GHOST_IDS_RESOURCE_KEY;
  const mapResourceKey = options.mapResourceKey || DEFAULT_MAP_RESOURCE_KEY;
  const spawnResourceKey = options.spawnResourceKey || DEFAULT_SPAWN_RESOURCE_KEY;

  return {
    name: 'spawn-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [
        gameStatusResourceKey,
        ghostIdsResourceKey,
        deadGhostIdsResourceKey,
        mapResourceKey,
        spawnResourceKey,
      ],
      write: [spawnResourceKey],
    },
    update(context) {
      const world = context.world;
      const gameStatus = world.getResource(gameStatusResourceKey);
      const ghostIds = world.getResource(ghostIdsResourceKey);
      const deadGhostIds = world.getResource(deadGhostIdsResourceKey) || [];
      const mapResource = world.getResource(mapResourceKey);
      const existingSpawnState = world.getResource(spawnResourceKey);

      const spawnState = sanitizeSpawnState(existingSpawnState);
      if (spawnState.activeGhostCap === 0) {
        spawnState.activeGhostCap = resolveActiveGhostCap(mapResource);
      }
      const ghostOrder = resolveDeterministicGhostOrder(ghostIds, spawnState.activeGhostCap);

      if (gameStatus?.currentState === GAME_STATE.PLAYING) {
        spawnState.elapsedMs += getDeltaMs(context);
      }

      if (deadGhostIds.length > 0) {
        consumeDeadGhostIds(spawnState, deadGhostIds);
      }

      // Ghosts waiting out the dead-return penalty are not currently active and
      // must leave the released list so they can be re-queued deterministically.
      pruneRespawningGhostsFromReleasedIds(spawnState);

      const respawnReadyIds = processRespawns(spawnState);
      if (respawnReadyIds.length > 0) {
        enqueueUniqueGhostIds(
          spawnState.queuedGhostIds,
          respawnReadyIds,
          createMembershipSet(spawnState.releasedGhostIds),
          new Set(),
        );
      }

      enqueueNewlyEligibleInitialGhosts(spawnState, ghostOrder);
      releaseEligibleGhosts(spawnState);

      world.setResource(spawnResourceKey, spawnState);
    },
  };
}

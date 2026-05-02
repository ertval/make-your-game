/*
 * B-06 explosion geometry and chain-reaction system.
 *
 * This module translates queued bomb detonations into fire tiles and map
 * mutations. It owns cross-pattern explosion geometry, destructible-wall
 * clearing, deterministic power-up drops, power-up destruction by fire, fire
 * lifetime cleanup, and bounded iterative bomb chain reactions.
 *
 * Public API:
 * - EXPLOSION_BOMB_REQUIRED_MASK: query mask for pooled bomb entities.
 * - EXPLOSION_FIRE_REQUIRED_MASK: query mask for pooled fire entities.
 * - resolvePowerUpDropCellType(chance): map seeded RNG chance to cell type.
 * - createExplosionSystem(options): create the logic-phase ECS system.
 *
 * Implementation notes:
 * - Fire and bombs use preallocated entity pools. A pooled slot is active only
 *   when its collider type is FIRE or BOMB respectively.
 * - Chain reactions use an indexed work queue rather than recursion so long
 *   chains cannot grow the JavaScript call stack.
 * - Scoring remains out of scope for B-06. The system emits `chainDepth` and
 *   stores source metadata on fire tiles so scoring can apply combo rules later.
 */

import { COMPONENT_MASK } from '../components/registry.js';
import { COLLIDER_TYPE } from '../components/spatial.js';
import {
  CELL_TYPE,
  FIRE_DURATION_MS,
  MAX_CHAIN_DEPTH,
  POWER_UP_DROP_CHANCES,
} from '../resources/constants.js';
import { getCell, setCell } from '../resources/map-resource.js';
import { nextChance } from '../resources/rng.js';
import {
  emitGameplayEvent,
  GAMEPLAY_EVENT_SOURCE,
  GAMEPLAY_EVENT_TYPE,
} from './collision-gameplay-events.js';

export const EXPLOSION_BOMB_REQUIRED_MASK =
  COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;

export const EXPLOSION_FIRE_REQUIRED_MASK =
  COMPONENT_MASK.FIRE | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;

const EXPLOSION_DIRECTIONS = Object.freeze([
  Object.freeze({ rowDelta: -1, colDelta: 0 }),
  Object.freeze({ rowDelta: 1, colDelta: 0 }),
  Object.freeze({ rowDelta: 0, colDelta: -1 }),
  Object.freeze({ rowDelta: 0, colDelta: 1 }),
]);

/**
 * Map a seeded RNG chance value to the tile revealed by a destroyed wall.
 *
 * The thresholds encode the exact B-06 drop table: 85% empty, then 5% bomb+,
 * 5% fire+, and 5% speed boost. The lower bound of each 5% band is inclusive.
 *
 * @param {number} chance - Deterministic RNG value in [0, 1).
 * @returns {number} CELL_TYPE value to write into the map.
 */
export function resolvePowerUpDropCellType(chance) {
  const normalizedChance = Number.isFinite(chance) ? chance : 0;
  const emptyThreshold = POWER_UP_DROP_CHANCES.NONE;
  const bombThreshold = 0.9;
  const fireThreshold = 0.95;

  if (normalizedChance < emptyThreshold) {
    return CELL_TYPE.EMPTY;
  }

  if (normalizedChance < bombThreshold) {
    return CELL_TYPE.POWER_UP_BOMB;
  }

  if (normalizedChance < fireThreshold) {
    return CELL_TYPE.POWER_UP_FIRE;
  }

  return CELL_TYPE.POWER_UP_SPEED;
}

/**
 * Check whether a pooled bomb entity currently participates in gameplay.
 *
 * @param {ColliderStore | null | undefined} colliderStore - Collider component store.
 * @param {number} entityId - Bomb entity slot to inspect.
 * @returns {boolean} True when the bomb slot is active.
 */
function isActiveBomb(colliderStore, entityId) {
  return colliderStore?.type?.[entityId] === COLLIDER_TYPE.BOMB;
}

/**
 * Check whether a pooled fire entity currently occupies a damaging tile.
 *
 * @param {ColliderStore | null | undefined} colliderStore - Collider component store.
 * @param {number} entityId - Fire entity slot to inspect.
 * @returns {boolean} True when the fire slot is active.
 */
function isActiveFire(colliderStore, entityId) {
  return colliderStore?.type?.[entityId] === COLLIDER_TYPE.FIRE;
}

/**
 * Convert one active bomb entity into a detonation queue record.
 *
 * Chain reactions reuse the same payload shape as fuse-triggered detonations
 * so the resolver has one deterministic work-queue format.
 *
 * @param {BombStore} bombStore - Bomb component store.
 * @param {number} bombEntityId - Bomb entity id to queue.
 * @param {number} chainDepth - Chain depth for combo metadata.
 * @param {number} frame - Fixed-step frame index.
 * @returns {{ bombEntityId: number, chainDepth: number, frame: number, radius: number, row: number, col: number }}
 */
function createChainDetonationRequest(bombStore, bombEntityId, chainDepth, frame) {
  return {
    bombEntityId,
    chainDepth,
    frame: Number.isFinite(frame) ? frame : 0,
    radius: bombStore.radius[bombEntityId],
    row: bombStore.row[bombEntityId],
    col: bombStore.col[bombEntityId],
  };
}

/**
 * Read a finite chain depth from a detonation request.
 *
 * Malformed requests fall back to root-chain depth so one bad field does not
 * crash the fixed-step system dispatcher.
 *
 * @param {object} detonation - Detonation request payload.
 * @returns {number} Bounded positive chain depth.
 */
function readChainDepth(detonation) {
  const depth = Number.isFinite(detonation?.chainDepth) ? Math.floor(detonation.chainDepth) : 1;

  return Math.min(MAX_CHAIN_DEPTH, Math.max(1, depth));
}

/**
 * Find the first active bomb occupying a tile.
 *
 * The first match in stable query order keeps chain selection deterministic if
 * malformed state ever puts multiple bombs on one tile.
 *
 * @param {number[]} bombEntityIds - Queried pooled bomb entity ids.
 * @param {ColliderStore} colliderStore - Collider component store.
 * @param {BombStore} bombStore - Bomb component store.
 * @param {number} row - Tile row.
 * @param {number} col - Tile column.
 * @returns {number} Active bomb entity id, or -1 when none occupies the tile.
 */
function findActiveBombAtTile(bombEntityIds, colliderStore, bombStore, row, col) {
  for (const bombEntityId of bombEntityIds) {
    if (
      isActiveBomb(colliderStore, bombEntityId) &&
      bombStore.row[bombEntityId] === row &&
      bombStore.col[bombEntityId] === col
    ) {
      return bombEntityId;
    }
  }

  return -1;
}

/**
 * Find the first inactive pooled fire slot.
 *
 * Fire is high churn, so reusing preallocated slots avoids structural mutation
 * and recurring DOM/render pool churn in later adapters.
 *
 * @param {number[]} fireEntityIds - Queried pooled fire entity ids.
 * @param {ColliderStore} colliderStore - Collider component store.
 * @returns {number} Inactive fire entity id, or -1 when the pool is exhausted.
 */
function findInactiveFireSlot(fireEntityIds, colliderStore) {
  for (const fireEntityId of fireEntityIds) {
    if (!isActiveFire(colliderStore, fireEntityId)) {
      return fireEntityId;
    }
  }

  return -1;
}

/**
 * Check whether an active fire tile already exists at a map coordinate.
 *
 * Overlapping chain explosions can hit the same tile. Reusing the existing fire
 * tile keeps the active fire pool deterministic and avoids duplicate hazards.
 *
 * @param {number[]} fireEntityIds - Queried pooled fire entity ids.
 * @param {ColliderStore} colliderStore - Collider component store.
 * @param {PositionStore} positionStore - Position component store.
 * @param {number} row - Tile row.
 * @param {number} col - Tile column.
 * @returns {boolean} True when fire is already active at the tile.
 */
function hasActiveFireAtTile(fireEntityIds, colliderStore, positionStore, row, col) {
  for (const fireEntityId of fireEntityIds) {
    if (
      isActiveFire(colliderStore, fireEntityId) &&
      Math.round(positionStore.row[fireEntityId]) === row &&
      Math.round(positionStore.col[fireEntityId]) === col
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Activate one fire pool slot at a tile for the canonical fire lifetime.
 *
 * @param {FireStore} fireStore - Mutable fire component store.
 * @param {PositionStore} positionStore - Mutable position component store.
 * @param {ColliderStore} colliderStore - Mutable collider component store.
 * @param {number} fireEntityId - Inactive fire slot to activate.
 * @param {number} row - Fire tile row.
 * @param {number} col - Fire tile column.
 * @param {number} sourceBombId - Bomb entity that produced this fire tile.
 * @param {number} chainDepth - Chain depth associated with this fire tile.
 */
function activateFireSlot(
  fireStore,
  positionStore,
  colliderStore,
  fireEntityId,
  row,
  col,
  sourceBombId,
  chainDepth,
) {
  fireStore.burnTimerMs[fireEntityId] = FIRE_DURATION_MS;
  fireStore.row[fireEntityId] = row;
  fireStore.col[fireEntityId] = col;
  fireStore.sourceBombId[fireEntityId] = sourceBombId;
  fireStore.chainDepth[fireEntityId] = chainDepth;

  positionStore.row[fireEntityId] = row;
  positionStore.col[fireEntityId] = col;
  positionStore.prevRow[fireEntityId] = row;
  positionStore.prevCol[fireEntityId] = col;
  positionStore.targetRow[fireEntityId] = row;
  positionStore.targetCol[fireEntityId] = col;
  colliderStore.type[fireEntityId] = COLLIDER_TYPE.FIRE;
}

/**
 * Ensure a fire tile exists at the requested coordinate.
 *
 * If the pool is exhausted, the system drops the visual/damage tile quietly
 * rather than allocating during gameplay or throwing out of the system tick.
 *
 * @param {number[]} fireEntityIds - Queried pooled fire entity ids.
 * @param {FireStore} fireStore - Mutable fire component store.
 * @param {PositionStore} positionStore - Mutable position component store.
 * @param {ColliderStore} colliderStore - Mutable collider component store.
 * @param {number} row - Fire tile row.
 * @param {number} col - Fire tile column.
 * @param {number} sourceBombId - Bomb entity that produced this fire tile.
 * @param {number} chainDepth - Chain depth associated with this fire tile.
 */
function ensureFireAtTile(
  fireEntityIds,
  fireStore,
  positionStore,
  colliderStore,
  row,
  col,
  sourceBombId,
  chainDepth,
) {
  if (hasActiveFireAtTile(fireEntityIds, colliderStore, positionStore, row, col)) {
    return;
  }

  const fireEntityId = findInactiveFireSlot(fireEntityIds, colliderStore);
  if (fireEntityId < 0) {
    return;
  }

  activateFireSlot(
    fireStore,
    positionStore,
    colliderStore,
    fireEntityId,
    row,
    col,
    sourceBombId,
    chainDepth,
  );
}

/**
 * Deactivate a fire tile after its burn timer expires.
 *
 * @param {FireStore} fireStore - Mutable fire component store.
 * @param {ColliderStore} colliderStore - Mutable collider component store.
 * @param {number} fireEntityId - Fire entity slot to deactivate.
 */
function deactivateFire(fireStore, colliderStore, fireEntityId) {
  fireStore.burnTimerMs[fireEntityId] = 0;
  fireStore.sourceBombId[fireEntityId] = -1;
  fireStore.chainDepth[fireEntityId] = 0;
  colliderStore.type[fireEntityId] = COLLIDER_TYPE.NONE;
}

/**
 * Tick active fire timers and deactivate expired slots.
 *
 * Existing fire is ticked before new detonations are resolved so fire spawned
 * this frame keeps the full 500ms lifetime.
 *
 * @param {number[]} fireEntityIds - Queried pooled fire entity ids.
 * @param {FireStore} fireStore - Mutable fire component store.
 * @param {ColliderStore} colliderStore - Mutable collider component store.
 * @param {number} dtMs - Fixed-step delta in milliseconds.
 */
function tickActiveFire(fireEntityIds, fireStore, colliderStore, dtMs) {
  const clampedDtMs = Math.max(0, Number(dtMs) || 0);

  for (const fireEntityId of fireEntityIds) {
    if (!isActiveFire(colliderStore, fireEntityId)) {
      continue;
    }

    fireStore.burnTimerMs[fireEntityId] = Math.max(
      0,
      fireStore.burnTimerMs[fireEntityId] - clampedDtMs,
    );

    if (fireStore.burnTimerMs[fireEntityId] <= 0) {
      deactivateFire(fireStore, colliderStore, fireEntityId);
    }
  }
}

/**
 * Read a seeded chance from the RNG resource.
 *
 * Missing RNG falls back to 0 so tests and partial worlds remain deterministic
 * and produce an empty wall drop instead of calling Math.random().
 *
 * @param {RNG | null | undefined} rng - Seeded RNG resource.
 * @returns {number} Deterministic chance value.
 */
function readDropChance(rng) {
  if (!rng) {
    return 0;
  }

  return nextChance(rng);
}

/**
 * Apply map mutation rules for one explosion tile.
 *
 * Indestructible walls block fire before it appears. Destructible walls receive
 * fire, are replaced by a seeded drop result, and stop propagation. Pellets are
 * intentionally left intact, while visible power-ups are destroyed.
 *
 * @param {MapResource} mapResource - Mutable map resource.
 * @param {RNG | null | undefined} rng - Seeded RNG resource.
 * @param {number} row - Tile row being hit.
 * @param {number} col - Tile column being hit.
 * @returns {{ createFire: boolean, continuePropagation: boolean }} Tile resolution result.
 */
function resolveMapHit(mapResource, rng, row, col) {
  const cellType = getCell(mapResource, row, col);

  if (cellType === CELL_TYPE.INDESTRUCTIBLE) {
    return { createFire: false, continuePropagation: false };
  }

  if (cellType === CELL_TYPE.DESTRUCTIBLE) {
    setCell(mapResource, row, col, resolvePowerUpDropCellType(readDropChance(rng)));
    return { createFire: true, continuePropagation: false };
  }

  if (
    cellType === CELL_TYPE.POWER_UP_BOMB ||
    cellType === CELL_TYPE.POWER_UP_FIRE ||
    cellType === CELL_TYPE.POWER_UP_SPEED
  ) {
    setCell(mapResource, row, col, CELL_TYPE.EMPTY);
  }

  return { createFire: true, continuePropagation: true };
}

/**
 * Mark a bomb inactive after it detonates.
 *
 * Bomb ticking may already have deactivated the root bomb before explosion
 * resolution runs, so this operation is intentionally idempotent.
 *
 * @param {ColliderStore} colliderStore - Mutable collider component store.
 * @param {number} bombEntityId - Bomb entity slot to deactivate.
 */
function deactivateBomb(colliderStore, bombEntityId) {
  colliderStore.type[bombEntityId] = COLLIDER_TYPE.NONE;
}

/**
 * Emit the B-06 detonation event with chain metadata.
 *
 * @param {EventQueue | null | undefined} eventQueue - Optional event queue resource.
 * @param {object} detonation - Current detonation request.
 * @param {number} chainDepth - Bounded chain depth.
 * @returns {GameEvent | null} Enqueued event or null when no queue is registered.
 */
function emitBombDetonatedEvent(eventQueue, detonation, chainDepth) {
  return emitGameplayEvent(
    eventQueue,
    GAMEPLAY_EVENT_TYPE.BOMB_DETONATED,
    {
      chainDepth,
      entityId: detonation.bombEntityId,
      sourceSystem: GAMEPLAY_EVENT_SOURCE.EXPLOSION,
      tile: {
        row: detonation.row,
        col: detonation.col,
      },
    },
    detonation.frame,
  );
}

/**
 * Queue a chained bomb if the current explosion may propagate further.
 *
 * The chain-depth guard is checked before queueing so bombs beyond
 * MAX_CHAIN_DEPTH remain active and can still detonate by their own fuse later.
 *
 * @param {object} params - Chain queue dependencies grouped for readability.
 * @param {number[]} params.bombEntityIds - Queried pooled bomb entity ids.
 * @param {BombStore} params.bombStore - Bomb component store.
 * @param {ColliderStore} params.colliderStore - Collider component store.
 * @param {Array<object>} params.workQueue - Local iterative detonation queue.
 * @param {Set<number>} params.queuedBombIds - Bomb ids already queued this pass.
 * @param {Set<number>} params.processedBombIds - Bomb ids already processed this pass.
 * @param {number} params.row - Fire tile row.
 * @param {number} params.col - Fire tile column.
 * @param {number} params.chainDepth - Current detonation chain depth.
 * @param {number} params.frame - Fixed-step frame index to use for chained events.
 */
function queueChainedBombAtTile({
  bombEntityIds,
  bombStore,
  chainDepth,
  col,
  colliderStore,
  frame,
  processedBombIds,
  queuedBombIds,
  row,
  workQueue,
}) {
  if (chainDepth >= MAX_CHAIN_DEPTH) {
    return;
  }

  const chainedBombId = findActiveBombAtTile(bombEntityIds, colliderStore, bombStore, row, col);
  if (
    chainedBombId < 0 ||
    queuedBombIds.has(chainedBombId) ||
    processedBombIds.has(chainedBombId)
  ) {
    return;
  }

  queuedBombIds.add(chainedBombId);
  workQueue.push(createChainDetonationRequest(bombStore, chainedBombId, chainDepth + 1, frame));
}

/**
 * Resolve one explosion tile, including map mutation, fire activation, and chain detection.
 *
 * @param {object} params - Tile resolution dependencies grouped for readability.
 * @param {number[]} params.bombEntityIds - Queried pooled bomb entity ids.
 * @param {BombStore} params.bombStore - Bomb component store.
 * @param {ColliderStore} params.colliderStore - Mutable collider component store.
 * @param {number[]} params.fireEntityIds - Queried pooled fire entity ids.
 * @param {FireStore} params.fireStore - Mutable fire component store.
 * @param {MapResource} params.mapResource - Mutable map resource.
 * @param {PositionStore} params.positionStore - Mutable position component store.
 * @param {RNG | null | undefined} params.rng - Seeded RNG resource.
 * @param {Array<object>} params.workQueue - Local iterative detonation queue.
 * @param {Set<number>} params.queuedBombIds - Bomb ids already queued this pass.
 * @param {Set<number>} params.processedBombIds - Bomb ids already processed this pass.
 * @param {number} params.row - Tile row.
 * @param {number} params.col - Tile column.
 * @param {number} params.chainDepth - Current chain depth.
 * @param {number} params.sourceBombId - Bomb entity that produced this fire tile.
 * @param {number} params.frame - Fixed-step frame index.
 * @returns {boolean} True when the explosion arm may keep propagating.
 */
function resolveExplosionTile({
  bombEntityIds,
  bombStore,
  chainDepth,
  col,
  colliderStore,
  fireEntityIds,
  fireStore,
  frame,
  mapResource,
  positionStore,
  processedBombIds,
  queuedBombIds,
  rng,
  row,
  sourceBombId,
  workQueue,
}) {
  const result = resolveMapHit(mapResource, rng, row, col);

  if (result.createFire) {
    ensureFireAtTile(
      fireEntityIds,
      fireStore,
      positionStore,
      colliderStore,
      row,
      col,
      sourceBombId,
      chainDepth,
    );
    queueChainedBombAtTile({
      bombEntityIds,
      bombStore,
      chainDepth,
      col,
      colliderStore,
      frame,
      processedBombIds,
      queuedBombIds,
      row,
      workQueue,
    });
  }

  return result.continuePropagation;
}

/**
 * Resolve one bomb detonation into fire geometry.
 *
 * The center tile is resolved first, followed by each cardinal arm. A wall-stop
 * result only stops the current arm, never the other three directions.
 *
 * @param {object} params - Detonation dependencies grouped for readability.
 * @param {object} params.detonation - Current detonation request.
 * @param {number} params.chainDepth - Bounded current chain depth.
 * @param {number[]} params.bombEntityIds - Queried pooled bomb entity ids.
 * @param {BombStore} params.bombStore - Bomb component store.
 * @param {ColliderStore} params.colliderStore - Mutable collider component store.
 * @param {number[]} params.fireEntityIds - Queried pooled fire entity ids.
 * @param {FireStore} params.fireStore - Mutable fire component store.
 * @param {MapResource} params.mapResource - Mutable map resource.
 * @param {PositionStore} params.positionStore - Mutable position component store.
 * @param {RNG | null | undefined} params.rng - Seeded RNG resource.
 * @param {Array<object>} params.workQueue - Local iterative detonation queue.
 * @param {Set<number>} params.queuedBombIds - Bomb ids already queued this pass.
 * @param {Set<number>} params.processedBombIds - Bomb ids already processed this pass.
 */
function resolveDetonationGeometry({
  bombEntityIds,
  bombStore,
  chainDepth,
  colliderStore,
  detonation,
  fireEntityIds,
  fireStore,
  mapResource,
  positionStore,
  processedBombIds,
  queuedBombIds,
  rng,
  workQueue,
}) {
  const radius = Math.max(0, Math.floor(Number(detonation.radius) || 0));

  resolveExplosionTile({
    bombEntityIds,
    bombStore,
    chainDepth,
    col: detonation.col,
    colliderStore,
    fireEntityIds,
    fireStore,
    frame: detonation.frame,
    mapResource,
    positionStore,
    processedBombIds,
    queuedBombIds,
    rng,
    row: detonation.row,
    sourceBombId: detonation.bombEntityId,
    workQueue,
  });

  for (const direction of EXPLOSION_DIRECTIONS) {
    for (let distance = 1; distance <= radius; distance += 1) {
      const shouldContinue = resolveExplosionTile({
        bombEntityIds,
        bombStore,
        chainDepth,
        col: detonation.col + direction.colDelta * distance,
        colliderStore,
        fireEntityIds,
        fireStore,
        frame: detonation.frame,
        mapResource,
        positionStore,
        processedBombIds,
        queuedBombIds,
        rng,
        row: detonation.row + direction.rowDelta * distance,
        sourceBombId: detonation.bombEntityId,
        workQueue,
      });

      if (!shouldContinue) {
        break;
      }
    }
  }
}

/**
 * Drain queued detonations into a local iterative work queue.
 *
 * Clearing the shared queue before processing prevents stale requests from
 * being processed again if a later system inspects the same resource.
 *
 * @param {Array<object>} bombDetonationQueue - Shared detonation queue resource.
 * @returns {Array<object>} Local work queue seeded with pending detonations.
 */
function takeDetonationWorkQueue(bombDetonationQueue) {
  const workQueue = [];

  for (const detonation of bombDetonationQueue) {
    workQueue.push(detonation);
  }

  bombDetonationQueue.length = 0;
  return workQueue;
}

/**
 * Process all queued detonations and any chain reactions they trigger.
 *
 * The queue is consumed by index instead of recursive calls, satisfying the B6
 * requirement for an iterative chain-reaction implementation.
 *
 * @param {object} params - Processing dependencies grouped for readability.
 * @param {number[]} params.bombEntityIds - Queried pooled bomb entity ids.
 * @param {BombStore} params.bombStore - Bomb component store.
 * @param {ColliderStore} params.colliderStore - Mutable collider component store.
 * @param {EventQueue | null | undefined} params.eventQueue - Optional event queue resource.
 * @param {number[]} params.fireEntityIds - Queried pooled fire entity ids.
 * @param {FireStore} params.fireStore - Mutable fire component store.
 * @param {MapResource} params.mapResource - Mutable map resource.
 * @param {PositionStore} params.positionStore - Mutable position component store.
 * @param {RNG | null | undefined} params.rng - Seeded RNG resource.
 * @param {Array<object>} params.workQueue - Local detonation work queue.
 */
function processDetonationWorkQueue({
  bombEntityIds,
  bombStore,
  colliderStore,
  eventQueue,
  fireEntityIds,
  fireStore,
  mapResource,
  positionStore,
  rng,
  workQueue,
}) {
  const processedBombIds = new Set();
  const queuedBombIds = new Set();

  for (const detonation of workQueue) {
    queuedBombIds.add(detonation.bombEntityId);
  }

  for (let index = 0; index < workQueue.length; index += 1) {
    const detonation = workQueue[index];
    const bombEntityId = detonation.bombEntityId;

    if (processedBombIds.has(bombEntityId)) {
      continue;
    }

    const chainDepth = readChainDepth(detonation);

    processedBombIds.add(bombEntityId);
    deactivateBomb(colliderStore, bombEntityId);
    emitBombDetonatedEvent(eventQueue, detonation, chainDepth);
    resolveDetonationGeometry({
      bombEntityIds,
      bombStore,
      chainDepth,
      colliderStore,
      detonation,
      fireEntityIds,
      fireStore,
      mapResource,
      positionStore,
      processedBombIds,
      queuedBombIds,
      rng,
      workQueue,
    });
  }
}

/**
 * Create the B-06 explosion system.
 *
 * @param {{
 *   mapResourceKey?: string,
 *   positionResourceKey?: string,
 *   colliderResourceKey?: string,
 *   bombResourceKey?: string,
 *   fireResourceKey?: string,
 *   rngResourceKey?: string,
 *   bombDetonationQueueResourceKey?: string,
 *   eventQueueResourceKey?: string,
 *   bombRequiredMask?: number,
 *   fireRequiredMask?: number,
 * }} [options] - Optional resource-key and query-mask overrides for tests.
 * @returns {{ name: string, phase: string, resourceCapabilities: object, update: Function }} ECS system registration.
 */
export function createExplosionSystem(options = {}) {
  const mapResourceKey = options.mapResourceKey || 'mapResource';
  const positionResourceKey = options.positionResourceKey || 'position';
  const colliderResourceKey = options.colliderResourceKey || 'collider';
  const bombResourceKey = options.bombResourceKey || 'bomb';
  const fireResourceKey = options.fireResourceKey || 'fire';
  const rngResourceKey = options.rngResourceKey || 'rng';
  const bombDetonationQueueResourceKey =
    options.bombDetonationQueueResourceKey || 'bombDetonationQueue';
  const eventQueueResourceKey = options.eventQueueResourceKey || 'eventQueue';
  const bombRequiredMask = options.bombRequiredMask ?? EXPLOSION_BOMB_REQUIRED_MASK;
  const fireRequiredMask = options.fireRequiredMask ?? EXPLOSION_FIRE_REQUIRED_MASK;

  return {
    name: 'explosion-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [rngResourceKey],
      write: [
        mapResourceKey,
        positionResourceKey,
        colliderResourceKey,
        bombResourceKey,
        fireResourceKey,
        bombDetonationQueueResourceKey,
        eventQueueResourceKey,
      ],
    },
    update(context) {
      const world = context.world;
      const mapResource = world.getResource(mapResourceKey);
      const positionStore = world.getResource(positionResourceKey);
      const colliderStore = world.getResource(colliderResourceKey);
      const bombStore = world.getResource(bombResourceKey);
      const fireStore = world.getResource(fireResourceKey);
      const rng = world.getResource(rngResourceKey);
      const bombDetonationQueue = world.getResource(bombDetonationQueueResourceKey);
      const eventQueue = world.getResource(eventQueueResourceKey);

      if (
        !mapResource ||
        !positionStore ||
        !colliderStore ||
        !bombStore ||
        !fireStore ||
        !Array.isArray(bombDetonationQueue)
      ) {
        return;
      }

      const bombEntityIds = world.query(bombRequiredMask);
      const fireEntityIds = world.query(fireRequiredMask);

      tickActiveFire(fireEntityIds, fireStore, colliderStore, context.dtMs);

      if (bombDetonationQueue.length === 0) {
        return;
      }

      processDetonationWorkQueue({
        bombEntityIds,
        bombStore,
        colliderStore,
        eventQueue,
        fireEntityIds,
        fireStore,
        mapResource,
        positionStore,
        rng,
        workQueue: takeDetonationWorkQueue(bombDetonationQueue),
      });
    },
  };
}

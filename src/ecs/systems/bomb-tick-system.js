/*
 * B-06 bomb placement and fuse countdown system.
 *
 * This module owns the Track B simulation path for turning a fixed-step bomb
 * input snapshot into an active pooled bomb and for moving active bombs toward
 * detonation. It does not resolve explosion geometry, fire tiles, scoring,
 * rendering, audio, or UI state; those are separate systems/tickets.
 *
 * Public API:
 * - BOMB_TICK_PLAYER_REQUIRED_MASK: query mask for bomb-capable player entities.
 * - BOMB_TICK_BOMB_REQUIRED_MASK: query mask for pooled bomb entities.
 * - isActiveBomb(colliderStore, entityId): check whether a pooled bomb slot is live.
 * - createBombDetonationRequest(bombStore, entityId, frame): build queue payload.
 * - createBombTickSystem(options): create the logic-phase ECS system.
 *
 * Implementation notes:
 * - Bomb entities are expected to be preallocated pools. A bomb slot is inactive
 *   when it still has the BOMB component but its collider type is NONE.
 * - The system ticks existing active bombs before processing new placement so a
 *   newly placed bomb starts with the full canonical fuse on its first frame.
 * - Expired bombs are deactivated immediately after queueing a detonation so
 *   they cannot enqueue duplicate detonation requests on later fixed steps.
 */

import { COMPONENT_MASK } from '../components/registry.js';
import { COLLIDER_TYPE } from '../components/spatial.js';
import { BOMB_FUSE_MS, DEFAULT_FIRE_RADIUS } from '../resources/constants.js';
import { readEntityTile } from '../shared/tile-utils.js';

export const BOMB_TICK_PLAYER_REQUIRED_MASK =
  COMPONENT_MASK.PLAYER | COMPONENT_MASK.POSITION | COMPONENT_MASK.INPUT_STATE;

export const BOMB_TICK_BOMB_REQUIRED_MASK =
  COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;

/**
 * Check whether a pooled bomb entity is currently active in the maze.
 *
 * The BOMB component marks pool membership. The collider type marks whether
 * the slot currently participates in gameplay and collision occupancy.
 *
 * @param {ColliderStore | null | undefined} colliderStore - Collider component store.
 * @param {number} entityId - Bomb entity slot to inspect.
 * @returns {boolean} True when the bomb slot is live.
 */
export function isActiveBomb(colliderStore, entityId) {
  return colliderStore?.type?.[entityId] === COLLIDER_TYPE.BOMB;
}

/**
 * Check whether a player has requested bomb placement for this fixed step.
 *
 * Bomb input is a one-shot snapshot written by the input system, so any value
 * other than 1 is treated as no placement request.
 *
 * @param {InputStateStore | null | undefined} inputState - Input snapshot store.
 * @param {number} entityId - Player entity slot to inspect.
 * @returns {boolean} True when the player requested a bomb this step.
 */
function hasBombIntent(inputState, entityId) {
  return inputState?.bomb?.[entityId] === 1;
}

/**
 * Count active bombs owned by one player.
 *
 * This enforces the player's `maxBombs` limit without relying on render state
 * or any external collection of currently placed bombs.
 *
 * @param {number[]} bombEntityIds - Queried pooled bomb entity ids.
 * @param {ColliderStore} colliderStore - Collider component store.
 * @param {BombStore} bombStore - Bomb component store.
 * @param {number} ownerId - Player entity id.
 * @returns {number} Active bomb count for the owner.
 */
function countActiveBombsForOwner(bombEntityIds, colliderStore, bombStore, ownerId) {
  let count = 0;

  for (const bombEntityId of bombEntityIds) {
    if (isActiveBomb(colliderStore, bombEntityId) && bombStore.ownerId[bombEntityId] === ownerId) {
      count += 1;
    }
  }

  return count;
}

/**
 * Check whether an active bomb already occupies a tile.
 *
 * One-bomb-per-cell is a placement rule, so the check scans active pooled bombs
 * rather than static map data.
 *
 * @param {number[]} bombEntityIds - Queried pooled bomb entity ids.
 * @param {ColliderStore} colliderStore - Collider component store.
 * @param {BombStore} bombStore - Bomb component store.
 * @param {number} row - Candidate tile row.
 * @param {number} col - Candidate tile column.
 * @returns {boolean} True when an active bomb is already on the tile.
 */
function hasActiveBombAtTile(bombEntityIds, colliderStore, bombStore, row, col) {
  for (const bombEntityId of bombEntityIds) {
    if (
      isActiveBomb(colliderStore, bombEntityId) &&
      bombStore.row[bombEntityId] === row &&
      bombStore.col[bombEntityId] === col
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Find the first inactive pooled bomb slot in deterministic entity-id order.
 *
 * The World query result is already stable, so returning the first inactive
 * slot keeps repeated seeded runs from choosing different pool entities.
 *
 * @param {number[]} bombEntityIds - Queried pooled bomb entity ids.
 * @param {ColliderStore} colliderStore - Collider component store.
 * @returns {number} Inactive bomb entity id, or -1 when the pool is exhausted.
 */
function findInactiveBombSlot(bombEntityIds, colliderStore) {
  for (const bombEntityId of bombEntityIds) {
    if (!isActiveBomb(colliderStore, bombEntityId)) {
      return bombEntityId;
    }
  }

  return -1;
}

/**
 * Copy placement state into one inactive bomb pool slot.
 *
 * The bomb store owns authoritative tile/radius/fuse data, while the position
 * and collider stores let collision and later rendering systems observe the
 * same active bomb.
 *
 * @param {BombStore} bombStore - Mutable bomb component store.
 * @param {PositionStore} positionStore - Mutable position component store.
 * @param {ColliderStore} colliderStore - Mutable collider component store.
 * @param {number} bombEntityId - Inactive bomb pool slot to activate.
 * @param {number} ownerId - Player entity id placing the bomb.
 * @param {number} row - Bomb tile row.
 * @param {number} col - Bomb tile column.
 * @param {number} radius - Explosion radius copied from player state.
 */
function activateBombSlot(
  bombStore,
  positionStore,
  colliderStore,
  bombEntityId,
  ownerId,
  row,
  col,
  radius,
) {
  bombStore.fuseMs[bombEntityId] = BOMB_FUSE_MS;
  bombStore.radius[bombEntityId] = radius;
  bombStore.ownerId[bombEntityId] = ownerId;
  bombStore.row[bombEntityId] = row;
  bombStore.col[bombEntityId] = col;

  positionStore.row[bombEntityId] = row;
  positionStore.col[bombEntityId] = col;
  positionStore.prevRow[bombEntityId] = row;
  positionStore.prevCol[bombEntityId] = col;
  positionStore.targetRow[bombEntityId] = row;
  positionStore.targetCol[bombEntityId] = col;
  colliderStore.type[bombEntityId] = COLLIDER_TYPE.BOMB;
}

/**
 * Normalize a bomb radius value to the positive integer used by explosion geometry.
 *
 * Radius can come from mutable player state, so invalid or zero values fall
 * back to the design default before map-specific validation is applied.
 *
 * @param {number} radius - Raw radius value to normalize.
 * @returns {number} Positive integer radius.
 */
function normalizeBombRadius(radius) {
  const numericRadius = Number(radius);

  if (!Number.isFinite(numericRadius) || numericRadius <= 0) {
    return DEFAULT_FIRE_RADIUS;
  }

  return Math.floor(numericRadius);
}

/**
 * Resolve the largest meaningful bomb radius for a tile inside the current map.
 *
 * Explosion arms stop at walls and bounds later, but clamping to the furthest
 * in-bounds cardinal direction prevents malformed upgrade state from creating
 * huge traversal loops or Uint8Array wraparound when copied into bomb storage.
 *
 * @param {MapResource} mapResource - Map dimensions source.
 * @param {number} row - Bomb tile row.
 * @param {number} col - Bomb tile column.
 * @returns {number} Maximum useful radius from this tile.
 */
function resolveMaxBombRadiusForMapTile(mapResource, row, col) {
  if (
    !mapResource ||
    !Number.isFinite(mapResource.rows) ||
    !Number.isFinite(mapResource.cols) ||
    !Number.isFinite(row) ||
    !Number.isFinite(col)
  ) {
    return DEFAULT_FIRE_RADIUS;
  }

  const maxRow = mapResource.rows - 1;
  const maxCol = mapResource.cols - 1;

  if (maxRow < 0 || maxCol < 0 || row < 0 || row > maxRow || col < 0 || col > maxCol) {
    return 0;
  }

  return Math.max(row, maxRow - row, col, maxCol - col);
}

/**
 * Resolve the player's current bomb radius against the active map bounds.
 *
 * Missing or zero player fire radius falls back to the canonical default so
 * partially wired tests and recycled slots still place valid bombs. The final
 * value is clamped to the map because B6 explosions cannot affect tiles beyond
 * the loaded level dimensions.
 *
 * @param {PlayerStore | null | undefined} playerStore - Player component store.
 * @param {number} entityId - Player entity slot to inspect.
 * @param {MapResource} mapResource - Map dimensions source.
 * @param {number} row - Bomb tile row.
 * @param {number} col - Bomb tile column.
 * @returns {number} Map-bounded non-negative explosion radius.
 */
function readPlayerBombRadius(playerStore, entityId, mapResource, row, col) {
  const radius = normalizeBombRadius(playerStore?.fireRadius?.[entityId] ?? DEFAULT_FIRE_RADIUS);
  const maxRadius = resolveMaxBombRadiusForMapTile(mapResource, row, col);

  return Math.max(0, Math.min(radius, maxRadius));
}

/**
 * Resolve the player's simultaneous bomb limit.
 *
 * A missing or zero `maxBombs` value means the player cannot place bombs; that
 * avoids inventing capacity for malformed player state.
 *
 * @param {PlayerStore | null | undefined} playerStore - Player component store.
 * @param {number} entityId - Player entity slot to inspect.
 * @returns {number} Non-negative maximum active bombs.
 */
function readPlayerMaxBombs(playerStore, entityId) {
  return Math.max(0, playerStore?.maxBombs?.[entityId] ?? 0);
}

/**
 * Attempt to place one bomb for a player entity.
 *
 * Placement fails quietly when any ticket-defined guard is not satisfied:
 * no bomb intent, no free pooled slot, max-bomb limit reached, or occupied tile.
 *
 * @param {object} params - Placement dependencies grouped for readability.
 * @param {number[]} params.bombEntityIds - Queried pooled bomb entity ids.
 * @param {BombStore} params.bombStore - Mutable bomb component store.
 * @param {ColliderStore} params.colliderStore - Mutable collider component store.
 * @param {InputStateStore} params.inputState - Input snapshot store.
 * @param {MapResource} params.mapResource - Map resource used to bound bomb radius.
 * @param {PlayerStore} params.playerStore - Player component store.
 * @param {PositionStore} params.positionStore - Mutable position component store.
 * @param {number} params.playerEntityId - Player entity slot attempting placement.
 * @param {{ row: number, col: number }} params.reusableTile - Reusable tile object.
 * @returns {number} Activated bomb entity id, or -1 when no bomb was placed.
 */
function placeBombForPlayer({
  bombEntityIds,
  bombStore,
  colliderStore,
  inputState,
  mapResource,
  playerEntityId,
  playerStore,
  positionStore,
  reusableTile,
}) {
  if (!hasBombIntent(inputState, playerEntityId)) {
    return -1;
  }

  const tile = readEntityTile(positionStore, playerEntityId, reusableTile);
  if (!tile) {
    return -1;
  }

  const activeBombCount = countActiveBombsForOwner(
    bombEntityIds,
    colliderStore,
    bombStore,
    playerEntityId,
  );
  if (activeBombCount >= readPlayerMaxBombs(playerStore, playerEntityId)) {
    return -1;
  }

  if (hasActiveBombAtTile(bombEntityIds, colliderStore, bombStore, tile.row, tile.col)) {
    return -1;
  }

  const bombEntityId = findInactiveBombSlot(bombEntityIds, colliderStore);
  if (bombEntityId < 0) {
    return -1;
  }

  activateBombSlot(
    bombStore,
    positionStore,
    colliderStore,
    bombEntityId,
    playerEntityId,
    tile.row,
    tile.col,
    readPlayerBombRadius(playerStore, playerEntityId, mapResource, tile.row, tile.col),
  );
  return bombEntityId;
}

/**
 * Build the detonation queue payload for one expired bomb.
 *
 * Explosion resolution owns geometry and scoring metadata. The tick system only
 * forwards the bomb's stable identity, tile, radius, frame, and root chain depth.
 *
 * @param {BombStore} bombStore - Bomb component store.
 * @param {number} entityId - Expired bomb entity slot.
 * @param {number} frame - Fixed-step frame index.
 * @returns {{ bombEntityId: number, chainDepth: number, frame: number, radius: number, row: number, col: number }}
 */
export function createBombDetonationRequest(bombStore, entityId, frame) {
  return {
    bombEntityId: entityId,
    chainDepth: 1,
    frame: Number.isFinite(frame) ? frame : 0,
    radius: bombStore.radius[entityId],
    row: bombStore.row[entityId],
    col: bombStore.col[entityId],
  };
}

/**
 * Deactivate a bomb after its detonation request is queued.
 *
 * The queue keeps the payload needed by explosion resolution, and setting the
 * collider to NONE prevents repeated fuse-expiry events from the same slot.
 *
 * @param {ColliderStore} colliderStore - Mutable collider component store.
 * @param {number} entityId - Bomb entity slot to deactivate.
 */
function deactivateQueuedBomb(colliderStore, entityId) {
  colliderStore.type[entityId] = COLLIDER_TYPE.NONE;
}

/**
 * Decrement active bomb fuses and queue newly expired bombs.
 *
 * The function only handles bombs that were active at the start of the call;
 * newly placed bombs are handled afterward by the system update order.
 *
 * @param {number[]} bombEntityIds - Queried pooled bomb entity ids.
 * @param {BombStore} bombStore - Mutable bomb component store.
 * @param {ColliderStore} colliderStore - Mutable collider component store.
 * @param {Array<object>} bombDetonationQueue - Shared detonation queue resource.
 * @param {number} dtMs - Fixed-step delta in milliseconds.
 * @param {number} frame - Fixed-step frame index.
 */
function tickActiveBombs(
  bombEntityIds,
  bombStore,
  colliderStore,
  bombDetonationQueue,
  dtMs,
  frame,
) {
  const clampedDtMs = Math.max(0, Number(dtMs) || 0);

  for (const bombEntityId of bombEntityIds) {
    if (!isActiveBomb(colliderStore, bombEntityId)) {
      continue;
    }

    bombStore.fuseMs[bombEntityId] = Math.max(0, bombStore.fuseMs[bombEntityId] - clampedDtMs);

    if (bombStore.fuseMs[bombEntityId] > 0) {
      continue;
    }

    bombDetonationQueue.push(createBombDetonationRequest(bombStore, bombEntityId, frame));
    deactivateQueuedBomb(colliderStore, bombEntityId);
  }
}

/**
 * Create the B-06 bomb tick system.
 *
 * @param {{
 *   mapResourceKey?: string,
 *   playerResourceKey?: string,
 *   inputStateResourceKey?: string,
 *   positionResourceKey?: string,
 *   colliderResourceKey?: string,
 *   bombResourceKey?: string,
 *   bombDetonationQueueResourceKey?: string,
 *   playerRequiredMask?: number,
 *   bombRequiredMask?: number,
 * }} [options] - Optional resource-key and query-mask overrides for tests.
 * @returns {{ name: string, phase: string, resourceCapabilities: object, update: Function }} ECS system registration.
 */
export function createBombTickSystem(options = {}) {
  const mapResourceKey = options.mapResourceKey || 'mapResource';
  const playerResourceKey = options.playerResourceKey || 'player';
  const inputStateResourceKey = options.inputStateResourceKey || 'inputState';
  const positionResourceKey = options.positionResourceKey || 'position';
  const colliderResourceKey = options.colliderResourceKey || 'collider';
  const bombResourceKey = options.bombResourceKey || 'bomb';
  const bombDetonationQueueResourceKey =
    options.bombDetonationQueueResourceKey || 'bombDetonationQueue';
  const playerRequiredMask = options.playerRequiredMask ?? BOMB_TICK_PLAYER_REQUIRED_MASK;
  const bombRequiredMask = options.bombRequiredMask ?? BOMB_TICK_BOMB_REQUIRED_MASK;
  const reusableTile = { row: 0, col: 0 };

  return {
    name: 'bomb-tick-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [mapResourceKey, playerResourceKey, inputStateResourceKey],
      write: [
        positionResourceKey,
        colliderResourceKey,
        bombResourceKey,
        bombDetonationQueueResourceKey,
      ],
    },
    update(context) {
      const world = context.world;
      const mapResource = world.getResource(mapResourceKey);
      const playerStore = world.getResource(playerResourceKey);
      const inputState = world.getResource(inputStateResourceKey);
      const positionStore = world.getResource(positionResourceKey);
      const colliderStore = world.getResource(colliderResourceKey);
      const bombStore = world.getResource(bombResourceKey);
      const bombDetonationQueue = world.getResource(bombDetonationQueueResourceKey);

      if (
        !mapResource ||
        !playerStore ||
        !inputState ||
        !positionStore ||
        !colliderStore ||
        !bombStore ||
        !Array.isArray(bombDetonationQueue)
      ) {
        return;
      }

      const bombEntityIds = world.query(bombRequiredMask);

      tickActiveBombs(
        bombEntityIds,
        bombStore,
        colliderStore,
        bombDetonationQueue,
        context.dtMs,
        context.frame,
      );

      for (const playerEntityId of world.query(playerRequiredMask)) {
        placeBombForPlayer({
          bombEntityIds,
          bombStore,
          colliderStore,
          inputState,
          mapResource,
          playerEntityId,
          playerStore,
          positionStore,
          reusableTile,
        });
      }
    },
  };
}

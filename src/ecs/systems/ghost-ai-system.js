/*
 * B-08 ghost AI system.
 *
 * This module owns deterministic ghost behavior for the Track B ticket:
 * personality-driven targeting (Blinky/Pinky/Inky/Clyde), the Normal →
 * Stunned → Dead state machine consequences on movement, the "no reverse
 * direction" rule during Normal patrol, wall and ghost-house barrier
 * respect, and grid-aligned motion at level-specific speeds.
 *
 * The system is a pure ECS simulation system. It never touches the DOM,
 * never imports adapters, and reads everything via World resources.
 *
 * Public API:
 * - GHOST_AI_REQUIRED_MASK: canonical component mask for the ghost AI query.
 * - GHOST_AI_DIRECTIONS: stable ordered direction list used by tie-breaking.
 * - GHOST_DIRECTION_VECTOR: cardinal direction → (rowDelta, colDelta) map.
 * - computeBlinkyTarget(playerTile): tile that Blinky chases.
 * - computePinkyTarget(playerTile, playerVector): four tiles ahead of player.
 * - computeInkyTarget(playerTile, playerVector, blinkyTile): doubled-vector flank.
 * - computeClydeTarget(playerTile, ghostTile, mapResource): chase/retreat toggle.
 * - resolveGhostTargetTile(ghostType, context): canonical target for a ghost type.
 * - selectGhostDirection(context): pick a passable direction this step.
 * - resolveGhostSpeed(ghostStore, ghostId, mapResource): effective speed.
 * - createGhostAiSystem(options): physics-phase ECS system factory.
 *
 * Implementation notes:
 * - Targeting math comes straight from `docs/game-description.md` §5.1 so the
 *   personalities behave exactly as documented in the source-of-truth.
 * - Ghosts re-pick their direction only on tile-center alignment, matching the
 *   classic intersection rule and preserving grid alignment under variable FPS.
 * - Normal-state ghosts may not reverse. Stunned (Frenzy) and Dead ghosts
 *   ignore the no-reverse rule because the design explicitly allows fleeing
 *   and eyes-returning behavior to backtrack.
 * - The system uses small fixed-size arrays for the per-step direction scratch
 *   to avoid per-frame allocations in the hot path.
 * - Bombs are treated as impassable when an optional bomb-occupancy resource
 *   is registered. This is read-only — bomb placement and lifetime stay with
 *   the bomb systems (B-06).
 * - Dead ghosts return to the ghost spawn point inside the ghost house. The
 *   actual 5-second respawn delay is owned by the C-03 spawn system; this
 *   system only restores Dead → Normal once the spawn system re-releases the
 *   ghost (i.e. it appears in `releasedGhostIds` after its respawn timer).
 * - Stunned ghosts return to Normal when their per-entity stun timer reaches
 *   zero. The B-07 power-up system also clears stun on its own tick; this
 *   guard keeps the AI consistent if the systems are wired independently.
 */

import { resetGhost } from '../components/actors.js';
import { COMPONENT_MASK } from '../components/registry.js';
import {
  CLYDE_DISTANCE_THRESHOLD,
  GHOST_STATE,
  GHOST_STUNNED_SPEED,
  GHOST_TYPE,
  INKY_REFERENCE_OFFSET,
  PINKY_TARGET_OFFSET,
} from '../resources/constants.js';
import { GAME_STATE } from '../resources/game-status.js';
import { isPassableForGhost } from '../resources/map-resource.js';
import { readEntityTile } from '../shared/tile-utils.js';

const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_GHOST_RESOURCE_KEY = 'ghost';
const DEFAULT_MAP_RESOURCE_KEY = 'mapResource';
const DEFAULT_PLAYER_ENTITY_RESOURCE_KEY = 'playerEntity';
const DEFAULT_POSITION_RESOURCE_KEY = 'position';
const DEFAULT_VELOCITY_RESOURCE_KEY = 'velocity';
const DEFAULT_BOMB_OCCUPANCY_RESOURCE_KEY = 'bombCellOccupancy';
const DEFAULT_SPAWN_RESOURCE_KEY = 'ghostSpawnState';
const DEFAULT_RNG_RESOURCE_KEY = 'rng';

const MAX_DELTA_MS = 1000;
const MOVEMENT_EPSILON = 1e-9;

/**
 * Canonical component query for ghost AI.
 * Ghosts always carry position and velocity in addition to ghost state.
 */
export const GHOST_AI_REQUIRED_MASK =
  COMPONENT_MASK.GHOST | COMPONENT_MASK.POSITION | COMPONENT_MASK.VELOCITY;

/**
 * Stable ordering used for deterministic tie-breaking at intersections.
 * The order matches the classic Pac-Man tile preference: up, left, down, right.
 */
export const GHOST_AI_DIRECTIONS = Object.freeze(['up', 'left', 'down', 'right']);

/**
 * Cardinal direction vectors. Each direction changes exactly one axis so
 * cardinal motion is preserved across the entire AI loop.
 */
export const GHOST_DIRECTION_VECTOR = Object.freeze({
  up: Object.freeze({ rowDelta: -1, colDelta: 0 }),
  left: Object.freeze({ rowDelta: 0, colDelta: -1 }),
  down: Object.freeze({ rowDelta: 1, colDelta: 0 }),
  right: Object.freeze({ rowDelta: 0, colDelta: 1 }),
});

/**
 * Convert a (rowDelta, colDelta) vector into a direction key.
 *
 * @param {number} rowDelta - Row component of the vector.
 * @param {number} colDelta - Column component of the vector.
 * @returns {'up' | 'left' | 'down' | 'right' | null} Matching direction name.
 */
export function vectorToDirection(rowDelta, colDelta) {
  if (rowDelta === -1 && colDelta === 0) return 'up';
  if (rowDelta === 1 && colDelta === 0) return 'down';
  if (rowDelta === 0 && colDelta === -1) return 'left';
  if (rowDelta === 0 && colDelta === 1) return 'right';
  return null;
}

/**
 * Compute Blinky's target — the player's current tile.
 *
 * @param {{ row: number, col: number }} playerTile - Player tile.
 * @returns {{ row: number, col: number }} Target tile.
 */
export function computeBlinkyTarget(playerTile) {
  return { row: playerTile.row, col: playerTile.col };
}

/**
 * Compute Pinky's target — four tiles ahead of the player in the direction
 * the player is currently moving. If the player is idle, target the player's
 * own tile (per `game-description.md` §5.1).
 *
 * @param {{ row: number, col: number }} playerTile - Player tile.
 * @param {{ rowDelta: number, colDelta: number } | null} playerVector - Player movement vector.
 * @returns {{ row: number, col: number }} Target tile.
 */
export function computePinkyTarget(playerTile, playerVector) {
  const dRow = playerVector?.rowDelta ?? 0;
  const dCol = playerVector?.colDelta ?? 0;

  if (dRow === 0 && dCol === 0) {
    return { row: playerTile.row, col: playerTile.col };
  }

  return {
    row: playerTile.row + dRow * PINKY_TARGET_OFFSET,
    col: playerTile.col + dCol * PINKY_TARGET_OFFSET,
  };
}

/**
 * Compute Inky's target — take the tile 2 spaces ahead of the player, draw a
 * vector from Blinky's tile to that pivot, then double its length.
 *
 * @param {{ row: number, col: number }} playerTile - Player tile.
 * @param {{ rowDelta: number, colDelta: number } | null} playerVector - Player movement vector.
 * @param {{ row: number, col: number }} blinkyTile - Blinky's current tile.
 * @returns {{ row: number, col: number }} Target tile.
 */
export function computeInkyTarget(playerTile, playerVector, blinkyTile) {
  const dRow = playerVector?.rowDelta ?? 0;
  const dCol = playerVector?.colDelta ?? 0;
  const pivotRow = playerTile.row + dRow * INKY_REFERENCE_OFFSET;
  const pivotCol = playerTile.col + dCol * INKY_REFERENCE_OFFSET;

  // Double the Blinky→pivot vector around Blinky to get the flanking target.
  return {
    row: pivotRow + (pivotRow - blinkyTile.row),
    col: pivotCol + (pivotCol - blinkyTile.col),
  };
}

/**
 * Compute Clyde's target. Far from the player (> threshold) he chases like
 * Blinky; close (≤ threshold) he retreats to the bottom-left corner.
 *
 * @param {{ row: number, col: number }} playerTile - Player tile.
 * @param {{ row: number, col: number }} ghostTile - Clyde's current tile.
 * @param {{ rows: number, cols: number }} mapResource - Map dimensions.
 * @returns {{ row: number, col: number }} Target tile.
 */
export function computeClydeTarget(playerTile, ghostTile, mapResource) {
  const dRow = playerTile.row - ghostTile.row;
  const dCol = playerTile.col - ghostTile.col;
  const euclideanDistance = Math.sqrt(dRow * dRow + dCol * dCol);

  if (euclideanDistance > CLYDE_DISTANCE_THRESHOLD) {
    return { row: playerTile.row, col: playerTile.col };
  }

  // Bottom-left corner of the map (inside the play area).
  const rows = Math.max(0, (mapResource?.rows ?? 0) - 1);
  return { row: rows, col: 0 };
}

/**
 * Resolve the canonical target tile for a ghost given its personality and
 * the current world snapshot.
 *
 * @param {number} ghostType - Value from GHOST_TYPE.
 * @param {{
 *   ghostTile: { row: number, col: number },
 *   playerTile: { row: number, col: number },
 *   playerVector: { rowDelta: number, colDelta: number } | null,
 *   blinkyTile: { row: number, col: number },
 *   mapResource: object,
 * }} context - Targeting context.
 * @returns {{ row: number, col: number }} Target tile.
 */
export function resolveGhostTargetTile(ghostType, context) {
  const { ghostTile, playerTile, playerVector, blinkyTile, mapResource } = context;

  switch (ghostType) {
    case GHOST_TYPE.BLINKY:
      return computeBlinkyTarget(playerTile);
    case GHOST_TYPE.PINKY:
      return computePinkyTarget(playerTile, playerVector);
    case GHOST_TYPE.INKY:
      return computeInkyTarget(playerTile, playerVector, blinkyTile);
    case GHOST_TYPE.CLYDE:
      return computeClydeTarget(playerTile, ghostTile, mapResource);
    default:
      // Unknown types fall back to chasing the player so the ghost does not freeze.
      return computeBlinkyTarget(playerTile);
  }
}

/**
 * Resolve the effective speed for a ghost given its state and the map ghost
 * speed. Stunned ghosts always use the canonical stunned speed; dead ghosts
 * use the same speed as normal so the "eyes" return at a believable pace.
 *
 * @param {{ state: Uint8Array, speed: Float64Array } | null} ghostStore - Ghost component store.
 * @param {number} ghostId - Ghost entity slot index.
 * @param {{ ghostSpeed?: number }} mapResource - Map ghost speed.
 * @returns {number} Tiles per second.
 */
export function resolveGhostSpeed(ghostStore, ghostId, mapResource) {
  const state = ghostStore?.state?.[ghostId] ?? GHOST_STATE.NORMAL;

  if (state === GHOST_STATE.STUNNED) {
    return GHOST_STUNNED_SPEED;
  }

  const storedSpeed = ghostStore?.speed?.[ghostId];
  if (Number.isFinite(storedSpeed) && storedSpeed > 0) {
    return storedSpeed;
  }

  const mapSpeed = Number(mapResource?.ghostSpeed);
  if (Number.isFinite(mapSpeed) && mapSpeed > 0) {
    return mapSpeed;
  }

  return 0;
}

/**
 * Determine whether moving from one tile to the next is legal for a ghost.
 * Walls are blocked via the map resource; bomb cells are blocked if the
 * optional bomb-occupancy resource is registered.
 *
 * @param {object} mapResource - Map resource.
 * @param {number} nextRow - Target tile row.
 * @param {number} nextCol - Target tile col.
 * @param {Set<number> | Map<number, unknown> | null} bombCells - Optional bomb-occupied cell set keyed by `row*cols+col`.
 * @returns {boolean} True when the tile is enterable this step.
 */
function isGhostTilePassable(mapResource, nextRow, nextCol, bombCells) {
  if (!isPassableForGhost(mapResource, nextRow, nextCol)) {
    return false;
  }

  if (bombCells && typeof mapResource?.cols === 'number') {
    const cellIndex = nextRow * mapResource.cols + nextCol;
    if (bombCells.has(cellIndex)) {
      return false;
    }
  }

  return true;
}

/**
 * Pick the next movement direction for a ghost at a tile-center decision point.
 *
 * Normal ghosts pick the direction whose adjacent tile is closest to the
 * target (Euclidean squared distance). They may not reverse. Stunned ghosts
 * pick the direction farthest from the player and may reverse. Dead ghosts
 * pick the direction closest to the ghost spawn point and may reverse.
 *
 * @param {{
 *   ghostTile: { row: number, col: number },
 *   targetTile: { row: number, col: number },
 *   state: number,
 *   previousVector: { rowDelta: number, colDelta: number } | null,
 *   mapResource: object,
 *   bombCells: Set<number> | null,
 *   prefersDistance: boolean,
 * }} context - Selection context.
 * @returns {'up' | 'left' | 'down' | 'right' | null} Chosen direction.
 */
export function selectGhostDirection(context) {
  const {
    ghostTile,
    targetTile,
    state,
    previousVector,
    mapResource,
    bombCells = null,
    prefersDistance = false,
  } = context;
  const canReverse = state === GHOST_STATE.STUNNED || state === GHOST_STATE.DEAD;

  let bestDirection = null;
  let bestScore = prefersDistance ? -Infinity : Infinity;

  // Stable iteration order ensures deterministic tie-breaking.
  for (const direction of GHOST_AI_DIRECTIONS) {
    const vector = GHOST_DIRECTION_VECTOR[direction];
    const nextRow = ghostTile.row + vector.rowDelta;
    const nextCol = ghostTile.col + vector.colDelta;

    if (!isGhostTilePassable(mapResource, nextRow, nextCol, bombCells)) {
      continue;
    }

    // No-reverse: skip the inverse of the previous travel vector unless the
    // ghost is stunned (fleeing) or dead (returning).
    if (!canReverse && previousVector) {
      if (
        vector.rowDelta === -previousVector.rowDelta &&
        vector.colDelta === -previousVector.colDelta &&
        (previousVector.rowDelta !== 0 || previousVector.colDelta !== 0)
      ) {
        continue;
      }
    }

    const dRow = targetTile.row - nextRow;
    const dCol = targetTile.col - nextCol;
    // Squared distance avoids the sqrt; ordering is identical for non-negative values.
    const score = dRow * dRow + dCol * dCol;

    if (prefersDistance) {
      if (score > bestScore) {
        bestScore = score;
        bestDirection = direction;
      }
    } else if (score < bestScore) {
      bestScore = score;
      bestDirection = direction;
    }
  }

  // If every non-reverse direction is blocked, the ghost is in a dead-end and
  // must reverse. This is true even for Normal patrol.
  if (bestDirection === null && previousVector && !canReverse) {
    const reverseDir = vectorToDirection(-previousVector.rowDelta, -previousVector.colDelta);
    if (reverseDir) {
      const vector = GHOST_DIRECTION_VECTOR[reverseDir];
      const nextRow = ghostTile.row + vector.rowDelta;
      const nextCol = ghostTile.col + vector.colDelta;
      if (isGhostTilePassable(mapResource, nextRow, nextCol, bombCells)) {
        return reverseDir;
      }
    }
  }

  return bestDirection;
}

function readDeltaMs(context) {
  const deltaMs = Number(context?.dtMs ?? 0);
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return 0;
  }

  return Math.min(deltaMs, MAX_DELTA_MS);
}

function readBombOccupancyCells(resource, mapResource) {
  if (!resource || !mapResource || typeof mapResource.cols !== 'number') {
    return null;
  }

  if (resource instanceof Set || resource instanceof Map) {
    return resource;
  }

  // Accept array-of-objects {row, col} or {cellIndex} shapes.
  if (Array.isArray(resource)) {
    const cells = new Set();
    for (const entry of resource) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      if (Number.isFinite(entry.cellIndex)) {
        cells.add(Math.floor(entry.cellIndex));
        continue;
      }
      if (Number.isFinite(entry.row) && Number.isFinite(entry.col)) {
        cells.add(Math.floor(entry.row) * mapResource.cols + Math.floor(entry.col));
      }
    }
    return cells.size > 0 ? cells : null;
  }

  return null;
}

function readPlayerVector(velocityStore, playerEntityId) {
  if (!velocityStore || !Number.isInteger(playerEntityId) || playerEntityId < 0) {
    return { rowDelta: 0, colDelta: 0 };
  }
  const rowDelta = velocityStore.rowDelta?.[playerEntityId] ?? 0;
  const colDelta = velocityStore.colDelta?.[playerEntityId] ?? 0;
  return { rowDelta, colDelta };
}

function findBlinkyTile(ghostStore, positionStore, ghostEntityIds, reusableTile) {
  if (!ghostStore || !positionStore) {
    return { row: 0, col: 0 };
  }

  for (const ghostId of ghostEntityIds) {
    if (ghostStore.type?.[ghostId] === GHOST_TYPE.BLINKY) {
      const tile = readEntityTile(positionStore, ghostId, reusableTile);
      return tile ? { row: tile.row, col: tile.col } : { row: 0, col: 0 };
    }
  }

  return { row: 0, col: 0 };
}

function snapGhostToTarget(positionStore, velocityStore, ghostId) {
  positionStore.row[ghostId] = positionStore.targetRow[ghostId];
  positionStore.col[ghostId] = positionStore.targetCol[ghostId];
  velocityStore.rowDelta[ghostId] = 0;
  velocityStore.colDelta[ghostId] = 0;
}

function isGhostAtTarget(positionStore, ghostId) {
  return (
    Math.abs(positionStore.row[ghostId] - positionStore.targetRow[ghostId]) <= MOVEMENT_EPSILON &&
    Math.abs(positionStore.col[ghostId] - positionStore.targetCol[ghostId]) <= MOVEMENT_EPSILON
  );
}

function startGhostMove(positionStore, velocityStore, ghostId, ghostTile, direction) {
  const vector = GHOST_DIRECTION_VECTOR[direction];
  positionStore.row[ghostId] = ghostTile.row;
  positionStore.col[ghostId] = ghostTile.col;
  positionStore.targetRow[ghostId] = ghostTile.row + vector.rowDelta;
  positionStore.targetCol[ghostId] = ghostTile.col + vector.colDelta;
  velocityStore.rowDelta[ghostId] = vector.rowDelta;
  velocityStore.colDelta[ghostId] = vector.colDelta;
}

function advanceGhostTowardTarget(positionStore, velocityStore, ghostId, distanceTiles) {
  const rowDistance = positionStore.targetRow[ghostId] - positionStore.row[ghostId];
  const colDistance = positionStore.targetCol[ghostId] - positionStore.col[ghostId];
  const distanceToTarget = Math.max(Math.abs(rowDistance), Math.abs(colDistance));

  if (distanceToTarget <= MOVEMENT_EPSILON) {
    snapGhostToTarget(positionStore, velocityStore, ghostId);
    return distanceTiles;
  }

  const stepDistance = Math.min(distanceTiles, distanceToTarget);
  const dirRow = rowDistance === 0 ? 0 : rowDistance / Math.abs(rowDistance);
  const dirCol = colDistance === 0 ? 0 : colDistance / Math.abs(colDistance);

  positionStore.row[ghostId] += dirRow * stepDistance;
  positionStore.col[ghostId] += dirCol * stepDistance;

  if (stepDistance + MOVEMENT_EPSILON >= distanceToTarget) {
    snapGhostToTarget(positionStore, velocityStore, ghostId);
  }

  return distanceTiles - stepDistance;
}

function shouldClearStun(ghostStore, ghostId) {
  return (
    ghostStore?.state?.[ghostId] === GHOST_STATE.STUNNED &&
    (ghostStore.timerMs?.[ghostId] ?? 0) <= 0
  );
}

/**
 * Apply post-respawn cleanup: when a ghost is DEAD but has been re-released by
 * the spawn system (i.e., its respawn delay elapsed), reset it back to NORMAL
 * at the ghost spawn point. This keeps the AI consistent with C-03.
 */
function restoreReleasedDeadGhost(ghostStore, positionStore, velocityStore, ghostId, mapResource) {
  if (ghostStore?.state?.[ghostId] !== GHOST_STATE.DEAD) {
    return;
  }

  // Snap eyes to the spawn point so the next tick starts fresh.
  positionStore.row[ghostId] = mapResource.ghostSpawnRow;
  positionStore.col[ghostId] = mapResource.ghostSpawnCol;
  positionStore.targetRow[ghostId] = mapResource.ghostSpawnRow;
  positionStore.targetCol[ghostId] = mapResource.ghostSpawnCol;
  velocityStore.rowDelta[ghostId] = 0;
  velocityStore.colDelta[ghostId] = 0;

  ghostStore.state[ghostId] = GHOST_STATE.NORMAL;
  ghostStore.timerMs[ghostId] = 0;
}

/**
 * Create the B-08 ghost AI system.
 *
 * @param {{
 *   ghostResourceKey?: string,
 *   positionResourceKey?: string,
 *   velocityResourceKey?: string,
 *   mapResourceKey?: string,
 *   playerEntityResourceKey?: string,
 *   gameStatusResourceKey?: string,
 *   bombOccupancyResourceKey?: string | null,
 *   spawnResourceKey?: string | null,
 *   rngResourceKey?: string | null,
 *   requiredMask?: number,
 * }} [options] - Resource key overrides.
 * @returns {{ name: string, phase: string, resourceCapabilities: object, update: Function }}
 */
export function createGhostAiSystem(options = {}) {
  const ghostResourceKey = options.ghostResourceKey || DEFAULT_GHOST_RESOURCE_KEY;
  const positionResourceKey = options.positionResourceKey || DEFAULT_POSITION_RESOURCE_KEY;
  const velocityResourceKey = options.velocityResourceKey || DEFAULT_VELOCITY_RESOURCE_KEY;
  const mapResourceKey = options.mapResourceKey || DEFAULT_MAP_RESOURCE_KEY;
  const playerEntityResourceKey =
    options.playerEntityResourceKey || DEFAULT_PLAYER_ENTITY_RESOURCE_KEY;
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const bombOccupancyResourceKey =
    options.bombOccupancyResourceKey ?? DEFAULT_BOMB_OCCUPANCY_RESOURCE_KEY;
  const spawnResourceKey = options.spawnResourceKey ?? DEFAULT_SPAWN_RESOURCE_KEY;
  const rngResourceKey = options.rngResourceKey ?? DEFAULT_RNG_RESOURCE_KEY;
  const requiredMask = options.requiredMask ?? GHOST_AI_REQUIRED_MASK;

  // Reusable temporary tile objects keep the hot loop allocation-free.
  const ghostTile = { row: 0, col: 0 };
  const playerTile = { row: 0, col: 0 };
  const blinkyTile = { row: 0, col: 0 };

  const readCapabilities = [
    ghostResourceKey,
    positionResourceKey,
    velocityResourceKey,
    mapResourceKey,
    playerEntityResourceKey,
    gameStatusResourceKey,
  ];
  if (bombOccupancyResourceKey) {
    readCapabilities.push(bombOccupancyResourceKey);
  }
  if (spawnResourceKey) {
    readCapabilities.push(spawnResourceKey);
  }
  if (rngResourceKey) {
    readCapabilities.push(rngResourceKey);
  }

  return {
    name: 'ghost-ai-system',
    phase: 'physics',
    resourceCapabilities: {
      read: readCapabilities,
      write: [ghostResourceKey, positionResourceKey, velocityResourceKey],
    },
    update(context) {
      const world = context.world;
      const gameStatus = world.getResource(gameStatusResourceKey);
      if (gameStatus?.currentState !== GAME_STATE.PLAYING) {
        return;
      }

      const ghostStore = world.getResource(ghostResourceKey);
      const positionStore = world.getResource(positionResourceKey);
      const velocityStore = world.getResource(velocityResourceKey);
      const mapResource = world.getResource(mapResourceKey);
      const playerEntity = world.getResource(playerEntityResourceKey);
      if (!ghostStore || !positionStore || !velocityStore || !mapResource) {
        return;
      }

      const bombOccupancy = bombOccupancyResourceKey
        ? readBombOccupancyCells(world.getResource(bombOccupancyResourceKey), mapResource)
        : null;
      const spawnState = spawnResourceKey ? world.getResource(spawnResourceKey) : null;
      const releasedGhostSet = spawnState?.releasedGhostIds
        ? new Set(spawnState.releasedGhostIds)
        : null;

      const playerEntityId =
        playerEntity && Number.isInteger(playerEntity.id) && playerEntity.id >= 0
          ? playerEntity.id
          : -1;
      if (playerEntityId >= 0) {
        const tile = readEntityTile(positionStore, playerEntityId, playerTile);
        if (tile) {
          playerTile.row = tile.row;
          playerTile.col = tile.col;
        }
      }
      const playerVector = readPlayerVector(velocityStore, playerEntityId);

      const ghostEntityIds = typeof world.query === 'function' ? world.query(requiredMask) : [];

      // Resolve Blinky's tile once per step so Inky's targeting stays
      // deterministic across the iteration order.
      const blinkySnapshot = findBlinkyTile(ghostStore, positionStore, ghostEntityIds, blinkyTile);
      blinkyTile.row = blinkySnapshot.row;
      blinkyTile.col = blinkySnapshot.col;

      const deltaSeconds = readDeltaMs(context) / 1000;

      for (const ghostId of ghostEntityIds) {
        const ghostType = ghostStore.type?.[ghostId];
        if (ghostType === undefined || ghostType < 0) {
          continue;
        }

        // Stun timer expiry: restore to NORMAL if the per-entity timer ran out.
        if (shouldClearStun(ghostStore, ghostId)) {
          ghostStore.state[ghostId] = GHOST_STATE.NORMAL;
        }

        // Respawn handoff: when a ghost is DEAD and the spawn system has
        // already re-released it, return it to NORMAL at the spawn point.
        // We skip the rest of this tick so the ghost starts fresh next frame
        // and downstream systems observe the canonical spawn-point position.
        if (
          releasedGhostSet &&
          ghostStore.state?.[ghostId] === GHOST_STATE.DEAD &&
          releasedGhostSet.has(ghostId)
        ) {
          restoreReleasedDeadGhost(ghostStore, positionStore, velocityStore, ghostId, mapResource);
          continue;
        }

        const state = ghostStore.state?.[ghostId] ?? GHOST_STATE.NORMAL;
        const speed = resolveGhostSpeed(ghostStore, ghostId, mapResource);

        // Capture the pre-step position for downstream interpolation/change-detection.
        positionStore.prevRow[ghostId] = positionStore.row[ghostId];
        positionStore.prevCol[ghostId] = positionStore.col[ghostId];
        velocityStore.speedTilesPerSecond[ghostId] = speed;

        // A ghost only re-decides at a tile-aligned center. Mid-cell ghosts
        // just keep marching until they reach their target tile.
        if (isGhostAtTarget(positionStore, ghostId)) {
          const currentTile = readEntityTile(positionStore, ghostId, ghostTile);
          if (!currentTile) {
            continue;
          }

          const previousVector =
            velocityStore.rowDelta[ghostId] === 0 && velocityStore.colDelta[ghostId] === 0
              ? null
              : {
                  rowDelta: velocityStore.rowDelta[ghostId],
                  colDelta: velocityStore.colDelta[ghostId],
                };

          // Compute target tile.
          let targetTile;
          let prefersDistance = false;
          if (state === GHOST_STATE.STUNNED) {
            // Flee: maximize distance from the player.
            targetTile = { row: playerTile.row, col: playerTile.col };
            prefersDistance = true;
          } else if (state === GHOST_STATE.DEAD) {
            // Return to ghost spawn point.
            targetTile = {
              row: mapResource.ghostSpawnRow ?? currentTile.row,
              col: mapResource.ghostSpawnCol ?? currentTile.col,
            };
          } else {
            targetTile = resolveGhostTargetTile(ghostType, {
              ghostTile: currentTile,
              playerTile,
              playerVector,
              blinkyTile,
              mapResource,
            });
          }

          const chosenDirection = selectGhostDirection({
            ghostTile: currentTile,
            targetTile,
            state,
            previousVector,
            mapResource,
            bombCells: bombOccupancy,
            prefersDistance,
          });

          if (!chosenDirection) {
            // No legal move: stay put for this step.
            snapGhostToTarget(positionStore, velocityStore, ghostId);
            continue;
          }

          startGhostMove(positionStore, velocityStore, ghostId, currentTile, chosenDirection);
        }

        if (speed > 0 && deltaSeconds > 0) {
          advanceGhostTowardTarget(positionStore, velocityStore, ghostId, speed * deltaSeconds);
        }
      }
    },
  };
}

// Re-export reset helper so tests can build harnesses without importing actors.
export { resetGhost };

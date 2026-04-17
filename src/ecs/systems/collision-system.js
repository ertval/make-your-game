/*
 * B-04 entity collision system scaffold.
 *
 * This module owns the deterministic collision-resolution shell for Track B's
 * entity collision ticket. The current implementation establishes the helper
 * and system contract layer so later collision behavior can be added without
 * changing the public shape of the system.
 *
 * Public API:
 * - COLLISION_ENTITY_REQUIRED_MASK: query mask for dynamic entities with tile positions.
 * - DEFAULT_GHOST_SLOTS_PER_CELL: scratch-buffer fan-out for ghost occupancy lanes.
 * - tileToCellIndex(mapResource, row, col): convert a tile coordinate into a flat cell index.
 * - readEntityTile(positionStore, entityId, outTile): copy one entity's tile into a reusable object.
 * - createCollisionScratch(cellCount, maxGhostsPerCell): allocate reusable occupancy buffers.
 * - resetCollisionScratch(scratch): clear a scratch buffer back to deterministic sentinels.
 * - clearCollisionIntents(collisionIntents): empty the injected intent buffer in place.
 * - appendCollisionIntent(collisionIntents, intent): append one deterministic intent with monotonic order.
 * - isPlayerInvincible(playerStore, healthStore, entityId): resolve the current invincibility state.
 * - createCollisionSystem(options): create the logic-phase ECS system shell.
 *
 * Implementation notes:
 * - The scratch buffers use typed arrays and sentinel values so the collision
 *   system can build O(1) occupancy maps without allocating inside hot loops.
 * - The invincibility helper intentionally accepts both the player timer store
 *   and the health flag store because the current codebase carries both
 *   representations; this keeps B-04 compatible without forcing a cross-ticket
 *   schema decision here.
 * - The system clears the injected collision intent array only when the core
 *   resources exist. If required resources are missing, the system returns
 *   early and does not mutate external state.
 */

import { COMPONENT_MASK } from '../components/registry.js';
import { COLLIDER_TYPE } from '../components/spatial.js';
import { CELL_TYPE, GHOST_STATE } from '../resources/constants.js';
import { getCell, isGhostHouseCell, setCell } from '../resources/map-resource.js';

/**
 * Dynamic entities with tile positions are queried through position + collider.
 * Additional collision sources may be read directly from other stores later,
 * but that does not change the core query contract for moving entities.
 */
export const COLLISION_ENTITY_REQUIRED_MASK = COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;

/**
 * Default occupancy fan-out for ghosts in one cell.
 * Four is enough for the shipped game because the design caps the live ghost
 * count at four, so one cell can never need more ghost slots than this.
 */
export const DEFAULT_GHOST_SLOTS_PER_CELL = 4;

/**
 * Convert a tile coordinate into the flat cell index used by occupancy buffers.
 *
 * @param {MapResource | null | undefined} mapResource - Map dimensions source.
 * @param {number} row - Tile row to encode.
 * @param {number} col - Tile col to encode.
 * @returns {number} Flat cell index, or -1 when the tile is out of bounds.
 */
export function tileToCellIndex(mapResource, row, col) {
  if (!mapResource) {
    return -1;
  }

  if (row < 0 || row >= mapResource.rows || col < 0 || col >= mapResource.cols) {
    return -1;
  }

  return row * mapResource.cols + col;
}

/**
 * Copy one entity's current tile into a reusable output object.
 *
 * @param {PositionStore | null | undefined} positionStore - Position component store.
 * @param {number} entityId - Entity slot to read.
 * @param {{ row: number, col: number }} [outTile] - Reusable target object.
 * @returns {{ row: number, col: number } | null} The populated tile object, or null when missing.
 */
export function readEntityTile(positionStore, entityId, outTile = { row: 0, col: 0 }) {
  if (!positionStore) {
    return null;
  }

  // Rounding keeps the helper stable for exact centered positions while still
  // allowing a later refinement of the final in-transit collision semantics.
  outTile.row = Math.round(positionStore.row[entityId]);
  outTile.col = Math.round(positionStore.col[entityId]);
  return outTile;
}

/**
 * Copy one entity's previous tile into a reusable output object.
 *
 * @param {PositionStore | null | undefined} positionStore - Position component store.
 * @param {number} entityId - Entity slot to read.
 * @param {{ row: number, col: number }} [outTile] - Reusable target object.
 * @returns {{ row: number, col: number } | null} The populated tile object, or null when missing.
 */
function readPreviousEntityTile(positionStore, entityId, outTile = { row: 0, col: 0 }) {
  if (!positionStore) {
    return null;
  }

  outTile.row = Math.round(positionStore.prevRow[entityId]);
  outTile.col = Math.round(positionStore.prevCol[entityId]);
  return outTile;
}

/**
 * Snap one entity back onto a specific tile.
 *
 * @param {PositionStore} positionStore - Mutable position store.
 * @param {number} entityId - Entity slot to mutate.
 * @param {number} row - Tile row to occupy.
 * @param {number} col - Tile col to occupy.
 */
function setEntityTile(positionStore, entityId, row, col) {
  positionStore.row[entityId] = row;
  positionStore.col[entityId] = col;
  positionStore.targetRow[entityId] = row;
  positionStore.targetCol[entityId] = col;
}

/**
 * Allocate the reusable occupancy scratch buffers for one collision step.
 *
 * @param {number} cellCount - Total number of map cells.
 * @param {number} [maxGhostsPerCell=DEFAULT_GHOST_SLOTS_PER_CELL] - Ghost lane count.
 * @returns {CollisionScratch} Fresh scratch buffers sized for the map.
 */
export function createCollisionScratch(cellCount, maxGhostsPerCell = DEFAULT_GHOST_SLOTS_PER_CELL) {
  return {
    cellCount,
    maxGhostsPerCell,
    // Single-lane colliders use -1 to mean "no entity occupies this cell yet".
    playerByCell: new Int32Array(cellCount).fill(-1),
    bombByCell: new Int32Array(cellCount).fill(-1),
    fireByCell: new Int32Array(cellCount).fill(-1),
    // Ghosts need a compact fan-out lane because multiple ghosts can share one tile.
    ghostCounts: new Uint8Array(cellCount),
    ghostIds: new Int32Array(cellCount * maxGhostsPerCell).fill(-1),
  };
}

/**
 * Reset one scratch buffer back to deterministic sentinel defaults.
 *
 * @param {CollisionScratch} scratch - Reusable occupancy scratch buffer.
 * @returns {CollisionScratch} The same scratch object for call chaining.
 */
export function resetCollisionScratch(scratch) {
  scratch.playerByCell.fill(-1);
  scratch.bombByCell.fill(-1);
  scratch.fireByCell.fill(-1);
  scratch.ghostCounts.fill(0);
  scratch.ghostIds.fill(-1);
  return scratch;
}

/**
 * Empty the injected collision intent array in place.
 *
 * @param {Array<object> | null | undefined} collisionIntents - Shared step-local intent buffer.
 * @returns {Array<object> | null} The same buffer when valid, otherwise null.
 */
export function clearCollisionIntents(collisionIntents) {
  if (!Array.isArray(collisionIntents)) {
    return null;
  }

  collisionIntents.length = 0;
  return collisionIntents;
}

/**
 * Append one deterministic collision intent into the injected array.
 *
 * @param {Array<object> | null | undefined} collisionIntents - Shared step-local intent buffer.
 * @param {object} intent - Collision intent payload without the monotonic order.
 * @returns {object | null} The appended record, or null when the buffer is invalid.
 */
export function appendCollisionIntent(collisionIntents, intent) {
  if (!Array.isArray(collisionIntents)) {
    return null;
  }

  const nextIntent = {
    order: collisionIntents.length,
    ...intent,
  };
  collisionIntents.push(nextIntent);
  return nextIntent;
}

/**
 * Resolve whether the player is currently protected from collision damage.
 *
 * @param {PlayerStore | null | undefined} playerStore - Player gameplay store.
 * @param {HealthStore | null | undefined} healthStore - Health gameplay store.
 * @param {number} entityId - Player entity slot to inspect.
 * @returns {boolean} True when any supported invincibility source is active.
 */
export function isPlayerInvincible(playerStore, healthStore, entityId) {
  if (healthStore?.isInvincible?.[entityId] === 1) {
    return true;
  }

  return (playerStore?.invincibilityMs?.[entityId] || 0) > 0;
}

/**
 * Ensure the system has a scratch buffer sized for the current map.
 *
 * @param {CollisionScratch | null} scratch - Existing closure-local scratch buffer.
 * @param {number} cellCount - Current map cell count.
 * @param {number} maxGhostsPerCell - Current ghost lane count.
 * @returns {CollisionScratch} Reused or newly allocated scratch buffer.
 */
function ensureCollisionScratch(scratch, cellCount, maxGhostsPerCell) {
  if (
    !scratch ||
    scratch.cellCount !== cellCount ||
    scratch.maxGhostsPerCell !== maxGhostsPerCell
  ) {
    return createCollisionScratch(cellCount, maxGhostsPerCell);
  }

  return resetCollisionScratch(scratch);
}

/**
 * Add one ghost entity to the occupancy lanes for a cell.
 *
 * @param {CollisionScratch} scratch - Reusable occupancy scratch buffer.
 * @param {number} cellIndex - Flat cell index receiving the ghost.
 * @param {number} entityId - Ghost entity occupying the cell.
 */
function pushGhostOccupancy(scratch, cellIndex, entityId) {
  const ghostCount = scratch.ghostCounts[cellIndex];
  if (ghostCount >= scratch.maxGhostsPerCell) {
    return;
  }

  scratch.ghostIds[cellIndex * scratch.maxGhostsPerCell + ghostCount] = entityId;
  scratch.ghostCounts[cellIndex] = ghostCount + 1;
}

/**
 * Convert one flat cell index back into tile coordinates.
 *
 * @param {MapResource} mapResource - Map dimensions source.
 * @param {number} cellIndex - Flat cell index to decode.
 * @param {{ row: number, col: number }} outTile - Reusable tile object.
 * @returns {{ row: number, col: number }} The populated tile object.
 */
function readTileFromCellIndex(mapResource, cellIndex, outTile) {
  outTile.row = Math.floor(cellIndex / mapResource.cols);
  outTile.col = cellIndex % mapResource.cols;
  return outTile;
}

/**
 * Populate occupancy lanes for bombs and fire only.
 *
 * These colliders are the inputs for later actor constraint checks, so they
 * must be recorded before player and ghost occupancy is finalized.
 *
 * @param {number[]} entityIds - Queried dynamic entity IDs for this step.
 * @param {MapResource} mapResource - Map resource providing bounds.
 * @param {PositionStore} positionStore - Position component store.
 * @param {ColliderStore} colliderStore - Collider component store.
 * @param {CollisionScratch} scratch - Reusable occupancy scratch buffer.
 * @param {{ row: number, col: number }} reusableTile - Shared temporary tile object.
 */
function buildHazardOccupancy(
  entityIds,
  mapResource,
  positionStore,
  colliderStore,
  scratch,
  reusableTile,
) {
  for (const entityId of entityIds) {
    const tile = readEntityTile(positionStore, entityId, reusableTile);
    const cellIndex = tileToCellIndex(mapResource, tile.row, tile.col);
    if (cellIndex < 0) {
      continue;
    }

    const colliderType = colliderStore.type[entityId];
    if (colliderType === COLLIDER_TYPE.FIRE) {
      scratch.fireByCell[cellIndex] = entityId;
      continue;
    }

    if (colliderType === COLLIDER_TYPE.BOMB) {
      scratch.bombByCell[cellIndex] = entityId;
    }
  }
}

/**
 * Check whether a ghost may legally occupy a ghost-house tile this step.
 *
 * Ghosts may always remain inside or exit the house, but only dead ghosts may
 * enter it from outside.
 *
 * @param {MapResource} mapResource - Map resource with ghost-house geometry.
 * @param {GhostStore | null | undefined} ghostStore - Ghost gameplay store.
 * @param {number} entityId - Ghost entity slot to inspect.
 * @param {{ row: number, col: number }} currentTile - Current ghost tile.
 * @param {{ row: number, col: number }} previousTile - Previous ghost tile.
 * @returns {boolean} True when the current ghost-house occupancy is legal.
 */
function canGhostOccupyGhostHouse(mapResource, ghostStore, entityId, currentTile, previousTile) {
  if (!isGhostHouseCell(mapResource, currentTile.row, currentTile.col)) {
    return true;
  }

  if (isGhostHouseCell(mapResource, previousTile.row, previousTile.col)) {
    return true;
  }

  return (ghostStore?.state?.[entityId] ?? GHOST_STATE.NORMAL) === GHOST_STATE.DEAD;
}

/**
 * Check whether a ghost should be blocked from entering a bomb cell this step.
 *
 * Staying on the same bomb cell is tolerated here because the one-time
 * bomb-drop push-back rule is handled separately from this occupancy check.
 *
 * @param {CollisionScratch} scratch - Reusable occupancy scratch buffer.
 * @param {number} currentCellIndex - Ghost's current flat cell index.
 * @param {number} previousCellIndex - Ghost's previous flat cell index.
 * @returns {boolean} True when the ghost attempted to enter an occupied bomb cell.
 */
function shouldBlockGhostFromBombCell(scratch, currentCellIndex, previousCellIndex) {
  if (scratch.bombByCell[currentCellIndex] === -1) {
    return false;
  }

  return currentCellIndex !== previousCellIndex;
}

/**
 * Enforce ghost-house and bomb-cell occupancy rules by reverting illegal moves.
 *
 * @param {number[]} entityIds - Queried dynamic entity IDs for this step.
 * @param {MapResource} mapResource - Map resource with ghost-house geometry.
 * @param {PositionStore} positionStore - Mutable position store.
 * @param {ColliderStore} colliderStore - Collider component store.
 * @param {GhostStore | null | undefined} ghostStore - Ghost gameplay store.
 * @param {CollisionScratch} scratch - Reusable occupancy scratch buffer.
 * @param {{ row: number, col: number }} currentTile - Shared current-tile object.
 * @param {{ row: number, col: number }} previousTile - Shared previous-tile object.
 */
function enforceOccupancyConstraints(
  entityIds,
  mapResource,
  positionStore,
  colliderStore,
  ghostStore,
  scratch,
  currentTile,
  previousTile,
) {
  for (const entityId of entityIds) {
    const colliderType = colliderStore.type[entityId];
    if (colliderType !== COLLIDER_TYPE.PLAYER && colliderType !== COLLIDER_TYPE.GHOST) {
      continue;
    }

    const current = readEntityTile(positionStore, entityId, currentTile);
    const previous = readPreviousEntityTile(positionStore, entityId, previousTile);
    const currentCellIndex = tileToCellIndex(mapResource, current.row, current.col);
    const previousCellIndex = tileToCellIndex(mapResource, previous.row, previous.col);

    if (colliderType === COLLIDER_TYPE.PLAYER) {
      if (isGhostHouseCell(mapResource, current.row, current.col)) {
        setEntityTile(positionStore, entityId, previous.row, previous.col);
      }
      continue;
    }

    if (!canGhostOccupyGhostHouse(mapResource, ghostStore, entityId, current, previous)) {
      setEntityTile(positionStore, entityId, previous.row, previous.col);
      continue;
    }

    if (
      currentCellIndex >= 0 &&
      previousCellIndex >= 0 &&
      shouldBlockGhostFromBombCell(scratch, currentCellIndex, previousCellIndex)
    ) {
      setEntityTile(positionStore, entityId, previous.row, previous.col);
    }
  }
}

/**
 * Translate one static map power-up cell into the canonical gameplay type name.
 *
 * @param {number} cellType - Static map cell type at the player's tile.
 * @returns {'bombPlus' | 'firePlus' | 'speedBoost' | null} Normalized power-up type.
 */
function readPowerUpTypeFromCell(cellType) {
  if (cellType === CELL_TYPE.POWER_UP_BOMB) {
    return 'bombPlus';
  }

  if (cellType === CELL_TYPE.POWER_UP_FIRE) {
    return 'firePlus';
  }

  if (cellType === CELL_TYPE.POWER_UP_SPEED) {
    return 'speedBoost';
  }

  return null;
}

/**
 * Resolve and record collectible map-cell collisions for one player entity.
 *
 * The map is mutated immediately after a successful pickup so the same tile
 * cannot emit the same collection intent again on the next fixed step.
 *
 * @param {MapResource} mapResource - Mutable static grid resource.
 * @param {Array<object> | null | undefined} collisionIntents - Shared intent buffer.
 * @param {number} entityId - Player entity that may collect the tile.
 * @param {number} row - Player tile row.
 * @param {number} col - Player tile col.
 * @returns {object | null} The appended collection intent, or null when nothing collectible exists.
 */
export function collectStaticPickup(mapResource, collisionIntents, entityId, row, col) {
  const cellType = getCell(mapResource, row, col);

  if (cellType === CELL_TYPE.PELLET) {
    setCell(mapResource, row, col, CELL_TYPE.EMPTY);
    return appendCollisionIntent(collisionIntents, {
      type: 'pellet-collected',
      entityId,
      row,
      col,
    });
  }

  if (cellType === CELL_TYPE.POWER_PELLET) {
    setCell(mapResource, row, col, CELL_TYPE.EMPTY);
    return appendCollisionIntent(collisionIntents, {
      type: 'power-pellet-collected',
      entityId,
      row,
      col,
    });
  }

  const powerUpType = readPowerUpTypeFromCell(cellType);
  if (!powerUpType) {
    return null;
  }

  setCell(mapResource, row, col, CELL_TYPE.EMPTY);
  return appendCollisionIntent(collisionIntents, {
    type: 'power-up-collected',
    entityId,
    row,
    col,
    powerUpType,
  });
}

/**
 * Record final player and ghost occupancy after constraints have been enforced.
 *
 * @param {number[]} entityIds - Queried dynamic entity IDs for this step.
 * @param {MapResource} mapResource - Map resource providing bounds.
 * @param {PositionStore} positionStore - Position component store.
 * @param {ColliderStore} colliderStore - Collider component store.
 * @param {CollisionScratch} scratch - Reusable occupancy scratch buffer.
 * @param {{ row: number, col: number }} reusableTile - Shared temporary tile object.
 */
function buildActorOccupancy(
  entityIds,
  mapResource,
  positionStore,
  colliderStore,
  scratch,
  reusableTile,
) {
  for (const entityId of entityIds) {
    const tile = readEntityTile(positionStore, entityId, reusableTile);
    const cellIndex = tileToCellIndex(mapResource, tile.row, tile.col);
    if (cellIndex < 0) {
      continue;
    }

    const colliderType = colliderStore.type[entityId];
    if (colliderType === COLLIDER_TYPE.PLAYER) {
      scratch.playerByCell[cellIndex] = entityId;
      continue;
    }

    if (colliderType === COLLIDER_TYPE.GHOST) {
      pushGhostOccupancy(scratch, cellIndex, entityId);
    }
  }
}

/**
 * Resolve dynamic fire and ghost-contact collisions for one occupied cell.
 *
 * Collision priority is enforced here as:
 * 1. Invincibility
 * 2. Fire
 * 3. Ghost contact
 *
 * @param {MapResource} mapResource - Map dimensions source.
 * @param {CollisionScratch} scratch - Built occupancy data for this step.
 * @param {number} cellIndex - Flat cell index being resolved.
 * @param {Array<object> | null | undefined} collisionIntents - Shared intent buffer.
 * @param {PlayerStore | null | undefined} playerStore - Player gameplay store.
 * @param {HealthStore | null | undefined} healthStore - Health gameplay store.
 * @param {GhostStore | null | undefined} ghostStore - Ghost gameplay store.
 * @param {{ row: number, col: number }} reusableTile - Shared temporary tile object.
 */
function resolveDynamicCellCollisions(
  mapResource,
  scratch,
  cellIndex,
  collisionIntents,
  playerStore,
  healthStore,
  ghostStore,
  reusableTile,
) {
  const playerId = scratch.playerByCell[cellIndex];
  const fireId = scratch.fireByCell[cellIndex];
  const ghostCount = scratch.ghostCounts[cellIndex];
  const tile = readTileFromCellIndex(mapResource, cellIndex, reusableTile);
  const playerIsInvincible =
    playerId !== -1 && isPlayerInvincible(playerStore, healthStore, playerId);

  if (fireId !== -1) {
    if (playerId !== -1 && !playerIsInvincible) {
      appendCollisionIntent(collisionIntents, {
        type: 'player-death',
        entityId: playerId,
        row: tile.row,
        col: tile.col,
        cause: 'fire',
        sourceEntityId: fireId,
      });
    }

    for (let ghostIndex = 0; ghostIndex < ghostCount; ghostIndex += 1) {
      const ghostId = scratch.ghostIds[cellIndex * scratch.maxGhostsPerCell + ghostIndex];
      const ghostState = ghostStore?.state?.[ghostId] ?? GHOST_STATE.NORMAL;
      if (ghostState === GHOST_STATE.DEAD) {
        continue;
      }

      appendCollisionIntent(collisionIntents, {
        type: 'ghost-death',
        entityId: ghostId,
        row: tile.row,
        col: tile.col,
        cause: 'fire',
        sourceEntityId: fireId,
        ghostState,
      });

      // Marking the ghost dead immediately prevents the same lingering fire
      // tile from emitting duplicate death intents on subsequent fixed steps.
      if (ghostStore?.state) {
        ghostStore.state[ghostId] = GHOST_STATE.DEAD;
      }
    }

    return;
  }

  if (playerId === -1 || playerIsInvincible) {
    return;
  }

  for (let ghostIndex = 0; ghostIndex < ghostCount; ghostIndex += 1) {
    const ghostId = scratch.ghostIds[cellIndex * scratch.maxGhostsPerCell + ghostIndex];
    const ghostState = ghostStore?.state?.[ghostId] ?? GHOST_STATE.NORMAL;
    if (ghostState !== GHOST_STATE.NORMAL) {
      continue;
    }

    appendCollisionIntent(collisionIntents, {
      type: 'player-death',
      entityId: playerId,
      row: tile.row,
      col: tile.col,
      cause: 'ghost',
      sourceEntityId: ghostId,
      ghostState,
    });
    return;
  }
}

/**
 * Create the collision system shell.
 *
 * @param {{
 *   mapResourceKey?: string,
 *   positionResourceKey?: string,
 *   colliderResourceKey?: string,
 *   playerResourceKey?: string,
 *   healthResourceKey?: string,
 *   ghostResourceKey?: string,
 *   collisionIntentsResourceKey?: string,
 *   requiredMask?: number,
 *   maxGhostsPerCell?: number,
 * }} [options] - Optional resource-key overrides for tests and later wiring.
 * @returns {{ name: string, phase: string, resourceCapabilities: object, update: Function }} ECS registration.
 */
export function createCollisionSystem(options = {}) {
  const mapResourceKey = options.mapResourceKey || 'mapResource';
  const positionResourceKey = options.positionResourceKey || 'position';
  const colliderResourceKey = options.colliderResourceKey || 'collider';
  const playerResourceKey = options.playerResourceKey || 'player';
  const healthResourceKey = options.healthResourceKey || 'health';
  const ghostResourceKey = options.ghostResourceKey || 'ghost';
  const collisionIntentsResourceKey = options.collisionIntentsResourceKey || 'collisionIntents';
  const requiredMask = options.requiredMask ?? COLLISION_ENTITY_REQUIRED_MASK;
  const maxGhostsPerCell = options.maxGhostsPerCell ?? DEFAULT_GHOST_SLOTS_PER_CELL;
  let scratch = null;
  const reusableTile = { row: 0, col: 0 };
  const reusableCellTile = { row: 0, col: 0 };
  const reusablePreviousTile = { row: 0, col: 0 };

  return {
    name: 'collision-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [
        mapResourceKey,
        positionResourceKey,
        colliderResourceKey,
        playerResourceKey,
        healthResourceKey,
        ghostResourceKey,
      ],
      write: [collisionIntentsResourceKey],
    },
    update(context) {
      const world = context.world;
      const mapResource = world.getResource(mapResourceKey);
      const positionStore = world.getResource(positionResourceKey);
      const colliderStore = world.getResource(colliderResourceKey);
      const playerStore = world.getResource(playerResourceKey);
      const healthStore = world.getResource(healthResourceKey);
      const ghostStore = world.getResource(ghostResourceKey);
      const collisionIntents = world.getResource(collisionIntentsResourceKey);

      // The shell is intentionally tolerant during early integration so tests
      // and downstream systems can inject resources incrementally.
      if (!mapResource || !positionStore || !colliderStore) {
        return;
      }

      if (Array.isArray(collisionIntents)) {
        clearCollisionIntents(collisionIntents);
      }

      scratch = ensureCollisionScratch(
        scratch,
        mapResource.rows * mapResource.cols,
        maxGhostsPerCell,
      );

      const entityIds = world.query(requiredMask);
      buildHazardOccupancy(
        entityIds,
        mapResource,
        positionStore,
        colliderStore,
        scratch,
        reusableTile,
      );
      enforceOccupancyConstraints(
        entityIds,
        mapResource,
        positionStore,
        colliderStore,
        ghostStore,
        scratch,
        reusableTile,
        reusablePreviousTile,
      );
      buildActorOccupancy(
        entityIds,
        mapResource,
        positionStore,
        colliderStore,
        scratch,
        reusableTile,
      );

      for (const entityId of entityIds) {
        // Only the player can collect static map pickups.
        if (colliderStore.type[entityId] !== COLLIDER_TYPE.PLAYER) {
          continue;
        }

        const tile = readEntityTile(positionStore, entityId, reusableTile);
        const cellIndex = tileToCellIndex(mapResource, tile.row, tile.col);
        if (cellIndex < 0) {
          continue;
        }

        collectStaticPickup(mapResource, collisionIntents, entityId, tile.row, tile.col);
      }

      for (let cellIndex = 0; cellIndex < scratch.cellCount; cellIndex += 1) {
        if (scratch.playerByCell[cellIndex] === -1 && scratch.fireByCell[cellIndex] === -1) {
          if (scratch.ghostCounts[cellIndex] === 0) {
            continue;
          }
        }

        resolveDynamicCellCollisions(
          mapResource,
          scratch,
          cellIndex,
          collisionIntents,
          playerStore,
          healthStore,
          ghostStore,
          reusableCellTile,
        );
      }
    },
  };
}

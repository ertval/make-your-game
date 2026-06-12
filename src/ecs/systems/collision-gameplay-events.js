/*
 * B-05 / B-09 gameplay event surface helpers.
 *
 * This module defines the deterministic event names and payload validation used
 * by gameplay systems when publishing gameplay facts through the D-01
 * event-queue resource. B-05 introduced the collision/movement event surface;
 * B-09 finalizes the full cross-system event contract by adding the remaining
 * canonical event types and their payload schemas so every consumer (audio
 * cues, visual effects, telemetry) reads one stable definition.
 *
 * Public API:
 * - GAMEPLAY_EVENT_TYPE: canonical event type names.
 * - GAMEPLAY_EVENT_SOURCE: canonical source-system labels.
 * - GAME_OVER_CAUSE: canonical GameOver cause discriminants.
 * - emitGameplayEvent(queue, type, payload, frame): validate and enqueue one event.
 * - validateGameplayEventPayload(type, payload): reject malformed gameplay payloads.
 *
 * Implementation notes:
 * - This file lives under `src/ecs/systems/collision-*.js` because current
 *   policy ownership assigns the gameplay event-surface work to Track B system
 *   scope.
 * - The event queue owns the envelope fields `type`, `frame`, and `order`.
 *   Gameplay payloads own `sourceSystem` and any event-specific fields.
 * - Events split into two payload shapes:
 *   1. Spatial events carry `entityId` + `tile` (a concrete entity at a tile):
 *      pickups, contact, position change, bomb placed/detonated, ghost defeated,
 *      life lost.
 *   2. Lifecycle/broadcast events omit `entityId`/`tile` because they describe a
 *      world-level transition with no single owning tile: ghost stunned (all
 *      ghosts), level cleared, game over, victory.
 * - The canonical schema for every type is defined here even when the emission
 *   point lives in another track's system, so the integration branch wiring
 *   those emitters (life/timer/level-progress) and the audio consumer share one
 *   source of truth.
 */

import { enqueue } from '../resources/event-queue.js';

export const GAMEPLAY_EVENT_TYPE = Object.freeze({
  BOMB_PLACED: 'BombPlaced',
  BOMB_DETONATED: 'BombDetonated',
  PELLET_COLLECTED: 'PelletCollected',
  POWER_PELLET_COLLECTED: 'PowerPelletCollected',
  POWER_UP_COLLECTED: 'PowerUpCollected',
  PLAYER_GHOST_CONTACT: 'PlayerGhostContact',
  PLAYER_POSITION_CHANGED: 'PlayerPositionChanged',
  GHOST_DEFEATED: 'GhostDefeated',
  GHOST_STUNNED: 'GhostStunned',
  LIFE_LOST: 'LifeLost',
  LEVEL_CLEARED: 'LevelCleared',
  GAME_OVER: 'GameOver',
  VICTORY: 'Victory',
});

export const GAMEPLAY_EVENT_SOURCE = Object.freeze({
  COLLISION: 'collision-system',
  EXPLOSION: 'explosion-system',
  PLAYER_MOVE: 'player-move-system',
  BOMB_TICK: 'bomb-tick-system',
  POWER_UP: 'power-up-system',
  LIFE: 'life-system',
  TIMER: 'timer-system',
  LEVEL_PROGRESS: 'level-progress-system',
});

export const GAME_OVER_CAUSE = Object.freeze({
  TIME: 'time',
  LIVES: 'lives',
});

const COLLECTIBLE_EVENT_TYPES = new Set([
  GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED,
  GAMEPLAY_EVENT_TYPE.POWER_PELLET_COLLECTED,
  GAMEPLAY_EVENT_TYPE.POWER_UP_COLLECTED,
]);

// Spatial events describe one entity at one tile, so they require the canonical
// entityId + tile base payload. Lifecycle/broadcast events validate only their
// own fields plus sourceSystem.
const SPATIAL_EVENT_TYPES = new Set([
  GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED,
  GAMEPLAY_EVENT_TYPE.POWER_PELLET_COLLECTED,
  GAMEPLAY_EVENT_TYPE.POWER_UP_COLLECTED,
  GAMEPLAY_EVENT_TYPE.PLAYER_GHOST_CONTACT,
  GAMEPLAY_EVENT_TYPE.PLAYER_POSITION_CHANGED,
  GAMEPLAY_EVENT_TYPE.BOMB_PLACED,
  GAMEPLAY_EVENT_TYPE.BOMB_DETONATED,
  GAMEPLAY_EVENT_TYPE.GHOST_DEFEATED,
  GAMEPLAY_EVENT_TYPE.LIFE_LOST,
]);

const POWER_UP_TYPES = new Set(['bombPlus', 'firePlus', 'speedBoost']);

const GAME_OVER_CAUSES = new Set([GAME_OVER_CAUSE.TIME, GAME_OVER_CAUSE.LIVES]);

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isFiniteTile(tile) {
  return (
    tile !== null &&
    typeof tile === 'object' &&
    Number.isFinite(tile.row) &&
    Number.isFinite(tile.col)
  );
}

function requireBasePayload(type, payload) {
  if (typeof type !== 'string' || type.length === 0) {
    throw new TypeError('Gameplay event type must be a non-empty string.');
  }

  if (payload === null || typeof payload !== 'object') {
    throw new TypeError(`Gameplay event "${type}" payload must be an object.`);
  }

  if (typeof payload.sourceSystem !== 'string' || payload.sourceSystem.length === 0) {
    throw new TypeError(`Gameplay event "${type}" requires a sourceSystem string.`);
  }

  // Only spatial events carry an owning entity at a concrete tile. Lifecycle and
  // broadcast events (ghost-stunned, level-cleared, game-over, victory) describe
  // a world-level transition and intentionally omit entityId/tile.
  if (SPATIAL_EVENT_TYPES.has(type)) {
    if (!isNonNegativeInteger(payload.entityId)) {
      throw new TypeError(`Gameplay event "${type}" requires a non-negative integer entityId.`);
    }

    if (!isFiniteTile(payload.tile)) {
      throw new TypeError(`Gameplay event "${type}" requires a finite tile { row, col } payload.`);
    }
  }
}

/**
 * Validate one gameplay event payload before it enters the shared queue.
 *
 * @param {string} type - Canonical GAMEPLAY_EVENT_TYPE value.
 * @param {object} payload - Event-specific payload.
 * @returns {true} True when the payload is valid.
 */
export function validateGameplayEventPayload(type, payload) {
  requireBasePayload(type, payload);

  if (COLLECTIBLE_EVENT_TYPES.has(type)) {
    if (
      type === GAMEPLAY_EVENT_TYPE.POWER_UP_COLLECTED &&
      !POWER_UP_TYPES.has(payload.powerUpType)
    ) {
      throw new TypeError(`Gameplay event "${type}" requires a valid powerUpType.`);
    }

    return true;
  }

  if (type === GAMEPLAY_EVENT_TYPE.PLAYER_GHOST_CONTACT) {
    if (!isNonNegativeInteger(payload.sourceEntityId)) {
      throw new TypeError(`Gameplay event "${type}" requires a sourceEntityId ghost id.`);
    }

    if (!Number.isFinite(payload.ghostState)) {
      throw new TypeError(`Gameplay event "${type}" requires a finite ghostState.`);
    }

    return true;
  }

  if (type === GAMEPLAY_EVENT_TYPE.PLAYER_POSITION_CHANGED) {
    if (!isFiniteTile(payload.previousTile)) {
      throw new TypeError(`Gameplay event "${type}" requires a previousTile.`);
    }

    if (!isFiniteTile(payload.position)) {
      throw new TypeError(`Gameplay event "${type}" requires a finite position.`);
    }

    return true;
  }

  if (type === GAMEPLAY_EVENT_TYPE.BOMB_DETONATED) {
    if (!isNonNegativeInteger(payload.chainDepth)) {
      throw new TypeError(`Gameplay event "${type}" requires a non-negative integer chainDepth.`);
    }

    return true;
  }

  if (type === GAMEPLAY_EVENT_TYPE.BOMB_PLACED) {
    if (!isNonNegativeInteger(payload.ownerId)) {
      throw new TypeError(`Gameplay event "${type}" requires a non-negative integer ownerId.`);
    }

    if (!isNonNegativeInteger(payload.radius)) {
      throw new TypeError(`Gameplay event "${type}" requires a non-negative integer radius.`);
    }

    return true;
  }

  if (type === GAMEPLAY_EVENT_TYPE.GHOST_DEFEATED) {
    if (!isNonNegativeInteger(payload.sourceEntityId)) {
      throw new TypeError(`Gameplay event "${type}" requires a sourceEntityId fire id.`);
    }

    if (!isNonNegativeInteger(payload.chainDepth)) {
      throw new TypeError(`Gameplay event "${type}" requires a non-negative integer chainDepth.`);
    }

    if (!Number.isFinite(payload.ghostState)) {
      throw new TypeError(`Gameplay event "${type}" requires a finite ghostState.`);
    }

    return true;
  }

  if (type === GAMEPLAY_EVENT_TYPE.LIFE_LOST) {
    if (!isNonNegativeInteger(payload.livesRemaining)) {
      throw new TypeError(
        `Gameplay event "${type}" requires a non-negative integer livesRemaining.`,
      );
    }

    return true;
  }

  if (type === GAMEPLAY_EVENT_TYPE.GHOST_STUNNED) {
    if (!isPositiveInteger(payload.stunnedCount)) {
      throw new TypeError(`Gameplay event "${type}" requires a positive integer stunnedCount.`);
    }

    if (!Number.isFinite(payload.durationMs) || payload.durationMs <= 0) {
      throw new TypeError(`Gameplay event "${type}" requires a positive durationMs.`);
    }

    return true;
  }

  if (type === GAMEPLAY_EVENT_TYPE.LEVEL_CLEARED) {
    if (!isPositiveInteger(payload.level)) {
      throw new TypeError(`Gameplay event "${type}" requires a positive integer level.`);
    }

    return true;
  }

  if (type === GAMEPLAY_EVENT_TYPE.GAME_OVER) {
    if (!GAME_OVER_CAUSES.has(payload.cause)) {
      throw new TypeError(`Gameplay event "${type}" requires a valid cause (time|lives).`);
    }

    return true;
  }

  if (type === GAMEPLAY_EVENT_TYPE.VICTORY) {
    // Victory is a pure world-level transition; sourceSystem alone is required.
    return true;
  }

  throw new TypeError(`Unsupported gameplay event type: ${type}`);
}

/**
 * Validate and enqueue a gameplay event through the D-01 event queue resource.
 *
 * @param {EventQueue | null | undefined} queue - Mutable event queue resource.
 * @param {string} type - Canonical GAMEPLAY_EVENT_TYPE value.
 * @param {object} payload - Event-specific payload.
 * @param {number} frame - Fixed-step frame index.
 * @returns {GameEvent | null} Enqueued event or null when no queue is registered.
 */
export function emitGameplayEvent(queue, type, payload, frame) {
  if (!queue || !Array.isArray(queue.events)) {
    return null;
  }

  validateGameplayEventPayload(type, payload);
  enqueue(queue, type, payload, frame);
  return queue.events[queue.events.length - 1] || null;
}

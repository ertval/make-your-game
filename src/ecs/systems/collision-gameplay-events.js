/*
 * B-05 gameplay event surface helpers.
 *
 * This module defines the deterministic event names and payload validation used
 * by Track B simulation systems when publishing gameplay facts through the
 * D-01 event-queue resource.
 *
 * Public API:
 * - GAMEPLAY_EVENT_TYPE: canonical event type names.
 * - GAMEPLAY_EVENT_SOURCE: canonical source-system labels.
 * - emitGameplayEvent(queue, type, payload, frame): validate and enqueue one event.
 * - validateGameplayEventPayload(type, payload): reject malformed gameplay payloads.
 *
 * Implementation notes:
 * - This file lives under `src/ecs/systems/collision-*.js` because current
 *   policy ownership assigns B-05 event-surface work to Track B system scope.
 * - The event queue owns the envelope fields `type`, `frame`, and `order`.
 *   Gameplay payloads own `entityId`, `tile`, `sourceSystem`, and any
 *   event-specific fields.
 */

import { enqueue } from '../resources/event-queue.js';

export const GAMEPLAY_EVENT_TYPE = Object.freeze({
  BOMB_DETONATED: 'BombDetonated',
  PELLET_COLLECTED: 'PelletCollected',
  PLAYER_GHOST_CONTACT: 'PlayerGhostContact',
  PLAYER_POSITION_CHANGED: 'PlayerPositionChanged',
  POWER_PELLET_COLLECTED: 'PowerPelletCollected',
  POWER_UP_COLLECTED: 'PowerUpCollected',
});

export const GAMEPLAY_EVENT_SOURCE = Object.freeze({
  COLLISION: 'collision-system',
  EXPLOSION: 'explosion-system',
  PLAYER_MOVE: 'player-move-system',
});

const COLLECTIBLE_EVENT_TYPES = new Set([
  GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED,
  GAMEPLAY_EVENT_TYPE.POWER_PELLET_COLLECTED,
  GAMEPLAY_EVENT_TYPE.POWER_UP_COLLECTED,
]);

const POWER_UP_TYPES = new Set(['bombPlus', 'firePlus', 'speedBoost']);

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
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

  if (!isNonNegativeInteger(payload.entityId)) {
    throw new TypeError(`Gameplay event "${type}" requires a non-negative integer entityId.`);
  }

  if (!isFiniteTile(payload.tile)) {
    throw new TypeError(`Gameplay event "${type}" requires a finite tile { row, col } payload.`);
  }

  if (typeof payload.sourceSystem !== 'string' || payload.sourceSystem.length === 0) {
    throw new TypeError(`Gameplay event "${type}" requires a sourceSystem string.`);
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

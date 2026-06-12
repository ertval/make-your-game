/*
 * B-07 power-up effect system.
 *
 * This module implements a pure ECS logic system that consumes collision
 * intents emitted by the B-04 collision system and applies the four canonical
 * power-up effects defined in `docs/game-description.md` §4.4 and §3.2:
 *
 *   - Power Pellet (`⚡`)  : stuns every NORMAL ghost for `STUN_MS` (non-stacking).
 *   - Bomb power-up (`💣+`) : increments the player's `maxBombs`.
 *   - Fire power-up (`🔥+`) : increments the player's `fireRadius`.
 *   - Speed boost (`👟`)   : applies a `SPEED_BOOST_MS` speed multiplier window
 *                            (non-stacking reset on re-collection).
 *
 * The system also owns the parallel countdown timers for the stun window per
 * ghost and the speed boost window on the player, decrementing both with the
 * fixed-step delta only while gameplay is PLAYING.
 *
 * Public API:
 * - createPowerUpSystem(options): logic-phase ECS system factory.
 *
 * Implementation notes:
 * - The system never touches the DOM and never imports adapters. All side
 *   effects flow through component stores already owned by other tickets:
 *   `playerStore` (B-01) and `ghostStore` (B-01).
 * - Power Pellet stun does not affect ghosts that are already DEAD; they keep
 *   their respawn lifecycle owned by future Track B/C wiring.
 * - A per-frame guard on the world resource prevents the same collision-intent
 *   snapshot from being re-applied if the system is invoked twice in one frame.
 * - Player invincibility, scoring, and life decrement are intentionally out of
 *   scope here — those belong to `life-system.js` and `scoring-system.js`.
 */

import { COMPONENT_MASK } from '../components/registry.js';
import { GHOST_STATE, SPEED_BOOST_MS, STUN_MS } from '../resources/constants.js';
import { GAME_STATE } from '../resources/game-status.js';
import {
  emitGameplayEvent,
  GAMEPLAY_EVENT_SOURCE,
  GAMEPLAY_EVENT_TYPE,
} from './collision-gameplay-events.js';

const DEFAULT_COLLISION_INTENTS_RESOURCE_KEY = 'collisionIntents';
const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_GHOST_RESOURCE_KEY = 'ghost';
const DEFAULT_PLAYER_RESOURCE_KEY = 'player';
const DEFAULT_PLAYER_ENTITY_RESOURCE_KEY = 'playerEntity';
const DEFAULT_POWER_UP_STATE_RESOURCE_KEY = 'powerUpState';
const DEFAULT_EVENT_QUEUE_RESOURCE_KEY = 'eventQueue';
const MAX_DELTA_MS = 1000;

/**
 * Canonical collision intent type for individual power-up pickups.
 * Matches the value emitted by `collision-system.collectStaticPickup`.
 */
const POWER_UP_COLLECTED_INTENT = 'power-up-collected';

/**
 * Canonical collision intent type for power-pellet pickups.
 * Matches the value emitted by `collision-system.collectStaticPickup`.
 */
const POWER_PELLET_COLLECTED_INTENT = 'power-pellet-collected';

/**
 * Per-collision-intent `powerUpType` strings emitted by the collision system.
 * These are the canonical wire values used between B-04 intents and B-07 here.
 */
const POWER_UP_TYPE = Object.freeze({
  BOMB_PLUS: 'bombPlus',
  FIRE_PLUS: 'firePlus',
  SPEED_BOOST: 'speedBoost',
});

/**
 * Create the default power-up world resource record.
 *
 * The resource lets external systems (HUD, tests, scoring helpers) inspect the
 * remaining stun and speed-boost windows without reaching into typed-array
 * stores. It also carries the per-frame guard that prevents double-processing.
 *
 * @returns {{ stunRemainingMs: number, speedBoostRemainingMs: number, lastProcessedFrame: number | null }}
 */
export function createDefaultPowerUpState() {
  return {
    stunRemainingMs: 0,
    speedBoostRemainingMs: 0,
    lastProcessedFrame: null,
  };
}

function ensurePowerUpState(powerUpState) {
  if (!powerUpState || typeof powerUpState !== 'object') {
    return createDefaultPowerUpState();
  }

  if (!Number.isFinite(powerUpState.stunRemainingMs) || powerUpState.stunRemainingMs < 0) {
    powerUpState.stunRemainingMs = 0;
  }

  if (
    !Number.isFinite(powerUpState.speedBoostRemainingMs) ||
    powerUpState.speedBoostRemainingMs < 0
  ) {
    powerUpState.speedBoostRemainingMs = 0;
  }

  if (!Number.isFinite(powerUpState.lastProcessedFrame)) {
    powerUpState.lastProcessedFrame = null;
  } else {
    powerUpState.lastProcessedFrame = Math.floor(powerUpState.lastProcessedFrame);
  }

  return powerUpState;
}

function readDeltaMs(context) {
  const deltaMs = Number(context?.dtMs ?? 0);
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return 0;
  }

  return Math.min(deltaMs, MAX_DELTA_MS);
}

function readFrameIndex(context) {
  const explicitFrame = context?.frame;
  if (Number.isFinite(explicitFrame)) {
    return Math.floor(explicitFrame);
  }

  const worldFrame = context?.world?.frame;
  if (Number.isFinite(worldFrame)) {
    return Math.floor(worldFrame);
  }

  return null;
}

function readCollisionIntents(intents) {
  return Array.isArray(intents) ? intents : null;
}

/**
 * Restore one ghost slot to NORMAL state when its stun timer reaches zero.
 *
 * @param {{ state: Uint8Array, timerMs: Float64Array }} ghostStore - Ghost component store.
 * @param {number} ghostId - Ghost entity slot index.
 */
function clearGhostStun(ghostStore, ghostId) {
  ghostStore.timerMs[ghostId] = 0;
  // Only restore NORMAL if the ghost was still STUNNED — never overwrite a DEAD
  // ghost mid-respawn, which is owned by another system.
  if (ghostStore.state[ghostId] === GHOST_STATE.STUNNED) {
    ghostStore.state[ghostId] = GHOST_STATE.NORMAL;
  }
}

/**
 * Tick down each stunned ghost's per-entity timer.
 *
 * @param {{ state: Uint8Array, timerMs: Float64Array } | null | undefined} ghostStore - Ghost component store.
 * @param {number[]} ghostEntityIds - Live ghost entity ids.
 * @param {number} deltaMs - Fixed-step delta in milliseconds.
 * @returns {number} Maximum remaining stun across all ghosts (for resource view).
 */
function tickGhostStunTimers(ghostStore, ghostEntityIds, deltaMs) {
  if (!ghostStore?.state || !ghostStore.timerMs) {
    return 0;
  }

  let maxRemainingMs = 0;
  for (const ghostId of ghostEntityIds) {
    if (ghostStore.state[ghostId] !== GHOST_STATE.STUNNED) {
      continue;
    }

    const next = ghostStore.timerMs[ghostId] - deltaMs;
    if (next <= 0) {
      clearGhostStun(ghostStore, ghostId);
      continue;
    }

    ghostStore.timerMs[ghostId] = next;
    if (next > maxRemainingMs) {
      maxRemainingMs = next;
    }
  }

  return maxRemainingMs;
}

/**
 * Tick down the player's speed-boost timer and clear the flag on expiry.
 *
 * @param {{ speedBoostMs: Float64Array, isSpeedBoosted: Uint8Array } | null} playerStore - Player component store.
 * @param {number} entityId - Player entity slot index.
 * @param {number} deltaMs - Fixed-step delta in milliseconds.
 * @returns {number} Remaining speed-boost milliseconds after this tick.
 */
function tickPlayerSpeedBoost(playerStore, entityId, deltaMs) {
  if (!playerStore?.speedBoostMs || !playerStore.isSpeedBoosted) {
    return 0;
  }

  if (!Number.isInteger(entityId) || entityId < 0) {
    return 0;
  }

  const remaining = playerStore.speedBoostMs[entityId];
  if (remaining <= 0) {
    playerStore.isSpeedBoosted[entityId] = 0;
    return 0;
  }

  const next = remaining - deltaMs;
  if (next <= 0) {
    playerStore.speedBoostMs[entityId] = 0;
    playerStore.isSpeedBoosted[entityId] = 0;
    return 0;
  }

  playerStore.speedBoostMs[entityId] = next;
  playerStore.isSpeedBoosted[entityId] = 1;
  return next;
}

/**
 * Apply a Power Pellet collection: stun every NORMAL ghost for the canonical STUN_MS duration.
 *
 * Already-stunned ghosts have their timers reset (non-stacking refresh). DEAD
 * ghosts mid-respawn are intentionally left alone — the design treats their
 * lifecycle as owned by the respawn pipeline.
 *
 * @param {{ state: Uint8Array, timerMs: Float64Array } | null | undefined} ghostStore - Ghost component store.
 * @param {number[]} ghostEntityIds - Live ghost entity ids.
 * @returns {number} Number of ghosts whose stun timer was set or refreshed.
 */
function applyPowerPellet(ghostStore, ghostEntityIds) {
  if (!ghostStore?.state || !ghostStore.timerMs) {
    return 0;
  }

  let stunnedCount = 0;
  for (const ghostId of ghostEntityIds) {
    const currentState = ghostStore.state[ghostId];
    if (currentState === GHOST_STATE.DEAD) {
      continue;
    }

    ghostStore.state[ghostId] = GHOST_STATE.STUNNED;
    ghostStore.timerMs[ghostId] = STUN_MS;
    stunnedCount += 1;
  }

  return stunnedCount;
}

/**
 * Apply one collected power-up's effect to the player component store.
 *
 * @param {{
 *   maxBombs: Uint8Array,
 *   fireRadius: Uint8Array,
 *   speedBoostMs: Float64Array,
 *   isSpeedBoosted: Uint8Array,
 * } | null} playerStore - Player component store.
 * @param {number} entityId - Player entity slot index.
 * @param {string} powerUpType - Canonical power-up type string.
 * @returns {boolean} True when the effect was applied.
 */
function applyPowerUpToPlayer(playerStore, entityId, powerUpType) {
  if (!playerStore || !Number.isInteger(entityId) || entityId < 0) {
    return false;
  }

  switch (powerUpType) {
    case POWER_UP_TYPE.BOMB_PLUS: {
      if (!playerStore.maxBombs) {
        return false;
      }
      // Clamp to the typed-array element range to avoid wraparound on Uint8Array.
      const next = playerStore.maxBombs[entityId] + 1;
      playerStore.maxBombs[entityId] = Math.min(255, next);
      return true;
    }
    case POWER_UP_TYPE.FIRE_PLUS: {
      if (!playerStore.fireRadius) {
        return false;
      }
      const next = playerStore.fireRadius[entityId] + 1;
      playerStore.fireRadius[entityId] = Math.min(255, next);
      return true;
    }
    case POWER_UP_TYPE.SPEED_BOOST: {
      if (!playerStore.speedBoostMs || !playerStore.isSpeedBoosted) {
        return false;
      }
      // Non-stacking: collecting a second boost resets the window rather than
      // adding on top of the previous remaining time.
      playerStore.speedBoostMs[entityId] = SPEED_BOOST_MS;
      playerStore.isSpeedBoosted[entityId] = 1;
      return true;
    }
    default:
      return false;
  }
}

/**
 * Resolve the player entity slot index from the world handle resource.
 *
 * @param {{ id?: number } | null | undefined} playerEntity - Player entity handle resource.
 * @returns {number} Entity slot index or -1 when no player is registered.
 */
function resolvePlayerEntityId(playerEntity) {
  if (!playerEntity || !Number.isInteger(playerEntity.id) || playerEntity.id < 0) {
    return -1;
  }

  return playerEntity.id;
}

/**
 * Create the logic-phase power-up effect system.
 *
 * The system reads collision intents produced by the B-04 collision system in
 * the same fixed step and applies their effects to player and ghost stores. It
 * also owns the parallel countdown timers for stun and speed boost windows.
 *
 * @param {{
 *   collisionIntentsResourceKey?: string,
 *   gameStatusResourceKey?: string,
 *   ghostResourceKey?: string,
 *   playerResourceKey?: string,
 *   playerEntityResourceKey?: string,
 *   powerUpStateResourceKey?: string,
 * }} [options] - Optional resource-key overrides for tests and later wiring.
 * @returns {{ name: string, phase: string, resourceCapabilities: object, update: Function }} ECS registration.
 */
export function createPowerUpSystem(options = {}) {
  const collisionIntentsResourceKey =
    options.collisionIntentsResourceKey || DEFAULT_COLLISION_INTENTS_RESOURCE_KEY;
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const ghostResourceKey = options.ghostResourceKey || DEFAULT_GHOST_RESOURCE_KEY;
  const playerResourceKey = options.playerResourceKey || DEFAULT_PLAYER_RESOURCE_KEY;
  const playerEntityResourceKey =
    options.playerEntityResourceKey || DEFAULT_PLAYER_ENTITY_RESOURCE_KEY;
  const powerUpStateResourceKey =
    options.powerUpStateResourceKey || DEFAULT_POWER_UP_STATE_RESOURCE_KEY;
  // B-09: thread the event queue so a Power Pellet stun publishes GhostStunned.
  const eventQueueResourceKey = options.eventQueueResourceKey || DEFAULT_EVENT_QUEUE_RESOURCE_KEY;

  return {
    name: 'power-up-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [
        collisionIntentsResourceKey,
        gameStatusResourceKey,
        ghostResourceKey,
        playerEntityResourceKey,
        playerResourceKey,
      ],
      write: [ghostResourceKey, playerResourceKey, powerUpStateResourceKey, eventQueueResourceKey],
    },
    update(context) {
      const world = context.world;
      const gameStatus = world.getResource(gameStatusResourceKey);
      const playerStore = world.getResource(playerResourceKey);
      const ghostStore = world.getResource(ghostResourceKey);
      const playerEntity = world.getResource(playerEntityResourceKey);
      const eventQueue = world.getResource(eventQueueResourceKey);
      const intents = readCollisionIntents(world.getResource(collisionIntentsResourceKey));
      const powerUpState = ensurePowerUpState(world.getResource(powerUpStateResourceKey));
      // The resource is always reseated so the contract is "after update, this
      // key holds the canonical record" regardless of mutate-in-place vs replace.
      world.setResource(powerUpStateResourceKey, powerUpState);

      if (gameStatus?.currentState !== GAME_STATE.PLAYING) {
        return;
      }

      // The duplicate-frame guard runs before any timer ticks so a second call
      // in the same frame is a true no-op: timers never decrement twice and
      // collected intents never get applied twice.
      const frameIndex = readFrameIndex(context);
      if (frameIndex !== null && powerUpState.lastProcessedFrame === frameIndex) {
        return;
      }

      const playerEntityId = resolvePlayerEntityId(playerEntity);
      // Live ghost entity ids are queried via the canonical component mask so
      // the system stays compatible with deferred ghost spawning (B-08).
      const ghostEntityIds =
        typeof world.query === 'function' ? world.query(COMPONENT_MASK.GHOST) : [];

      const deltaMs = readDeltaMs(context);
      // Tick parallel countdowns first so collected intents in this same step
      // overwrite the timer with a fresh window (non-stacking refresh).
      const maxStunRemaining = tickGhostStunTimers(ghostStore, ghostEntityIds, deltaMs);
      const playerSpeedRemaining =
        playerEntityId >= 0 ? tickPlayerSpeedBoost(playerStore, playerEntityId, deltaMs) : 0;
      powerUpState.stunRemainingMs = maxStunRemaining;
      powerUpState.speedBoostRemainingMs = playerSpeedRemaining;

      if (intents !== null && intents.length > 0) {
        for (const intent of intents) {
          if (!intent) {
            continue;
          }

          if (intent.type === POWER_PELLET_COLLECTED_INTENT) {
            const stunnedCount = applyPowerPellet(ghostStore, ghostEntityIds);
            // Only refresh the HUD-facing window when at least one ghost was
            // actually stunned (e.g. skipped entirely when all ghosts are DEAD).
            if (stunnedCount > 0) {
              powerUpState.stunRemainingMs = STUN_MS;
              // B-09: GhostStunned is a broadcast fact (all NORMAL ghosts at
              // once), so it carries the stunned count and window rather than a
              // single owning entity/tile.
              emitGameplayEvent(
                eventQueue,
                GAMEPLAY_EVENT_TYPE.GHOST_STUNNED,
                {
                  durationMs: STUN_MS,
                  sourceSystem: GAMEPLAY_EVENT_SOURCE.POWER_UP,
                  stunnedCount,
                },
                frameIndex,
              );
            }
            continue;
          }

          if (intent.type !== POWER_UP_COLLECTED_INTENT) {
            continue;
          }

          const applied = applyPowerUpToPlayer(playerStore, playerEntityId, intent.powerUpType);
          if (applied && intent.powerUpType === POWER_UP_TYPE.SPEED_BOOST) {
            powerUpState.speedBoostRemainingMs = SPEED_BOOST_MS;
          }
        }
      }

      powerUpState.lastProcessedFrame = frameIndex;
    },
  };
}

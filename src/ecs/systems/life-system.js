/*
 * C-02 player life and respawn protection system.
 *
 * Cross-track note: This file is owned by Track C but was modified by Track A
 * (ekaramet/bugfix-P1-track-A) — the ARCH-02 entity-store refactor required
 * changes to the respawn API call sites. Bugfix-mode policy permits this.
 *
 * This module implements a pure ECS logic system that manages player lives,
 * death consumption, temporary invincibility, explicit respawn signaling,
 * and terminal game-over transitions entirely through world resources. It
 * consumes collision-driven death intents deterministically and mutates only
 * the shared gameplay resources needed for life-state progression.
 *
 * Public API:
 * - createLifeSystem(options)
 *
 * Implementation notes:
 * - The player life state lives in a mutable `playerLife` resource so the
 *   system has no hidden side effects outside the world resource graph.
 * - The system consumes structured collision intents from the shared
 *   `collisionIntents` buffer, matching the B-04 collision contract.
 * - Invincibility timing is driven only by the injected fixed-step delta on
 *   the system context, which keeps the logic deterministic and unit-testable
 *   with no browser coupling.
 */

import { resetInputState } from '../components/actors.js';
import { resetPosition, resetVelocity } from '../components/spatial.js';
import { INVINCIBILITY_MS, PLAYER_START_LIVES } from '../resources/constants.js';
import { canTransition, GAME_STATE, transitionTo } from '../resources/game-status.js';
import { readEntityTile } from '../shared/tile-utils.js';
import {
  emitGameplayEvent,
  GAME_OVER_CAUSE,
  GAMEPLAY_EVENT_SOURCE,
  GAMEPLAY_EVENT_TYPE,
} from './collision-gameplay-events.js';

const DEFAULT_COLLISION_INTENTS_RESOURCE_KEY = 'collisionIntents';
const DEFAULT_EVENT_QUEUE_RESOURCE_KEY = 'eventQueue';
const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_INPUT_STATE_RESOURCE_KEY = 'inputState';
const DEFAULT_MAP_RESOURCE_KEY = 'mapResource';
const DEFAULT_PLAYER_ENTITY_RESOURCE_KEY = 'playerEntity';
const DEFAULT_PLAYER_RESOURCE_KEY = 'player';
const DEFAULT_PLAYER_LIFE_RESOURCE_KEY = 'playerLife';
const DEFAULT_POSITION_RESOURCE_KEY = 'position';
const DEFAULT_RESPAWN_INTENT_RESOURCE_KEY = 'respawnIntent';
const DEFAULT_VELOCITY_RESOURCE_KEY = 'velocity';
const MAX_DELTA_MS = 1000;

function createDefaultPlayerLife() {
  return {
    lives: PLAYER_START_LIVES,
    isInvincible: false,
    invincibilityRemainingMs: 0,
  };
}

function ensurePlayerLifeResource(playerLife) {
  if (!playerLife || typeof playerLife !== 'object') {
    return createDefaultPlayerLife();
  }

  if (!Number.isFinite(playerLife.lives)) {
    playerLife.lives = PLAYER_START_LIVES;
  }

  playerLife.lives = Math.max(0, Math.floor(playerLife.lives));
  playerLife.isInvincible = playerLife.isInvincible === true;

  if (!Number.isFinite(playerLife.invincibilityRemainingMs)) {
    playerLife.invincibilityRemainingMs = 0;
  }

  if (playerLife.invincibilityRemainingMs <= 0) {
    playerLife.invincibilityRemainingMs = 0;
    playerLife.isInvincible = false;
  }

  return playerLife;
}

function getDeltaMs(context) {
  const deltaMs = Number(context.dtMs ?? 0);
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return 0;
  }

  return Math.min(deltaMs, MAX_DELTA_MS);
}

function tickInvincibility(playerLife, deltaMs) {
  if (!playerLife.isInvincible) {
    return;
  }

  playerLife.invincibilityRemainingMs = Math.max(0, playerLife.invincibilityRemainingMs - deltaMs);

  if (playerLife.invincibilityRemainingMs === 0) {
    playerLife.isInvincible = false;
  }
}

function syncPlayerInvincibility(playerStore, playerEntity, playerLife) {
  const entityId = playerEntity?.id;
  if (!playerStore || !Number.isInteger(entityId) || !playerStore.invincibilityMs) {
    return;
  }

  playerStore.invincibilityMs[entityId] = playerLife.invincibilityRemainingMs;
}

function respawnPlayerEntity(world, resources, playerLife) {
  const {
    inputStateResourceKey,
    mapResourceKey,
    playerEntityResourceKey,
    playerResourceKey,
    positionResourceKey,
    velocityResourceKey,
  } = resources;
  const mapResource = world.getResource(mapResourceKey);
  const playerEntity = world.getResource(playerEntityResourceKey);

  if (
    !mapResource ||
    !Number.isFinite(mapResource.playerSpawnRow) ||
    !Number.isFinite(mapResource.playerSpawnCol) ||
    !world.isEntityAlive(playerEntity)
  ) {
    return;
  }

  const entityId = playerEntity.id;
  const playerStore = world.getResource(playerResourceKey);
  const positionStore = world.getResource(positionResourceKey);
  const velocityStore = world.getResource(velocityResourceKey);
  const inputState = world.getResource(inputStateResourceKey);
  const spawnRow = mapResource.playerSpawnRow;
  const spawnCol = mapResource.playerSpawnCol;

  if (positionStore) {
    resetPosition(positionStore, entityId);
    positionStore.row[entityId] = spawnRow;
    positionStore.col[entityId] = spawnCol;
    positionStore.prevRow[entityId] = spawnRow;
    positionStore.prevCol[entityId] = spawnCol;
    positionStore.targetRow[entityId] = spawnRow;
    positionStore.targetCol[entityId] = spawnCol;
  }

  if (velocityStore) {
    resetVelocity(velocityStore, entityId);
  }

  if (inputState) {
    resetInputState(inputState, entityId);
  }

  if (playerStore) {
    // Respawn clears transient movement/boost state without resetting persistent upgrades.
    if (playerStore.speedBoostMs) {
      playerStore.speedBoostMs[entityId] = 0;
    }
    if (playerStore.isSpeedBoosted) {
      playerStore.isSpeedBoosted[entityId] = 0;
    }
    if (playerStore.invincibilityMs) {
      playerStore.invincibilityMs[entityId] = playerLife.invincibilityRemainingMs;
    }
  }
}

function triggerGameOver(gameStatus) {
  if (gameStatus && canTransition(gameStatus, GAME_STATE.GAME_OVER)) {
    transitionTo(gameStatus, GAME_STATE.GAME_OVER);
  }
}

function hasPlayerDeathIntent(collisionIntents) {
  if (!Array.isArray(collisionIntents)) {
    return false;
  }

  return collisionIntents.some((intent) => intent?.type === 'player-death');
}

export function createLifeSystem(options = {}) {
  const collisionIntentsResourceKey =
    options.collisionIntentsResourceKey || DEFAULT_COLLISION_INTENTS_RESOURCE_KEY;
  const eventQueueResourceKey = options.eventQueueResourceKey || DEFAULT_EVENT_QUEUE_RESOURCE_KEY;
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const inputStateResourceKey = options.inputStateResourceKey || DEFAULT_INPUT_STATE_RESOURCE_KEY;
  const mapResourceKey = options.mapResourceKey || DEFAULT_MAP_RESOURCE_KEY;
  const playerEntityResourceKey =
    options.playerEntityResourceKey || DEFAULT_PLAYER_ENTITY_RESOURCE_KEY;
  const playerResourceKey = options.playerResourceKey || DEFAULT_PLAYER_RESOURCE_KEY;
  const playerLifeResourceKey = options.playerLifeResourceKey || DEFAULT_PLAYER_LIFE_RESOURCE_KEY;
  const positionResourceKey = options.positionResourceKey || DEFAULT_POSITION_RESOURCE_KEY;
  const respawnIntentResourceKey =
    options.respawnIntentResourceKey || DEFAULT_RESPAWN_INTENT_RESOURCE_KEY;
  const velocityResourceKey = options.velocityResourceKey || DEFAULT_VELOCITY_RESOURCE_KEY;

  return {
    name: 'life-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [
        collisionIntentsResourceKey,
        gameStatusResourceKey,
        inputStateResourceKey,
        mapResourceKey,
        playerEntityResourceKey,
        playerResourceKey,
        playerLifeResourceKey,
        positionResourceKey,
        respawnIntentResourceKey,
        velocityResourceKey,
      ],
      write: [
        eventQueueResourceKey,
        gameStatusResourceKey,
        inputStateResourceKey,
        playerResourceKey,
        playerLifeResourceKey,
        positionResourceKey,
        respawnIntentResourceKey,
        velocityResourceKey,
      ],
    },
    update(context) {
      const gameStatus = context.world.getResource(gameStatusResourceKey);
      const deathIntent = hasPlayerDeathIntent(
        context.world.getResource(collisionIntentsResourceKey),
      );
      let playerLife = context.world.getResource(playerLifeResourceKey);

      playerLife = ensurePlayerLifeResource(playerLife);
      context.world.setResource(playerLifeResourceKey, playerLife);
      // Reset per-tick respawn signaling up front so the resource is always defined
      // and never leaks a previous-frame event into the next fixed step.
      context.world.setResource(respawnIntentResourceKey, false);

      if (gameStatus?.currentState === GAME_STATE.PLAYING) {
        tickInvincibility(playerLife, getDeltaMs(context));
      }
      syncPlayerInvincibility(
        context.world.getResource(playerResourceKey),
        context.world.getResource(playerEntityResourceKey),
        playerLife,
      );

      const canHandleDeath =
        deathIntent === true &&
        playerLife.isInvincible === false &&
        gameStatus?.currentState === GAME_STATE.PLAYING;

      if (!canHandleDeath) {
        return;
      }

      // Capture the player's tile before any respawn snaps it back to spawn, so
      // the spatial LifeLost payload reports the actual death location.
      const eventQueue = context.world.getResource(eventQueueResourceKey);
      const playerEntity = context.world.getResource(playerEntityResourceKey);
      const positionStore = context.world.getResource(positionResourceKey);
      const playerId = playerEntity?.id;
      const hasSpatialContext =
        Number.isInteger(playerId) && playerId >= 0 && positionStore != null;
      const deathTile = hasSpatialContext ? readEntityTile(positionStore, playerId) : null;

      playerLife.lives = Math.max(0, playerLife.lives - 1);

      // LifeLost is a spatial event; only emit when we have a concrete entity at
      // a finite tile (the validator rejects NaN tiles, and a throw inside a
      // system update would quarantine it). emitGameplayEvent is itself a no-op
      // when the queue is absent.
      if (deathTile && Number.isFinite(deathTile.row) && Number.isFinite(deathTile.col)) {
        emitGameplayEvent(
          eventQueue,
          GAMEPLAY_EVENT_TYPE.LIFE_LOST,
          {
            entityId: playerId,
            livesRemaining: playerLife.lives,
            sourceSystem: GAMEPLAY_EVENT_SOURCE.LIFE,
            tile: { row: deathTile.row, col: deathTile.col },
          },
          context.frame,
        );
      }

      if (playerLife.lives === 0) {
        context.world.setResource(respawnIntentResourceKey, false);
        triggerGameOver(gameStatus);
        // GameOver is a lifecycle event (no owning tile); emitted after LifeLost
        // so consumers observe the canonical "LifeLost → GameOver" ordering.
        emitGameplayEvent(
          eventQueue,
          GAMEPLAY_EVENT_TYPE.GAME_OVER,
          {
            cause: GAME_OVER_CAUSE.LIVES,
            sourceSystem: GAMEPLAY_EVENT_SOURCE.LIFE,
          },
          context.frame,
        );
        return;
      }

      playerLife.isInvincible = true;
      playerLife.invincibilityRemainingMs = INVINCIBILITY_MS;
      respawnPlayerEntity(
        context.world,
        {
          inputStateResourceKey,
          mapResourceKey,
          playerEntityResourceKey,
          playerResourceKey,
          positionResourceKey,
          velocityResourceKey,
        },
        playerLife,
      );
      context.world.setResource(respawnIntentResourceKey, true);
    },
  };
}

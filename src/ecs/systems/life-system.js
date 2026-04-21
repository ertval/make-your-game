/*
 * C-02 player life and respawn protection system.
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

const DEFAULT_COLLISION_INTENTS_RESOURCE_KEY = 'collisionIntents';
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
    !world.entityStore.isAlive(playerEntity)
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

      playerLife.lives = Math.max(0, playerLife.lives - 1);

      if (playerLife.lives === 0) {
        context.world.setResource(respawnIntentResourceKey, false);
        triggerGameOver(gameStatus);
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

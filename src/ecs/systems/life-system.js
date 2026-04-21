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
 * - The system clears the shared `deathIntent` resource every update so one
 *   collision signal cannot decrement lives across multiple fixed steps.
 * - Invincibility timing is driven only by the injected clock resource, which
 *   keeps the logic deterministic and unit-testable with no browser coupling.
 */

import { INVINCIBILITY_MS, PLAYER_START_LIVES } from '../resources/constants.js';
import { canTransition, GAME_STATE, transitionTo } from '../resources/game-status.js';

const DEFAULT_CLOCK_RESOURCE_KEY = 'clock';
const DEFAULT_DEATH_INTENT_RESOURCE_KEY = 'deathIntent';
const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_PLAYER_LIFE_RESOURCE_KEY = 'playerLife';
const DEFAULT_RESPAWN_INTENT_RESOURCE_KEY = 'respawnIntent';

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

function getDeltaMs(clock) {
  const deltaMs = clock?.deltaMs;
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return 0;
  }

  return deltaMs;
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

function triggerGameOver(gameStatus) {
  if (gameStatus && canTransition(gameStatus, GAME_STATE.GAME_OVER)) {
    transitionTo(gameStatus, GAME_STATE.GAME_OVER);
  }
}

export function createLifeSystem(options = {}) {
  const clockResourceKey = options.clockResourceKey || DEFAULT_CLOCK_RESOURCE_KEY;
  const deathIntentResourceKey =
    options.deathIntentResourceKey || DEFAULT_DEATH_INTENT_RESOURCE_KEY;
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const playerLifeResourceKey = options.playerLifeResourceKey || DEFAULT_PLAYER_LIFE_RESOURCE_KEY;
  const respawnIntentResourceKey =
    options.respawnIntentResourceKey || DEFAULT_RESPAWN_INTENT_RESOURCE_KEY;

  return {
    name: 'life-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [
        clockResourceKey,
        deathIntentResourceKey,
        gameStatusResourceKey,
        playerLifeResourceKey,
        respawnIntentResourceKey,
      ],
      write: [
        deathIntentResourceKey,
        gameStatusResourceKey,
        playerLifeResourceKey,
        respawnIntentResourceKey,
      ],
    },
    update(context) {
      const clock = context.world.getResource(clockResourceKey);
      const gameStatus = context.world.getResource(gameStatusResourceKey);
      const deathIntent = context.world.getResource(deathIntentResourceKey) === true;
      let playerLife = context.world.getResource(playerLifeResourceKey);

      playerLife = ensurePlayerLifeResource(playerLife);
      context.world.setResource(playerLifeResourceKey, playerLife);
      // Reset per-tick respawn signaling up front so the resource is always defined
      // and never leaks a previous-frame event into the next fixed step.
      context.world.setResource(respawnIntentResourceKey, false);
      // Consume death intent deterministically every tick after snapshotting it.
      context.world.setResource(deathIntentResourceKey, false);

      tickInvincibility(playerLife, getDeltaMs(clock));

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
      context.world.setResource(respawnIntentResourceKey, true);
    },
  };
}

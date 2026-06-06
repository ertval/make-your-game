/**
 * D-08: HUD Rendering System
 *
 * Syncs the data-only gameplay resources (timer, score, lives) to the DOM HUD elements.
 * When a hudAdapter world resource is registered, it delegates formatting and DOM updates
 * to the adapter. Otherwise it falls back to direct textContent writes on bare DOM refs.
 *
 * Public API:
 * - createHudSystem(options)
 */

const DEFAULT_TIMER_RESOURCE_KEY = 'levelTimer';
const DEFAULT_SCORE_RESOURCE_KEY = 'scoreState';
const DEFAULT_PLAYER_LIFE_RESOURCE_KEY = 'playerLife';
const DEFAULT_PLAYER_RESOURCE_KEY = 'player';
const DEFAULT_PLAYER_ENTITY_RESOURCE_KEY = 'playerEntity';
const DEFAULT_HUD_ELEMENTS_RESOURCE_KEY = 'hudElements';
const DEFAULT_HUD_ADAPTER_RESOURCE_KEY = 'hudAdapter';
const DEFAULT_LEVEL_LOADER_RESOURCE_KEY = 'levelLoader';

/**
 * Resolve one player power-up stat (max bombs / fire radius) from the player
 * store, returning a safe fallback when no live player entity is registered.
 *
 * @param {{ id?: number } | null | undefined} playerEntity - Player entity handle resource.
 * @param {Uint8Array | null | undefined} statArray - Typed-array column to read.
 * @returns {number} Stat value for the current player, or 0 when unavailable.
 */
function readPlayerStat(playerEntity, statArray) {
  if (!statArray || !playerEntity || !Number.isInteger(playerEntity.id) || playerEntity.id < 0) {
    return 0;
  }

  return statArray[playerEntity.id] ?? 0;
}

export function createHudSystem(options = {}) {
  const timerResourceKey = options.timerResourceKey || DEFAULT_TIMER_RESOURCE_KEY;
  const scoreResourceKey = options.scoreResourceKey || DEFAULT_SCORE_RESOURCE_KEY;
  const playerLifeResourceKey = options.playerLifeResourceKey || DEFAULT_PLAYER_LIFE_RESOURCE_KEY;
  const playerResourceKey = options.playerResourceKey || DEFAULT_PLAYER_RESOURCE_KEY;
  const playerEntityResourceKey =
    options.playerEntityResourceKey || DEFAULT_PLAYER_ENTITY_RESOURCE_KEY;
  const hudElementsResourceKey =
    options.hudElementsResourceKey || DEFAULT_HUD_ELEMENTS_RESOURCE_KEY;
  const hudAdapterResourceKey = options.hudAdapterResourceKey || DEFAULT_HUD_ADAPTER_RESOURCE_KEY;
  const levelLoaderResourceKey =
    options.levelLoaderResourceKey || DEFAULT_LEVEL_LOADER_RESOURCE_KEY;

  return {
    name: 'hud-system',
    phase: 'render',
    resourceCapabilities: {
      read: [
        timerResourceKey,
        scoreResourceKey,
        playerLifeResourceKey,
        playerResourceKey,
        playerEntityResourceKey,
        hudElementsResourceKey,
        hudAdapterResourceKey,
        levelLoaderResourceKey,
      ],
    },
    update(context) {
      const hudAdapter = context.world.getResource(hudAdapterResourceKey);

      if (hudAdapter && typeof hudAdapter.update === 'function') {
        const timerState = context.world.getResource(timerResourceKey);
        const scoreState = context.world.getResource(scoreResourceKey);
        const playerLife = context.world.getResource(playerLifeResourceKey);
        const playerStore = context.world.getResource(playerResourceKey);
        const playerEntity = context.world.getResource(playerEntityResourceKey);
        const levelLoader = context.world.getResource(levelLoaderResourceKey);
        const levelIndex = levelLoader?.getCurrentLevelIndex?.() ?? 0;

        hudAdapter.update({
          lives: playerLife?.lives ?? 0,
          score: scoreState?.totalPoints ?? 0,
          timer: Math.ceil(timerState?.remainingSeconds ?? 0),
          bombs: readPlayerStat(playerEntity, playerStore?.maxBombs),
          fire: readPlayerStat(playerEntity, playerStore?.fireRadius),
          level: levelIndex + 1,
        });
        return;
      }

      const hud = context.world.getResource(hudElementsResourceKey);
      if (!hud) return;

      const timerState = context.world.getResource(timerResourceKey);
      if (timerState && hud.timer) {
        const seconds = Math.ceil(timerState.remainingSeconds || 0);
        hud.timer.textContent = `Timer: ${seconds}`;
      }

      const scoreState = context.world.getResource(scoreResourceKey);
      if (scoreState && hud.score) {
        hud.score.textContent = `Score: ${scoreState.totalPoints || 0}`;
      }

      const playerLife = context.world.getResource(playerLifeResourceKey);
      if (playerLife && hud.lives) {
        hud.lives.textContent = `Lives: ${playerLife.lives ?? 0}`;
      }
    },
  };
}

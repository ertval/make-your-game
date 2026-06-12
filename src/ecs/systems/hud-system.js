/**
 * D-08 / ARCH-01: HUD data system.
 *
 * Reads the data-only gameplay resources (timer, score, lives, power-up stats,
 * level) and writes a plain HUD snapshot into the `hudState` resource buffer.
 *
 * This system performs NO DOM access and holds no adapter reference: per the
 * DOM-isolation rule (AGENTS.md § DOM Isolation), simulation/logic systems must
 * not call DOM APIs. The render-phase `hud-render-system` reads the `hudState`
 * buffer and delegates DOM writes to the HUD adapter.
 *
 * Public API:
 * - createHudSystem(options)
 */

const DEFAULT_TIMER_RESOURCE_KEY = 'levelTimer';
const DEFAULT_SCORE_RESOURCE_KEY = 'scoreState';
const DEFAULT_PLAYER_LIFE_RESOURCE_KEY = 'playerLife';
const DEFAULT_PLAYER_RESOURCE_KEY = 'player';
const DEFAULT_PLAYER_ENTITY_RESOURCE_KEY = 'playerEntity';
const DEFAULT_LEVEL_LOADER_RESOURCE_KEY = 'levelLoader';
const DEFAULT_HUD_STATE_RESOURCE_KEY = 'hudState';

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

/**
 * Create a fresh, data-only HUD snapshot object.
 *
 * @returns {{ lives: number, score: number, timer: number, bombs: number, fire: number, level: number }}
 */
export function createHudState() {
  return {
    lives: 0,
    score: 0,
    timer: 0,
    bombs: 0,
    fire: 0,
    level: 1,
  };
}

export function createHudSystem(options = {}) {
  const timerResourceKey = options.timerResourceKey || DEFAULT_TIMER_RESOURCE_KEY;
  const scoreResourceKey = options.scoreResourceKey || DEFAULT_SCORE_RESOURCE_KEY;
  const playerLifeResourceKey = options.playerLifeResourceKey || DEFAULT_PLAYER_LIFE_RESOURCE_KEY;
  const playerResourceKey = options.playerResourceKey || DEFAULT_PLAYER_RESOURCE_KEY;
  const playerEntityResourceKey =
    options.playerEntityResourceKey || DEFAULT_PLAYER_ENTITY_RESOURCE_KEY;
  const levelLoaderResourceKey =
    options.levelLoaderResourceKey || DEFAULT_LEVEL_LOADER_RESOURCE_KEY;
  const hudStateResourceKey = options.hudStateResourceKey || DEFAULT_HUD_STATE_RESOURCE_KEY;

  return {
    name: 'hud-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [
        timerResourceKey,
        scoreResourceKey,
        playerLifeResourceKey,
        playerResourceKey,
        playerEntityResourceKey,
        levelLoaderResourceKey,
      ],
      write: [hudStateResourceKey],
    },
    update(context) {
      const world = context.world;
      const timerState = world.getResource(timerResourceKey);
      const scoreState = world.getResource(scoreResourceKey);
      const playerLife = world.getResource(playerLifeResourceKey);
      const playerStore = world.getResource(playerResourceKey);
      const playerEntity = world.getResource(playerEntityResourceKey);
      const levelLoader = world.getResource(levelLoaderResourceKey);
      const levelIndex = levelLoader?.getCurrentLevelIndex?.() ?? 0;

      // Reuse the existing buffer object so downstream consumers and tests can
      // hold a stable reference across frames; create one lazily otherwise.
      const hudState = world.getResource(hudStateResourceKey) || createHudState();

      hudState.lives = playerLife?.lives ?? 0;
      hudState.score = scoreState?.totalPoints ?? 0;
      hudState.timer = Math.ceil(timerState?.remainingSeconds ?? 0);
      hudState.bombs = readPlayerStat(playerEntity, playerStore?.maxBombs);
      hudState.fire = readPlayerStat(playerEntity, playerStore?.fireRadius);
      hudState.level = levelIndex + 1;

      world.setResource(hudStateResourceKey, hudState);
    },
  };
}

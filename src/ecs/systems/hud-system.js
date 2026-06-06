/**
 * D-08: HUD Rendering System
 *
 * Syncs the data-only gameplay resources (timer, score, lives, bombs, fire) to
 * the DOM HUD elements. When a hudAdapter world resource is registered, the
 * system delegates formatting and DOM updates to the adapter — the adapter's
 * own setTextContentIfChanged guard means the system can safely pass raw values
 * each frame without per-frame churn. Otherwise the system falls back to
 * direct textContent writes on bare DOM refs exposed by the bootstrap.
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
      const world = context.world;
      const playerStore = world.getResource(playerResourceKey);
      const playerEntity = world.getResource(playerEntityResourceKey);
      const playerId =
        playerEntity && Number.isInteger(playerEntity.id) && playerEntity.id >= 0
          ? playerEntity.id
          : -1;
      const bombs = playerStore && playerId >= 0 ? (playerStore.maxBombs?.[playerId] ?? 0) : 0;
      const fire = playerStore && playerId >= 0 ? (playerStore.fireRadius?.[playerId] ?? 0) : 0;

      const hudAdapter = world.getResource(hudAdapterResourceKey);

      if (hudAdapter && typeof hudAdapter.update === 'function') {
        const timerState = world.getResource(timerResourceKey);
        const scoreState = world.getResource(scoreResourceKey);
        const playerLife = world.getResource(playerLifeResourceKey);
        const levelLoader = world.getResource(levelLoaderResourceKey);
        const levelIndex = levelLoader?.getCurrentLevelIndex?.() ?? 0;

        hudAdapter.update({
          lives: playerLife?.lives ?? 0,
          score: scoreState?.totalPoints ?? 0,
          timer: Math.ceil(timerState?.remainingSeconds ?? 0),
          bombs,
          fire,
          level: levelIndex + 1,
        });
        return;
      }

      const hud = world.getResource(hudElementsResourceKey);
      if (!hud) return;

      const timerState = world.getResource(timerResourceKey);
      if (timerState && hud.timer) {
        const seconds = Math.ceil(timerState.remainingSeconds || 0);
        hud.timer.textContent = `Timer: ${seconds}`;
      }

      const scoreState = world.getResource(scoreResourceKey);
      if (scoreState && hud.score) {
        hud.score.textContent = `Score: ${scoreState.totalPoints || 0}`;
      }

      const playerLife = world.getResource(playerLifeResourceKey);
      if (playerLife && hud.lives) {
        hud.lives.textContent = `Lives: ${playerLife.lives ?? 0}`;
      }

      if (hud.bombs) {
        hud.bombs.textContent = `Bombs: ${bombs}`;
      }
      if (hud.fire) {
        hud.fire.textContent = `Fire: ${fire}`;
      }
    },
  };
}

/**
 * D-08: HUD Rendering System
 *
 * Syncs the data-only gameplay resources (timer, score, lives) to the DOM HUD elements.
 * This is the only system besides render-dom-system allowed to perform DOM writes.
 * It enforces the AGENTS.md requirement for batched DOM commits in the render phase.
 *
 * Public API:
 * - createHudSystem(options)
 */

const DEFAULT_TIMER_RESOURCE_KEY = 'levelTimer';
const DEFAULT_SCORE_RESOURCE_KEY = 'scoreState';
const DEFAULT_PLAYER_LIFE_RESOURCE_KEY = 'playerLife';
const DEFAULT_HUD_ELEMENTS_RESOURCE_KEY = 'hudElements';

export function createHudSystem(options = {}) {
  const timerResourceKey = options.timerResourceKey || DEFAULT_TIMER_RESOURCE_KEY;
  const scoreResourceKey = options.scoreResourceKey || DEFAULT_SCORE_RESOURCE_KEY;
  const playerLifeResourceKey = options.playerLifeResourceKey || DEFAULT_PLAYER_LIFE_RESOURCE_KEY;
  const hudElementsResourceKey =
    options.hudElementsResourceKey || DEFAULT_HUD_ELEMENTS_RESOURCE_KEY;

  return {
    name: 'hud-system',
    phase: 'render',
    resourceCapabilities: {
      read: [timerResourceKey, scoreResourceKey, playerLifeResourceKey, hudElementsResourceKey],
    },
    update(context) {
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

/**
 * ARCH-01: HUD render system.
 *
 * Render-phase consumer that reads the data-only `hudState` buffer produced by
 * `hud-system` and delegates DOM updates to the HUD adapter. This is the single
 * boundary at which HUD data reaches the DOM, keeping simulation/logic systems
 * DOM-free (AGENTS.md § DOM Isolation).
 *
 * Public API:
 * - createHudRenderSystem(options)
 */

const DEFAULT_HUD_STATE_RESOURCE_KEY = 'hudState';
const DEFAULT_HUD_ADAPTER_RESOURCE_KEY = 'hudAdapter';

export function createHudRenderSystem(options = {}) {
  const hudStateResourceKey = options.hudStateResourceKey || DEFAULT_HUD_STATE_RESOURCE_KEY;
  const hudAdapterResourceKey = options.hudAdapterResourceKey || DEFAULT_HUD_ADAPTER_RESOURCE_KEY;

  return {
    name: 'hud-render-system',
    phase: 'render',
    resourceCapabilities: {
      read: [hudStateResourceKey, hudAdapterResourceKey],
    },
    update(context) {
      const world = context.world;
      const hudAdapter = world.getResource(hudAdapterResourceKey);

      if (!hudAdapter || typeof hudAdapter.update !== 'function') {
        return;
      }

      const hudState = world.getResource(hudStateResourceKey);
      if (!hudState) {
        return;
      }

      hudAdapter.update({
        lives: hudState.lives,
        score: hudState.score,
        timer: hudState.timer,
        bombs: hudState.bombs,
        fire: hudState.fire,
        level: hudState.level,
      });
    },
  };
}

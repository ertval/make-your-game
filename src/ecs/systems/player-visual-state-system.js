/**
 * Player visual-state mirror system.
 *
 * Bridges the canonical `playerStore.isSpeedBoosted` flag (owned by the B-07
 * power-up system) into `visualState.classBits[VISUAL_FLAGS.SPEED_BOOST]` so
 * render-dom-system can emit the `.is-speed-boosted` CSS class on the player
 * sprite.
 *
 * Public API:
 * - createPlayerVisualStateSystem(options): logic-phase ECS system factory.
 *
 * Implementation notes:
 * - The system is intentionally read-only on the player store: B-07 owns the
 *   `isSpeedBoosted` flag and its countdown timer. This system just mirrors
 *   the boolean into the visual-state bitmask.
 * - Only the SPEED_BOOST bit is touched. STUNNED, DEAD, INVINCIBLE, and HIDDEN
 *   bits are owned by other systems (life-system, ghost-animation-system, …)
 *   and must survive a transition unchanged. The bitwise `& ~VISUAL_FLAGS.SPEED_BOOST`
 *   mask is the standard pattern for "refresh only my owned bit".
 * - Mirroring runs in the same logic phase as the power-up system but is
 *   registered after it so the new flag set by a freshly-collected boost is
 *   visible on the very next render commit (same frame, no one-frame lag).
 * - The system never touches the DOM, never imports adapters, and only
 *   mutates the typed-array `visualState.classBits` slot owned by the ECS
 *   world resource API. This keeps the simulation/UI boundary intact per
 *   AGENTS.md ECS rules.
 */

import { VISUAL_FLAGS } from '../resources/constants.js';

const DEFAULT_PLAYER_RESOURCE_KEY = 'player';
const DEFAULT_VISUAL_STATE_RESOURCE_KEY = 'visualState';
const DEFAULT_PLAYER_ENTITY_RESOURCE_KEY = 'playerEntity';

/**
 * Resolve the player entity slot index from the world handle resource.
 *
 * Mirrors the helper used by other logic-phase systems; centralised here so
 * the visual-state system stays independent of bootstrap wiring.
 *
 * @param {{ id?: number, generation?: number } | null | undefined} playerEntity
 *   Player entity handle resource.
 * @returns {number} Entity slot index or -1 when no player is registered.
 */
function resolvePlayerEntityId(playerEntity) {
  if (!playerEntity || !Number.isInteger(playerEntity.id) || playerEntity.id < 0) {
    return -1;
  }

  return playerEntity.id;
}

/**
 * Create the logic-phase player visual-state mirror system.
 *
 * Reads the canonical player store and writes the SPEED_BOOST bit on the
 * visual-state bitmask for the current player entity. Other bits (STUNNED,
 * DEAD, INVINCIBLE, HIDDEN) are preserved bit-for-bit.
 *
 * @param {{
 *   playerResourceKey?: string,
 *   visualStateResourceKey?: string,
 *   playerEntityResourceKey?: string,
 * }} [options] - Resource-key overrides for tests and later wiring.
 * @returns {{
 *   name: string,
 *   phase: string,
 *   resourceCapabilities: { read: string[], write: string[] },
 *   update: Function,
 * }} ECS registration.
 */
export function createPlayerVisualStateSystem(options = {}) {
  const playerResourceKey = options.playerResourceKey || DEFAULT_PLAYER_RESOURCE_KEY;
  const visualStateResourceKey =
    options.visualStateResourceKey || DEFAULT_VISUAL_STATE_RESOURCE_KEY;
  const playerEntityResourceKey =
    options.playerEntityResourceKey || DEFAULT_PLAYER_ENTITY_RESOURCE_KEY;

  return {
    name: 'player-visual-state-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [playerEntityResourceKey, playerResourceKey],
      write: [visualStateResourceKey],
    },
    update(context) {
      const world = context.world;
      const playerEntity = world.getResource(playerEntityResourceKey);
      const playerStore = world.getResource(playerResourceKey);
      const visualState = world.getResource(visualStateResourceKey);

      // Missing-resource guard: tests and partial-bootstrap runs can omit any
      // of these; treat that as "nothing to mirror" rather than throwing, so
      // the system never crashes the frame loop.
      if (!playerStore || !visualState) {
        return;
      }

      const playerId = resolvePlayerEntityId(playerEntity);
      if (playerId < 0) {
        return;
      }

      // Only the SPEED_BOOST bit is owned by this system. Refresh it without
      // disturbing the STUNNED/DEAD/INVINCIBLE/HIDDEN bits other systems
      // manage — masking out the owned bit and re-ORing it on the resolved
      // boolean gives a one-line, allocation-free transition.
      const isBoosted = playerStore.isSpeedBoosted?.[playerId] === 1;
      const currentBits = visualState.classBits[playerId] ?? 0;
      const nextBits = isBoosted
        ? currentBits | VISUAL_FLAGS.SPEED_BOOST
        : currentBits & ~VISUAL_FLAGS.SPEED_BOOST;
      visualState.classBits[playerId] = nextBits;
    },
  };
}

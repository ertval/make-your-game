/**
 * D-10 ghost animation system.
 *
 * Mirrors player-animation-system for ghosts: converts each released ghost's
 * velocity + state into the `renderable.spriteId` and `visualState.classBits`
 * that render-dom-system needs to pick the right per-ghost sprite (walk frame,
 * stunned, or dead variant).
 *
 * Public API:
 * - GHOST_ANIMATION_REQUIRED_MASK: canonical query mask for ghost animation.
 * - GHOST_WALK_FRAME_INTERVAL_MS: timer between walk-cycle frame swaps.
 * - createGhostAnimationSystem(options): logic-phase ECS system factory.
 *
 * Implementation notes:
 * - The system runs in the `logic` phase, before render-collect-system reads
 *   `renderable.spriteId`. It must run after ghost-ai-system (physics phase
 *   already runs first) so the velocity it reads is the current step's value.
 * - Direction is derived from `velocity.rowDelta` / `velocity.colDelta`. When a
 *   ghost is between tile centers (velocity = 0) the previous spriteId is
 *   preserved so the sprite does not flicker back to idle.
 * - Frame index is global across all ghosts so the walk-cycle stays in sync.
 *   Per-ghost direction lives implicitly in the spriteId that was last written.
 * - Ghost state (NORMAL / STUNNED / DEAD) is mirrored into the VISUAL_FLAGS
 *   bitmask on `visualState.classBits`. Render-dom-system reads those bits to
 *   apply the `.sprite--ghost--stunned` / `.sprite--ghost--dead` overrides.
 */

import { COMPONENT_MASK } from '../components/registry.js';
import { GHOST_STATE, VISUAL_FLAGS } from '../resources/constants.js';

/** Time between walk-cycle frame swaps in milliseconds. */
export const GHOST_WALK_FRAME_INTERVAL_MS = 150;

/**
 * Sprite IDs match render-dom-system's GHOST_SPRITE_FRAMES table. The ID values
 * mirror PLAYER_SPRITE_CLASSES so the same indices map to the same direction
 * walk frames across player and ghost rendering tables.
 */
const SPRITE_ID = Object.freeze({
  IDLE: 0,
  WALK_UP_01: 2,
  WALK_UP_02: 3,
  WALK_DOWN_01: 4,
  WALK_DOWN_02: 5,
  WALK_LEFT_01: 6,
  WALK_LEFT_02: 7,
  WALK_RIGHT_01: 8,
  WALK_RIGHT_02: 9,
});

const WALK_FRAMES = Object.freeze({
  up: [SPRITE_ID.WALK_UP_01, SPRITE_ID.WALK_UP_02],
  down: [SPRITE_ID.WALK_DOWN_01, SPRITE_ID.WALK_DOWN_02],
  left: [SPRITE_ID.WALK_LEFT_01, SPRITE_ID.WALK_LEFT_02],
  right: [SPRITE_ID.WALK_RIGHT_01, SPRITE_ID.WALK_RIGHT_02],
});

/** Component bits a ghost must have before it appears on the render side. */
export const GHOST_ANIMATION_REQUIRED_MASK =
  COMPONENT_MASK.GHOST | COMPONENT_MASK.VELOCITY | COMPONENT_MASK.RENDERABLE;

const STATE_FLAG_MASK = VISUAL_FLAGS.STUNNED | VISUAL_FLAGS.DEAD;

/**
 * Build the ghost animation system.
 *
 * @param {{
 *   ghostResourceKey?: string,
 *   velocityResourceKey?: string,
 *   renderableResourceKey?: string,
 *   visualStateResourceKey?: string,
 *   requiredMask?: number,
 * }} [options] - Resource key overrides.
 * @returns {object} ECS logic-phase system descriptor.
 */
export function createGhostAnimationSystem(options = {}) {
  const ghostKey = options.ghostResourceKey || 'ghost';
  const velocityKey = options.velocityResourceKey || 'velocity';
  const renderableKey = options.renderableResourceKey || 'renderable';
  const visualStateKey = options.visualStateResourceKey || 'visualState';
  const requiredMask = options.requiredMask ?? GHOST_ANIMATION_REQUIRED_MASK;

  let walkTimer = 0;
  let frameIndex = 0;

  return {
    name: 'ghost-animation-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [ghostKey, velocityKey],
      write: [renderableKey, visualStateKey],
    },
    update(context) {
      const ghost = context.world.getResource(ghostKey);
      const velocity = context.world.getResource(velocityKey);
      const renderable = context.world.getResource(renderableKey);
      const visualState = context.world.getResource(visualStateKey);
      if (!ghost || !velocity || !renderable || !visualState) {
        return;
      }

      const dtMs = Number(context.dtMs) || 0;
      walkTimer += dtMs;
      if (walkTimer >= GHOST_WALK_FRAME_INTERVAL_MS) {
        walkTimer -= GHOST_WALK_FRAME_INTERVAL_MS;
        frameIndex = 1 - frameIndex;
      }

      const ghostIds = context.world.query(requiredMask);

      for (const id of ghostIds) {
        const state = ghost.state[id];

        // Refresh the STUNNED / DEAD bits without disturbing flags owned by
        // other systems (INVINCIBLE, HIDDEN, SPEED_BOOST).
        let classBits = visualState.classBits[id] & ~STATE_FLAG_MASK;
        if (state === GHOST_STATE.STUNNED) {
          classBits |= VISUAL_FLAGS.STUNNED;
        } else if (state === GHOST_STATE.DEAD) {
          classBits |= VISUAL_FLAGS.DEAD;
        }
        visualState.classBits[id] = classBits;

        const rowDelta = velocity.rowDelta[id];
        const colDelta = velocity.colDelta[id];

        let direction = null;
        if (rowDelta < 0) direction = 'up';
        else if (rowDelta > 0) direction = 'down';
        else if (colDelta < 0) direction = 'left';
        else if (colDelta > 0) direction = 'right';

        if (!direction) {
          // Hold the previous spriteId. A ghost briefly snaps to velocity = 0
          // when it reaches a tile center; flipping to IDLE here would cause a
          // single-frame flicker every tile crossing.
          continue;
        }

        renderable.spriteId[id] = WALK_FRAMES[direction][frameIndex];
      }
    },
  };
}

/*
 * D-07: Render Collect System
 *
 * Runs after simulation and before the DOM commit phase. Queries all entities
 * that have both a Position and a Renderable component via the ECS query index,
 * computes interpolated tile-space coordinates using the frame alpha, and writes
 * one render intent per entity into the preallocated render-intent buffer.
 *
 * Public API:
 * - RENDER_COLLECT_REQUIRED_MASK: canonical query mask for Position + Renderable.
 * - createRenderCollectSystem(options)
 *
 * Implementation notes:
 * - Alpha is the fractional progress between the previous fixed step and the
 *   current one: x = prevCol + (col - prevCol) * alpha.
 * - Entity selection is driven by world.query(RENDER_COLLECT_REQUIRED_MASK) so
 *   only entities with both Position and Renderable component bits set are
 *   collected. This is the same pattern used by input-system and
 *   player-move-system.
 * - world.query() returns entity IDs in ascending order, giving stable and
 *   deterministic intent ordering across frames.
 * - This system never touches the DOM. All output is plain data in the buffer.
 * - Opacity encodes invincibility: invincible entities render at half opacity
 *   (128/255) so the player blinks visually without hiding completely.
 */

import { COMPONENT_MASK } from '../components/registry.js';
import { appendRenderIntent, resetRenderIntentBuffer } from '../render-intent.js';
import { VISUAL_FLAGS } from '../resources/constants.js';

const DEFAULT_RENDERABLE_RESOURCE_KEY = 'renderable';
const DEFAULT_VISUAL_STATE_RESOURCE_KEY = 'visualState';
const DEFAULT_POSITION_RESOURCE_KEY = 'position';
const DEFAULT_RENDER_INTENT_BUFFER_RESOURCE_KEY = 'renderIntentBuffer';

const OPACITY_FULL = 255;
const OPACITY_INVINCIBLE = 128;

/**
 * Canonical component query mask for the render collect system.
 * Only entities with both Position and Renderable bits set are collected.
 */
export const RENDER_COLLECT_REQUIRED_MASK = COMPONENT_MASK.POSITION | COMPONENT_MASK.RENDERABLE;

export function createRenderCollectSystem(options = {}) {
  const renderableResourceKey = options.renderableResourceKey || DEFAULT_RENDERABLE_RESOURCE_KEY;
  const visualStateResourceKey =
    options.visualStateResourceKey || DEFAULT_VISUAL_STATE_RESOURCE_KEY;
  const positionResourceKey = options.positionResourceKey || DEFAULT_POSITION_RESOURCE_KEY;
  const renderIntentBufferResourceKey =
    options.renderIntentBufferResourceKey || DEFAULT_RENDER_INTENT_BUFFER_RESOURCE_KEY;
  const requiredMask = options.requiredMask ?? RENDER_COLLECT_REQUIRED_MASK;

  return {
    name: 'render-collect-system',
    phase: 'collect',
    resourceCapabilities: {
      read: [renderableResourceKey, visualStateResourceKey, positionResourceKey],
      write: [renderIntentBufferResourceKey],
    },
    update(context) {
      const renderable = context.world.getResource(renderableResourceKey);
      const position = context.world.getResource(positionResourceKey);
      const buffer = context.world.getResource(renderIntentBufferResourceKey);

      if (!renderable || !position || !buffer) {
        return;
      }

      const visualState = context.world.getResource(visualStateResourceKey);
      const alpha = Number.isFinite(context.alpha) ? Math.max(0, Math.min(1, context.alpha)) : 1;

      resetRenderIntentBuffer(buffer);

      // Use the ECS query index to select only entities with Position + Renderable.
      // world.query() returns IDs in ascending order for stable, deterministic output.
      const entityIds = context.world.query(requiredMask);

      for (const id of entityIds) {
        const prevRow = position.prevRow[id];
        const prevCol = position.prevCol[id];
        const row = position.row[id];
        const col = position.col[id];

        const x = prevCol + (col - prevCol) * alpha;
        const y = prevRow + (row - prevRow) * alpha;

        const classBits = visualState ? visualState.classBits[id] : 0;
        const isInvincible = (classBits & VISUAL_FLAGS.INVINCIBLE) !== 0;
        const opacity = isInvincible ? OPACITY_INVINCIBLE : OPACITY_FULL;

        appendRenderIntent(buffer, {
          entityId: id,
          kind: renderable.kind[id],
          spriteId: renderable.spriteId[id],
          x,
          y,
          classBits,
          opacity,
        });
      }
    },
  };
}

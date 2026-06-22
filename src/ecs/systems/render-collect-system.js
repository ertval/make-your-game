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
 * - This system runs in the 'render' phase (via World.runRenderCommit) so it
 *   executes after all fixed-step simulation phases and before any DOM commit
 *   system registered later in the same render phase. Register this system
 *   before render-dom-system to guarantee collect → commit ordering.
 * - This system never touches the DOM. All output is plain data in the buffer.
 * - Opacity encodes invincibility: invincible entities render at half opacity
 *   (128/255) so the player blinks visually without hiding completely.
 */

import { COMPONENT_MASK } from '../components/registry.js';
import { COLLIDER_TYPE } from '../components/spatial.js';
import { RENDERABLE_KIND } from '../components/visual.js';
import { BOMB_FUSE_MS, FIRE_DURATION_MS, VISUAL_FLAGS } from '../resources/constants.js';
import { appendRenderIntentDirect } from '../resources/render-intent.js';

/**
 * Number of fire-tile animation frames. Matches the count of
 * `explosion-{01..NN}.webp` assets and the `FIRE_SPRITE_CLASSES` table in
 * render-dom-system.js. Frame 0 is the brightest peak, frame N-1 is the
 * dim "embers" tail.
 */
const FIRE_ANIMATION_FRAMES = 4;

/**
 * Number of bomb fuse-animation frames. Matches the `BOMB_SPRITE_CLASSES`
 * table in render-dom-system.js (bomb-idle, bomb-fuse-01..03). Frame 0 is the
 * freshly-placed idle bomb; frame N-1 is the fuse burnt down to the wick just
 * before detonation.
 */
const BOMB_ANIMATION_FRAMES = 4;

const DEFAULT_RENDERABLE_RESOURCE_KEY = 'renderable';
const DEFAULT_VISUAL_STATE_RESOURCE_KEY = 'visualState';
const DEFAULT_POSITION_RESOURCE_KEY = 'position';
const DEFAULT_RENDER_INTENT_BUFFER_RESOURCE_KEY = 'renderIntent';
const DEFAULT_BOMB_RESOURCE_KEY = 'bomb';
const DEFAULT_FIRE_RESOURCE_KEY = 'fire';
const DEFAULT_COLLIDER_RESOURCE_KEY = 'collider';

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
  const bombResourceKey = options.bombResourceKey || DEFAULT_BOMB_RESOURCE_KEY;
  const fireResourceKey = options.fireResourceKey || DEFAULT_FIRE_RESOURCE_KEY;
  const colliderResourceKey = options.colliderResourceKey || DEFAULT_COLLIDER_RESOURCE_KEY;
  const requiredMask = options.requiredMask ?? RENDER_COLLECT_REQUIRED_MASK;

  return {
    name: 'render-collect-system',
    phase: 'render',
    resourceCapabilities: {
      read: [
        renderableResourceKey,
        visualStateResourceKey,
        positionResourceKey,
        bombResourceKey,
        fireResourceKey,
        colliderResourceKey,
      ],
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

      // Buffer reset is owned by the bootstrap frame setup (resetRenderIntentBuffer
      // is called before world.runRenderCommit). The collect system appends only.

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

        // Use allocation-free direct write to avoid per-entity object creation.
        appendRenderIntentDirect(
          buffer,
          id,
          renderable.kind[id],
          renderable.spriteId[id],
          x,
          y,
          classBits,
          opacity,
        );
      }

      // Issue #84 — bombs and fires are placed by Track B systems
      // (bomb-tick-system, explosion-system) that don't set the RENDERABLE
      // component mask. They DO populate the position store + their own
      // dedicated stores (bomb / fire), so we scan those stores directly and
      // emit render intents tile-aligned (no alpha lerp; they don't move).
      //
      // CANONICAL ACTIVE MARKER: `colliderStore.type[id]`. The bomb / fire
      // gameplay systems set the collider type on activation
      // (COLLIDER_TYPE.BOMB / COLLIDER_TYPE.FIRE) and reset it to
      // COLLIDER_TYPE.NONE on detonation / expiration — they do NOT reset
      // `bombStore.ownerId` or `fireStore.sourceBombId`. Using the collider
      // type as the activity check matches `bomb-tick-system.isActiveBomb()`
      // and `explosion-system`'s lifecycle markers, so stale slots stop
      // emitting intents the instant they go inactive (otherwise the bomb /
      // fire sprite stays stuck on the board and the render-dom cleanup loop
      // never releases the pooled element).
      const colliderStore = context.world.getResource(colliderResourceKey);
      const bombStore = context.world.getResource(bombResourceKey);
      if (colliderStore?.type && bombStore?.row && bombStore?.col) {
        const slots = colliderStore.type.length;
        for (let id = 0; id < slots; id += 1) {
          if (colliderStore.type[id] !== COLLIDER_TYPE.BOMB) continue;
          const classBits = visualState ? visualState.classBits[id] : 0;

          // Map remaining fuse time to a 0..N-1 frame index. fuseMs counts
          // DOWN from BOMB_FUSE_MS to 0, so progress = 1 - (fuse / duration).
          // Frame 0 (idle) shows just after placement; frame N-1 (fuse burnt
          // to the wick) shows right before detonation. Clamped so rounding
          // past the bounds still resolves to a valid sprite class.
          const fuse = bombStore.fuseMs[id];
          const progress = BOMB_FUSE_MS > 0 ? 1 - fuse / BOMB_FUSE_MS : 0;
          let spriteId = Math.floor(progress * BOMB_ANIMATION_FRAMES);
          if (spriteId < 0) spriteId = 0;
          else if (spriteId >= BOMB_ANIMATION_FRAMES) spriteId = BOMB_ANIMATION_FRAMES - 1;

          appendRenderIntentDirect(
            buffer,
            id,
            RENDERABLE_KIND.BOMB,
            spriteId,
            bombStore.col[id],
            bombStore.row[id],
            classBits,
            OPACITY_FULL,
          );
        }
      }

      const fireStore = context.world.getResource(fireResourceKey);
      if (colliderStore?.type && fireStore?.row && fireStore?.col) {
        const slots = colliderStore.type.length;
        for (let id = 0; id < slots; id += 1) {
          if (colliderStore.type[id] !== COLLIDER_TYPE.FIRE) continue;
          const classBits = visualState ? visualState.classBits[id] : 0;

          // Map remaining burn time to a 0..N-1 frame index. burnTimerMs
          // counts DOWN from FIRE_DURATION_MS to 0, so progress = 1 - (timer
          // / duration). Frame 0 is shown at the start (peak), frame N-1 at
          // the very end (embers). Clamped so any rounding past the bounds
          // still picks a valid sprite class.
          const timer = fireStore.burnTimerMs[id];
          const progress = FIRE_DURATION_MS > 0 ? 1 - timer / FIRE_DURATION_MS : 0;
          let spriteId = Math.floor(progress * FIRE_ANIMATION_FRAMES);
          if (spriteId < 0) spriteId = 0;
          else if (spriteId >= FIRE_ANIMATION_FRAMES) spriteId = FIRE_ANIMATION_FRAMES - 1;

          appendRenderIntentDirect(
            buffer,
            id,
            RENDERABLE_KIND.FIRE,
            spriteId,
            fireStore.col[id],
            fireStore.row[id],
            classBits,
            OPACITY_FULL,
          );
        }
      }
    },
  };
}

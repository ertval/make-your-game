/**
 * D-08: Render DOM System (The Batcher)
 *
 * The ONLY system where DOM mutates. Consumes render intents from the buffer
 * filled by render-collect-system and applies batched writes to the DOM via
 * the sprite pool adapter.
 *
 * Public API:
 * - createRenderDomSystem(options)
 *
 * Implementation notes:
 * - Runs in the 'render' phase, after render-collect-system. Both D-07 and D-08
 *   use the 'render' phase; they execute in registration order within that phase.
 * - Applies batched writes: transform translate3d, opacity, classList changes.
 * - Acquires sprites from pool for each render intent.
 * - Releases sprites from entities no longer rendered.
 * - Tile-to-pixel conversion uses TILE_SIZE_PX constant.
 * - classBits (VISUAL_FLAGS) mapped to CSS classes for state (stunned, dead, etc).
 * - Opacity conversion: byte (0-255) to CSS string (0-1).
 * - This is the ONLY system that touches the DOM.
 */

import { RENDERABLE_KIND, VISUAL_FLAGS } from '../components/visual.js';

const DEFAULT_RENDER_INTENT_RESOURCE_KEY = 'renderIntent';
const DEFAULT_SPRITE_POOL_RESOURCE_KEY = 'spritePool';

const TILE_SIZE_PX = 32;

/**
 * Map RENDERABLE_KIND to sprite pool type keys.
 * Note: WALL uses 'wall' but the pool doesn't have a wall type - walls are rendered
 * as static grid cells via renderer-adapter, so entities with WALL kind shouldn't
 * normally reach this system. POWER_UP falls back to 'pellet' pool since that's the
 * closest available type.
 */
const KIND_TO_SPRITE_TYPE = {
  [RENDERABLE_KIND.PLAYER]: 'player',
  [RENDERABLE_KIND.GHOST]: 'ghost',
  [RENDERABLE_KIND.BOMB]: 'bomb',
  [RENDERABLE_KIND.FIRE]: 'fire',
  [RENDERABLE_KIND.PELLET]: 'pellet',
  [RENDERABLE_KIND.POWER_UP]: 'pellet', // fallback to pellet pool
  [RENDERABLE_KIND.WALL]: null, // walls are static, not rendered as sprites
};

/**
 * CSS class mappings for each kind.
 */
const KIND_TO_CLASSES = {
  [RENDERABLE_KIND.PLAYER]: ['sprite--player'],
  [RENDERABLE_KIND.GHOST]: ['sprite--ghost'],
  [RENDERABLE_KIND.BOMB]: ['sprite--bomb'],
  [RENDERABLE_KIND.FIRE]: ['sprite--fire'],
  [RENDERABLE_KIND.PELLET]: ['sprite--pellet'],
  [RENDERABLE_KIND.POWER_UP]: ['sprite--powerup'],
  [RENDERABLE_KIND.WALL]: ['sprite--wall'],
};

/**
 * Convert opacity byte (0-255) to CSS opacity string.
 */
function opacityToCss(byte) {
  return (byte / 255).toFixed(3);
}

/**
 * Apply classList changes for visual flags.
 * @param {Element} el
 * @param {number} classBits - VISUAL_FLAGS bitmask
 */
function applyVisualFlagClasses(el, classBits) {
  if ((classBits & VISUAL_FLAGS.HIDDEN) !== 0) {
    el.style.display = 'none';
  }
  if ((classBits & VISUAL_FLAGS.STUNNED) !== 0) {
    el.classList.add('sprite--ghost--stunned');
  }
  if ((classBits & VISUAL_FLAGS.DEAD) !== 0) {
    el.classList.add('sprite--ghost--dead');
  }
  if ((classBits & VISUAL_FLAGS.SPEED_BOOST) !== 0) {
    el.classList.add('sprite--player--speed-boost');
  }
}

export function createRenderDomSystem(options = {}) {
  const renderIntentResourceKey =
    options.renderIntentResourceKey || DEFAULT_RENDER_INTENT_RESOURCE_KEY;
  const spritePoolResourceKey = options.spritePoolResourceKey || DEFAULT_SPRITE_POOL_RESOURCE_KEY;

  /** @type {Map<number, {type: string, element: Element}>} Entity ID to {type, element} */
  const entityElementMap = new Map();

  return {
    name: 'render-dom-system',
    phase: 'render',
    resourceCapabilities: {
      read: [renderIntentResourceKey, spritePoolResourceKey],
    },
    update(context) {
      const buffer = context.world.getResource(renderIntentResourceKey);
      const spritePool = context.world.getResource(spritePoolResourceKey);

      if (!buffer || !spritePool) {
        return;
      }

      const intentCount = buffer._count;
      /** @type {Set<number>} Entity IDs rendered this frame */
      const currentFrameEntityIds = new Set();

      for (let i = 0; i < intentCount; i += 1) {
        const entityId = buffer.entityId[i];
        const kind = buffer.kind[i];
        const x = buffer.x[i];
        const y = buffer.y[i];
        const opacity = buffer.opacity[i];
        const classBits = buffer.classBits[i];

        currentFrameEntityIds.add(entityId);

        const spriteType = KIND_TO_SPRITE_TYPE[kind];
        if (!spriteType) continue; // skip if no mapping (e.g., WALL)

        const el = spritePool.acquire(spriteType);

        // Clear previous classes before adding new ones
        el.className = '';
        el.style.display = '';

        const pixelX = x * TILE_SIZE_PX;
        const pixelY = y * TILE_SIZE_PX;
        el.style.transform = `translate3d(${pixelX}px, ${pixelY}px, 0)`;
        el.style.opacity = opacityToCss(opacity);

        const baseClasses = KIND_TO_CLASSES[kind] || [];
        for (const cls of baseClasses) {
          el.classList.add(cls);
        }

        applyVisualFlagClasses(el, classBits);

        entityElementMap.set(entityId, { type: spriteType, element: el });
      }

      for (const [prevEntityId, info] of entityElementMap) {
        if (!currentFrameEntityIds.has(prevEntityId)) {
          spritePool.release(info.type, info.element);
          entityElementMap.delete(prevEntityId);
        }
      }
    },
  };
}

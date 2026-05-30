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
 * - WALL entities (KIND_TO_SPRITE_TYPE.WALL === null) are intentionally skipped
 *   here — walls render as static grid cells via the renderer adapter, not as
 *   pooled sprites. The null sentinel is a deliberate no-op, not dead code.
 * - HIDDEN flag is implemented via an offscreen transform, not display:none,
 *   to keep the visibility toggle on the compositor and avoid layout reflow.
 * - This is the ONLY system that touches the DOM.
 */

import { RENDERABLE_KIND, VISUAL_FLAGS } from '../components/visual.js';
import { GHOST_TYPE } from '../resources/constants.js';

const DEFAULT_RENDER_INTENT_RESOURCE_KEY = 'renderIntent';
const DEFAULT_SPRITE_POOL_RESOURCE_KEY = 'spritePool';
const DEFAULT_GHOST_RESOURCE_KEY = 'ghost';

const TILE_SIZE_PX = 32;

const OFFSCREEN_TRANSFORM = 'translate(-9999px, -9999px)';

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
 * Player spriteId → CSS frame class. IDs match sprite-handoff.json array order.
 */
const PLAYER_SPRITE_CLASSES = [
  'sprite--player--idle', // 0
  null, // 1 player-death (not yet in use)
  'sprite--player--walk-up-01', // 2
  'sprite--player--walk-up-02', // 3
  'sprite--player--walk-down-01', // 4
  'sprite--player--walk-down-02', // 5
  'sprite--player--walk-left-01', // 6
  'sprite--player--walk-left-02', // 7
  'sprite--player--walk-right-01', // 8
  'sprite--player--walk-right-02', // 9
];

/**
 * Ghost type enum → CSS suffix used for the per-personality base sprite. The
 * matching `.sprite--ghost--{type}` classes live in `styles/grid.css` and
 * supply each ghost's idle background-image.
 */
const GHOST_TYPE_SUFFIX = {
  [GHOST_TYPE.BLINKY]: 'blinky',
  [GHOST_TYPE.PINKY]: 'pinky',
  [GHOST_TYPE.INKY]: 'inky',
  [GHOST_TYPE.CLYDE]: 'clyde',
};

/**
 * Ghost spriteId → CSS walk-frame suffix. IDs are produced by
 * ghost-animation-system and align with PLAYER_SPRITE_CLASSES indices so the
 * walk-cycle math stays identical across the two animation systems. A null
 * entry means "no walk-frame override" — only the type's idle sprite is shown.
 */
const GHOST_SPRITE_FRAMES = [
  null, // 0 IDLE — fall back to base type sprite
  null, // 1 reserved (mirrors PLAYER_SPRITE_CLASSES[1])
  'walk-up-01', // 2
  'walk-up-02', // 3
  'walk-down-01', // 4
  'walk-down-02', // 5
  'walk-left-01', // 6
  'walk-left-02', // 7
  'walk-right-01', // 8
  'walk-right-02', // 9
];

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
  const ghostResourceKey = options.ghostResourceKey || DEFAULT_GHOST_RESOURCE_KEY;

  /** @type {Map<number, {type: string, element: Element}>} Entity ID to {type, element} */
  const entityElementMap = new Map();
  /** @type {Set<number>} Hoisted to avoid per-frame allocation (ARCH-05). */
  const currentFrameEntityIds = new Set();

  return {
    name: 'render-dom-system',
    phase: 'render',
    resourceCapabilities: {
      read: [renderIntentResourceKey, spritePoolResourceKey, ghostResourceKey],
    },
    update(context) {
      const buffer = context.world.getResource(renderIntentResourceKey);
      const spritePool = context.world.getResource(spritePoolResourceKey);
      // The ghost store is optional so tests that wire render-dom-system
      // without gameplay components keep working; without it ghosts render
      // only the base `.sprite--ghost` class.
      const ghostStore = context.world.getResource(ghostResourceKey);

      if (!buffer || !spritePool) {
        return;
      }

      if (context.world.renderFrame === 0) {
        entityElementMap.clear();
      }

      const intentCount = buffer._count;
      currentFrameEntityIds.clear();

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

        let el;
        const existingInfo = entityElementMap.get(entityId);
        if (existingInfo && existingInfo.type === spriteType) {
          el = existingInfo.element;
        } else {
          if (existingInfo) {
            spritePool.release(existingInfo.type, existingInfo.element);
          }
          el = spritePool.acquire(spriteType);
        }

        // Clear previous classes but keep the base sprite class for width/height
        el.className = 'sprite';

        if ((classBits & VISUAL_FLAGS.HIDDEN) !== 0) {
          // ARCH-01: hide via offscreen transform (compositor-only) rather
          // than display:none, which would force layout/reflow.
          el.style.transform = OFFSCREEN_TRANSFORM;
        } else {
          const pixelX = x * TILE_SIZE_PX;
          const pixelY = y * TILE_SIZE_PX;
          el.style.transform = `translate3d(${pixelX}px, ${pixelY}px, 0)`;
        }
        el.style.opacity = opacityToCss(opacity);

        const baseClasses = KIND_TO_CLASSES[kind] || [];
        for (const cls of baseClasses) {
          el.classList.add(cls);
        }

        if (kind === RENDERABLE_KIND.PLAYER) {
          const spriteId = buffer.spriteId[i];
          const frameClass = PLAYER_SPRITE_CLASSES[spriteId];
          if (frameClass) el.classList.add(frameClass);
        } else if (kind === RENDERABLE_KIND.GHOST && ghostStore) {
          const ghostType = ghostStore.type[entityId];
          const typeSuffix = GHOST_TYPE_SUFFIX[ghostType];
          if (typeSuffix) {
            // The base `.sprite--ghost--{type}` class provides the per-ghost
            // idle background-image. Stunned and dead state classes (added
            // below by applyVisualFlagClasses) override this image via CSS
            // ordering in styles/grid.css.
            el.classList.add(`sprite--ghost--${typeSuffix}`);

            // Walk-cycle frames only apply while the ghost is in NORMAL
            // state. Skipping them when STUNNED/DEAD is set lets the state
            // background-image win via specificity ordering.
            const isStateOverridden =
              (classBits & (VISUAL_FLAGS.STUNNED | VISUAL_FLAGS.DEAD)) !== 0;
            if (!isStateOverridden) {
              const spriteId = buffer.spriteId[i];
              const frameSuffix = GHOST_SPRITE_FRAMES[spriteId];
              if (frameSuffix) {
                el.classList.add(`sprite--ghost--${typeSuffix}--${frameSuffix}`);
              }
            }
          }
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

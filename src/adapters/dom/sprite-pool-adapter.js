/**
 * D-09: Sprite Pool Adapter
 *
 * Pre-allocates DOM element pools for all dynamic sprites. Elements are hidden
 * with an offscreen transform rather than display:none to avoid layout thrashing.
 *
 * Public API:
 * - createSpritePool(options) — factory for sprite pool adapter.
 * - pool.acquire(type) — get an idle element from the named pool.
 * - pool.release(type, element) — return an element to its pool.
 * - pool.warmUp(containerElement) — pre-allocate and attach all pool elements.
 * - pool.reset() — release all active elements back to their pools.
 */

import {
  POOL_FIRE,
  POOL_GHOSTS,
  POOL_MAX_BOMBS,
  POOL_PELLETS,
} from '../../ecs/resources/constants.js';

export const SPRITE_TYPE = /** @type {const} */ ({
  PLAYER: 'player',
  GHOST: 'ghost',
  BOMB: 'bomb',
  FIRE: 'fire',
  PELLET: 'pellet',
});

const OFFSCREEN_TRANSFORM = 'translate(-9999px, -9999px)';

const POOL_SIZES = {
  [SPRITE_TYPE.PLAYER]: 1,
  [SPRITE_TYPE.GHOST]: POOL_GHOSTS,
  [SPRITE_TYPE.BOMB]: POOL_MAX_BOMBS,
  [SPRITE_TYPE.FIRE]: POOL_FIRE,
  [SPRITE_TYPE.PELLET]: POOL_PELLETS,
};

/**
 * @param {object} [options]
 * @param {Document} [options.document=globalThis.document]
 * @param {boolean} [options.dev=false]
 */
export function createSpritePool({ document: doc = globalThis.document, dev = false } = {}) {
  /** @type {Map<string, HTMLElement[]>} idle elements per type */
  const idle = new Map();
  /** @type {Map<string, HTMLElement[]>} active elements per type */
  const active = new Map();

  for (const type of Object.values(SPRITE_TYPE)) {
    idle.set(type, []);
    active.set(type, []);
  }

  function createElement(type) {
    const el = doc.createElement('div');
    el.classList.add('sprite', `sprite--${type}`);
    el.style.transform = OFFSCREEN_TRANSFORM;
    return el;
  }

  /**
   * Pre-allocate all pool elements and attach them to the container.
   *
   * @param {HTMLElement} containerElement
   */
  function warmUp(containerElement) {
    for (const [type, size] of Object.entries(POOL_SIZES)) {
      const pool = idle.get(type);
      while (pool.length < size) {
        const el = createElement(type);
        containerElement.appendChild(el);
        pool.push(el);
      }
    }
  }

  /**
   * Acquire an idle element from the named pool.
   * In dev: warns on exhaustion. In production: recycles oldest active element.
   *
   * @param {string} type
   * @returns {HTMLElement}
   */
  function acquire(type) {
    const pool = idle.get(type);
    if (!pool) throw new Error(`Unknown sprite type: ${type}`);

    if (pool.length > 0) {
      const el = pool.pop();
      active.get(type).push(el);
      return el;
    }

    const activePool = active.get(type);
    if (dev) {
      console.warn(`[sprite-pool] Pool exhausted for type "${type}" (size ${POOL_SIZES[type]})`);
    }
    const recycled = activePool.shift();
    if (!recycled) {
      // Pool was never warmed up: idle and active are both empty. Create an
      // element on demand so callers don't crash. Caller is responsible for
      // DOM insertion since warmUp() did not attach this element.
      if (dev) {
        console.warn(`[sprite-pool] Pool for "${type}" never warmed — creating element on demand.`);
      }
      const el = createElement(type);
      activePool.push(el);
      return el;
    }
    recycled.style.transform = OFFSCREEN_TRANSFORM;
    activePool.push(recycled);
    return recycled;
  }

  /**
   * Return an element to its pool and move it offscreen.
   *
   * @param {string} type
   * @param {HTMLElement} element
   */
  function release(type, element) {
    const activePool = active.get(type);
    if (!activePool) throw new Error(`Unknown sprite type: ${type}`);

    const idx = activePool.indexOf(element);
    // Guard against double-release or foreign elements: only return elements
    // that are actually tracked as active. Silently skip unknown elements to
    // avoid inflating the idle pool with duplicates or foreign references.
    if (idx === -1) return;

    activePool.splice(idx, 1);
    element.style.transform = OFFSCREEN_TRANSFORM;
    idle.get(type).push(element);
  }

  /**
   * Release all active elements back to their pools.
   */
  function reset() {
    for (const type of Object.values(SPRITE_TYPE)) {
      const activePool = active.get(type);
      const idlePool = idle.get(type);
      for (const el of activePool) {
        el.style.transform = OFFSCREEN_TRANSFORM;
        idlePool.push(el);
      }
      activePool.length = 0;
    }
  }

  /**
   * @param {string} type
   * @returns {{ idle: number, active: number }}
   */
  function stats(type) {
    return {
      idle: idle.get(type)?.length ?? 0,
      active: active.get(type)?.length ?? 0,
    };
  }

  return { warmUp, acquire, release, reset, stats };
}

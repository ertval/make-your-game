/**
 * D-08: DOM Renderer Adapter
 *
 * Consumes the data-only RenderIntentBuffer (D-04) and performs the single
 * batch of DOM writes required by AGENTS.md. Isolates simulation logic
 * from browser side effects and enforces ordered phases per rAF.
 *
 * Architecture Note:
 * - This is the ONLY place allowed to perform per-frame DOM updates for game entities.
 * - Uses compositor-friendly properties (transform, opacity) to ensure 60FPS.
 * - Prevents layout thrashing by avoiding interleaved reads/writes.
 *
 * Public API:
 * - createDomRenderer(options) — factory for the renderer record.
 * - renderer.update(buffer) — perform the frame commit using the intent buffer.
 */

/**
 * Create a new DOM renderer instance.
 *
 * @param {object} options
 * @param {HTMLElement} options.appRoot — The container for game entity nodes.
 * @returns {DomRenderer}
 */
export function createDomRenderer({ appRoot }) {
  if (!appRoot) {
    throw new Error('DomRenderer requires an appRoot element.');
  }

  // Map<entityId, HTMLElement> for stable node tracking.
  const elementMap = new Map();

  /**
   * Perform the single-pass DOM commit phase.
   *
   * @param {import('../../ecs/render-intent.js').RenderIntentBuffer} buffer — Populated intent buffer.
   */
  function update(buffer) {
    // 1. Mark all current elements as potentially stale.
    const staleIds = new Set(elementMap.keys());

    // 2. Process all intents produced by the render collect systems.
    // Iterating over typed arrays is allocation-free (ARCH-01, DEAD-X06).
    for (let i = 0; i < buffer._count; i += 1) {
      const entityId = buffer.entityId[i];
      const kind = buffer.kind[i];
      const x = buffer.x[i];
      const y = buffer.y[i];
      const opacity = buffer.opacity[i];
      const classBits = buffer.classBits[i];

      let el = elementMap.get(entityId);

      if (!el) {
        // Create new element for new entity.
        // SEC-10: prefer classList.add over className string assignment to
        // avoid clobbering classes set by other code paths.
        el = document.createElement('div');
        el.classList.add('entity', `kind-${kind}`);
        appRoot.appendChild(el);
        elementMap.set(entityId, el);
      } else {
        staleIds.delete(entityId);
      }

      // 3. Batch CSS updates (compositor-friendly).
      // translate3d(x, y, 0) is sub-pixel precise and layer-promoted.
      // We use tile-size (32px) from constants.css.
      const tx = x * 32;
      const ty = y * 32;
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      el.style.opacity = (opacity / 255).toFixed(2);

      // Update class bits (simplified for now).
      el.dataset.classBits = String(classBits);
    }

    // 4. Remove elements for destroyed entities (ARCH-13: listener cleanup would happen here).
    for (const id of staleIds) {
      const el = elementMap.get(id);
      /* v8 ignore next 3 */
      if (el) {
        appRoot.removeChild(el);
        elementMap.delete(id);
      }
    }
  }

  return {
    update,
  };
}

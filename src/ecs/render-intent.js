/**
 * D-04 render-intent buffer.
 *
 * Defines the frame-local batch structure consumed by render-dom-system.js
 * (D-08). The intent buffer is a preallocated, data-only carrier that
 * translates ECS component state into a deterministic list of render
 * operations. No DOM nodes, no adapters, and no browser state may ever be
 * stored inside intent entries — doing so would violate the ECS/DOM isolation
 * boundary defined in AGENTS.md.
 *
 * Public API:
 * - RENDER_INTENT_VERSION: schema version for cross-developer contract.
 * - createRenderIntentBuffer(maxIntents): preallocated parallel-array buffer.
 * - resetRenderIntentBuffer(buffer): zero-fill the buffer for a new frame.
 * - appendRenderIntent(buffer, entry): push an intent into the next slot.
 * - getRenderIntentView(buffer, count): return an array of populated entries.
 *
 * Implementation notes:
 * - Parallel typed arrays avoid per-entry object allocations on hot paths.
 * - MAX_RENDER_INTENTS from constants.js defines the absolute capacity.
 * - The _count field tracks how many slots are populated for the current
 *   frame; consumers must never read beyond _count.
 * - classBits is a bitmask (VISUAL_FLAGS) so multiple flags combine via OR
 *   without needing a separate flags array per entry.
 * - x/y are sub-tile floating-point positions after interpolation; the render
 *   DOM system converts them to pixel translate3d values.
 */

import { isDevelopment } from '../shared/env.js';
import { RENDERABLE_KIND } from './components/visual.js';
import { MAX_RENDER_INTENTS } from './resources/constants.js';

/**
 * @typedef {Object} RenderIntentBuffer
 * @property {Uint32Array} entityId - Entity IDs for DOM node mapping.
 * @property {Uint8Array} kind - RENDERABLE_KIND enum values.
 * @property {Int32Array} spriteId - Asset manifest sprite IDs (-1 for none).
 * @property {Float32Array} x - Interpolated tile-space X positions.
 * @property {Float32Array} y - Interpolated tile-space Y positions.
 * @property {Uint8Array} classBits - VISUAL_FLAGS bitmasks.
 * @property {Uint8Array} opacity - Opacity bytes (0-255).
 * @property {number} _count - Current population count.
 * @property {number} _capacity - Maximum capacity.
 */

/**
 * @typedef {Object} RenderIntentEntry
 * @property {number} entityId
 * @property {number} kind
 * @property {number} spriteId
 * @property {number} x
 * @property {number} y
 * @property {number} classBits
 * @property {number} opacity
 */

/**
 * Contract schema version — bumped when the intent field layout changes so
 * downstream render systems can assert they are consuming the expected format.
 */
export const RENDER_INTENT_VERSION = 1;

/**
 * Allocate a preallocated render-intent buffer sized for the maximum number of
 * intents a single frame may produce.
 *
 * Returns a plain data object with parallel typed arrays — no objects, no
 * closures, no DOM references. This keeps the hot path allocation-free after
 * the initial warm-up.
 *
 * @param {number} [maxIntents=MAX_RENDER_INTENTS] - Override capacity for tests.
 * @returns {RenderIntentBuffer} Fresh intent buffer with zeroed counts.
 */
export function createRenderIntentBuffer(maxIntents = MAX_RENDER_INTENTS) {
  return {
    // Entity ID that produced this intent (for stable ordering and DOM node mapping).
    entityId: new Uint32Array(maxIntents),
    // RENDERABLE_KIND enum value — tells the DOM system which sprite/class to use.
    kind: new Uint8Array(maxIntents),
    // Sprite ID from the asset manifest (-1 means no specific sprite).
    spriteId: new Int32Array(maxIntents).fill(-1),
    // Interpolated tile-space X position (sub-tile precision for smooth motion).
    x: new Float32Array(maxIntents),
    // Interpolated tile-space Y position (sub-tile precision for smooth motion).
    y: new Float32Array(maxIntents),
    // VISUAL_FLAGS bitmask — combines STUNNED, INVINCIBLE, DEAD, etc. via OR.
    classBits: new Uint8Array(maxIntents),
    // Opacity override (0–255 maps to 0.0–1.0); 255 means fully opaque.
    opacity: new Uint8Array(maxIntents).fill(255),
    // How many slots are currently populated for this frame.
    _count: 0,
    // Maximum capacity — useful when the buffer is shared across resize events.
    _capacity: maxIntents,
  };
}

/**
 * Reset the intent buffer for a fresh frame. Only _count is cleared; the
 * underlying typed arrays retain stale data to avoid unnecessary writes. The
 * next append call overwrites from index 0.
 *
 * @param {RenderIntentBuffer} buffer - Mutable intent buffer to reset.
 */
export function resetRenderIntentBuffer(buffer) {
  buffer._count = 0;
}

/**
 * Append a render intent entry into the next available slot. If the buffer is
 * full, the entry is silently dropped and a development warning is logged.
 *
 * NOTE: This helper accepts an object and is suitable for low-frequency paths
 * (tests, tooling). Use appendRenderIntentDirect for hot per-entity loops to
 * avoid per-frame object allocations.
 *
 * @param {RenderIntentBuffer} buffer - Mutable intent buffer to write into.
 * @param {object} entry - Intent data object.
 * @param {number} entry.entityId - Entity that owns this visual.
 * @param {number} entry.kind - RENDERABLE_KIND enum value.
 * @param {number} [entry.spriteId=-1] - Asset manifest sprite ID.
 * @param {number} [entry.x=0] - Interpolated tile-space X.
 * @param {number} [entry.y=0] - Interpolated tile-space Y.
 * @param {number} [entry.classBits=0] - VISUAL_FLAGS bitmask.
 * @param {number} [entry.opacity=255] - Opacity byte (0–255).
 */
export function appendRenderIntent(buffer, entry) {
  if (buffer._count >= buffer._capacity) {
    if (isDevelopment()) {
      console.warn(
        `Render intent buffer full (${buffer._capacity}/${buffer._capacity}). ` +
          `Intent for entity ${entry.entityId} dropped.`,
      );
    }
    return;
  }

  const idx = buffer._count;
  buffer.entityId[idx] = entry.entityId;
  buffer.kind[idx] = entry.kind || RENDERABLE_KIND.NONE;
  buffer.spriteId[idx] = entry.spriteId ?? -1;
  buffer.x[idx] = entry.x ?? 0;
  buffer.y[idx] = entry.y ?? 0;
  buffer.classBits[idx] = entry.classBits || 0;
  buffer.opacity[idx] = entry.opacity ?? 255;
  buffer._count += 1;
}

/**
 * Allocation-free variant of appendRenderIntent for use in hot per-entity
 * loops. Accepts individual primitive fields instead of an object so no
 * intermediate allocation occurs on the collect hot path.
 *
 * @param {RenderIntentBuffer} buffer - Mutable intent buffer to write into.
 * @param {number} entityId - Entity that owns this visual.
 * @param {number} kind - RENDERABLE_KIND enum value.
 * @param {number} spriteId - Asset manifest sprite ID (-1 for none).
 * @param {number} x - Interpolated tile-space X position.
 * @param {number} y - Interpolated tile-space Y position.
 * @param {number} classBits - VISUAL_FLAGS bitmask.
 * @param {number} opacity - Opacity byte (0–255).
 */
export function appendRenderIntentDirect(
  buffer,
  entityId,
  kind,
  spriteId,
  x,
  y,
  classBits,
  opacity,
) {
  if (buffer._count >= buffer._capacity) {
    if (isDevelopment()) {
      console.warn(
        `Render intent buffer full (${buffer._capacity}/${buffer._capacity}). ` +
          `Intent for entity ${entityId} dropped.`,
      );
    }
    return;
  }

  const idx = buffer._count;
  buffer.entityId[idx] = entityId;
  buffer.kind[idx] = kind || RENDERABLE_KIND.NONE;
  buffer.spriteId[idx] = spriteId;
  buffer.x[idx] = x;
  buffer.y[idx] = y;
  buffer.classBits[idx] = classBits;
  buffer.opacity[idx] = opacity;
  buffer._count += 1;
}

/**
 * Return a plain-array view of the populated intents for the current frame.
 * This is NOT allocation-free and should only be used by tests or the render
 * commit phase, never inside the collect-system hot loop.
 *
 * @param {RenderIntentBuffer} buffer - Intent buffer to read from.
 * @returns {Array<RenderIntentEntry>} Array of populated intent objects.
 */
export function getRenderIntentView(buffer) {
  const result = new Array(buffer._count);
  for (let i = 0; i < buffer._count; i += 1) {
    result[i] = {
      entityId: buffer.entityId[i],
      kind: buffer.kind[i],
      spriteId: buffer.spriteId[i],
      x: buffer.x[i],
      y: buffer.y[i],
      classBits: buffer.classBits[i],
      opacity: buffer.opacity[i],
    };
  }
  return result;
}

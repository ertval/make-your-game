/*
 * D-04 render-intent buffer unit tests.
 *
 * These tests validate the frame-local batch structure, preallocation strategy,
 * and the ECS/DOM isolation contract: no DOM nodes, no adapter references,
 * and no browser-specific state may leak into ECS component storage or the
 * intent buffer.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendRenderIntent,
  appendRenderIntentDirect,
  createRenderIntentBuffer,
  getRenderIntentView,
  RENDER_INTENT_VERSION,
  resetRenderIntentBuffer,
} from '../../../src/ecs/render-intent.js';
import { MAX_RENDER_INTENTS } from '../../../src/ecs/resources/constants.js';

vi.mock('../../../src/shared/env.js', () => ({
  isDevelopment: vi.fn(() => true),
}));

import {
  createRenderableStore,
  createVisualStateStore,
  RENDERABLE_KIND,
  VISUAL_FLAGS,
} from '../../../src/ecs/components/visual.js';
import { isDevelopment } from '../../../src/shared/env.js';

describe('render-intent buffer', () => {
  it('exports a stable schema version', () => {
    expect(typeof RENDER_INTENT_VERSION).toBe('number');
    expect(RENDER_INTENT_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('creates a buffer with preallocated typed arrays and zero count', () => {
    const buf = createRenderIntentBuffer(64);

    expect(buf.entityId).toBeInstanceOf(Uint32Array);
    expect(buf.kind).toBeInstanceOf(Uint8Array);
    expect(buf.spriteId).toBeInstanceOf(Int32Array);
    expect(buf.x).toBeInstanceOf(Float32Array);
    expect(buf.y).toBeInstanceOf(Float32Array);
    expect(buf.classBits).toBeInstanceOf(Uint8Array);
    expect(buf.opacity).toBeInstanceOf(Uint8Array);
    expect(buf.entityId.length).toBe(64);
    expect(buf._count).toBe(0);
    expect(buf._capacity).toBe(64);
  });

  it('defaults to MAX_RENDER_INTENTS capacity when no size is given', () => {
    const buf = createRenderIntentBuffer();
    expect(buf._capacity).toBe(MAX_RENDER_INTENTS);
  });

  it('initialises spriteId array to -1 (no sprite assigned)', () => {
    const buf = createRenderIntentBuffer(4);
    for (let i = 0; i < 4; i += 1) {
      expect(buf.spriteId[i]).toBe(-1);
    }
  });

  it('initialises opacity to fully opaque (255)', () => {
    const buf = createRenderIntentBuffer(4);
    for (let i = 0; i < 4; i += 1) {
      expect(buf.opacity[i]).toBe(255);
    }
  });

  it('resets only the count, leaving stale array data intact', () => {
    const buf = createRenderIntentBuffer(8);
    appendRenderIntent(buf, { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 3.5, y: 7.2 });
    expect(buf._count).toBe(1);
    expect(buf.x[0]).toBe(3.5);

    resetRenderIntentBuffer(buf);
    expect(buf._count).toBe(0);
    // Stale data survives — this is intentional to avoid unnecessary writes.
    expect(buf.x[0]).toBe(3.5);
  });
});

describe('appendRenderIntent', () => {
  it('writes entry data into the next available slot', () => {
    const buf = createRenderIntentBuffer(4);

    appendRenderIntent(buf, {
      entityId: 42,
      kind: RENDERABLE_KIND.GHOST,
      spriteId: 7,
      x: 1.25,
      y: 3.75,
      classBits: VISUAL_FLAGS.STUNNED,
      opacity: 128,
    });

    expect(buf._count).toBe(1);
    expect(buf.entityId[0]).toBe(42);
    expect(buf.kind[0]).toBe(RENDERABLE_KIND.GHOST);
    expect(buf.spriteId[0]).toBe(7);
    expect(buf.x[0]).toBe(1.25);
    expect(buf.y[0]).toBe(3.75);
    expect(buf.classBits[0]).toBe(VISUAL_FLAGS.STUNNED);
    expect(buf.opacity[0]).toBe(128);
  });

  it('applies defaults for omitted optional fields', () => {
    const buf = createRenderIntentBuffer(4);

    appendRenderIntent(buf, { entityId: 1, kind: RENDERABLE_KIND.BOMB });

    expect(buf.spriteId[0]).toBe(-1);
    expect(buf.x[0]).toBe(0);
    expect(buf.y[0]).toBe(0);
    expect(buf.classBits[0]).toBe(0);
    expect(buf.opacity[0]).toBe(255);
  });

  it('combines multiple visual flags via bitwise OR', () => {
    const buf = createRenderIntentBuffer(4);
    const flags = VISUAL_FLAGS.STUNNED | VISUAL_FLAGS.INVINCIBLE | VISUAL_FLAGS.SPEED_BOOST;

    appendRenderIntent(buf, { entityId: 1, kind: RENDERABLE_KIND.GHOST, classBits: flags });

    expect(buf.classBits[0]).toBe(flags);
    expect(buf.classBits[0] & VISUAL_FLAGS.STUNNED).toBeTruthy();
    expect(buf.classBits[0] & VISUAL_FLAGS.INVINCIBLE).toBeTruthy();
    expect(buf.classBits[0] & VISUAL_FLAGS.SPEED_BOOST).toBeTruthy();
    expect(buf.classBits[0] & VISUAL_FLAGS.DEAD).toBeFalsy();
  });

  it('appends multiple entries in insertion order', () => {
    const buf = createRenderIntentBuffer(8);

    appendRenderIntent(buf, { entityId: 10, kind: RENDERABLE_KIND.PLAYER });
    appendRenderIntent(buf, { entityId: 20, kind: RENDERABLE_KIND.GHOST });
    appendRenderIntent(buf, { entityId: 30, kind: RENDERABLE_KIND.BOMB });

    expect(buf._count).toBe(3);
    expect(buf.entityId[0]).toBe(10);
    expect(buf.entityId[1]).toBe(20);
    expect(buf.entityId[2]).toBe(30);
  });

  it('silently drops entries when the buffer is full', () => {
    const buf = createRenderIntentBuffer(2);

    appendRenderIntent(buf, { entityId: 1, kind: RENDERABLE_KIND.PLAYER });
    appendRenderIntent(buf, { entityId: 2, kind: RENDERABLE_KIND.GHOST });
    appendRenderIntent(buf, { entityId: 3, kind: RENDERABLE_KIND.BOMB });

    expect(buf._count).toBe(2);
    expect(buf.entityId[0]).toBe(1);
    expect(buf.entityId[1]).toBe(2);
  });
});

describe('getRenderIntentView', () => {
  it('returns an array of populated entry objects up to _count', () => {
    const buf = createRenderIntentBuffer(8);

    appendRenderIntent(buf, { entityId: 5, kind: RENDERABLE_KIND.PLAYER, x: 2, y: 4 });
    appendRenderIntent(buf, {
      entityId: 6,
      kind: RENDERABLE_KIND.GHOST,
      classBits: VISUAL_FLAGS.DEAD,
    });

    const view = getRenderIntentView(buf);

    expect(view).toHaveLength(2);
    expect(view[0]).toEqual({
      entityId: 5,
      kind: RENDERABLE_KIND.PLAYER,
      spriteId: -1,
      x: 2,
      y: 4,
      classBits: 0,
      opacity: 255,
    });
    expect(view[1]).toEqual({
      entityId: 6,
      kind: RENDERABLE_KIND.GHOST,
      spriteId: -1,
      x: 0,
      y: 0,
      classBits: VISUAL_FLAGS.DEAD,
      opacity: 255,
    });
  });

  it('returns an empty array when no intents were appended', () => {
    const buf = createRenderIntentBuffer(4);
    expect(getRenderIntentView(buf)).toEqual([]);
  });
});

describe('D-04 ECS/DOM isolation contract', () => {
  beforeEach(() => {
    vi.mocked(isDevelopment).mockReturnValue(true);
  });

  it('stores no DOM nodes or browser objects in the intent buffer', () => {
    const buf = createRenderIntentBuffer(4);

    appendRenderIntent(buf, { entityId: 1, kind: RENDERABLE_KIND.PLAYER });

    // Every field must be a typed-array primitive value — never a DOM node.
    const forbiddenTypes = ['object', 'function'];
    const fields = ['entityId', 'kind', 'spriteId', 'x', 'y', 'classBits', 'opacity'];

    for (const field of fields) {
      const val = buf[field][0];
      expect(typeof val).toBe('number');
      expect(forbiddenTypes.includes(typeof val)).toBe(false);
    }

    // _count and _capacity are internal metadata numbers.
    expect(typeof buf._count).toBe('number');
    expect(typeof buf._capacity).toBe('number');
  });

  it('component visual stores contain no DOM handles, closures, or adapter references', () => {
    // Visual stores are pure typed arrays — verify by creating a store and
    // confirming every property is a TypedArray instance.
    const renderable = createRenderableStore(4);
    const visualState = createVisualStateStore(4);

    // All stored data must be TypedArray instances.
    for (const [, value] of Object.entries(renderable)) {
      expect(value instanceof ArrayBuffer || ArrayBuffer.isView(value)).toBe(true);
    }

    for (const [, value] of Object.entries(visualState)) {
      expect(value instanceof ArrayBuffer || ArrayBuffer.isView(value)).toBe(true);
    }
  });

  it('classBits encodes visual state without per-frame string allocations', () => {
    // The contract requires classBits to be a numeric bitmask, never an array
    // of class-name strings. This test proves the append path keeps strings out.
    const buf = createRenderIntentBuffer(4);
    const flags = VISUAL_FLAGS.INVINCIBLE | VISUAL_FLAGS.DEAD;

    appendRenderIntent(buf, { entityId: 1, kind: RENDERABLE_KIND.PLAYER, classBits: flags });

    // classBits must be a plain number, not a string or array.
    expect(typeof buf.classBits[0]).toBe('number');
    expect(buf.classBits[0]).toBe(flags);

    // The view must also expose a numeric classBits field.
    const [entry] = getRenderIntentView(buf);
    expect(typeof entry.classBits).toBe('number');
    expect(entry.classBits).toBe(flags);
  });
});

describe('appendRenderIntent buffer-full warning', () => {
  beforeEach(() => {
    vi.mocked(isDevelopment).mockReturnValue(true);
  });

  it('warns via console when appendRenderIntent exceeds capacity in dev mode', () => {
    const buf = createRenderIntentBuffer(1);
    appendRenderIntent(buf, { entityId: 1, kind: RENDERABLE_KIND.PLAYER });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    appendRenderIntent(buf, { entityId: 99, kind: RENDERABLE_KIND.GHOST });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('Render intent buffer full');
    expect(warnSpy.mock.calls[0][0]).toContain('entity 99');
    expect(buf._count).toBe(1);

    warnSpy.mockRestore();
  });

  it('warns via console when appendRenderIntentDirect exceeds capacity in dev mode', () => {
    const buf = createRenderIntentBuffer(1);
    appendRenderIntentDirect(buf, 1, 1, -1, 0, 0, 0, 255);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    appendRenderIntentDirect(buf, 99, 2, -1, 0, 0, 0, 255);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('Render intent buffer full');
    expect(warnSpy.mock.calls[0][0]).toContain('entity 99');
    expect(buf._count).toBe(1);

    warnSpy.mockRestore();
  });

  it('does not warn when appendRenderIntent exceeds capacity in production mode', () => {
    vi.mocked(isDevelopment).mockReturnValue(false);
    const buf = createRenderIntentBuffer(1);
    appendRenderIntent(buf, { entityId: 1, kind: RENDERABLE_KIND.PLAYER });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    appendRenderIntent(buf, { entityId: 99, kind: RENDERABLE_KIND.GHOST });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(buf._count).toBe(1);

    warnSpy.mockRestore();
  });

  it('does not warn when appendRenderIntentDirect exceeds capacity in production mode', () => {
    vi.mocked(isDevelopment).mockReturnValue(false);
    const buf = createRenderIntentBuffer(1);
    appendRenderIntentDirect(buf, 1, 1, -1, 0, 0, 0, 255);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    appendRenderIntentDirect(buf, 99, 2, -1, 0, 0, 0, 255);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(buf._count).toBe(1);

    warnSpy.mockRestore();
  });
});

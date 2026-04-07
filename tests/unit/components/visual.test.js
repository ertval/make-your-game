/**
 * Unit tests for the B-01 visual component stores.
 *
 * These checks protect the render-facing data contract so later render systems
 * can rely on deterministic defaults and stable enum values.
 */

import { describe, expect, it } from 'vitest';

import {
  RENDERABLE_KIND,
  VISUAL_FLAGS,
  createRenderableStore,
  createVisualStateStore,
  resetRenderable,
  resetVisualState,
} from '../../../src/ecs/components/visual.js';

describe('visual component stores', () => {
  it('re-exports the canonical visual flags used by classBits', () => {
    expect(VISUAL_FLAGS).toEqual({
      STUNNED: 1,
      INVINCIBLE: 2,
      HIDDEN: 4,
      DEAD: 8,
      SPEED_BOOST: 16,
    });
  });

  it('defines distinct non-zero renderable kinds for gameplay entities', () => {
    const kinds = Object.values(RENDERABLE_KIND);

    expect(RENDERABLE_KIND.NONE).toBe(0);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(RENDERABLE_KIND.PLAYER).toBeGreaterThan(0);
    expect(RENDERABLE_KIND.POWER_UP).toBeGreaterThan(0);
  });

  it('creates and resets a renderable store with inert defaults', () => {
    const store = createRenderableStore(3);
    const entityId = 1;

    expect(store.kind).toBeInstanceOf(Uint8Array);
    expect(store.spriteId).toBeInstanceOf(Int32Array);
    expect(store.kind[entityId]).toBe(RENDERABLE_KIND.NONE);
    expect(store.spriteId[entityId]).toBe(-1);

    store.kind[entityId] = RENDERABLE_KIND.GHOST;
    store.spriteId[entityId] = 12;

    resetRenderable(store, entityId);

    expect(store.kind[entityId]).toBe(RENDERABLE_KIND.NONE);
    expect(store.spriteId[entityId]).toBe(-1);
  });

  it('creates and resets a visual-state store with zeroed class bits', () => {
    const store = createVisualStateStore(2);

    expect(store.classBits).toBeInstanceOf(Uint8Array);
    expect(store.classBits[0]).toBe(0);

    store.classBits[0] = VISUAL_FLAGS.STUNNED | VISUAL_FLAGS.SPEED_BOOST;
    resetVisualState(store, 0);

    expect(store.classBits[0]).toBe(0);
  });
});

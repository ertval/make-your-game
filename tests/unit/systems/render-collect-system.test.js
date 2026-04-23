/**
 * Unit tests for the D-07 render collect system.
 *
 * Verifies interpolation math, deterministic intent ordering, buffer reset,
 * entity filtering, classBits passthrough, opacity encoding, and buffer
 * capacity handling — all without any DOM or browser dependencies.
 */

import { describe, expect, it } from 'vitest';
import { RENDERABLE_KIND } from '../../../src/ecs/components/visual.js';
import { createRenderIntentBuffer, getRenderIntentView } from '../../../src/ecs/render-intent.js';
import { VISUAL_FLAGS } from '../../../src/ecs/resources/constants.js';
import { createRenderCollectSystem } from '../../../src/ecs/systems/render-collect-system.js';

function makeWorld(resources = {}) {
  const store = new Map(Object.entries(resources));
  return {
    getResource: (key) => store.get(key) ?? null,
    setResource: (key, val) => store.set(key, val),
  };
}

function makeRenderable(maxEntities, entries = []) {
  const kind = new Uint8Array(maxEntities);
  const spriteId = new Int32Array(maxEntities).fill(-1);
  for (const { id, k, s } of entries) {
    kind[id] = k;
    if (s !== undefined) spriteId[id] = s;
  }
  return { kind, spriteId };
}

function makePosition(maxEntities, entries = []) {
  const row = new Float64Array(maxEntities);
  const col = new Float64Array(maxEntities);
  const prevRow = new Float64Array(maxEntities);
  const prevCol = new Float64Array(maxEntities);
  const targetRow = new Float64Array(maxEntities);
  const targetCol = new Float64Array(maxEntities);
  for (const { id, r, c, pr, pc } of entries) {
    row[id] = r ?? 0;
    col[id] = c ?? 0;
    prevRow[id] = pr ?? r ?? 0;
    prevCol[id] = pc ?? c ?? 0;
  }
  return { row, col, prevRow, prevCol, targetRow, targetCol };
}

function makeVisualState(maxEntities, entries = []) {
  const classBits = new Uint8Array(maxEntities);
  for (const { id, bits } of entries) {
    classBits[id] = bits;
  }
  return { classBits };
}

function run(world, alpha = 1) {
  const system = createRenderCollectSystem();
  system.update({ world, alpha });
  return getRenderIntentView(world.getResource('renderIntentBuffer'));
}

describe('render-collect-system', () => {
  describe('interpolation math', () => {
    it('interpolates x and y correctly at alpha=0.5', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4, [{ id: 1, k: RENDERABLE_KIND.PLAYER }]),
        position: makePosition(4, [{ id: 1, r: 4, c: 6, pr: 2, pc: 4 }]),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, 0.5);
      expect(intents).toHaveLength(1);
      expect(intents[0].x).toBeCloseTo(5, 6); // prevCol=4 + (6-4)*0.5
      expect(intents[0].y).toBeCloseTo(3, 6); // prevRow=2 + (4-2)*0.5
    });

    it('outputs previous position at alpha=0', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4, [{ id: 1, k: RENDERABLE_KIND.PLAYER }]),
        position: makePosition(4, [{ id: 1, r: 4, c: 6, pr: 2, pc: 4 }]),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, 0);
      expect(intents[0].x).toBeCloseTo(4, 6);
      expect(intents[0].y).toBeCloseTo(2, 6);
    });

    it('outputs current position at alpha=1', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4, [{ id: 1, k: RENDERABLE_KIND.PLAYER }]),
        position: makePosition(4, [{ id: 1, r: 4, c: 6, pr: 2, pc: 4 }]),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, 1);
      expect(intents[0].x).toBeCloseTo(6, 6);
      expect(intents[0].y).toBeCloseTo(4, 6);
    });

    it('clamps alpha above 1 to 1', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4, [{ id: 1, k: RENDERABLE_KIND.PLAYER }]),
        position: makePosition(4, [{ id: 1, r: 4, c: 6, pr: 2, pc: 4 }]),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, 2);
      expect(intents[0].x).toBeCloseTo(6, 6);
      expect(intents[0].y).toBeCloseTo(4, 6);
    });

    it('clamps alpha below 0 to 0', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4, [{ id: 1, k: RENDERABLE_KIND.PLAYER }]),
        position: makePosition(4, [{ id: 1, r: 4, c: 6, pr: 2, pc: 4 }]),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, -1);
      expect(intents[0].x).toBeCloseTo(4, 6);
      expect(intents[0].y).toBeCloseTo(2, 6);
    });

    it('defaults to alpha=1 when alpha is not finite', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4, [{ id: 1, k: RENDERABLE_KIND.PLAYER }]),
        position: makePosition(4, [{ id: 1, r: 4, c: 6, pr: 2, pc: 4 }]),
        renderIntentBuffer: buffer,
      });
      const system = createRenderCollectSystem();
      system.update({ world, alpha: NaN });
      const intents = getRenderIntentView(world.getResource('renderIntentBuffer'));
      expect(intents[0].x).toBeCloseTo(6, 6);
      expect(intents[0].y).toBeCloseTo(4, 6);
    });
  });

  describe('deterministic ordering', () => {
    it('emits intents in ascending entity ID order', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(8, [
          { id: 5, k: RENDERABLE_KIND.GHOST },
          { id: 2, k: RENDERABLE_KIND.PLAYER },
          { id: 7, k: RENDERABLE_KIND.PELLET },
        ]),
        position: makePosition(8, [
          { id: 5, r: 1, c: 1 },
          { id: 2, r: 2, c: 2 },
          { id: 7, r: 3, c: 3 },
        ]),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, 1);
      expect(intents.map((i) => i.entityId)).toEqual([2, 5, 7]);
    });

    it('produces identical ordering on consecutive frames', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(8, [
          { id: 3, k: RENDERABLE_KIND.BOMB },
          { id: 1, k: RENDERABLE_KIND.PLAYER },
        ]),
        position: makePosition(8, [
          { id: 3, r: 1, c: 1 },
          { id: 1, r: 2, c: 2 },
        ]),
        renderIntentBuffer: buffer,
      });
      const system = createRenderCollectSystem();
      system.update({ world, alpha: 1 });
      const first = getRenderIntentView(buffer).map((i) => i.entityId);
      system.update({ world, alpha: 0.5 });
      const second = getRenderIntentView(buffer).map((i) => i.entityId);
      expect(first).toEqual(second);
    });
  });

  describe('buffer reset', () => {
    it('resets the buffer at the start of each frame', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4, [{ id: 1, k: RENDERABLE_KIND.PLAYER }]),
        position: makePosition(4, [{ id: 1, r: 1, c: 1 }]),
        renderIntentBuffer: buffer,
      });
      const system = createRenderCollectSystem();
      system.update({ world, alpha: 1 });
      expect(getRenderIntentView(buffer)).toHaveLength(1);

      // Remove entity and re-run — buffer should reflect new state, not old
      world.getResource('renderable').kind[1] = 0;
      system.update({ world, alpha: 1 });
      expect(getRenderIntentView(buffer)).toHaveLength(0);
    });
  });

  describe('entity filtering', () => {
    it('skips entities with kind=0 (no renderable)', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4, [{ id: 2, k: RENDERABLE_KIND.PLAYER }]),
        position: makePosition(4, [
          { id: 1, r: 1, c: 1 },
          { id: 2, r: 2, c: 2 },
        ]),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, 1);
      expect(intents).toHaveLength(1);
      expect(intents[0].entityId).toBe(2);
    });

    it('emits no intents when no entities have a renderable kind', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4),
        position: makePosition(4, [{ id: 1, r: 1, c: 1 }]),
        renderIntentBuffer: buffer,
      });
      expect(run(world, 1)).toHaveLength(0);
    });

    it('returns early when required resources are missing', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({ renderIntentBuffer: buffer });
      const system = createRenderCollectSystem();
      expect(() => system.update({ world, alpha: 1 })).not.toThrow();
      expect(getRenderIntentView(buffer)).toHaveLength(0);
    });
  });

  describe('classBits and opacity', () => {
    it('copies classBits from visualState into the intent', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4, [{ id: 1, k: RENDERABLE_KIND.GHOST }]),
        position: makePosition(4, [{ id: 1, r: 1, c: 1 }]),
        visualState: makeVisualState(4, [{ id: 1, bits: VISUAL_FLAGS.STUNNED }]),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, 1);
      expect(intents[0].classBits).toBe(VISUAL_FLAGS.STUNNED);
    });

    it('sets opacity to 128 for invincible entities', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4, [{ id: 1, k: RENDERABLE_KIND.PLAYER }]),
        position: makePosition(4, [{ id: 1, r: 1, c: 1 }]),
        visualState: makeVisualState(4, [{ id: 1, bits: VISUAL_FLAGS.INVINCIBLE }]),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, 1);
      expect(intents[0].opacity).toBe(128);
    });

    it('sets opacity to 255 for non-invincible entities', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4, [{ id: 1, k: RENDERABLE_KIND.PLAYER }]),
        position: makePosition(4, [{ id: 1, r: 1, c: 1 }]),
        visualState: makeVisualState(4, [{ id: 1, bits: 0 }]),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, 1);
      expect(intents[0].opacity).toBe(255);
    });

    it('uses zero classBits when visualState resource is absent', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4, [{ id: 1, k: RENDERABLE_KIND.PLAYER }]),
        position: makePosition(4, [{ id: 1, r: 1, c: 1 }]),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, 1);
      expect(intents[0].classBits).toBe(0);
      expect(intents[0].opacity).toBe(255);
    });

    it('passes through spriteId from the renderable store', () => {
      const buffer = createRenderIntentBuffer(10);
      const world = makeWorld({
        renderable: makeRenderable(4, [{ id: 1, k: RENDERABLE_KIND.GHOST, s: 42 }]),
        position: makePosition(4, [{ id: 1, r: 1, c: 1 }]),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, 1);
      expect(intents[0].spriteId).toBe(42);
    });
  });

  describe('buffer capacity', () => {
    it('does not exceed buffer capacity when entity count equals capacity', () => {
      const capacity = 4;
      const buffer = createRenderIntentBuffer(capacity);
      const entries = Array.from({ length: capacity }, (_, i) => ({
        id: i,
        k: RENDERABLE_KIND.PELLET,
      }));
      const world = makeWorld({
        renderable: makeRenderable(capacity, entries),
        position: makePosition(
          capacity,
          entries.map(({ id }) => ({ id, r: id, c: id })),
        ),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, 1);
      expect(intents).toHaveLength(capacity);
    });

    it('silently drops intents beyond buffer capacity', () => {
      const capacity = 2;
      const buffer = createRenderIntentBuffer(capacity);
      const world = makeWorld({
        renderable: makeRenderable(4, [
          { id: 0, k: RENDERABLE_KIND.PELLET },
          { id: 1, k: RENDERABLE_KIND.PELLET },
          { id: 2, k: RENDERABLE_KIND.PELLET },
        ]),
        position: makePosition(4, [
          { id: 0, r: 0, c: 0 },
          { id: 1, r: 1, c: 1 },
          { id: 2, r: 2, c: 2 },
        ]),
        renderIntentBuffer: buffer,
      });
      const intents = run(world, 1);
      expect(intents).toHaveLength(capacity);
    });
  });
});

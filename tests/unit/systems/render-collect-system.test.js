/**
 * Unit tests for the D-07 render collect system.
 *
 * Verifies the Position + Renderable ECS membership contract, interpolation
 * math, deterministic intent ordering, buffer reset, classBits passthrough,
 * opacity encoding, and buffer capacity handling — all without DOM dependencies.
 */

import { describe, expect, it } from 'vitest';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { createPositionStore } from '../../../src/ecs/components/spatial.js';
import {
  createRenderableStore,
  createVisualStateStore,
  RENDERABLE_KIND,
} from '../../../src/ecs/components/visual.js';
import { createRenderIntentBuffer, getRenderIntentView } from '../../../src/ecs/render-intent.js';
import { VISUAL_FLAGS } from '../../../src/ecs/resources/constants.js';
import {
  createRenderCollectSystem,
  RENDER_COLLECT_REQUIRED_MASK,
} from '../../../src/ecs/systems/render-collect-system.js';
import { World } from '../../../src/ecs/world/world.js';

const MAX_ENTITIES = 16;

function createHarness() {
  const world = new World();
  const system = createRenderCollectSystem();
  const position = createPositionStore(MAX_ENTITIES);
  const renderable = createRenderableStore(MAX_ENTITIES);
  const visualState = createVisualStateStore(MAX_ENTITIES);
  const buffer = createRenderIntentBuffer(MAX_ENTITIES);

  world.setResource('position', position);
  world.setResource('renderable', renderable);
  world.setResource('visualState', visualState);
  world.setResource('renderIntentBuffer', buffer);

  function addRenderableEntity({
    kind = RENDERABLE_KIND.PLAYER,
    spriteId = -1,
    row = 0,
    col = 0,
    prevRow,
    prevCol,
  } = {}) {
    const entity = world.createEntity(RENDER_COLLECT_REQUIRED_MASK);
    renderable.kind[entity.id] = kind;
    renderable.spriteId[entity.id] = spriteId;
    position.row[entity.id] = row;
    position.col[entity.id] = col;
    position.prevRow[entity.id] = prevRow ?? row;
    position.prevCol[entity.id] = prevCol ?? col;
    return entity;
  }

  function addRenderableOnlyEntity({ kind = RENDERABLE_KIND.PLAYER } = {}) {
    const entity = world.createEntity(COMPONENT_MASK.RENDERABLE);
    renderable.kind[entity.id] = kind;
    return entity;
  }

  function addPositionOnlyEntity({ row = 0, col = 0 } = {}) {
    const entity = world.createEntity(COMPONENT_MASK.POSITION);
    position.row[entity.id] = row;
    position.col[entity.id] = col;
    return entity;
  }

  function run(alpha = 1) {
    system.update({ world, alpha });
    return getRenderIntentView(buffer);
  }

  return {
    addPositionOnlyEntity,
    addRenderableEntity,
    addRenderableOnlyEntity,
    buffer,
    position,
    renderable,
    run,
    system,
    visualState,
    world,
  };
}

describe('render-collect-system', () => {
  describe('RENDER_COLLECT_REQUIRED_MASK', () => {
    it('requires both POSITION and RENDERABLE component bits', () => {
      expect(RENDER_COLLECT_REQUIRED_MASK & COMPONENT_MASK.POSITION).toBeTruthy();
      expect(RENDER_COLLECT_REQUIRED_MASK & COMPONENT_MASK.RENDERABLE).toBeTruthy();
    });
  });

  describe('Position + Renderable membership contract', () => {
    it('collects entities with both Position and Renderable components', () => {
      const { addRenderableEntity, run } = createHarness();
      addRenderableEntity({ kind: RENDERABLE_KIND.PLAYER });
      expect(run()).toHaveLength(1);
    });

    it('excludes entities with only the Renderable component bit', () => {
      const { addRenderableOnlyEntity, run } = createHarness();
      addRenderableOnlyEntity({ kind: RENDERABLE_KIND.PLAYER });
      expect(run()).toHaveLength(0);
    });

    it('excludes entities with only the Position component bit', () => {
      const { addPositionOnlyEntity, run } = createHarness();
      addPositionOnlyEntity({ row: 2, col: 3 });
      expect(run()).toHaveLength(0);
    });

    it('collects only the qualifying entity when mixed membership exists', () => {
      const { addRenderableEntity, addRenderableOnlyEntity, addPositionOnlyEntity, run } =
        createHarness();
      const qualifying = addRenderableEntity({ kind: RENDERABLE_KIND.GHOST });
      addRenderableOnlyEntity();
      addPositionOnlyEntity();
      const intents = run();
      expect(intents).toHaveLength(1);
      expect(intents[0].entityId).toBe(qualifying.id);
    });
  });

  describe('interpolation math', () => {
    it('interpolates x and y correctly at alpha=0.5', () => {
      const { addRenderableEntity, run } = createHarness();
      addRenderableEntity({ row: 4, col: 6, prevRow: 2, prevCol: 4 });
      const intents = run(0.5);
      expect(intents[0].x).toBeCloseTo(5, 6); // prevCol=4 + (6-4)*0.5
      expect(intents[0].y).toBeCloseTo(3, 6); // prevRow=2 + (4-2)*0.5
    });

    it('outputs previous position at alpha=0', () => {
      const { addRenderableEntity, run } = createHarness();
      addRenderableEntity({ row: 4, col: 6, prevRow: 2, prevCol: 4 });
      const intents = run(0);
      expect(intents[0].x).toBeCloseTo(4, 6);
      expect(intents[0].y).toBeCloseTo(2, 6);
    });

    it('outputs current position at alpha=1', () => {
      const { addRenderableEntity, run } = createHarness();
      addRenderableEntity({ row: 4, col: 6, prevRow: 2, prevCol: 4 });
      const intents = run(1);
      expect(intents[0].x).toBeCloseTo(6, 6);
      expect(intents[0].y).toBeCloseTo(4, 6);
    });

    it('clamps alpha above 1 to 1', () => {
      const { addRenderableEntity, run } = createHarness();
      addRenderableEntity({ row: 4, col: 6, prevRow: 2, prevCol: 4 });
      expect(run(2)[0].x).toBeCloseTo(6, 6);
    });

    it('clamps alpha below 0 to 0', () => {
      const { addRenderableEntity, run } = createHarness();
      addRenderableEntity({ row: 4, col: 6, prevRow: 2, prevCol: 4 });
      expect(run(-1)[0].x).toBeCloseTo(4, 6);
    });

    it('defaults to alpha=1 when alpha is not finite', () => {
      const { addRenderableEntity, system, world, buffer } = createHarness();
      addRenderableEntity({ row: 4, col: 6, prevRow: 2, prevCol: 4 });
      system.update({ world, alpha: NaN });
      expect(getRenderIntentView(buffer)[0].x).toBeCloseTo(6, 6);
    });
  });

  describe('deterministic ordering', () => {
    it('emits intents in ascending entity ID order', () => {
      const { addRenderableEntity, run } = createHarness();
      const e1 = addRenderableEntity({ kind: RENDERABLE_KIND.PLAYER });
      const e2 = addRenderableEntity({ kind: RENDERABLE_KIND.GHOST });
      const e3 = addRenderableEntity({ kind: RENDERABLE_KIND.PELLET });
      const ids = run().map((i) => i.entityId);
      expect(ids).toEqual([e1.id, e2.id, e3.id].sort((a, b) => a - b));
    });

    it('produces identical ordering on consecutive frames', () => {
      const { addRenderableEntity, system, world, buffer } = createHarness();
      addRenderableEntity({ kind: RENDERABLE_KIND.BOMB });
      addRenderableEntity({ kind: RENDERABLE_KIND.PLAYER });
      system.update({ world, alpha: 1 });
      const first = getRenderIntentView(buffer).map((i) => i.entityId);
      system.update({ world, alpha: 0.5 });
      const second = getRenderIntentView(buffer).map((i) => i.entityId);
      expect(first).toEqual(second);
    });
  });

  describe('buffer reset', () => {
    it('resets the buffer at the start of each frame', () => {
      const { addRenderableEntity, system, world, buffer, renderable } = createHarness();
      const entity = addRenderableEntity({ kind: RENDERABLE_KIND.PLAYER });
      system.update({ world, alpha: 1 });
      expect(getRenderIntentView(buffer)).toHaveLength(1);

      // Remove component membership — buffer should reflect new state
      renderable.kind[entity.id] = RENDERABLE_KIND.NONE;
      world.deferSetEntityMask(entity, COMPONENT_MASK.POSITION);
      world.flushDeferredMutations();
      system.update({ world, alpha: 1 });
      expect(getRenderIntentView(buffer)).toHaveLength(0);
    });
  });

  describe('classBits and opacity', () => {
    it('copies classBits from visualState into the intent', () => {
      const { addRenderableEntity, visualState, run } = createHarness();
      const entity = addRenderableEntity({ kind: RENDERABLE_KIND.GHOST });
      visualState.classBits[entity.id] = VISUAL_FLAGS.STUNNED;
      expect(run()[0].classBits).toBe(VISUAL_FLAGS.STUNNED);
    });

    it('sets opacity to 128 for invincible entities', () => {
      const { addRenderableEntity, visualState, run } = createHarness();
      const entity = addRenderableEntity({ kind: RENDERABLE_KIND.PLAYER });
      visualState.classBits[entity.id] = VISUAL_FLAGS.INVINCIBLE;
      expect(run()[0].opacity).toBe(128);
    });

    it('sets opacity to 255 for non-invincible entities', () => {
      const { addRenderableEntity, run } = createHarness();
      addRenderableEntity({ kind: RENDERABLE_KIND.PLAYER });
      expect(run()[0].opacity).toBe(255);
    });

    it('passes through spriteId from the renderable store', () => {
      const { addRenderableEntity, run } = createHarness();
      addRenderableEntity({ kind: RENDERABLE_KIND.GHOST, spriteId: 42 });
      expect(run()[0].spriteId).toBe(42);
    });
  });

  describe('missing resources', () => {
    it('returns early without throwing when required resources are missing', () => {
      const world = new World();
      const buffer = createRenderIntentBuffer(10);
      world.setResource('renderIntentBuffer', buffer);
      const system = createRenderCollectSystem();
      expect(() => system.update({ world, alpha: 1 })).not.toThrow();
      expect(getRenderIntentView(buffer)).toHaveLength(0);
    });
  });
});

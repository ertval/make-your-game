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
import {
  createRenderIntentBuffer,
  getRenderIntentView,
  resetRenderIntentBuffer,
} from '../../../src/ecs/render-intent.js';
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
  world.setResource('renderIntent', buffer);

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
    // Simulate bootstrap's pre-render reset — the collect system appends only.
    resetRenderIntentBuffer(buffer);
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
      resetRenderIntentBuffer(buffer);
      system.update({ world, alpha: 0.5 });
      const second = getRenderIntentView(buffer).map((i) => i.entityId);
      expect(first).toEqual(second);
    });
  });

  describe('buffer ownership', () => {
    it('appends only — does not reset the buffer itself (bootstrap owns the reset)', () => {
      const { addRenderableEntity, system, world, buffer, renderable } = createHarness();
      const entity = addRenderableEntity({ kind: RENDERABLE_KIND.PLAYER });

      // Frame 1: bootstrap resets, then collect runs
      resetRenderIntentBuffer(buffer);
      system.update({ world, alpha: 1 });
      expect(getRenderIntentView(buffer)).toHaveLength(1);

      // Frame 2: bootstrap resets, then collect runs with entity removed
      renderable.kind[entity.id] = RENDERABLE_KIND.NONE;
      world.deferSetEntityMask(entity, COMPONENT_MASK.POSITION);
      world.flushDeferredMutations();
      resetRenderIntentBuffer(buffer);
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
      world.setResource('renderIntent', buffer);
      const system = createRenderCollectSystem();
      expect(() => system.update({ world, alpha: 1 })).not.toThrow();
      expect(getRenderIntentView(buffer)).toHaveLength(0);
    });
  });

  describe('bomb / fire store scanning (issue #84)', () => {
    /**
     * Bombs and fires are placed by Track B systems (bomb-tick-system,
     * explosion-system) that don't set the RENDERABLE component bit. They DO
     * populate the position store + their own dedicated stores. The render
     * collect system must scan those stores directly so the corresponding
     * sprite-pool elements get an on-board transform — otherwise the bomb
     * sprite stays at translate(-9999px) and is invisible (issue #84).
     *
     * CANONICAL ACTIVE MARKER: `colliderStore.type[id]`. The gameplay
     * systems flip the collider type between COLLIDER_TYPE.BOMB / FIRE and
     * COLLIDER_TYPE.NONE on activation / detonation. `bombStore.ownerId` and
     * `fireStore.sourceBombId` are NOT reset on detonation, so using them
     * as an activity check leaves stale bomb/fire sprites stuck on the board.
     */

    /** Build a minimal collider store. NONE (0) is the default inactive marker. */
    function makeColliderStore(slots = 4) {
      return { type: new Uint8Array(slots) };
    }

    function makeBombStore(slots = 4) {
      return {
        ownerId: new Int32Array(slots).fill(-1),
        row: new Int32Array(slots),
        col: new Int32Array(slots),
      };
    }

    function makeFireStore(slots = 4) {
      return {
        sourceBombId: new Int32Array(slots).fill(-1),
        burnTimerMs: new Float64Array(slots),
        row: new Int32Array(slots),
        col: new Int32Array(slots),
      };
    }

    // COLLIDER_TYPE.{NONE,BOMB,FIRE} = 0, 3, 4 — see src/ecs/components/spatial.js.
    const COLLIDER_BOMB = 3;
    const COLLIDER_FIRE = 4;

    it('emits no BOMB intents when no collider slot is COLLIDER_TYPE.BOMB', () => {
      const { buffer, run, world } = createHarness();
      world.setResource('collider', makeColliderStore(8));
      world.setResource('bomb', makeBombStore(8));
      run();
      const intents = getRenderIntentView(buffer);
      expect(intents.filter((i) => i.kind === RENDERABLE_KIND.BOMB)).toHaveLength(0);
    });

    it('emits a BOMB intent for every collider slot marked COLLIDER_TYPE.BOMB', () => {
      const { buffer, run, world } = createHarness();
      const colliders = makeColliderStore(4);
      const bombs = makeBombStore(4);
      // Activate bomb at slot 0 (position 3,5) and slot 2 (position 7,1).
      colliders.type[0] = COLLIDER_BOMB;
      bombs.ownerId[0] = 1;
      bombs.row[0] = 3;
      bombs.col[0] = 5;
      colliders.type[2] = COLLIDER_BOMB;
      bombs.ownerId[2] = 1;
      bombs.row[2] = 7;
      bombs.col[2] = 1;
      world.setResource('collider', colliders);
      world.setResource('bomb', bombs);

      run();
      const bombIntents = getRenderIntentView(buffer).filter(
        (i) => i.kind === RENDERABLE_KIND.BOMB,
      );
      expect(bombIntents).toHaveLength(2);
      expect(bombIntents[0]).toMatchObject({ entityId: 0, x: 5, y: 3 });
      expect(bombIntents[1]).toMatchObject({ entityId: 2, x: 1, y: 7 });
    });

    it('stops emitting BOMB intents once the collider type is reset to NONE', () => {
      // Regression for the stuck-bomb screenshot: bombStore.ownerId stays set
      // after detonation, but colliderStore.type drops back to NONE.
      const { run, world } = createHarness();
      const colliders = makeColliderStore(4);
      const bombs = makeBombStore(4);
      colliders.type[1] = COLLIDER_BOMB;
      bombs.ownerId[1] = 1;
      bombs.row[1] = 0;
      bombs.col[1] = 0;
      world.setResource('collider', colliders);
      world.setResource('bomb', bombs);

      // Frame 1: bomb visible.
      expect(run().filter((i) => i.kind === RENDERABLE_KIND.BOMB)).toHaveLength(1);

      // Detonate: explosion-system flips collider.type back to NONE but
      // intentionally leaves bombStore.ownerId in place (slot data is kept
      // for the BombPlaced event payload contract).
      colliders.type[1] = 0;
      // bombs.ownerId[1] === 1 still! Old impl would still emit a BOMB intent.

      // Frame 2: no BOMB intent because collider type is NONE.
      expect(run().filter((i) => i.kind === RENDERABLE_KIND.BOMB)).toHaveLength(0);
    });

    it('emits a FIRE intent for every collider slot marked COLLIDER_TYPE.FIRE', () => {
      const { buffer, run, world } = createHarness();
      const colliders = makeColliderStore(4);
      const fires = makeFireStore(4);
      // slot 0: active fire at (2, 2)
      colliders.type[0] = COLLIDER_FIRE;
      fires.sourceBombId[0] = 0;
      fires.burnTimerMs[0] = 250;
      fires.row[0] = 2;
      fires.col[0] = 2;
      // slot 1: collider NONE — must skip even though sourceBombId is set.
      // slot 3: active fire at (4, 9)
      colliders.type[3] = COLLIDER_FIRE;
      fires.sourceBombId[3] = 0;
      fires.burnTimerMs[3] = 100;
      fires.row[3] = 4;
      fires.col[3] = 9;
      world.setResource('collider', colliders);
      world.setResource('fire', fires);

      run();
      const fireIntents = getRenderIntentView(buffer).filter(
        (i) => i.kind === RENDERABLE_KIND.FIRE,
      );
      expect(fireIntents).toHaveLength(2);
      expect(fireIntents[0]).toMatchObject({ entityId: 0, x: 2, y: 2 });
      expect(fireIntents[1]).toMatchObject({ entityId: 3, x: 9, y: 4 });
    });

    it('stops emitting FIRE intents once the collider type is reset to NONE', () => {
      // Regression for stuck-fire-tiles: fireStore.sourceBombId is not reset
      // after the burn timer expires; only colliderStore.type drops to NONE.
      const { run, world } = createHarness();
      const colliders = makeColliderStore(4);
      const fires = makeFireStore(4);
      colliders.type[2] = COLLIDER_FIRE;
      fires.sourceBombId[2] = 0;
      fires.burnTimerMs[2] = 250;
      fires.row[2] = 5;
      fires.col[2] = 5;
      world.setResource('collider', colliders);
      world.setResource('fire', fires);

      expect(run().filter((i) => i.kind === RENDERABLE_KIND.FIRE)).toHaveLength(1);

      colliders.type[2] = 0;
      // fires.sourceBombId[2] === 0 still — but collider type is now NONE.

      expect(run().filter((i) => i.kind === RENDERABLE_KIND.FIRE)).toHaveLength(0);
    });

    it('coexists with the existing POSITION+RENDERABLE entity query', () => {
      const { addRenderableEntity, run, world } = createHarness();
      addRenderableEntity({ kind: RENDERABLE_KIND.PLAYER, row: 1, col: 1 });
      const colliders = makeColliderStore(4);
      const bombs = makeBombStore(4);
      colliders.type[0] = COLLIDER_BOMB;
      bombs.ownerId[0] = 1;
      bombs.row[0] = 5;
      bombs.col[0] = 6;
      world.setResource('collider', colliders);
      world.setResource('bomb', bombs);

      const intents = run();
      const kinds = intents.map((i) => i.kind).sort((a, b) => a - b);
      expect(kinds).toContain(RENDERABLE_KIND.PLAYER);
      expect(kinds).toContain(RENDERABLE_KIND.BOMB);
    });

    it('does nothing extra when neither collider nor bomb/fire stores are registered', () => {
      const { addRenderableEntity, run } = createHarness();
      addRenderableEntity({ kind: RENDERABLE_KIND.PLAYER });
      expect(run()).toHaveLength(1);
    });
  });
});

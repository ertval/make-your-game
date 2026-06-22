/**
 * D-08: Render DOM System Tests
 *
 * Validates the DOM commit phase - batched transform/opacity/class writes,
 * sprite pool integration, and render-intent consumption.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { createPositionStore } from '../../../src/ecs/components/spatial.js';
import {
  createRenderableStore,
  createVisualStateStore,
  RENDERABLE_KIND,
  VISUAL_FLAGS,
} from '../../../src/ecs/components/visual.js';
import {
  createRenderIntentBuffer,
  resetRenderIntentBuffer,
} from '../../../src/ecs/resources/render-intent.js';
import { World } from '../../../src/ecs/world/world.js';

const MAX_ENTITIES = 16;

function createMockSpritePool() {
  const active = new Map();
  const idle = new Map();

  const SPRITE_TYPE = {
    PLAYER: 'player',
    GHOST: 'ghost',
    BOMB: 'bomb',
    FIRE: 'fire',
    PELLET: 'pellet',
    POWER_UP: 'powerup',
  };

  for (const type of Object.values(SPRITE_TYPE)) {
    idle.set(type, []);
    active.set(type, []);
  }

  const elements = new Map();

  return {
    acquire: vi.fn((type) => {
      let pool = idle.get(type);
      if (!pool || pool.length === 0) {
        pool = active.get(type) || [];
      }
      const el = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      elements.set(el, type);
      active.get(type).push(el);
      return el;
    }),
    release: vi.fn((type, el) => {
      const activePool = active.get(type);
      const idx = activePool.indexOf(el);
      if (idx !== -1) {
        activePool.splice(idx, 1);
        el.style.transform = 'translate(-9999px, -9999px)';
      }
    }),
    getActiveTypes: () => {
      const result = [];
      for (const [type, pool] of active) {
        if (pool.length > 0) result.push(type);
      }
      return result;
    },
    SPRITE_TYPE,
  };
}

function createHarness() {
  const world = new World();
  const spritePool = createMockSpritePool();

  const position = createPositionStore(MAX_ENTITIES);
  const renderable = createRenderableStore(MAX_ENTITIES);
  const visualState = createVisualStateStore(MAX_ENTITIES);
  const buffer = createRenderIntentBuffer(MAX_ENTITIES);

  world.setResource('position', position);
  world.setResource('renderable', renderable);
  world.setResource('visualState', visualState);
  world.setResource('renderIntent', buffer);
  world.setResource('spritePool', spritePool);

  function addRenderableEntity({
    kind = RENDERABLE_KIND.PLAYER,
    spriteId = -1,
    row = 0,
    col = 0,
    prevRow,
    prevCol,
  } = {}) {
    const entity = world.createEntity(COMPONENT_MASK.POSITION | COMPONENT_MASK.RENDERABLE);
    renderable.kind[entity.id] = kind;
    renderable.spriteId[entity.id] = spriteId;
    position.row[entity.id] = row;
    position.col[entity.id] = col;
    position.prevRow[entity.id] = prevRow ?? row;
    position.prevCol[entity.id] = prevCol ?? col;
    return entity;
  }

  function setVisualState(entityId, classBits = 0) {
    visualState.classBits[entityId] = classBits;
  }

  function resetBuffer() {
    resetRenderIntentBuffer(buffer);
  }

  function fillBuffer(intents) {
    resetBuffer();
    for (const intent of intents) {
      buffer.entityId[buffer._count] = intent.entityId;
      buffer.kind[buffer._count] = intent.kind;
      buffer.spriteId[buffer._count] = intent.spriteId ?? -1;
      buffer.x[buffer._count] = intent.x;
      buffer.y[buffer._count] = intent.y;
      buffer.classBits[buffer._count] = intent.classBits ?? 0;
      buffer.opacity[buffer._count] = intent.opacity ?? 255;
      buffer._count += 1;
    }
  }

  return {
    world,
    spritePool,
    position,
    renderable,
    visualState,
    buffer,
    addRenderableEntity,
    setVisualState,
    resetBuffer,
    fillBuffer,
  };
}

describe('render-dom-system', () => {
  let renderDomSystem;

  beforeEach(async () => {
    const { createRenderDomSystem } = await import('../../../src/ecs/systems/render-dom-system.js');
    renderDomSystem = createRenderDomSystem();
  });

  describe('phase and resource config', () => {
    it('runs in the render phase', () => {
      expect(renderDomSystem.phase).toBe('render');
    });

    it('declares read access to renderIntent and spritePool', () => {
      expect(renderDomSystem.resourceCapabilities.read).toContain('renderIntent');
      expect(renderDomSystem.resourceCapabilities.read).toContain('spritePool');
    });
  });

  describe('DOM commit', () => {
    it('applies transform translate3d for each intent', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 2.5, y: 3.0, opacity: 255, classBits: 0 },
      ]);

      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      expect(mockEl.style.transform).toBe('translate3d(80px, 96px, 0)');
    });

    it('applies opacity to elements', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 0, y: 0, opacity: 128, classBits: 0 },
      ]);

      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      expect(mockEl.style.opacity).toBe('0.502');
    });

    it('applies full opacity 255', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 0, y: 0, opacity: 255, classBits: 0 },
      ]);

      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      expect(mockEl.style.opacity).toBe('1.000');
    });
  });

  describe('sprite pool integration', () => {
    it('acquires sprite from pool for each intent kind', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 0, y: 0, opacity: 255, classBits: 0 },
        { entityId: 2, kind: RENDERABLE_KIND.GHOST, x: 0, y: 0, opacity: 255, classBits: 0 },
        { entityId: 3, kind: RENDERABLE_KIND.BOMB, x: 0, y: 0, opacity: 255, classBits: 0 },
      ]);

      const mockEl1 = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      const mockEl2 = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      const mockEl3 = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockImplementation((type) => {
        if (type === 'player') return mockEl1;
        if (type === 'ghost') return mockEl2;
        if (type === 'bomb') return mockEl3;
        return { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      });

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      expect(spritePool.acquire).toHaveBeenCalledWith('player');
      expect(spritePool.acquire).toHaveBeenCalledWith('ghost');
      expect(spritePool.acquire).toHaveBeenCalledWith('bomb');
    });
  });

  describe('bomb fuse frame classes', () => {
    it('maps the bomb spriteId to the matching fuse-frame class', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      // spriteId 2 → third fuse frame (.sprite--bomb--fuse-03).
      fillBuffer([
        {
          entityId: 1,
          kind: RENDERABLE_KIND.BOMB,
          spriteId: 2,
          x: 0,
          y: 0,
          opacity: 255,
          classBits: 0,
        },
      ]);

      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      expect(mockEl.classList.add).toHaveBeenCalledWith('sprite--bomb');
      expect(mockEl.classList.add).toHaveBeenCalledWith('sprite--bomb--fuse-03');
    });
  });

  describe('classList state handling', () => {
    it('adds stunned class for ghost with STUNNED flag', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        {
          entityId: 1,
          kind: RENDERABLE_KIND.GHOST,
          x: 0,
          y: 0,
          opacity: 255,
          classBits: VISUAL_FLAGS.STUNNED,
        },
      ]);

      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      expect(mockEl.classList.add).toHaveBeenCalledWith('sprite--ghost');
      expect(mockEl.classList.add).toHaveBeenCalledWith('sprite--ghost--stunned');
    });

    it('adds dead class for ghost with DEAD flag', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        {
          entityId: 1,
          kind: RENDERABLE_KIND.GHOST,
          x: 0,
          y: 0,
          opacity: 255,
          classBits: VISUAL_FLAGS.DEAD,
        },
      ]);

      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      expect(mockEl.classList.add).toHaveBeenCalledWith('sprite--ghost');
      expect(mockEl.classList.add).toHaveBeenCalledWith('sprite--ghost--dead');
    });

    it('adds speed-boost class for player with SPEED_BOOST flag', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        {
          entityId: 1,
          kind: RENDERABLE_KIND.PLAYER,
          x: 0,
          y: 0,
          opacity: 255,
          classBits: VISUAL_FLAGS.SPEED_BOOST,
        },
      ]);

      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      expect(mockEl.classList.add).toHaveBeenCalledWith('sprite--player');
      expect(mockEl.classList.add).toHaveBeenCalledWith('sprite--player--speed-boost');
    });

    it('hides HIDDEN entities via offscreen transform, not display:none (ARCH-01)', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        {
          entityId: 1,
          kind: RENDERABLE_KIND.PLAYER,
          x: 5,
          y: 7,
          opacity: 255,
          classBits: VISUAL_FLAGS.HIDDEN,
        },
      ]);

      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      // Per AGENTS.md: pool elements MUST be hidden via offscreen transform,
      // not display:none (which forces layout/reflow).
      expect(mockEl.style.transform).toBe('translate(-9999px, -9999px)');
      expect(mockEl.style.display).not.toBe('none');
    });
  });

  describe('kind mapping', () => {
    it('skips WALL kind (not rendered as sprite)', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.WALL, x: 0, y: 0, opacity: 255, classBits: 0 },
      ]);

      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      expect(spritePool.acquire).not.toHaveBeenCalled();
    });

    it('uses pellet pool for POWER_UP kind', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.POWER_UP, x: 0, y: 0, opacity: 255, classBits: 0 },
      ]);

      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      expect(spritePool.acquire).toHaveBeenCalledWith('pellet');
    });
  });

  describe('classList reset', () => {
    /**
     * Build a sprite-element double backed by a real Set so classList mutations
     * are observable end-to-end (add/remove actually change membership). Used to
     * prove the SEC-08 reset semantics rather than just spying on calls.
     */
    function createClassListElement(initialClasses = []) {
      const classes = new Set(initialClasses);
      return {
        style: {},
        classList: {
          add: (...names) => {
            for (const name of names) classes.add(name);
          },
          remove: (...names) => {
            for (const name of names) classes.delete(name);
          },
          contains: (name) => classes.has(name),
          get size() {
            return classes.size;
          },
          values: () => [...classes],
        },
      };
    }

    it('keeps the base sprite class after the per-frame reset', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 0, y: 0, opacity: 255, classBits: 0 },
      ]);

      const mockEl = createClassListElement(['sprite', 'sprite--ghost']);
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      // Base class survives; stale managed class from a previous use is cleared;
      // the fresh kind class is present.
      expect(mockEl.classList.contains('sprite')).toBe(true);
      expect(mockEl.classList.contains('sprite--ghost')).toBe(false);
      expect(mockEl.classList.contains('sprite--player')).toBe(true);
    });

    it('preserves foreign (non-managed) classes on the pooled element (SEC-08 / #167)', async () => {
      // Regression: the reset used to be `el.className = 'sprite'`, which wiped
      // EVERY class on the element — including ones added by other concerns
      // sharing the pooled node (debug overlays, test markers, future
      // cross-cutting features). The reset must remove only this system's own
      // managed sprite classes and leave foreign classes untouched.
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 0, y: 0, opacity: 255, classBits: 0 },
      ]);

      const mockEl = createClassListElement([
        'sprite',
        'debug-highlight', // foreign — must survive
        'sprite--ghost', // stale managed — must be cleared
      ]);
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      expect(mockEl.classList.contains('debug-highlight')).toBe(true);
      expect(mockEl.classList.contains('sprite')).toBe(true);
      expect(mockEl.classList.contains('sprite--ghost')).toBe(false);
      expect(mockEl.classList.contains('sprite--player')).toBe(true);
    });
  });

  describe('entity tracking', () => {
    it('tracks entity IDs across frames', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 0, y: 0, opacity: 255, classBits: 0 },
      ]);

      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      expect(spritePool.acquire).toHaveBeenCalledTimes(1);
    });
  });

  describe('missing resources', () => {
    it('returns early without throwing when renderIntent is missing', async () => {
      const { world } = createHarness();
      world.setResource('renderIntent', null);

      expect(() => renderDomSystem.update({ world })).not.toThrow();
    });

    it('returns early without throwing when spritePool is missing', async () => {
      const { buffer } = createHarness();
      const world = {
        getResource: (k) => {
          if (k === 'renderIntent') return buffer;
          if (k === 'spritePool') return null;
        },
      };

      expect(() => renderDomSystem.update({ world })).not.toThrow();
    });
  });

  describe('entity element reuse and type swap', () => {
    it('reuses existing element when entity kind has the same sprite type across frames', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValue(mockEl);

      // First frame — acquires element
      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 0, y: 0, opacity: 255, classBits: 0 },
      ]);
      renderDomSystem.update({
        world: {
          getResource: (k) =>
            k === 'renderIntent' ? buffer : k === 'spritePool' ? spritePool : null,
        },
      });
      expect(spritePool.acquire).toHaveBeenCalledTimes(1);

      // Second frame — same kind, should reuse (no new acquire)
      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 1, y: 0, opacity: 255, classBits: 0 },
      ]);
      renderDomSystem.update({
        world: {
          getResource: (k) =>
            k === 'renderIntent' ? buffer : k === 'spritePool' ? spritePool : null,
        },
      });

      // Reuse means acquire was called only once total (from first frame)
      expect(spritePool.acquire).toHaveBeenCalledTimes(1);
    });

    it('releases old element and acquires new one when entity sprite type changes', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      const playerEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      const ghostEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(playerEl).mockReturnValueOnce(ghostEl);

      // First frame — player
      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 0, y: 0, opacity: 255, classBits: 0 },
      ]);
      renderDomSystem.update({
        world: {
          getResource: (k) =>
            k === 'renderIntent' ? buffer : k === 'spritePool' ? spritePool : null,
        },
      });
      expect(spritePool.acquire).toHaveBeenCalledWith('player');

      // Second frame — same entity but now a ghost (type swap)
      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.GHOST, x: 0, y: 0, opacity: 255, classBits: 0 },
      ]);
      renderDomSystem.update({
        world: {
          getResource: (k) =>
            k === 'renderIntent' ? buffer : k === 'spritePool' ? spritePool : null,
        },
      });

      expect(spritePool.release).toHaveBeenCalledWith('player', playerEl);
      expect(spritePool.acquire).toHaveBeenCalledWith('ghost');
    });

    it('releases sprites for entities not rendered this frame', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      const playerEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      const ghostEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(playerEl).mockReturnValueOnce(ghostEl);

      // First frame — two entities
      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 0, y: 0, opacity: 255, classBits: 0 },
        { entityId: 2, kind: RENDERABLE_KIND.GHOST, x: 1, y: 0, opacity: 255, classBits: 0 },
      ]);
      renderDomSystem.update({
        world: {
          getResource: (k) =>
            k === 'renderIntent' ? buffer : k === 'spritePool' ? spritePool : null,
        },
      });

      expect(spritePool.release).not.toHaveBeenCalled();

      // Second frame — only entity 1 is rendered; entity 2 should be released
      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 0, y: 0, opacity: 255, classBits: 0 },
      ]);
      renderDomSystem.update({
        world: {
          getResource: (k) =>
            k === 'renderIntent' ? buffer : k === 'spritePool' ? spritePool : null,
        },
      });

      expect(spritePool.release).toHaveBeenCalledWith('ghost', ghostEl);
    });
  });

  describe('renderFrame=0 reset (restart / level transition)', () => {
    /**
     * Regression for: "Sometimes when restarting, or reaching a new level, a
     * ghost which hasn't spawned yet is still being rendered where they
     * previously were."
     *
     * On restart and on level transition, bootstrap flips `world.renderFrame`
     * back to 0 so frame counters start clean. The render-dom system uses
     * this as the signal to drop its `entityElementMap` tracking — but a
     * `Map.clear()` only forgets the entries; it does not return the pool
     * elements. Any sprite that was tracked from the previous run (e.g. a
     * ghost whose new mask is 0 while it waits in the spawn house) stays
     * stuck on the board at its last transform until *something* re-acquires
     * the element. The fix releases all tracked elements back to the pool
     * before clearing the map.
     */
    it('fires the restart cleanup when driven through the real World render commit', async () => {
      // Production-wiring regression: the live frame counter is delivered on
      // `context.renderFrame`, while `context.world` is the capability-scoped
      // worldView which has NO `renderFrame` property. A system that reads
      // `context.world.renderFrame` sees `undefined`, so the cleanup never
      // fires — that left a ghost element orphaned (pool active-set desynced
      // from the element map) and frozen at its previous-level transform.
      const { world, fillBuffer, spritePool } = createHarness();
      world.registerSystem(renderDomSystem);

      // Frame 3: a ghost element is acquired and tracked.
      world.renderFrame = 3;
      fillBuffer([
        { entityId: 7, kind: RENDERABLE_KIND.GHOST, x: 5, y: 5, opacity: 255, classBits: 0 },
      ]);
      world.runRenderCommit();
      expect(spritePool.release).not.toHaveBeenCalled();
      const ghostEl = spritePool.acquire.mock.results[0].value;

      // Restart: bootstrap flips renderFrame back to 0. The SAME entity id is
      // still produced this frame, so the per-frame "dropped out" cleanup
      // would NOT release the old element — only the renderFrame===0 bulk
      // clear does. The system must release the old element and re-acquire a
      // fresh one so the pool active-set never desyncs from the element map.
      // (Keeping the id present is what makes this assertion fail when the
      // system regresses to reading the always-undefined
      // `context.world.renderFrame`.)
      world.renderFrame = 0;
      fillBuffer([
        { entityId: 7, kind: RENDERABLE_KIND.GHOST, x: 5, y: 5, opacity: 255, classBits: 0 },
      ]);
      world.runRenderCommit();

      // The previously-tracked element is released back to the pool even
      // though `context.world` (the worldView) carries no renderFrame —
      // proving the system reads the live `context.renderFrame`.
      expect(spritePool.release).toHaveBeenCalledWith('ghost', ghostEl);
    });

    it('releases every tracked element back to the pool when renderFrame resets to 0', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      // Frame 1: a player and a ghost are tracked.
      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 1, y: 1, opacity: 255, classBits: 0 },
        { entityId: 7, kind: RENDERABLE_KIND.GHOST, x: 5, y: 5, opacity: 255, classBits: 0 },
      ]);

      const playerEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      const ghostEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(playerEl).mockReturnValueOnce(ghostEl);

      // The live frame counter is delivered on `context.renderFrame` (the
      // world's render commit puts it there). The per-system `world` is the
      // frozen worldView and carries NO `renderFrame` property — mirror that
      // here so this test would fail if the system regressed to reading
      // `context.world.renderFrame` (which is always undefined in production).
      renderDomSystem.update({
        renderFrame: 1,
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
            return null;
          },
        },
      });

      expect(spritePool.release).not.toHaveBeenCalled();

      // Frame 0 (simulates restart / level transition): buffer is empty —
      // the new level's entities haven't produced intents yet. The old
      // entries in entityElementMap must be released so their elements
      // don't stay parked at the previous transform.
      resetRenderIntentBuffer(buffer);

      renderDomSystem.update({
        renderFrame: 0,
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
            return null;
          },
        },
      });

      // Both previously-tracked elements must be released. The exact order
      // depends on Map insertion order; we just want both calls.
      expect(spritePool.release).toHaveBeenCalledWith('player', playerEl);
      expect(spritePool.release).toHaveBeenCalledWith('ghost', ghostEl);
      expect(spritePool.release).toHaveBeenCalledTimes(2);
    });

    it('does not double-release elements that were already released by the steady-state cleanup loop', async () => {
      // Sanity check: the renderFrame=0 release path is for the restart edge
      // only; the per-frame "entity dropped out of intent list" cleanup must
      // continue to handle steady-state releases without help.
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        { entityId: 3, kind: RENDERABLE_KIND.PLAYER, x: 0, y: 0, opacity: 255, classBits: 0 },
      ]);
      const playerEl = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      spritePool.acquire.mockReturnValueOnce(playerEl);

      // Steady-state frame 5.
      renderDomSystem.update({
        renderFrame: 5,
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
            return null;
          },
        },
      });
      expect(spritePool.release).not.toHaveBeenCalled();

      // Steady-state frame 6 with no intents → entity dropped out → release.
      resetRenderIntentBuffer(buffer);
      renderDomSystem.update({
        renderFrame: 6,
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
            return null;
          },
        },
      });
      expect(spritePool.release).toHaveBeenCalledTimes(1);
      expect(spritePool.release).toHaveBeenCalledWith('player', playerEl);
    });
  });
});

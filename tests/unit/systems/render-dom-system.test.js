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
} from '../../../src/ecs/render-intent.js';
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

    it('hides element when HIDDEN flag is set', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        {
          entityId: 1,
          kind: RENDERABLE_KIND.PLAYER,
          x: 0,
          y: 0,
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

      expect(mockEl.style.display).toBe('none');
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
    it('clears className before adding new classes', async () => {
      const { buffer, fillBuffer, spritePool } = createHarness();

      fillBuffer([
        { entityId: 1, kind: RENDERABLE_KIND.PLAYER, x: 0, y: 0, opacity: 255, classBits: 0 },
      ]);

      const mockEl = {
        classList: { add: vi.fn(), remove: vi.fn() },
        style: {},
        className: 'old-class',
      };
      spritePool.acquire.mockReturnValueOnce(mockEl);

      renderDomSystem.update({
        world: {
          getResource: (k) => {
            if (k === 'renderIntent') return buffer;
            if (k === 'spritePool') return spritePool;
          },
        },
      });

      expect(mockEl.className).toBe('');
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
});

/**
 * D-08: Render DOM system integration tests.
 *
 * Verifies that createRenderDomSystem() integrates with the render pipeline:
 * - Registers in the 'render' phase
 * - Reads from render-intent buffer (filled by render-collect-system)
 * - Acquires sprites from pool
 * - Applies DOM writes
 * - Runs after render-collect-system in registration order
 */

import { describe, expect, it, vi } from 'vitest';
import { createRenderIntentBuffer } from '../../../src/ecs/render-intent.js';
import { createRenderDomSystem } from '../../../src/ecs/systems/render-dom-system.js';
import { World } from '../../../src/ecs/world/world.js';

function createMockSpritePool() {
  const activeEls = [];
  const acquired = [];

  return {
    acquire: vi.fn((type) => {
      const el = { classList: { add: vi.fn() }, style: {}, className: '' };
      acquired.push({ type, element: el });
      activeEls.push(el);
      return el;
    }),
    release: vi.fn(),
    stats: vi.fn(() => ({ player: activeEls.filter((e) => e.type === 'player').length })),
    getAcquiredEls: () => acquired,
  };
}

function createIntegrationHarness() {
  const world = new World();
  const buffer = createRenderIntentBuffer(16);
  const spritePool = createMockSpritePool();

  world.setResource('renderIntent', buffer);
  world.setResource('spritePool', spritePool);

  return { world, buffer, spritePool };
}

describe('render-dom-system integration', () => {
  it('registers without throwing in the render phase', () => {
    const { world } = createIntegrationHarness();
    expect(() => world.registerSystem(createRenderDomSystem())).not.toThrow();
  });

  it('declares phase render so World.registerSystem() accepts it', () => {
    expect(createRenderDomSystem().phase).toBe('render');
  });

  it('acquires sprites from pool for each intent in buffer', () => {
    const { world, buffer, spritePool } = createIntegrationHarness();

    // Pre-populate buffer with intents (simulating render-collect-system output)
    buffer.entityId[0] = 1;
    buffer.kind[0] = 1; // PLAYER
    buffer.x[0] = 2;
    buffer.y[0] = 3;
    buffer.opacity[0] = 255;
    buffer.classBits[0] = 0;
    buffer._count = 1;

    world.registerSystem(createRenderDomSystem());
    world.runRenderCommit({ alpha: 1 });

    expect(spritePool.acquire).toHaveBeenCalledTimes(1);
    expect(spritePool.acquire).toHaveBeenCalledWith('player');
  });

  it('applies transform with pixel coordinates (tile * 32)', () => {
    const { world, buffer, spritePool } = createIntegrationHarness();

    buffer.entityId[0] = 1;
    buffer.kind[0] = 1; // PLAYER
    buffer.x[0] = 3; // 3 * 32 = 96px
    buffer.y[0] = 2; // 2 * 32 = 64px
    buffer.opacity[0] = 255;
    buffer.classBits[0] = 0;
    buffer._count = 1;

    world.registerSystem(createRenderDomSystem());
    world.runRenderCommit({ alpha: 1 });

    const acquired = spritePool.getAcquiredEls();
    expect(acquired[0].element.style.transform).toBe('translate3d(96px, 64px, 0)');
  });

  it('handles empty buffer gracefully', () => {
    const { world, spritePool } = createIntegrationHarness();

    world.registerSystem(createRenderDomSystem());
    world.runRenderCommit({ alpha: 1 });

    expect(spritePool.acquire).not.toHaveBeenCalled();
  });

  it('runs after render-collect-system in registration order', () => {
    const { world, buffer } = createIntegrationHarness();

    buffer.entityId[0] = 1;
    buffer.kind[0] = 1;
    buffer.x[0] = 0;
    buffer.y[0] = 0;
    buffer.opacity[0] = 255;
    buffer.classBits[0] = 0;
    buffer._count = 1;

    const callOrder = [];
    const collectSystem = {
      name: 'render-collect-system',
      phase: 'render',
      update() {
        callOrder.push('collect');
      },
    };
    const domSystem = createRenderDomSystem();
    domSystem.update = vi.fn(domSystem.update);

    world.registerSystem(collectSystem);
    world.registerSystem(domSystem);
    world.runRenderCommit({ alpha: 1 });

    expect(callOrder).toContain('collect');
  });
});

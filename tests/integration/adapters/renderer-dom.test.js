/**
 * D-08 / ARCH-01: Render DOM System Integration Tests
 *
 * Verifies that the active render-dom-system does not perform any writes
 * to innerHTML, ensuring DOM safety.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { RENDERABLE_KIND } from '../../../src/ecs/components/visual.js';
import { createRenderIntentBuffer } from '../../../src/ecs/render-intent.js';
import { createRenderDomSystem } from '../../../src/ecs/systems/render-dom-system.js';
import { World } from '../../../src/ecs/world/world.js';

function createMockSpritePool() {
  let innerHtmlWrites = 0;

  const mockElement = {
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
    },
    style: {
      transform: '',
      opacity: '',
    },
    get innerHTML() {
      return '';
    },
    set innerHTML(_val) {
      innerHtmlWrites += 1;
    },
    className: '',
  };

  return {
    acquire: vi.fn(() => mockElement),
    release: vi.fn(),
    getInnerHtmlWrites: () => innerHtmlWrites,
  };
}

describe('render-dom-system DOM safety', () => {
  it('enforces 0 innerHTML writes during runRenderCommit', () => {
    const world = new World();
    const buffer = createRenderIntentBuffer(16);
    const spritePool = createMockSpritePool();

    world.setResource('renderIntent', buffer);
    world.setResource('spritePool', spritePool);

    // Pre-populate buffer with intents
    buffer.entityId[0] = 1;
    buffer.kind[0] = RENDERABLE_KIND.PLAYER;
    buffer.x[0] = 2;
    buffer.y[0] = 3;
    buffer.opacity[0] = 255;
    buffer.classBits[0] = 0;
    buffer._count = 1;

    world.registerSystem(createRenderDomSystem());
    world.runRenderCommit({ alpha: 1 });

    expect(spritePool.acquire).toHaveBeenCalledTimes(1);
    expect(spritePool.getInnerHtmlWrites()).toBe(0);
  });

  it('contains zero innerHTML references in the render-dom-system source code', () => {
    const systemFilePath = path.resolve(__dirname, '../../../src/ecs/systems/render-dom-system.js');
    const sourceCode = fs.readFileSync(systemFilePath, 'utf8');

    // Make sure 'innerHTML' string/token is nowhere in the file.
    expect(sourceCode.includes('innerHTML')).toBe(false);
  });
});

/**
 * Unit tests for ARCH-01 and DEAD-X06 DOM Renderer.
 *
 * Verifies that the renderer correctly creates and updates entity nodes
 * using direct iteration over the RenderIntentBuffer.
 *
 * Uses stubs to avoid dependency on a real DOM environment (JSDOM/HappyDOM).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDomRenderer } from '../../../src/adapters/dom/renderer-dom.js';

function createMockElement(_kind = 'div') {
  return {
    className: '',
    children: [],
    style: {
      transform: '',
      opacity: '',
    },
    dataset: {},
    appendChild: vi.fn(function (child) {
      this.children.push(child);
    }),
    removeChild: vi.fn(function (child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
    }),
  };
}

describe('dom-renderer', () => {
  let appRoot;
  let renderer;

  beforeEach(() => {
    // Stub global document for the factory call
    vi.stubGlobal('document', {
      createElement: vi.fn(() => createMockElement()),
    });

    appRoot = createMockElement();
    renderer = createDomRenderer({ appRoot });
  });

  it('creates new elements for new entities', () => {
    const buffer = {
      _count: 1,
      entityId: [10],
      kind: [1],
      x: [1],
      y: [2],
      opacity: [255],
      classBits: [0],
    };

    renderer.update(buffer);

    expect(appRoot.appendChild).toHaveBeenCalled();
    expect(appRoot.children.length).toBe(1);
    const el = appRoot.children[0];
    expect(el.className).toContain('kind-1');
  });

  it('updates existing elements and avoids re-creation', () => {
    const buffer1 = {
      _count: 1,
      entityId: [10],
      kind: [1],
      x: [1],
      y: [1],
      opacity: [255],
      classBits: [0],
    };

    renderer.update(buffer1);
    const firstEl = appRoot.children[0];
    expect(appRoot.appendChild).toHaveBeenCalledTimes(1);

    const buffer2 = {
      _count: 1,
      entityId: [10],
      kind: [1],
      x: [2],
      y: [2],
      opacity: [128],
      classBits: [1],
    };

    renderer.update(buffer2);

    expect(appRoot.children.length).toBe(1);
    expect(appRoot.children[0]).toBe(firstEl); // Stable node tracking
    expect(appRoot.appendChild).toHaveBeenCalledTimes(1); // No new append
    expect(firstEl.style.transform).toBe('translate3d(64px, 64px, 0)'); // 2 * 32px
    expect(firstEl.style.opacity).toBe('0.50'); // 128 / 255
  });

  it('removes elements for entities no longer in the buffer (ARCH-13)', () => {
    const buffer1 = {
      _count: 1,
      entityId: [10],
      kind: [1],
      x: [1],
      y: [1],
      opacity: [255],
      classBits: [0],
    };

    renderer.update(buffer1);
    expect(appRoot.children.length).toBe(1);

    const buffer2 = {
      _count: 0,
      entityId: [],
      kind: [],
      x: [],
      y: [],
      opacity: [],
      classBits: [],
    };

    renderer.update(buffer2);
    expect(appRoot.removeChild).toHaveBeenCalled();
    expect(appRoot.children.length).toBe(0);
  });

  it('throws when appRoot is missing', () => {
    expect(() => createDomRenderer({})).toThrow('DomRenderer requires an appRoot element.');
    expect(() => createDomRenderer({ appRoot: null })).toThrow('DomRenderer requires an appRoot element.');
  });
});

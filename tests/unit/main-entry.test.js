/*
 * Unit coverage for main entrypoints.
 *
 * Purpose: ensure main.ecs.js stays side-effect free on import.
 */

import { describe, expect, it, vi } from 'vitest';

describe('main.ecs.js entrypoint', () => {
  it('does not auto-bootstrap on import when window/document are present', async () => {
    const hadWindow = Object.hasOwn(globalThis, 'window');
    const hadDocument = Object.hasOwn(globalThis, 'document');
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    globalThis.window = {};
    globalThis.document = {
      getElementById: () => {
        throw new Error('Unexpected bootstrap side effect.');
      },
    };

    vi.resetModules();

    try {
      await expect(import('../../src/main.ecs.js')).resolves.toBeDefined();
    } finally {
      if (hadWindow) {
        globalThis.window = originalWindow;
      } else {
        delete globalThis.window;
      }

      if (hadDocument) {
        globalThis.document = originalDocument;
      } else {
        delete globalThis.document;
      }
    }
  });
});

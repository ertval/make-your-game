/**
 * Test: trusted-types.test.js
 * Purpose: Verifies the Trusted Types default-policy bootstrap behavior.
 * Public API: N/A (test module).
 * Implementation Notes: Uses dynamic imports to exercise module side effects.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../../src/security/trusted-types.js';
const originalWindow = globalThis.window;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (typeof originalWindow === 'undefined') {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

async function loadTrustedTypesModule() {
  await import(MODULE_PATH);
}

describe('trusted types bootstrap', () => {
  it('no-ops when window is unavailable', async () => {
    delete globalThis.window;
    await expect(loadTrustedTypesModule()).resolves.toBeUndefined();
  });

  it('creates the default policy when none exists', async () => {
    const createPolicy = vi.fn(() => ({}));

    globalThis.window = {
      trustedTypes: {
        defaultPolicy: null,
        createPolicy,
      },
    };

    await loadTrustedTypesModule();

    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(createPolicy).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        createHTML: expect.any(Function),
        createScript: expect.any(Function),
        createScriptURL: expect.any(Function),
      }),
    );
  });

  it('does not create a policy when one already exists', async () => {
    const createPolicy = vi.fn(() => ({}));

    globalThis.window = {
      trustedTypes: {
        defaultPolicy: {},
        createPolicy,
      },
    };

    await loadTrustedTypesModule();

    expect(createPolicy).not.toHaveBeenCalled();
  });
});

/**
 * Test: a03-runtime-error-handling.test.js
 * Purpose: Verifies critical runtime error surfacing for unhandled promise rejections.
 * Public API: N/A (test module).
 * Implementation Notes: Uses window/logger/overlay stubs to validate handler installation and error UI output.
 */

import { describe, expect, it, vi } from 'vitest';

import { installUnhandledRejectionHandler } from '../../../src/main.ecs.js';

function createWindowStub() {
  const listeners = new Map();

  return {
    addEventListener: vi.fn((eventName, handler) => {
      listeners.set(eventName, handler);
    }),
    dispatch: (eventName, payload = {}) => {
      const handler = listeners.get(eventName);
      if (handler) {
        handler(payload);
      }
    },
  };
}

describe('A-03 runtime critical error handling', () => {
  it('renders an overlay message for unhandled promise rejections', () => {
    const overlayRoot = {
      setAttribute: vi.fn(),
      textContent: '',
    };
    const logger = {
      error: vi.fn(),
    };
    const windowStub = createWindowStub();

    installUnhandledRejectionHandler({
      logger,
      overlayRoot,
      windowRef: windowStub,
    });

    const rejectionReason = new Error('boom');
    windowStub.dispatch('unhandledrejection', {
      reason: rejectionReason,
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled promise rejection in game runtime.',
      rejectionReason,
    );
    expect(overlayRoot.setAttribute).toHaveBeenCalledWith('aria-live', 'assertive');
    expect(overlayRoot.setAttribute).toHaveBeenCalledWith('role', 'alert');
    expect(overlayRoot.textContent).toBe('Critical error: boom');
  });

  it('installs only one unhandled rejection handler per window', () => {
    const overlayRoot = {
      setAttribute: vi.fn(),
      textContent: '',
    };
    const logger = {
      error: vi.fn(),
    };
    const windowStub = createWindowStub();

    installUnhandledRejectionHandler({
      logger,
      overlayRoot,
      windowRef: windowStub,
    });
    installUnhandledRejectionHandler({
      logger,
      overlayRoot,
      windowRef: windowStub,
    });

    expect(windowStub.addEventListener).toHaveBeenCalledTimes(1);
  });
});

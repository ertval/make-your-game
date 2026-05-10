import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDevelopment } from '../../../src/shared/env.js';

describe('env.js', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when NODE_ENV is development', () => {
    vi.stubGlobal('process', { env: { NODE_ENV: 'development' } });
    expect(isDevelopment()).toBe(true);
  });

  it('returns false when NODE_ENV is not development', () => {
    vi.stubGlobal('process', { env: { NODE_ENV: 'production' } });
    expect(isDevelopment()).toBe(false);
  });

  it('returns false when process throws a ReferenceError (catch block)', () => {
    // Save original process
    const originalProcess = globalThis.process;

    // Temporarily delete process to trigger catch block in env.js
    delete globalThis.process;

    try {
      expect(isDevelopment()).toBe(false);
    } finally {
      // Restore original process immediately
      globalThis.process = originalProcess;
    }
  });
});

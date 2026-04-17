/**
 * Unit tests for the Track C storage adapter.
 *
 * Verifies that persisted high-score reads treat storage as untrusted input,
 * fail closed on malformed payloads, and tolerate storage access failures.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  createStorageAdapter,
  parsePersistedHighScore,
} from '../../../src/adapters/io/storage-adapter.js';

describe('storage-adapter', () => {
  it('parses a valid persisted high score', () => {
    expect(parsePersistedHighScore('{"highScore":42}')).toBe(42);
  });

  it('fails closed on malformed persisted payloads', () => {
    expect(parsePersistedHighScore('not-json', 7)).toBe(7);
    expect(parsePersistedHighScore('{"highScore":"bad"}', 7)).toBe(7);
    expect(parsePersistedHighScore('{"highScore":-4}', 7)).toBe(7);
  });

  it('guards storage reads and writes with fallback behavior', () => {
    const logger = { warn: vi.fn() };
    const storage = {
      getItem() {
        throw new Error('read blocked');
      },
      setItem() {
        throw new Error('write blocked');
      },
    };
    const adapter = createStorageAdapter({ logger, storage });

    expect(adapter.loadHighScore(9)).toBe(9);
    expect(adapter.saveHighScore(12)).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});

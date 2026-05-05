/**
 * Unit tests for the Track C storage adapter.
 *
 * Verifies guarded localStorage reads, invalid JSON fallback behavior,
 * untrusted-shape rejection, and write-path error handling.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getHighScore,
  HIGH_SCORE_STORAGE_KEY,
  safeRead,
  safeWrite,
  saveHighScore,
} from '../../../src/adapters/io/storage-adapter.js';

function createMockStorage() {
  let store = {};

  return {
    clear() {
      store = {};
    },
    getItem(key) {
      return key in store ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = value;
    },
  };
}

describe('storage-adapter', () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    globalThis.localStorage = mockStorage;
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns the default value when the key is missing', () => {
    const result = safeRead('missing', null, { score: 0 });

    expect(result).toEqual({ score: 0 });
  });

  it('returns the parsed value when the stored JSON is a valid object', () => {
    localStorage.setItem('good', JSON.stringify({ score: 10 }));

    const result = safeRead('good', null, { score: 0 });

    expect(result).toEqual({ score: 10 });
  });

  it('returns the default value and warns when stored JSON is invalid', () => {
    localStorage.setItem('bad', '{invalid json}');

    const result = safeRead('bad', null, { score: 0 });

    expect(result).toEqual({ score: 0 });
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns the default value when the parsed value is not an object', () => {
    localStorage.setItem('wrong', JSON.stringify(123));

    const result = safeRead('wrong', null, { score: 0 });

    expect(result).toEqual({ score: 0 });
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns the default value when the parsed value is null', () => {
    localStorage.setItem('null', JSON.stringify(null));

    const result = safeRead('null', null, { score: 0 });

    expect(result).toEqual({ score: 0 });
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns the default value when the parsed value is an array', () => {
    localStorage.setItem('array', JSON.stringify([1, 2, 3]));

    const result = safeRead('array', null, { score: 0 });

    expect(result).toEqual({ score: 0 });
    expect(console.warn).toHaveBeenCalled();
  });

  it('stores a JSON string during safeWrite', () => {
    safeWrite('test', { score: 5 });

    expect(localStorage.getItem('test')).toBe(JSON.stringify({ score: 5 }));
  });

  it('handles safeWrite storage errors gracefully', () => {
    globalThis.localStorage = {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error('fail');
      },
    };

    safeWrite('test', { score: 5 });

    expect(console.warn).toHaveBeenCalled();
  });

  it('stores normalized high scores with the canonical key', () => {
    saveHighScore(42.9);

    expect(localStorage.getItem(HIGH_SCORE_STORAGE_KEY)).toBe(JSON.stringify({ score: 42 }));
  });

  it('returns 0 for malformed high score payloads', () => {
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify({ score: 'bad' }));

    expect(getHighScore()).toBe(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns the stored finite high score value', () => {
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify({ score: 105 }));

    expect(getHighScore()).toBe(105);
  });
});

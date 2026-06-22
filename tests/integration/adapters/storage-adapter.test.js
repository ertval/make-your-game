/**
 * Unit tests for the Track C storage adapter.
 *
 * Verifies guarded localStorage reads, invalid JSON fallback behavior,
 * untrusted-shape rejection, and write-path error handling.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUDIO_SETTINGS_STORAGE_KEY,
  DEFAULT_AUDIO_SETTINGS,
  getAudioSettings,
  getHighScore,
  getHighScores,
  HIGH_SCORE_STORAGE_KEY,
  MAX_HIGH_SCORES,
  safeRead,
  safeWrite,
  saveAudioSettings,
  saveHighScore,
  updateAudioSetting,
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

  it('returns the default value and warns when the validate predicate rejects the value', () => {
    localStorage.setItem('typed', JSON.stringify({ score: 10 }));

    const validate = vi.fn(() => false);
    const result = safeRead('typed', validate, { score: 0 });

    expect(result).toEqual({ score: 0 });
    expect(validate).toHaveBeenCalledWith({ score: 10 });
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns the parsed value when the validate predicate accepts it', () => {
    localStorage.setItem('typed', JSON.stringify({ score: 10 }));

    const validate = vi.fn(() => true);
    const result = safeRead('typed', validate, { score: 0 });

    expect(result).toEqual({ score: 10 });
    expect(validate).toHaveBeenCalledWith({ score: 10 });
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

  it('stores a normalized high score as a top-N list with the canonical key', () => {
    saveHighScore(42.9);

    expect(localStorage.getItem(HIGH_SCORE_STORAGE_KEY)).toBe(
      JSON.stringify({ score: 42, scores: [42] }),
    );
  });

  it('returns 0 for malformed high score payloads', () => {
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify({ score: 'bad' }));

    expect(getHighScore()).toBe(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns the stored finite high score value (legacy single-score shape)', () => {
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify({ score: 105 }));

    expect(getHighScore()).toBe(105);
    expect(getHighScores()).toEqual([105]);
  });

  it('accumulates finished-game scores into a descending, deduplicated top-N list', () => {
    saveHighScore(100);
    saveHighScore(300);
    saveHighScore(300); // duplicate is collapsed
    saveHighScore(200);

    expect(getHighScores()).toEqual([300, 200, 100]);
    expect(getHighScore()).toBe(300);
  });

  it(`caps the leaderboard at MAX_HIGH_SCORES (${MAX_HIGH_SCORES}) keeping the highest`, () => {
    // Insert 1..15 in arbitrary order.
    for (const value of [5, 12, 3, 15, 9, 1, 14, 7, 11, 2, 13, 8, 4, 10, 6]) {
      saveHighScore(value);
    }

    const scores = getHighScores();
    expect(scores).toHaveLength(MAX_HIGH_SCORES);
    expect(scores).toEqual([15, 14, 13, 12, 11, 10, 9, 8, 7, 6]);
  });

  it('ignores zero / invalid finished-game scores', () => {
    saveHighScore(0);
    saveHighScore(-50);
    saveHighScore(Number.NaN);

    expect(getHighScores()).toEqual([]);
    expect(localStorage.getItem(HIGH_SCORE_STORAGE_KEY)).toBeNull();
  });

  it('reads a stored top-N list and returns it sorted descending', () => {
    localStorage.setItem(
      HIGH_SCORE_STORAGE_KEY,
      JSON.stringify({ score: 50, scores: [10, 50, 30] }),
    );

    expect(getHighScores()).toEqual([50, 30, 10]);
    expect(getHighScore()).toBe(50);
  });
});

describe('storage-adapter: C-11A audio settings', () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    globalThis.localStorage = mockStorage;
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns the documented defaults when no settings are stored', () => {
    expect(getAudioSettings()).toEqual({
      musicEnabled: true,
      sfxEnabled: true,
      musicVolume: 1,
      sfxVolume: 1,
      uiVolume: 1,
    });
    // The exported default constant matches the ticket contract.
    expect(DEFAULT_AUDIO_SETTINGS).toEqual(getAudioSettings());
  });

  it('round-trips a full settings object through save and restore', () => {
    const settings = {
      musicEnabled: false,
      sfxEnabled: true,
      musicVolume: 0.25,
      sfxVolume: 0.5,
      uiVolume: 0.75,
    };

    const written = saveAudioSettings(settings);
    expect(written).toEqual(settings);

    // Restore reads back the exact same values (persistence round-trip).
    expect(getAudioSettings()).toEqual(settings);
    // And it is the canonical key the rest of the app reads.
    expect(JSON.parse(localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY))).toEqual(settings);
  });

  it('falls back to defaults when the stored JSON is malformed', () => {
    localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, '{ not valid json');

    expect(getAudioSettings()).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(console.warn).toHaveBeenCalled();
  });

  it('falls back to defaults when the stored value is not an object', () => {
    localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify('loud'));

    expect(getAudioSettings()).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it('repairs individual invalid fields without discarding the valid ones', () => {
    localStorage.setItem(
      AUDIO_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        musicEnabled: 'yes', // not a boolean -> default true
        sfxEnabled: false, // valid -> kept
        musicVolume: 2, // out of range -> clamped to 1
        sfxVolume: -3, // out of range -> clamped to 0
        uiVolume: 'NaN', // not a number -> default 1
      }),
    );

    expect(getAudioSettings()).toEqual({
      musicEnabled: true,
      sfxEnabled: false,
      musicVolume: 1,
      sfxVolume: 0,
      uiVolume: 1,
    });
  });

  it('persists immediately on a single-field change (read-merge-write)', () => {
    saveAudioSettings({ ...DEFAULT_AUDIO_SETTINGS, musicVolume: 0.9 });

    const result = updateAudioSetting('musicEnabled', false);

    // Returned + persisted value reflects the change and keeps the other fields.
    expect(result.musicEnabled).toBe(false);
    expect(result.musicVolume).toBe(0.9);
    expect(getAudioSettings()).toEqual(result);
  });

  it('ignores unknown setting keys without corrupting storage', () => {
    saveAudioSettings(DEFAULT_AUDIO_SETTINGS);

    const result = updateAudioSetting('masterVolume', 0.1);

    expect(result).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(console.warn).toHaveBeenCalled();
  });

  it('normalizes a partial object on save, filling missing fields with defaults', () => {
    const written = saveAudioSettings({ musicVolume: 0.3 });

    expect(written).toEqual({
      musicEnabled: true,
      sfxEnabled: true,
      musicVolume: 0.3,
      sfxVolume: 1,
      uiVolume: 1,
    });
  });
});

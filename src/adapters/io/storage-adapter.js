/*
 * Storage adapter for persisted high-score state.
 *
 * This module centralizes the localStorage trust boundary so runtime code can
 * read and write high-score data without assuming persisted values are valid.
 * All reads fail closed: malformed JSON, hostile shapes, storage access errors,
 * and non-finite values return the supplied fallback instead of propagating
 * untrusted data into gameplay state.
 *
 * Public API:
 * - HIGH_SCORE_STORAGE_KEY
 * - createStorageAdapter(options)
 * - parsePersistedHighScore(rawValue, fallbackScore?)
 *
 * Implementation notes:
 * - Only non-negative finite integers are accepted as persisted scores.
 * - Browser storage exceptions are caught and downgraded to warnings so
 *   gameplay can continue when storage is unavailable or blocked.
 */

export const HIGH_SCORE_STORAGE_KEY = 'ms-ghostman.high-score';

function normalizeFallbackScore(fallbackScore = 0) {
  if (!Number.isFinite(fallbackScore) || fallbackScore < 0) {
    return 0;
  }

  return Math.floor(fallbackScore);
}

export function parsePersistedHighScore(rawValue, fallbackScore = 0) {
  const safeFallback = normalizeFallbackScore(fallbackScore);

  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return safeFallback;
  }

  let parsedValue;
  try {
    parsedValue = JSON.parse(rawValue);
  } catch {
    return safeFallback;
  }

  const candidateScore =
    typeof parsedValue === 'object' && parsedValue !== null ? parsedValue.highScore : parsedValue;

  if (!Number.isFinite(candidateScore) || candidateScore < 0) {
    return safeFallback;
  }

  return Math.floor(candidateScore);
}

export function createStorageAdapter(options = {}) {
  const logger = options.logger || console;
  const storageKey = options.storageKey || HIGH_SCORE_STORAGE_KEY;
  const storage =
    options.storage ||
    (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null);

  function warn(message, error) {
    if (typeof logger?.warn === 'function') {
      logger.warn(message, error);
    }
  }

  return {
    clearHighScore() {
      if (!storage || typeof storage.removeItem !== 'function') {
        return false;
      }

      try {
        storage.removeItem(storageKey);
        return true;
      } catch (error) {
        warn('Failed to clear persisted high score.', error);
        return false;
      }
    },
    loadHighScore(fallbackScore = 0) {
      const safeFallback = normalizeFallbackScore(fallbackScore);

      if (!storage || typeof storage.getItem !== 'function') {
        return safeFallback;
      }

      try {
        return parsePersistedHighScore(storage.getItem(storageKey), safeFallback);
      } catch (error) {
        warn('Failed to read persisted high score.', error);
        return safeFallback;
      }
    },
    saveHighScore(score) {
      const normalizedScore = normalizeFallbackScore(score);

      if (!storage || typeof storage.setItem !== 'function') {
        return false;
      }

      try {
        storage.setItem(storageKey, JSON.stringify({ highScore: normalizedScore }));
        return true;
      } catch (error) {
        warn('Failed to persist high score.', error);
        return false;
      }
    },
  };
}

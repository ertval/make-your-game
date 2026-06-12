/**
 * Storage adapter for local persistence behind a guarded JSON boundary.
 * Public API: safeRead(key, validate, defaultValue), safeWrite(key, value),
 * saveHighScore(score), getHighScore().
 * Notes: This module avoids DOM usage and treats storage as untrusted input.
 * Callers pass a `validate(value) => boolean` predicate so the adapter rejects
 * any payload that parses to an object but fails the caller's shape contract.
 */
export const HIGH_SCORE_STORAGE_KEY = 'ms-ghostman.highScore';

function getStorage() {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  return localStorage;
}

/**
 * Read and parse a JSON value from storage, treating its contents as untrusted.
 *
 * @param {string} key Storage key to read.
 * @param {((value: unknown) => boolean) | null} validate Optional predicate
 *   that returns `true` when the parsed value satisfies the caller's shape
 *   contract. When omitted (`null`/`undefined`) only the base object-shape
 *   guard is applied.
 * @param {*} defaultValue Value returned when the key is absent, unreadable, or
 *   fails validation.
 * @returns {*} The validated parsed value, or `defaultValue`.
 */
export function safeRead(key, validate, defaultValue) {
  try {
    const storage = getStorage();
    const rawValue = storage?.getItem(key) ?? null;

    if (rawValue === null) {
      return defaultValue;
    }

    const parsedValue = JSON.parse(rawValue);

    if (parsedValue === null || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
      console.warn(`[storage] Invalid JSON shape for key "${key}".`);
      return defaultValue;
    }

    if (typeof validate === 'function' && !validate(parsedValue)) {
      console.warn(`[storage] Value for key "${key}" failed validation.`);
      return defaultValue;
    }

    return parsedValue;
  } catch (error) {
    console.warn(`[storage] Failed to read key "${key}".`, error);
    return defaultValue;
  }
}

export function safeWrite(key, value) {
  try {
    const storage = getStorage();
    storage?.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[storage] Failed to write key "${key}".`, error);
  }
}

function normalizeHighScoreValue(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.floor(score));
}

export function saveHighScore(score) {
  const currentHighScore = getHighScore();
  const normalizedScore = normalizeHighScoreValue(score);

  if (normalizedScore > currentHighScore) {
    safeWrite(HIGH_SCORE_STORAGE_KEY, {
      score: normalizedScore,
    });
  }
}

function isHighScorePayload(value) {
  return typeof value.score === 'number' && Number.isFinite(value.score);
}

export function getHighScore() {
  const parsedValue = safeRead(HIGH_SCORE_STORAGE_KEY, isHighScorePayload, { score: 0 });

  return Math.max(0, Math.floor(parsedValue.score));
}

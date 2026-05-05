/**
 * Storage adapter for local persistence behind a guarded JSON boundary.
 * Public API: safeRead(key, schema, defaultValue), safeWrite(key, value),
 * saveHighScore(score), getHighScore().
 * Notes: This module avoids DOM usage, treats storage as untrusted input, and
 * leaves JSON Schema 2020-12 validation as a follow-up integration step.
 */
export const HIGH_SCORE_STORAGE_KEY = 'ms-ghostman.highScore';

function getStorage() {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  return localStorage;
}

export function safeRead(key, _schema, defaultValue) {
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

    // TODO: Validate parsedValue against schema using JSON Schema 2020-12.

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
  safeWrite(HIGH_SCORE_STORAGE_KEY, {
    score: normalizeHighScoreValue(score),
  });
}

export function getHighScore() {
  const parsedValue = safeRead(HIGH_SCORE_STORAGE_KEY, null, { score: 0 });

  if (typeof parsedValue.score !== 'number' || !Number.isFinite(parsedValue.score)) {
    console.warn(`[storage] Invalid high score payload for key "${HIGH_SCORE_STORAGE_KEY}".`);
    return 0;
  }

  return Math.max(0, Math.floor(parsedValue.score));
}

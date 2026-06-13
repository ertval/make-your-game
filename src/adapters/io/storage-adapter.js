/**
 * Storage adapter for local persistence behind a guarded JSON boundary.
 * Public API: safeRead(key, validate, defaultValue), safeWrite(key, value),
 * saveHighScore(score), getHighScore(), getHighScores(),
 * getAudioSettings(), saveAudioSettings(settings), updateAudioSetting(key, value).
 * Notes: This module avoids DOM usage, treats storage as untrusted input, and is
 * the ONLY module permitted to touch localStorage. Callers pass a
 * `validate(value) => boolean` predicate so the adapter rejects any payload that
 * parses to an object but fails the caller's shape contract.
 */
export const HIGH_SCORE_STORAGE_KEY = 'ms-ghostman.highScore';

/** Max number of high scores retained in the top-N leaderboard. */
export const MAX_HIGH_SCORES = 10;

/** C-11A: persisted audio-settings key. */
export const AUDIO_SETTINGS_STORAGE_KEY = 'ms-ghostman.audioSettings';

/**
 * Canonical default audio settings. Every field is restored to these when the
 * stored payload is missing, malformed, or partially invalid.
 */
export const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  musicEnabled: true,
  sfxEnabled: true,
  musicVolume: 1,
  sfxVolume: 1,
  uiVolume: 1,
});

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

/**
 * Read the stored payload and normalize it into a sorted (descending) list of
 * the top high scores.
 *
 * Backward compatible: legacy payloads shaped `{ score: N }` (written before the
 * top-N list existed) are read as a single-entry list. Newer payloads carry a
 * `scores` array. Any malformed entry is dropped, the list is sorted high→low,
 * deduplicated by value, and capped at MAX_HIGH_SCORES.
 *
 * @returns {number[]} Up to MAX_HIGH_SCORES scores, descending.
 */
export function getHighScores() {
  const parsedValue = safeRead(HIGH_SCORE_STORAGE_KEY, isHighScorePayload, { score: 0 });

  const rawList = Array.isArray(parsedValue.scores)
    ? parsedValue.scores
    : typeof parsedValue.score === 'number'
      ? [parsedValue.score]
      : [];

  const normalized = rawList
    .map((value) => normalizeHighScoreValue(value))
    .filter((value) => value > 0);

  // Descending, unique, capped.
  const unique = Array.from(new Set(normalized)).sort((a, b) => b - a);
  return unique.slice(0, MAX_HIGH_SCORES);
}

/**
 * Insert a finished-game score into the persisted top-N leaderboard. The list is
 * kept sorted high→low and capped at MAX_HIGH_SCORES; the legacy `score` field
 * (the single best) is written alongside `scores` for backward compatibility.
 * A score of 0 (or invalid) is ignored.
 *
 * @param {number} score - The finished-game score to record.
 */
export function saveHighScore(score) {
  const normalizedScore = normalizeHighScoreValue(score);
  if (normalizedScore <= 0) {
    return;
  }

  const scores = getHighScores();
  scores.push(normalizedScore);
  const nextScores = Array.from(new Set(scores))
    .sort((a, b) => b - a)
    .slice(0, MAX_HIGH_SCORES);

  safeWrite(HIGH_SCORE_STORAGE_KEY, {
    // `score` stays the single best for legacy readers; `scores` is the top-N list.
    score: nextScores[0] ?? 0,
    scores: nextScores,
  });
}

function isHighScorePayload(value) {
  const hasScalar = typeof value.score === 'number' && Number.isFinite(value.score);
  const hasList = Array.isArray(value.scores);
  return hasScalar || hasList;
}

export function getHighScore() {
  const [best = 0] = getHighScores();
  return best;
}

/**
 * Coerce one persisted boolean flag, falling back to the default when the stored
 * value is anything other than a real boolean.
 *
 * @param {unknown} value - Raw stored value.
 * @param {boolean} fallback - Default to use when the value is not a boolean.
 * @returns {boolean} A valid boolean.
 */
function normalizeBooleanSetting(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Coerce one persisted volume into the inclusive [0, 1] linear-gain range,
 * falling back to the default for non-finite or out-of-range values.
 *
 * @param {unknown} value - Raw stored value.
 * @param {number} fallback - Default to use when the value is invalid.
 * @returns {number} A volume in [0, 1].
 */
function normalizeVolumeSetting(value, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

/**
 * Normalize an arbitrary parsed payload into a complete, valid audio-settings
 * object. Each field independently falls back to its default, so a single bad
 * field never discards the others, and a totally malformed payload yields the
 * full defaults.
 *
 * @param {unknown} raw - Parsed (untrusted) storage payload.
 * @returns {{ musicEnabled: boolean, sfxEnabled: boolean, musicVolume: number, sfxVolume: number, uiVolume: number }}
 */
function normalizeAudioSettings(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    musicEnabled: normalizeBooleanSetting(source.musicEnabled, DEFAULT_AUDIO_SETTINGS.musicEnabled),
    sfxEnabled: normalizeBooleanSetting(source.sfxEnabled, DEFAULT_AUDIO_SETTINGS.sfxEnabled),
    musicVolume: normalizeVolumeSetting(source.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
    sfxVolume: normalizeVolumeSetting(source.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume),
    uiVolume: normalizeVolumeSetting(source.uiVolume, DEFAULT_AUDIO_SETTINGS.uiVolume),
  };
}

/**
 * Read the persisted audio settings, falling back to defaults for any missing,
 * malformed, or invalid field. Always returns a complete settings object.
 *
 * @returns {{ musicEnabled: boolean, sfxEnabled: boolean, musicVolume: number, sfxVolume: number, uiVolume: number }}
 */
export function getAudioSettings() {
  // safeRead already guards JSON parse + object shape and returns the default on
  // any failure; normalizeAudioSettings then sanitizes each field.
  const parsedValue = safeRead(AUDIO_SETTINGS_STORAGE_KEY, null, { ...DEFAULT_AUDIO_SETTINGS });
  return normalizeAudioSettings(parsedValue);
}

/**
 * Persist a full audio-settings object. The payload is normalized first so only
 * valid, complete settings are written.
 *
 * @param {object} settings - Partial or full audio settings to persist.
 * @returns {{ musicEnabled: boolean, sfxEnabled: boolean, musicVolume: number, sfxVolume: number, uiVolume: number }} The normalized settings that were written.
 */
export function saveAudioSettings(settings) {
  const normalized = normalizeAudioSettings(settings);
  safeWrite(AUDIO_SETTINGS_STORAGE_KEY, normalized);
  return normalized;
}

/**
 * Update a single audio-setting field and persist immediately (read-merge-write).
 * Unknown keys are ignored. Returns the resulting normalized settings.
 *
 * @param {keyof DEFAULT_AUDIO_SETTINGS} key - Setting field to change.
 * @param {boolean | number} value - New value for the field.
 * @returns {{ musicEnabled: boolean, sfxEnabled: boolean, musicVolume: number, sfxVolume: number, uiVolume: number }} The persisted settings after the update.
 */
export function updateAudioSetting(key, value) {
  if (!Object.hasOwn(DEFAULT_AUDIO_SETTINGS, key)) {
    console.warn(`[storage] Ignoring unknown audio setting "${key}".`);
    return getAudioSettings();
  }
  const next = { ...getAudioSettings(), [key]: value };
  return saveAudioSettings(next);
}

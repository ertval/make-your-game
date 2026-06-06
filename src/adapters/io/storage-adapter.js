/**
 * Storage adapter for local persistence behind a guarded JSON boundary.
 * Public API: safeRead(key, schema, defaultValue), safeWrite(key, value),
 * saveHighScore(score), getHighScore(),
 * getAudioSettings(), saveAudioSettings(settings), updateAudioSetting(key, value).
 * Notes: This module avoids DOM usage, treats storage as untrusted input, is the
 * ONLY module permitted to touch localStorage, and leaves JSON Schema 2020-12
 * validation as a follow-up integration step.
 */
export const HIGH_SCORE_STORAGE_KEY = 'ms-ghostman.highScore';

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
  const currentHighScore = getHighScore();
  const normalizedScore = normalizeHighScoreValue(score);

  if (normalizedScore > currentHighScore) {
    safeWrite(HIGH_SCORE_STORAGE_KEY, {
      score: normalizedScore,
    });
  }
}

export function getHighScore() {
  const parsedValue = safeRead(HIGH_SCORE_STORAGE_KEY, null, { score: 0 });

  if (typeof parsedValue.score !== 'number' || !Number.isFinite(parsedValue.score)) {
    console.warn(`[storage] Invalid high score payload for key "${HIGH_SCORE_STORAGE_KEY}".`);
    return 0;
  }

  return Math.max(0, Math.floor(parsedValue.score));
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

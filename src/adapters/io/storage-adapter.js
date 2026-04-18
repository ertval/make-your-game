/**
 * Storage adapter for local persistence behind a guarded JSON boundary.
 * Public API: safeRead(key, schema, defaultValue), safeWrite(key, value).
 * Notes: This module avoids DOM usage, treats storage as untrusted input, and
 * leaves JSON Schema 2020-12 validation as a follow-up integration step.
 */

export function safeRead(key, _schema, defaultValue) {
  try {
    const rawValue = localStorage.getItem(key);

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
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[storage] Failed to write key "${key}".`, error);
  }
}

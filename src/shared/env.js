/*
 * Module: env.js
 * Purpose: Cross-host environment probes that survive bundler shimming.
 * Public API: isDevelopment()
 * Implementation Notes: Reading `process.env.NODE_ENV` directly throws a
 *   ReferenceError in a Vite-built browser bundle when `process` is fully
 *   shaken out, so we wrap each probe in a try/catch. This keeps callers from
 *   re-implementing the same defensive snippet across the codebase.
 */

/**
 * Detect whether the current host is running in a development build.
 *
 * Returns `true` only when `process.env.NODE_ENV === 'development'`. Any
 * failure to read that value (missing `process`, missing `env`, etc.) is
 * treated as "not development" so production paths never accidentally enable
 * dev-only warnings or assertions.
 *
 * @returns {boolean} True when the environment is explicitly development.
 */
export function isDevelopment() {
  try {
    return process.env.NODE_ENV === 'development';
  } catch {
    return false;
  }
}

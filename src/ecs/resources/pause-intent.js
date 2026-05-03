/*
 * C-04 pause intent resource helpers.
 *
 * This module owns the canonical resource shape for pause commands shared by
 * pause-input-system and pause-system so they cannot drift over time.
 *
 * Public API:
 * - createDefaultPauseIntent()
 */

export function createDefaultPauseIntent() {
  return {
    action: null,
  };
}

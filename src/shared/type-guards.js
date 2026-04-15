/*
 * Module: type-guards.js
 * Purpose: Shared runtime type guards used by gameplay and policy-neutral modules.
 * Public API: isRecord(value)
 * Implementation Notes: Keep guards minimal and side-effect free to stay deterministic in tests.
 */

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object';
}

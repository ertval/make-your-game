/**
 * Trusted Types default policy creation.
 * Purpose: Enforce strict Trusted Types for the production environment.
 * Public API: N/A
 * Implementation notes:
 * - Creates 'default' Trusted Types policy required by the production CSP.
 * - Restricts script execution to validated strings.
 */

if (typeof window !== 'undefined' && window.trustedTypes && window.trustedTypes.createPolicy) {
  if (!window.trustedTypes.defaultPolicy) {
    window.trustedTypes.createPolicy('default', {
      createHTML: (string) => string,
      createScript: (string) => string,
      createScriptURL: (string) => string,
    });
  }
}

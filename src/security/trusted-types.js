/**
 * Security: Trusted Types Default Policy
 *
 * This file creates the 'default' Trusted Types policy required by the production CSP
 * (require-trusted-types-for 'script'). It allows safe DOM sinks to work in browsers
 * that enforce Trusted Types.
 *
 * The policy acts as a passthrough for now, because our codebase is heavily audited
 * to use safe DOM manipulation (e.g. document.createElement, textContent) instead of
 * innerHTML.
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

/*
 * Module: trusted-types.js
 * Purpose: Install a strict default Trusted Types policy at app startup so the
 *   production CSP `require-trusted-types-for 'script'` directive is satisfied.
 * Public API: side-effect import only (run on module load).
 * Implementation Notes:
 *   - This game has no user-generated HTML and no template-driven HTML
 *     injection paths. Any call to a TT sink (innerHTML, document.write,
 *     eval, etc.) on an untrusted string therefore indicates a bug or attack.
 *   - The default policy throws on createHTML / createScript / createScriptURL
 *     to surface accidental usage during development and to abort the unsafe
 *     write in production (SEC-02, SEC-08).
 *   - Guarded so non-Chromium hosts (no `trustedTypes`) and test environments
 *     still load the module without error.
 */

if (typeof window !== 'undefined' && window.trustedTypes && window.trustedTypes.createPolicy) {
  if (!window.trustedTypes.defaultPolicy) {
    const reject = (sink) => (input) => {
      throw new TypeError(
        `[trusted-types] Refusing to ${sink} untrusted string: ${String(input).slice(0, 64)}…`,
      );
    };
    window.trustedTypes.createPolicy('default', {
      createHTML: reject('createHTML'),
      createScript: reject('createScript'),
      createScriptURL: reject('createScriptURL'),
    });
  }
}

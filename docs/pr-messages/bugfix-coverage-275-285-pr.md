# 🔧 bugfix: missing-coverage remediation — #275 (CI-11) + #285 (CI-13)

> Two AGENTS.md "MUST" coverage gaps assigned to @edvallm, bundled on one `bugfix-*` branch (bypasses ownership — `main.ecs.js` is Track A and #275 spans D/C). #275 hardens + tests `prefers-reduced-motion`; #285 adds the dev-mode DOM budget assertion.

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
- [x] Branch name follows `<owner>/bugfix-<slug>` (`medvall/bugfix-coverage-275-285`) — bugfix branch, ownership bypass.
- [x] Changes are within scope; cross-track files (`main.ecs.js`) carried under the bugfix bypass.
- [x] Ran unit + e2e for the touched paths.
- [x] Checked security sinks, architecture boundaries, dependency impact (none).
- [x] Requested human review.

## Layer boundary confirmations

- [x] `src/ecs/systems/` unchanged (no DOM added).
- [x] `assertDomElementBudget` is an app-boundary guard in `main.ecs.js` (the composition root), not an ECS system; it only reads `document.querySelectorAll` and throws — no simulation coupling.
- [x] Untrusted UI content still uses safe sinks; the budget breach is surfaced via the existing `renderCriticalError` `textContent` path (no HTML injection).
- [x] No framework imports or canvas APIs introduced.

## What changed

### #275 (CI-11) — `prefers-reduced-motion` hardening + test
- **`styles/animations.css`**: added a universal reduced-motion safety net inside the existing `@media (prefers-reduced-motion: reduce)` block — `*, *::before, *::after { animation-duration/transition-duration/*-delay: 0s !important }`.
- **`tests/e2e/reduced-motion.spec.js`** (new): emulates `reducedMotion: 'reduce'`, then asserts (a) no element in the `#overlay-root` menu subtree declares a non-zero animation/transition, and (b) no element site-wide declares a non-zero transition (during gameplay + boot).

### #285 (CI-13) — dev-mode DOM budget assertion
- **`src/main.ecs.js`**: added `DOM_ELEMENT_BUDGET = 500` and `assertDomElementBudget({ documentRef, limit })`, which throws a descriptive error when `document.querySelectorAll('*').length` exceeds the budget. Wired a `isDevelopment()`-gated call right after `runtime.start()` (initial board is in the DOM); the breach throws and is surfaced by the existing startup `catch` → `renderCriticalError`.
- **`tests/unit/main.ecs.test.js`**: 4 new cases (budget constant, boundary = 500 passes, 501 throws a visible descriptive error, custom limit).

## Why

- AGENTS.md §Accessibility (MUST): non-gameplay motion must respect `prefers-reduced-motion`. AGENTS.md §Performance budget (MUST): "DOM ≤ 500 total after level load. Assert in dev-mode startup." The reduced-motion rule was checked nowhere in tests; the DOM budget was checked only in e2e, never asserted in the app itself.

## Tests

- `npx vitest run` — **1298 passed** (incl. 4 new `assertDomElementBudget` cases).
- `npx playwright test tests/e2e/reduced-motion.spec.js` — **2 passed**.
- `npm run check` — clean. `npm run policy` — green modulo the pre-existing e2e timing-flake cluster (documented in prior PRs; unrelated to this change).

**TDD note (honest):**
- **#285** followed failing-test-first: the new unit tests failed (function absent) → implemented → pass.
- **#275** did **not** reproduce as a failure — the per-animation handling in `animations.css` already existed and the new e2e passed against unmodified code. Rather than fabricate a failure, this PR **locks in** the contract with the (passing) regression test and **hardens** it with the universal override so compliance no longer depends on incidental quirks (an unused `.overlay` transition; a malformed `.overlay__btn` transition-duration) or on every future selector being hand-added to the block.

## Audit questions affected

- **F-19/F-20/F-21** (paint/layers/promotion) — unaffected; reduced-motion only zeroes durations. **F-17/F-18** (frame budget) — the DOM budget guard is dev-only, no production/runtime cost.
- Accessibility (reduced-motion) and the DOM-budget performance MUST now have explicit automated coverage.

## Security notes

- No new sinks. Budget breach message is plain `textContent` via `renderCriticalError`. No untrusted input; the count comes from the live DOM.

## Architecture / dependency notes

- `assertDomElementBudget` lives at the app composition root, not in an ECS system; dev-gated so production startup is unchanged. No dependency or lockfile changes.

## Risks

- Low. The reduced-motion override is additive and scoped to the reduce media query. The DOM assertion runs only under `isDevelopment()` and only throws on a genuine >500 breach (surfaced, not silent) — production builds are unaffected.

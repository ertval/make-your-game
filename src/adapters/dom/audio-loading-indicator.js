/*
 * C-09 audio-loading indicator DOM adapter.
 *
 * This module owns the DOM-visibility boundary for the audio preloading
 * indicator. Like the screens adapter, it performs NO DOM creation and contains
 * NO game logic: it only shows or hides an already-rendered node via class and
 * attribute updates, and is the single place audio-loading state reaches the
 * DOM. ECS systems never touch it — the app boundary wires it to the C-09
 * preload orchestrator (see `preloadWithIndicator` in audio-integration.js).
 *
 * Public API:
 * - createAudioLoadingIndicator(rootElement): adapter bound to one root node.
 *
 * Implementation notes:
 * - The indicator node is queried once at creation and reused.
 * - Missing nodes are tolerated so tests and partial layouts never throw.
 * - `aria-busy` mirrors visibility so assistive tech announces the busy state
 *   without stealing focus; the node is also `aria-live="polite"`.
 */

const HIDDEN_CLASS = 'is-screen-hidden';
const VISIBLE_CLASS = 'is-screen-visible';

export function createAudioLoadingIndicator(rootElement, options = {}) {
  const indicator =
    options.indicatorElement || rootElement?.querySelector?.('[data-audio-loading]') || null;

  let visible = false;

  function show() {
    visible = true;
    if (!indicator) {
      return;
    }
    indicator.classList?.remove(HIDDEN_CLASS);
    indicator.classList?.add(VISIBLE_CLASS);
    indicator.setAttribute?.('aria-hidden', 'false');
    indicator.setAttribute?.('aria-busy', 'true');
  }

  function hide() {
    visible = false;
    if (!indicator) {
      return;
    }
    indicator.classList?.remove(VISIBLE_CLASS);
    indicator.classList?.add(HIDDEN_CLASS);
    indicator.setAttribute?.('aria-hidden', 'true');
    indicator.setAttribute?.('aria-busy', 'false');
  }

  return {
    show,
    hide,
    isVisible() {
      return visible;
    },
  };
}

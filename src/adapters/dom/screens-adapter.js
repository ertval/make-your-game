/*
 * Track C screen overlay DOM adapter.
 *
 * This module owns the DOM visibility boundary for pre-existing game screens
 * and overlays. It performs no DOM creation, contains no game logic, and only
 * shows or hides already-rendered nodes via class and attribute updates.
 *
 * Public API:
 * - createScreensAdapter(rootElement): create a screen adapter bound to one root.
 *
 * Implementation notes:
 * - Screen nodes are queried once during adapter creation and then reused.
 * - Only one screen is shown at a time; all show helpers call hideAll first.
 * - Missing screen nodes are tolerated so tests and partial layouts do not throw.
 * - Keyboard navigation is scoped to the active screen and uses only
 *   pre-existing [data-option] elements inside each overlay.
 */

const HIDDEN_SCREEN_CLASS = 'is-screen-hidden';
const VISIBLE_SCREEN_CLASS = 'is-screen-visible';
const ACTIVE_OPTION_ATTRIBUTE = 'data-active';
const DEFAULT_SCREEN_ORDER = ['start', 'pause', 'levelComplete', 'gameOver', 'victory'];

function hideElement(element) {
  if (!element) {
    return;
  }

  element.classList?.remove(VISIBLE_SCREEN_CLASS);
  element.classList?.add(HIDDEN_SCREEN_CLASS);
  element.setAttribute?.('aria-hidden', 'true');
  element.setAttribute?.('tabindex', '-1');
}

function showElement(element) {
  if (!element) {
    return;
  }

  element.classList?.remove(HIDDEN_SCREEN_CLASS);
  element.classList?.add(VISIBLE_SCREEN_CLASS);
  element.setAttribute?.('aria-hidden', 'false');
  element.setAttribute?.('tabindex', '-1');
}

function getActionFromOption(option) {
  if (!option || typeof option.getAttribute !== 'function') {
    return '';
  }

  return option.getAttribute('data-action') || option.getAttribute('data-option') || '';
}

export function createScreensAdapter(rootElement, options = {}) {
  const ownerDocument =
    rootElement.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const screens = {
    gameOver: rootElement.querySelector('[data-screen="game-over"]'),
    levelComplete: rootElement.querySelector('[data-screen="level-complete"]'),
    pause: rootElement.querySelector('[data-screen="pause"]'),
    start: rootElement.querySelector('[data-screen="start"]'),
    victory: rootElement.querySelector('[data-screen="victory"]'),
  };
  const allScreens = DEFAULT_SCREEN_ORDER.map((screenKey) => screens[screenKey]);
  const gameplayElement = options.gameplayElement || null;
  const selectedIndices = new Map(DEFAULT_SCREEN_ORDER.map((screenKey) => [screenKey, 0]));
  let activeIndex = 0;
  let activeOptions = [];
  let activeScreen = null;
  let activeScreenKey = null;
  let previousFocusElement = null;

  function restorePreviousFocus() {
    const nextFocusTarget =
      gameplayElement && typeof gameplayElement.focus === 'function'
        ? gameplayElement
        : previousFocusElement && typeof previousFocusElement.focus === 'function'
          ? previousFocusElement
          : null;

    nextFocusTarget?.focus();

    previousFocusElement = null;
  }

  function clearActiveOptions() {
    for (const option of activeOptions) {
      option.removeAttribute(ACTIVE_OPTION_ATTRIBUTE);
    }

    activeOptions = [];
    activeIndex = 0;
    activeScreen = null;
    activeScreenKey = null;
  }

  function applyActiveOption() {
    for (const option of activeOptions) {
      option.removeAttribute(ACTIVE_OPTION_ATTRIBUTE);
    }

    const activeOption = activeOptions[activeIndex];
    activeOption.setAttribute(ACTIVE_OPTION_ATTRIBUTE, 'true');
    if (activeScreenKey) {
      selectedIndices.set(activeScreenKey, activeIndex);
    }
    activeOption.focus?.();
  }

  function activateScreenOptions(screenKey, screen) {
    clearActiveOptions();

    if (!screen) {
      return;
    }

    if (!previousFocusElement) {
      previousFocusElement = ownerDocument?.activeElement || null;
    }

    activeScreen = screen;
    activeScreenKey = screenKey;
    activeOptions = Array.from(screen.querySelectorAll('[data-option]'));

    if (activeOptions.length === 0) {
      screen.focus?.();
      return;
    }

    activeIndex = Math.min(selectedIndices.get(screenKey) || 0, activeOptions.length - 1);
    applyActiveOption();
  }

  function dispatchAction(action) {
    options.onAction?.(action);

    if (action === 'pause-continue') {
      options.onResume?.();
      return;
    }

    if (action === 'pause-restart') {
      options.onRestart?.();
    }
  }

  function onKeyDown(event) {
    if (!activeScreen || activeOptions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % activeOptions.length;
      applyActiveOption();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + activeOptions.length) % activeOptions.length;
      applyActiveOption();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const activeOption = activeOptions[activeIndex];
      dispatchAction(getActionFromOption(activeOption));
      activeOption.click?.();
    }
  }

  function hideAll() {
    for (const screen of allScreens) {
      hideElement(screen);
    }

    clearActiveOptions();
    restorePreviousFocus();
  }

  function showStart() {
    hideAll();
    showElement(screens.start);
    activateScreenOptions('start', screens.start);
  }

  function showPause() {
    hideAll();
    showElement(screens.pause);
    activateScreenOptions('pause', screens.pause);
  }

  function showLevelComplete() {
    hideAll();
    showElement(screens.levelComplete);
    activateScreenOptions('levelComplete', screens.levelComplete);
  }

  function showGameOver() {
    hideAll();
    showElement(screens.gameOver);
    activateScreenOptions('gameOver', screens.gameOver);
  }

  function showVictory() {
    hideAll();
    showElement(screens.victory);
    activateScreenOptions('victory', screens.victory);
  }

  rootElement.addEventListener('keydown', onKeyDown);
  hideAll();

  function destroy() {
    rootElement.removeEventListener('keydown', onKeyDown);
    clearActiveOptions();
    restorePreviousFocus();
  }

  return {
    destroy,
    hideAll,
    showGameOver,
    showLevelComplete,
    showPause,
    showStart,
    showVictory,
  };
}

/*
 * Track C screen overlay DOM adapter.
 *
 * This module owns the DOM visibility boundary for pre-existing game screens
 * and overlays. It performs no DOM creation, contains no game logic, and only
 * shows or hides already-rendered nodes via style.display updates.
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

function hideElement(element) {
  if (element) {
    element.style.display = 'none';
  }
}

function showElement(element) {
  if (element) {
    element.style.display = 'block';
  }
}

export function createScreensAdapter(rootElement) {
  const ownerDocument =
    rootElement.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const screens = {
    gameOver: rootElement.querySelector('[data-screen="game-over"]'),
    levelComplete: rootElement.querySelector('[data-screen="level-complete"]'),
    pause: rootElement.querySelector('[data-screen="pause"]'),
    start: rootElement.querySelector('[data-screen="start"]'),
    victory: rootElement.querySelector('[data-screen="victory"]'),
  };
  const allScreens = Object.values(screens);
  let activeIndex = 0;
  let activeOptions = [];
  let activeScreen = null;
  let previousFocusElement = null;

  function restorePreviousFocus() {
    if (previousFocusElement && typeof previousFocusElement.focus === 'function') {
      previousFocusElement.focus();
    }

    previousFocusElement = null;
  }

  function clearActiveOptions() {
    for (const option of activeOptions) {
      option.removeAttribute('data-active');
    }

    activeOptions = [];
    activeIndex = 0;
    activeScreen = null;
  }

  function applyActiveOption() {
    if (activeOptions.length === 0) {
      return;
    }

    for (const option of activeOptions) {
      option.removeAttribute('data-active');
    }

    const activeOption = activeOptions[activeIndex];
    activeOption.setAttribute('data-active', 'true');
    activeOption.focus?.();
  }

  function activateScreenOptions(screen) {
    clearActiveOptions();

    if (!screen) {
      return;
    }

    if (!previousFocusElement) {
      previousFocusElement = ownerDocument?.activeElement || null;
    }

    activeScreen = screen;
    activeOptions = Array.from(screen.querySelectorAll('[data-option]'));

    if (activeOptions.length === 0) {
      return;
    }

    applyActiveOption();
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
      activeOptions[activeIndex].click?.();
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
    activateScreenOptions(screens.start);
  }

  function showPause() {
    hideAll();
    showElement(screens.pause);
    activateScreenOptions(screens.pause);
  }

  function showLevelComplete() {
    hideAll();
    showElement(screens.levelComplete);
    activateScreenOptions(screens.levelComplete);
  }

  function showGameOver() {
    hideAll();
    showElement(screens.gameOver);
    activateScreenOptions(screens.gameOver);
  }

  function showVictory() {
    hideAll();
    showElement(screens.victory);
    activateScreenOptions(screens.victory);
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

/*
 * Track C screen overlay DOM adapter.
 *
 * This module owns the DOM visibility boundary for pre-existing game screens
 * and overlays. It performs no DOM creation, contains no game logic, and only
 * shows or hides already-rendered nodes via class and attribute updates.
 *
 * Public API:
 * - createScreensAdapter(rootElement, options): create a screen adapter bound to one root.
 *   Returned methods: showStart, showPause, showSettings(origin),
 *   showHighScores(origin), showLevelComplete, showGameOver, showVictory,
 *   hideAll, syncSettingsControls(settings), destroy.
 *   Options: onAction, onConfirm(action), onResume, onRestart,
 *   onSettingChange(key, value), getHighScores (or legacy getHighScore),
 *   gameplayElement, initialSettings.
 *   onConfirm fires for every confirmed button activation (including the
 *   internally-handled Settings / High Scores overlay navigation and toggles),
 *   so the host can play a single uniform confirm cue.
 *
 * Implementation notes:
 * - Screen nodes are queried once during adapter creation and then reused.
 * - Only one screen is shown at a time; all show helpers call hideAll first.
 * - Missing screen nodes are tolerated so tests and partial layouts do not throw.
 * - Keyboard navigation is scoped to the active screen and uses only
 *   pre-existing [data-option] elements inside each overlay.
 * - C-11B Settings overlay: opened from the start/pause menus via the
 *   'open-settings' action and returns to its origin on 'settings-back'.
 *   Settings navigation is overlay-to-overlay (it does not restore gameplay
 *   focus mid-flow). Toggle buttons flip aria-pressed (with an emoji icon);
 *   range sliders are adjusted with Left/Right and keep aria-valuenow in sync.
 *   Every control change is forwarded through onSettingChange(key, value) so the
 *   host can persist + apply it (C-11A); value is a boolean for toggles and a
 *   0..1 volume for sliders.
 */

const HIDDEN_SCREEN_CLASS = 'is-screen-hidden';
const VISIBLE_SCREEN_CLASS = 'is-screen-visible';
const ACTIVE_OPTION_ATTRIBUTE = 'data-active';
const DEFAULT_SCREEN_ORDER = [
  'start',
  'pause',
  'settings',
  'highScores',
  'levelComplete',
  'gameOver',
  'victory',
];

// Screens the C-11B Settings overlay can be opened from and must return to.
const SETTINGS_ORIGIN_SCREENS = new Set(['start', 'pause']);

// Screens the C-05 High Scores overlay can be opened from and must return to
// (the start menu and the pause menu both expose it).
const HIGH_SCORES_ORIGIN_SCREENS = new Set(['start', 'pause']);

// Cap on how many leaderboard rows the overlay renders, mirroring the storage
// adapter's MAX_HIGH_SCORES. Kept as a local literal to avoid an adapter→io
// import (the screens adapter is DOM-only and receives scores via injection).
const MAX_HIGH_SCORE_ROWS = 10;

/**
 * Whether a [data-option] element is a range slider (Left/Right adjusts value)
 * rather than a button (Enter activates).
 *
 * @param {Element | null | undefined} option - Candidate option element.
 * @returns {boolean} True for an `<input type="range">`.
 */
function isSliderOption(option) {
  return (
    !!option &&
    typeof option.getAttribute === 'function' &&
    (option.tagName === 'INPUT' || option.type === 'range') &&
    option.getAttribute('type') === 'range'
  );
}

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
    highScores: rootElement.querySelector('[data-screen="high-scores"]'),
    levelComplete: rootElement.querySelector('[data-screen="level-complete"]'),
    pause: rootElement.querySelector('[data-screen="pause"]'),
    settings: rootElement.querySelector('[data-screen="settings"]'),
    start: rootElement.querySelector('[data-screen="start"]'),
    victory: rootElement.querySelector('[data-screen="victory"]'),
  };
  // C-05: optional provider that returns the persisted top-N high scores
  // (descending) for the High Scores overlay. Defaults to an empty list so the
  // adapter stays usable in tests / partial layouts without a storage provider.
  // A legacy single-score `getHighScore` provider is also accepted and wrapped.
  const getHighScores =
    typeof options.getHighScores === 'function'
      ? options.getHighScores
      : typeof options.getHighScore === 'function'
        ? () => {
            const best = options.getHighScore();
            return Number.isFinite(best) && best > 0 ? [best] : [];
          }
        : () => [];
  const allScreens = DEFAULT_SCREEN_ORDER.map((screenKey) => screens[screenKey]);
  const gameplayElement = options.gameplayElement || null;
  const selectedIndices = new Map(DEFAULT_SCREEN_ORDER.map((screenKey) => [screenKey, 0]));
  let activeIndex = 0;
  let activeOptions = [];
  let activeScreen = null;
  let activeScreenKey = null;
  let previousFocusElement = null;
  // C-11B: the screen the Settings overlay was opened from, so Back returns
  // there. Defaults to 'start' when opened without an explicit origin.
  let settingsOrigin = 'start';
  // C-05: the screen the High Scores overlay was opened from, so Back returns
  // there. Defaults to 'start' (the only origin today).
  let highScoresOrigin = 'start';

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

  function dispatchAction(action, option) {
    // Confirm cue for EVERY confirmed button activation (Enter or trusted click),
    // regardless of whether the action is forwarded to the host or handled
    // internally (Settings / High Scores overlay navigation, toggles, Back).
    // Fired here — the single button-activation funnel — so menu start, pause,
    // and both sub-overlays all click uniformly. Sliders never reach this path.
    options.onConfirm?.(action);

    // C-11B settings actions are handled inside the adapter (overlay-to-overlay
    // navigation + control state) and are NOT forwarded as game actions, so the
    // confirm-cue/game-flow handler in main.ecs only sees real game actions.
    if (action === 'open-settings') {
      const origin = option?.getAttribute?.('data-settings-origin') || activeScreenKey || 'start';
      showSettings(origin);
      return;
    }

    if (action === 'settings-back') {
      backFromSettings();
      return;
    }

    if (action === 'settings-toggle-music' || action === 'settings-toggle-sfx') {
      toggleSettingButton(option);
      return;
    }

    // C-05 High Scores overlay actions are handled inside the adapter
    // (overlay-to-overlay navigation, like Settings) and are NOT forwarded as
    // game actions — they never reach game-flow.
    if (action === 'open-high-scores') {
      const origin =
        option?.getAttribute?.('data-high-scores-origin') || activeScreenKey || 'start';
      showHighScores(origin);
      return;
    }

    if (action === 'high-scores-back') {
      backFromHighScores();
      return;
    }

    options.onAction?.(action);

    if (action === 'pause-continue') {
      options.onResume?.();
      return;
    }

    if (action === 'pause-restart') {
      options.onRestart?.();
    }
  }

  /**
   * Flip an aria-pressed toggle button, update its emoji icon, and notify the
   * host so the change is persisted + applied (C-11A).
   *
   * @param {Element | null | undefined} option - The toggle button element.
   */
  function toggleSettingButton(option) {
    if (!option || typeof option.getAttribute !== 'function') {
      return;
    }
    const settingKey = option.getAttribute('data-setting');
    const enabled = option.getAttribute('aria-pressed') !== 'true';
    option.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    const icon = option.querySelector?.('[data-setting-icon]');
    if (icon) {
      icon.textContent = enabled ? '🔊' : '🔇';
    }
    if (settingKey) {
      options.onSettingChange?.(settingKey, enabled);
    }
  }

  /**
   * Read a slider's value as a 0..1 volume and notify the host (C-11A). Also
   * keeps aria-valuenow in sync with the live value for screen readers.
   *
   * @param {Element | null | undefined} option - The range input element.
   */
  function commitSliderValue(option) {
    if (!option || typeof option.getAttribute !== 'function') {
      return;
    }
    const settingKey = option.getAttribute('data-setting');
    const max = Number(option.getAttribute('max')) || 100;
    const raw = Number(option.value);
    const numeric = Number.isFinite(raw) ? raw : 0;
    option.setAttribute('aria-valuenow', String(numeric));
    if (settingKey) {
      options.onSettingChange?.(settingKey, numeric / max);
    }
  }

  function onKeyDown(event) {
    if (!activeScreen || activeOptions.length === 0) {
      return;
    }

    const currentOption = activeOptions[activeIndex];

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

    // Left/Right adjust the focused slider (C-11B volume controls). For
    // non-slider options these keys are ignored so menu navigation is unchanged.
    if (
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      isSliderOption(currentOption)
    ) {
      event.preventDefault();
      const step = Number(currentOption.getAttribute('step')) || 1;
      const min = Number(currentOption.getAttribute('min')) || 0;
      const max = Number(currentOption.getAttribute('max')) || 100;
      const delta = event.key === 'ArrowRight' ? step : -step;
      const next = Math.max(min, Math.min(max, (Number(currentOption.value) || 0) + delta));
      currentOption.value = String(next);
      commitSliderValue(currentOption);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      // Sliders have no "activate" semantics; Enter only confirms buttons.
      if (isSliderOption(currentOption)) {
        return;
      }
      dispatchAction(getActionFromOption(currentOption), currentOption);
      currentOption.click?.();
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

  function showGameOver(score = null) {
    hideAll();
    showElement(screens.gameOver);
    if (score !== null && screens.gameOver) {
      const scoreEl = screens.gameOver.querySelector('[data-high-score]');
      if (scoreEl) {
        scoreEl.textContent = `High Score: ${String(score).padStart(5, '0')}`;
      }
    }
    activateScreenOptions('gameOver', screens.gameOver);
  }

  function showVictory(score = null) {
    hideAll();
    showElement(screens.victory);
    if (score !== null && screens.victory) {
      const scoreEl = screens.victory.querySelector('[data-high-score]');
      if (scoreEl) {
        scoreEl.textContent = `High Score: ${String(score).padStart(5, '0')}`;
      }
    }
    activateScreenOptions('victory', screens.victory);
  }

  /**
   * Hide every screen for an overlay-to-overlay transition WITHOUT restoring
   * gameplay focus. The originating overlay element stays the saved
   * `previousFocusElement`, so a later full `hideAll()` still returns the user to
   * the right place. Only the option-level active state is cleared.
   */
  function hideScreensForOverlaySwap() {
    for (const screen of allScreens) {
      hideElement(screen);
    }
    for (const option of activeOptions) {
      option.removeAttribute(ACTIVE_OPTION_ATTRIBUTE);
    }
    activeOptions = [];
    activeIndex = 0;
    activeScreen = null;
    activeScreenKey = null;
  }

  /**
   * Open the C-11B Settings overlay, remembering the screen it was opened from
   * so Back can return there. Keeps "only one overlay visible" and preserves the
   * saved focus target captured when the originating menu was first shown.
   *
   * @param {string} [originScreenKey='start'] - 'start' or 'pause'.
   */
  function showSettings(originScreenKey = 'start') {
    settingsOrigin = SETTINGS_ORIGIN_SCREENS.has(originScreenKey) ? originScreenKey : 'start';
    hideScreensForOverlaySwap();
    showElement(screens.settings);
    activateScreenOptions('settings', screens.settings);
  }

  /**
   * Return from Settings to the originating overlay (start or pause). Restores
   * that screen's previous option selection via the per-screen index memory.
   */
  function backFromSettings() {
    hideScreensForOverlaySwap();
    const target = screens[settingsOrigin] || screens.start;
    const targetKey = screens[settingsOrigin] ? settingsOrigin : 'start';
    showElement(target);
    activateScreenOptions(targetKey, target);
  }

  /**
   * Render the persisted top-N high scores as ranked list rows inside the High
   * Scores overlay (`[data-high-scores]`), each formatted as `"<rank>. <score>"`
   * with a 5-digit zero-padded score (matching the game-over/victory readouts).
   * Renders a single "No scores yet" row when the list is empty. Tolerates a
   * missing node / non-array provider result, drops non-positive entries, and
   * caps the list at MAX_HIGH_SCORE_ROWS.
   */
  function renderHighScores() {
    const screen = screens.highScores;
    if (!screen) {
      return;
    }
    const listEl = screen.querySelector('[data-high-scores]');
    if (!listEl) {
      return;
    }

    const raw = getHighScores();
    const scores = (Array.isArray(raw) ? raw : [])
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, MAX_HIGH_SCORE_ROWS);

    // Replace the list contents. Build rows as DOM nodes with textContent only
    // (no innerHTML) so this stays a safe DOM sink per the security policy.
    while (listEl.firstChild) {
      listEl.removeChild(listEl.firstChild);
    }

    if (scores.length === 0) {
      const empty = ownerDocument?.createElement?.('li');
      if (empty) {
        empty.className = 'high-scores__empty';
        empty.textContent = 'No scores yet';
        listEl.appendChild(empty);
      }
      return;
    }

    for (const [index, score] of scores.entries()) {
      const row = ownerDocument?.createElement?.('li');
      if (!row) {
        continue;
      }
      row.className = 'high-scores__row';
      // "1.  04340" — rank + zero-padded score, matching the HUD/game-over style.
      row.textContent = `${index + 1}. ${String(score).padStart(5, '0')}`;
      listEl.appendChild(row);
    }
  }

  /**
   * Open the C-05 High Scores overlay, remembering the screen it was opened from
   * so Back can return there. Reads the persisted top-N scores on open (via the
   * injected provider) so the leaderboard is always current. Mirrors the Settings
   * overlay-to-overlay navigation: only one overlay is visible at a time.
   *
   * @param {string} [originScreenKey='start'] - Origin screen ('start' | 'pause').
   */
  function showHighScores(originScreenKey = 'start') {
    highScoresOrigin = HIGH_SCORES_ORIGIN_SCREENS.has(originScreenKey) ? originScreenKey : 'start';
    renderHighScores();
    hideScreensForOverlaySwap();
    showElement(screens.highScores);
    activateScreenOptions('highScores', screens.highScores);
  }

  /**
   * Return from High Scores to the originating overlay (start). Restores that
   * screen's previous option selection via the per-screen index memory.
   */
  function backFromHighScores() {
    hideScreensForOverlaySwap();
    const target = screens[highScoresOrigin] || screens.start;
    const targetKey = screens[highScoresOrigin] ? highScoresOrigin : 'start';
    showElement(target);
    activateScreenOptions(targetKey, target);
  }

  function onOptionClick(event) {
    if (event.isTrusted) {
      const option = event.currentTarget;
      // Sliders persist through their own input handler, not the click path.
      if (isSliderOption(option)) {
        return;
      }
      dispatchAction(getActionFromOption(option), option);
    }
  }

  function onSliderInput(event) {
    if (event.isTrusted) {
      commitSliderValue(event.currentTarget);
    }
  }

  const allOptions = [];
  for (const screen of allScreens) {
    if (screen && typeof screen.querySelectorAll === 'function') {
      allOptions.push(...Array.from(screen.querySelectorAll('[data-option]')));
    }
  }

  for (const option of allOptions) {
    if (typeof option.addEventListener !== 'function') {
      continue;
    }
    if (isSliderOption(option)) {
      option.addEventListener('input', onSliderInput);
    } else {
      option.addEventListener('click', onOptionClick);
    }
  }

  /**
   * Seed the Settings overlay controls from persisted C-11A settings so the UI
   * reflects stored state when first opened. Pure DOM sync — no host callbacks.
   *
   * @param {{ musicEnabled?: boolean, sfxEnabled?: boolean, musicVolume?: number, sfxVolume?: number, uiVolume?: number }} settings - Validated settings.
   */
  function syncSettingsControls(settings) {
    if (!settings || !screens.settings) {
      return;
    }
    const toggleMap = { musicEnabled: settings.musicEnabled, sfxEnabled: settings.sfxEnabled };
    for (const [key, enabled] of Object.entries(toggleMap)) {
      const button = screens.settings.querySelector(`[data-setting="${key}"]`);
      if (button) {
        button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        const icon = button.querySelector('[data-setting-icon]');
        if (icon) {
          icon.textContent = enabled ? '🔊' : '🔇';
        }
      }
    }
    const volumeMap = {
      musicVolume: settings.musicVolume,
      sfxVolume: settings.sfxVolume,
      uiVolume: settings.uiVolume,
    };
    for (const [key, volume] of Object.entries(volumeMap)) {
      const slider = screens.settings.querySelector(`[data-setting="${key}"]`);
      if (slider && typeof volume === 'number') {
        const max = Number(slider.getAttribute('max')) || 100;
        const value = Math.round(volume * max);
        slider.value = String(value);
        slider.setAttribute('aria-valuenow', String(value));
      }
    }
  }

  rootElement.addEventListener('keydown', onKeyDown);
  hideAll();
  syncSettingsControls(options.initialSettings);

  function destroy() {
    rootElement.removeEventListener('keydown', onKeyDown);
    for (const option of allOptions) {
      if (typeof option.removeEventListener !== 'function') {
        continue;
      }
      if (isSliderOption(option)) {
        option.removeEventListener('input', onSliderInput);
      } else {
        option.removeEventListener('click', onOptionClick);
      }
    }
    clearActiveOptions();
    restorePreviousFocus();
  }

  return {
    destroy,
    hideAll,
    showGameOver,
    showHighScores,
    showLevelComplete,
    showPause,
    showSettings,
    showStart,
    showVictory,
    syncSettingsControls,
  };
}

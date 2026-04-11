/*
 * B-02 keyboard input adapter.
 *
 * This module captures browser keyboard events and normalizes them into a
 * deterministic adapter contract for ECS input systems. It owns the DOM event
 * boundary for gameplay controls while keeping game-flow interpretation out of
 * scope for later Track C systems.
 *
 * Public API:
 * - INPUT_INTENT: canonical normalized input names.
 * - KEYBOARD_CODE_BINDINGS: canonical KeyboardEvent.code -> intent mapping.
 * - KEYBOARD_KEY_BINDINGS: fallback KeyboardEvent.key -> intent mapping.
 * - normalizeKeyboardIntent(event): normalize one keyboard event into an intent.
 * - createInputAdapter(options): create an adapter with held-key and pressed-key state.
 *
 * Implementation notes:
 * - Held movement uses a Set so later systems can implement hold-to-move
 *   without depending on OS key repeat behavior.
 * - Edge-triggered actions are buffered in `pressedKeys` so one-shot inputs
 *   like bomb, pause, and confirm can be consumed exactly once per fixed step.
 * - `drainPressedKeys()` reuses an internal Set buffer so fixed-step input
 *   sampling does not allocate fresh collections every simulation tick.
 * - `clearHeldKeys()` intentionally clears both held and pressed input state
 *   because the runtime already calls that method on blur/visibility recovery.
 * - The adapter also listens for `blur` and hidden `visibilitychange` events
 *   so stuck-key recovery still works even before the runtime is fully wired.
 */

/**
 * Canonical normalized intent names used across the input pipeline.
 */
export const INPUT_INTENT = Object.freeze({
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
  BOMB: 'bomb',
  PAUSE: 'pause',
  CONFIRM: 'confirm',
});

/**
 * Canonical KeyboardEvent.code bindings.
 * `code` is preferred because it is layout-stable for the supported controls.
 */
export const KEYBOARD_CODE_BINDINGS = Object.freeze({
  ArrowUp: INPUT_INTENT.UP,
  ArrowDown: INPUT_INTENT.DOWN,
  ArrowLeft: INPUT_INTENT.LEFT,
  ArrowRight: INPUT_INTENT.RIGHT,
  Space: INPUT_INTENT.BOMB,
  Escape: INPUT_INTENT.PAUSE,
  KeyP: INPUT_INTENT.PAUSE,
  Enter: INPUT_INTENT.CONFIRM,
});

/**
 * Fallback KeyboardEvent.key bindings for tests or environments without `code`.
 */
export const KEYBOARD_KEY_BINDINGS = Object.freeze({
  ArrowUp: INPUT_INTENT.UP,
  ArrowDown: INPUT_INTENT.DOWN,
  ArrowLeft: INPUT_INTENT.LEFT,
  ArrowRight: INPUT_INTENT.RIGHT,
  ' ': INPUT_INTENT.BOMB,
  Spacebar: INPUT_INTENT.BOMB,
  Escape: INPUT_INTENT.PAUSE,
  Esc: INPUT_INTENT.PAUSE,
  p: INPUT_INTENT.PAUSE,
  P: INPUT_INTENT.PAUSE,
  Enter: INPUT_INTENT.CONFIRM,
});

/**
 * Normalize one DOM keyboard event into a canonical gameplay intent.
 *
 * @param {KeyboardEvent | { code?: string, key?: string } | null | undefined} event - DOM event-like input.
 * @returns {string | null} Canonical intent name or null when the key is irrelevant.
 */
export function normalizeKeyboardIntent(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  // Prefer `code` so the physical control mapping stays stable across layouts.
  if (typeof event.code === 'string') {
    return KEYBOARD_CODE_BINDINGS[event.code] || null;
  }

  // Fall back to `key` so tests and synthetic events can still exercise the adapter.
  if (typeof event.key === 'string' && event.key in KEYBOARD_KEY_BINDINGS) {
    return KEYBOARD_KEY_BINDINGS[event.key];
  }

  return null;
}

/**
 * Create the keyboard input adapter and attach listeners when an event target exists.
 *
 * @param {{
 *   documentTarget?: Document | null,
 *   eventTarget?: EventTarget | null,
 *   windowTarget?: EventTarget | null,
 * }} [options] - Optional adapter configuration.
 * @returns {InputAdapter} Mutable keyboard adapter state and lifecycle helpers.
 */
export function createInputAdapter(options = {}) {
  const defaultWindowTarget = typeof window !== 'undefined' ? window : null;
  const defaultDocumentTarget = typeof document !== 'undefined' ? document : null;
  const target = options.eventTarget || defaultWindowTarget;
  const windowTarget = options.windowTarget || defaultWindowTarget;
  const documentTarget = options.documentTarget || defaultDocumentTarget;
  const heldKeys = new Set();
  const pressedKeys = new Set();
  const drainedPressedKeys = new Set();

  /**
   * Clear all tracked key state.
   * The name matches the existing runtime contract even though it also clears
   * pressed-edge state for focus-loss safety.
   */
  function clearHeldKeys() {
    heldKeys.clear();
    pressedKeys.clear();
  }

  /**
   * Drain buffered edge-triggered intents in insertion order.
   *
   * @returns {Set<string>} Reused snapshot of pressed intents since the last drain.
   */
  function drainPressedKeys() {
    drainedPressedKeys.clear();

    for (const pressedKey of pressedKeys) {
      drainedPressedKeys.add(pressedKey);
    }

    pressedKeys.clear();
    return drainedPressedKeys;
  }

  /**
   * Handle keydown by updating held state and buffering one-shot edges.
   *
   * @param {KeyboardEvent | { code?: string, key?: string, repeat?: boolean, preventDefault?: Function }} event - DOM event-like input.
   */
  function onKeyDown(event) {
    const intent = normalizeKeyboardIntent(event);
    if (!intent) {
      return;
    }

    // Prevent page scroll and browser chrome shortcuts for captured gameplay keys.
    event.preventDefault?.();

    // Mark the key as held even if a repeated event is the first one we observe.
    heldKeys.add(intent);

    // Buffer only the initial press edge so gameplay never depends on OS repeat.
    if (event.repeat || pressedKeys.has(intent)) {
      return;
    }

    pressedKeys.add(intent);
  }

  /**
   * Handle keyup by clearing the held-state entry for the normalized intent.
   *
   * @param {KeyboardEvent | { code?: string, key?: string, preventDefault?: Function }} event - DOM event-like input.
   */
  function onKeyUp(event) {
    const intent = normalizeKeyboardIntent(event);
    if (!intent) {
      return;
    }

    heldKeys.delete(intent);
  }

  /**
   * Clear input state on focus loss so the game never resumes with stale holds.
   */
  function onBlur() {
    clearHeldKeys();
  }

  /**
   * Clear input state when the document becomes hidden.
   * Becoming visible again is a runtime timing concern, not an adapter concern.
   */
  function onVisibilityChange() {
    if (documentTarget?.hidden) {
      clearHeldKeys();
    }
  }

  /**
   * Remove DOM listeners and clear local input state.
   */
  function destroy() {
    if (typeof target?.removeEventListener === 'function') {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
    }
    if (typeof windowTarget?.removeEventListener === 'function') {
      windowTarget.removeEventListener('blur', onBlur);
    }
    if (typeof documentTarget?.removeEventListener === 'function') {
      documentTarget.removeEventListener('visibilitychange', onVisibilityChange);
    }

    clearHeldKeys();
  }

  if (typeof target?.addEventListener === 'function') {
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
  }
  if (typeof windowTarget?.addEventListener === 'function') {
    windowTarget.addEventListener('blur', onBlur);
  }
  if (typeof documentTarget?.addEventListener === 'function') {
    documentTarget.addEventListener('visibilitychange', onVisibilityChange);
  }

  return {
    clearHeldKeys,
    destroy,
    drainPressedKeys,
    heldKeys,
    pressedKeys,
  };
}

/*
 * C-11B persistent audio quick-toggle DOM adapter (Track C).
 *
 * This module owns the always-visible top-right audio buttons (music / sfx)
 * that let the player mute/unmute without opening the Settings overlay. It is a
 * thin DOM boundary: it toggles aria-pressed + the emoji icon and forwards each
 * change to the host via onToggle(key, enabled). It creates no DOM and contains
 * no audio or game logic — persistence + adapter application live in the host
 * (C-11A storage adapter + applyAudioSettings).
 *
 * Public API:
 * - createAudioQuickToggle(rootElement, options): bind the quick-toggle buttons.
 *   options.onToggle(settingKey, enabled): notified on every toggle.
 *   options.initialSettings: { musicEnabled, sfxEnabled } to seed button state.
 *   Returned: { sync(settings), destroy() }.
 *
 * Implementation notes:
 * - Buttons are matched by [data-audio-toggle="<settingKey>"]; missing nodes are
 *   tolerated so headless/partial layouts never throw.
 * - aria-pressed is the source of truth for the on/off state; the emoji icon
 *   (🔊 / 🔇) mirrors it for sighted users while aria-label stays stable for
 *   screen readers.
 */

const DEFAULT_ENABLED_ICON = '🔊';
const DEFAULT_DISABLED_ICON = '🔇';

function setButtonState(button, enabled) {
  if (!button || typeof button.setAttribute !== 'function') {
    return;
  }
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  const icon = button.querySelector?.('[data-audio-toggle-icon]');
  if (icon) {
    // Per-button icons via data-icon-on / data-icon-off (e.g. 🎵 for music,
    // 🔊 for sfx), falling back to the shared speaker icons.
    const onIcon = button.getAttribute?.('data-icon-on') || DEFAULT_ENABLED_ICON;
    const offIcon = button.getAttribute?.('data-icon-off') || DEFAULT_DISABLED_ICON;
    icon.textContent = enabled ? onIcon : offIcon;
  }
}

export function createAudioQuickToggle(rootElement, options = {}) {
  if (!rootElement || typeof rootElement.querySelectorAll !== 'function') {
    return { sync() {}, destroy() {} };
  }

  const buttons = Array.from(rootElement.querySelectorAll('[data-audio-toggle]'));

  function handleClick(event) {
    const button = event.currentTarget;
    if (!button || typeof button.getAttribute !== 'function') {
      return;
    }
    const settingKey = button.getAttribute('data-audio-toggle');
    const enabled = button.getAttribute('aria-pressed') !== 'true';
    setButtonState(button, enabled);
    if (settingKey) {
      options.onToggle?.(settingKey, enabled);
    }
  }

  for (const button of buttons) {
    if (typeof button.addEventListener === 'function') {
      button.addEventListener('click', handleClick);
    }
  }

  /**
   * Reflect persisted settings onto the buttons without firing onToggle.
   *
   * @param {{ musicEnabled?: boolean, sfxEnabled?: boolean }} settings - Validated settings.
   */
  function sync(settings) {
    if (!settings) {
      return;
    }
    for (const button of buttons) {
      const key = button.getAttribute?.('data-audio-toggle');
      if (key && typeof settings[key] === 'boolean') {
        setButtonState(button, settings[key]);
      }
    }
  }

  function destroy() {
    for (const button of buttons) {
      if (typeof button.removeEventListener === 'function') {
        button.removeEventListener('click', handleClick);
      }
    }
  }

  sync(options.initialSettings);

  return { sync, destroy };
}

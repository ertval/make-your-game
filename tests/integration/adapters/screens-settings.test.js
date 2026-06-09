/**
 * C-11B integration tests for the Settings overlay behavior of the Track C
 * screens adapter, plus the persistent audio quick-toggle adapter.
 *
 * Uses a small purpose-built fake DOM (no jsdom dependency, runs in the node
 * environment like the other adapter suites) that faithfully models the exact
 * operations the adapters use: querySelector/querySelectorAll by attribute,
 * get/setAttribute, classList, focus, addEventListener + dispatch, and the
 * range-input `value`/`type`/`tagName` surface.
 *
 * Coverage:
 * - open Settings from start and from pause, Back returns to the origin
 * - only one overlay visible at a time
 * - keyboard navigation (Up/Down between options, Left/Right on sliders)
 * - accessibility: aria-pressed toggles, aria-valuenow sliders
 * - onSettingChange forwards booleans (toggles) and 0..1 volumes (sliders)
 * - initialSettings + syncSettingsControls reflect persisted state
 * - quick-toggle adapter: aria-pressed + emoji icon + onToggle callback
 */

import { describe, expect, it, vi } from 'vitest';

import { createScreensAdapter } from '../../../src/adapters/dom/screens-adapter.js';
import { createAudioQuickToggle } from '../../../src/adapters/dom/screens-audio-toggle.js';

// ---- minimal DOM ----------------------------------------------------------

function createElement(tag, attrs = {}) {
  const attributes = new Map(Object.entries(attrs));
  const classes = new Set();
  const children = [];
  const listeners = new Map();
  const el = {
    tagName: tag.toUpperCase(),
    children,
    focusCount: 0,
    clickCount: 0,
    get type() {
      return attributes.get('type') ?? '';
    },
    get value() {
      return attributes.get('value') ?? '';
    },
    set value(v) {
      attributes.set('value', String(v));
    },
    get textContent() {
      return attributes.get('__text') ?? '';
    },
    set textContent(v) {
      attributes.set('__text', String(v));
    },
    classList: {
      add: (...t) => {
        for (const x of t) classes.add(x);
      },
      remove: (...t) => {
        for (const x of t) classes.delete(x);
      },
      contains: (x) => classes.has(x),
    },
    getAttribute: (n) => (attributes.has(n) ? attributes.get(n) : null),
    setAttribute: (n, v) => attributes.set(n, String(v)),
    removeAttribute: (n) => attributes.delete(n),
    hasClass: (x) => classes.has(x),
    focus() {
      this.focusCount += 1;
      ownerDocument.activeElement = this;
    },
    click() {
      this.clickCount += 1;
      // Programmatic .click() fires an untrusted event in real browsers, which
      // the adapter's click handler ignores — model that so keyboard activation
      // is not double-counted.
      dispatch(this, 'click', { isTrusted: false, currentTarget: this });
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    _listeners: listeners,
    append(...nodes) {
      for (const n of nodes) {
        children.push(n);
        n.parent = this;
      }
    },
    matches(selector) {
      return matchSelector(this, selector);
    },
    querySelector(selector) {
      return descendants(this).find((n) => matchSelector(n, selector)) ?? null;
    },
    querySelectorAll(selector) {
      return descendants(this).filter((n) => matchSelector(n, selector));
    },
  };
  return el;
}

function descendants(node) {
  const out = [];
  for (const child of node.children) {
    out.push(child, ...descendants(child));
  }
  return out;
}

function matchSelector(node, selector) {
  // Supports: [attr], [attr="value"], tag, and our data-* attribute lookups.
  const attrMatch = selector.match(/^\[([^\]=]+)(?:="([^"]*)")?\]$/);
  if (attrMatch) {
    const [, name, value] = attrMatch;
    if (!node.getAttribute || node.getAttribute(name) === null) return false;
    return value === undefined || node.getAttribute(name) === value;
  }
  return node.tagName?.toLowerCase() === selector.toLowerCase();
}

function dispatch(node, type, event) {
  const handlers = node._listeners?.get(type);
  if (handlers) {
    for (const h of [...handlers]) h({ ...event, currentTarget: node, target: node });
  }
}

const ownerDocument = { activeElement: null };

function button(action, extra = {}) {
  const b = createElement('button', { 'data-option': '', 'data-action': action, ...extra });
  return b;
}

function toggleButton(action, settingKey) {
  const b = createElement('button', {
    'data-option': '',
    'data-action': action,
    'data-setting': settingKey,
    'aria-pressed': 'true',
  });
  const icon = createElement('span', { 'data-setting-icon': '' });
  icon.textContent = '🔊';
  b.append(icon);
  return b;
}

function slider(action, settingKey) {
  return createElement('input', {
    type: 'range',
    'data-option': '',
    'data-action': action,
    'data-setting': settingKey,
    min: '0',
    max: '100',
    step: '1',
    value: '100',
    'aria-valuenow': '100',
  });
}

function screenSection(screenKey, optionNodes) {
  const dataScreen =
    { start: 'start', pause: 'pause', settings: 'settings' }[screenKey] || screenKey;
  const section = createElement('section', { 'data-screen': dataScreen });
  const panel = createElement('div');
  section.append(panel);
  for (const node of optionNodes) panel.append(node);
  return section;
}

function buildRoot() {
  ownerDocument.activeElement = null;
  const root = createElement('section');
  root.ownerDocument = ownerDocument;

  const startSection = screenSection('start', [
    button('start-primary'),
    button('open-settings', { 'data-settings-origin': 'start' }),
    button('start-secondary'),
  ]);
  const pauseSection = screenSection('pause', [
    button('pause-continue'),
    button('open-settings', { 'data-settings-origin': 'pause' }),
    button('pause-restart'),
  ]);
  // UI volume is merged into the SFX slider (no separate UI slider).
  const settingsSection = screenSection('settings', [
    toggleButton('settings-toggle-music', 'musicEnabled'),
    slider('settings-volume-music', 'musicVolume'),
    toggleButton('settings-toggle-sfx', 'sfxEnabled'),
    slider('settings-volume-sfx', 'sfxVolume'),
    button('settings-back'),
  ]);

  root.append(startSection, pauseSection, settingsSection);
  return root;
}

function keydown(root, key) {
  dispatch(root, 'keydown', {
    key,
    isTrusted: true,
    preventDefault: () => {},
  });
}

function screen(root, key) {
  return root.querySelector(`[data-screen="${key}"]`);
}

// ---- tests ----------------------------------------------------------------

describe('screens-adapter: C-11B Settings overlay', () => {
  function setup(opts = {}) {
    const root = buildRoot();
    const onSettingChange = vi.fn();
    const adapter = createScreensAdapter(root, { onSettingChange, ...opts });
    return { root, adapter, onSettingChange };
  }

  it('opens Settings from the start menu and shows only that overlay', () => {
    const { root, adapter } = setup();
    adapter.showStart();

    // Navigate to the "Settings" option (index 1) and activate it.
    keydown(root, 'ArrowDown');
    keydown(root, 'Enter');

    expect(screen(root, 'settings').hasClass('is-screen-visible')).toBe(true);
    expect(screen(root, 'start').hasClass('is-screen-hidden')).toBe(true);
    // Only one overlay visible.
    const visible = root
      .querySelectorAll('[data-screen]')
      .filter((s) => s.hasClass('is-screen-visible'));
    expect(visible).toHaveLength(1);
  });

  it('Back from Settings returns to the start menu when opened from start', () => {
    const { root, adapter } = setup();
    adapter.showStart();
    adapter.showSettings('start');

    // Back is the last option; go Up once from index 0 wraps to it.
    keydown(root, 'ArrowUp');
    keydown(root, 'Enter');

    expect(screen(root, 'start').hasClass('is-screen-visible')).toBe(true);
    expect(screen(root, 'settings').hasClass('is-screen-hidden')).toBe(true);
  });

  it('Back from Settings returns to the pause menu when opened from pause', () => {
    const { root, adapter } = setup();
    adapter.showPause();
    adapter.showSettings('pause');

    keydown(root, 'ArrowUp');
    keydown(root, 'Enter');

    expect(screen(root, 'pause').hasClass('is-screen-visible')).toBe(true);
    expect(screen(root, 'settings').hasClass('is-screen-hidden')).toBe(true);
  });

  it('toggles a setting button: flips aria-pressed, swaps the emoji, fires onSettingChange', () => {
    const { root, adapter, onSettingChange } = setup();
    adapter.showSettings('start');

    const musicToggle = screen(root, 'settings').querySelector('[data-setting="musicEnabled"]');
    const icon = musicToggle.querySelector('[data-setting-icon]');
    expect(musicToggle.getAttribute('aria-pressed')).toBe('true');

    // First option is the music toggle.
    keydown(root, 'Enter');

    expect(musicToggle.getAttribute('aria-pressed')).toBe('false');
    expect(icon.textContent).toBe('🔇');
    expect(onSettingChange).toHaveBeenCalledWith('musicEnabled', false);
  });

  it('adjusts a slider with Left/Right and keeps aria-valuenow in sync (0..1 volume out)', () => {
    const { root, adapter, onSettingChange } = setup();
    adapter.showSettings('start');

    // index 0 = music toggle, index 1 = music volume slider.
    keydown(root, 'ArrowDown');
    const slider = screen(root, 'settings').querySelector('[data-setting="musicVolume"]');
    expect(slider.getAttribute('aria-valuenow')).toBe('100');

    keydown(root, 'ArrowLeft');

    expect(slider.value).toBe('99');
    expect(slider.getAttribute('aria-valuenow')).toBe('99');
    expect(onSettingChange).toHaveBeenLastCalledWith('musicVolume', 0.99);
  });

  it('Enter on a slider does not activate/navigate (sliders are not buttons)', () => {
    const { root, adapter, onSettingChange } = setup();
    adapter.showSettings('start');
    keydown(root, 'ArrowDown'); // to the music slider

    keydown(root, 'Enter');

    // Still on Settings; Enter was a no-op for the slider.
    expect(screen(root, 'settings').hasClass('is-screen-visible')).toBe(true);
    expect(onSettingChange).not.toHaveBeenCalled();
  });

  it('seeds controls from initialSettings (aria-pressed, icon, aria-valuenow)', () => {
    const { root } = setup({
      initialSettings: {
        musicEnabled: false,
        sfxEnabled: true,
        musicVolume: 0.25,
        sfxVolume: 0.5,
        uiVolume: 0.5,
      },
    });

    const settings = screen(root, 'settings');
    const music = settings.querySelector('[data-setting="musicEnabled"]');
    expect(music.getAttribute('aria-pressed')).toBe('false');
    expect(music.querySelector('[data-setting-icon]').textContent).toBe('🔇');
    expect(
      settings.querySelector('[data-setting="musicVolume"]').getAttribute('aria-valuenow'),
    ).toBe('25');
    // UI volume has no separate slider; the SFX slider seeds from sfxVolume.
    expect(settings.querySelector('[data-setting="sfxVolume"]').getAttribute('aria-valuenow')).toBe(
      '50',
    );
  });

  it('syncSettingsControls reflects later persisted changes', () => {
    const { root, adapter } = setup();
    adapter.syncSettingsControls({
      musicEnabled: true,
      sfxEnabled: false,
      musicVolume: 1,
      sfxVolume: 0.1,
      uiVolume: 1,
    });

    const settings = screen(root, 'settings');
    expect(settings.querySelector('[data-setting="sfxEnabled"]').getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(settings.querySelector('[data-setting="sfxVolume"]').getAttribute('aria-valuenow')).toBe(
      '10',
    );
  });
});

describe('screens-audio-toggle: persistent quick-toggle (C-11B)', () => {
  function buildToggleRoot(initial = { musicEnabled: true, sfxEnabled: true }) {
    const root = createElement('div');
    const music = createElement('button', {
      'data-audio-toggle': 'musicEnabled',
      'data-icon-on': '🎵',
      'data-icon-off': '🔇',
      'aria-pressed': 'true',
    });
    music.append(
      (() => {
        const i = createElement('span', { 'data-audio-toggle-icon': '' });
        i.textContent = '🎵';
        return i;
      })(),
    );
    const sfx = createElement('button', {
      'data-audio-toggle': 'sfxEnabled',
      'data-icon-on': '🔊',
      'data-icon-off': '🔇',
      'aria-pressed': 'true',
    });
    sfx.append(
      (() => {
        const i = createElement('span', { 'data-audio-toggle-icon': '' });
        i.textContent = '🔊';
        return i;
      })(),
    );
    root.append(music, sfx);
    return { root, music, sfx, initial };
  }

  it('flips aria-pressed + emoji and reports the new state on click', () => {
    const { root, music } = buildToggleRoot();
    const onToggle = vi.fn();
    createAudioQuickToggle(root, { onToggle });

    music.click();

    expect(music.getAttribute('aria-pressed')).toBe('false');
    expect(music.querySelector('[data-audio-toggle-icon]').textContent).toBe('🔇');
    expect(onToggle).toHaveBeenCalledWith('musicEnabled', false);
  });

  it('seeds button state from initialSettings without firing onToggle', () => {
    const { root, music, sfx } = buildToggleRoot();
    const onToggle = vi.fn();
    createAudioQuickToggle(root, {
      onToggle,
      initialSettings: { musicEnabled: false, sfxEnabled: true },
    });

    expect(music.getAttribute('aria-pressed')).toBe('false');
    expect(music.querySelector('[data-audio-toggle-icon]').textContent).toBe('🔇');
    expect(sfx.getAttribute('aria-pressed')).toBe('true');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("uses each button's own data-icon-on / data-icon-off (music 🎵, sfx 🔊)", () => {
    const { root, music, sfx } = buildToggleRoot();
    createAudioQuickToggle(root, {});

    // Off then back on: each button restores its distinct enabled icon.
    music.click();
    expect(music.querySelector('[data-audio-toggle-icon]').textContent).toBe('🔇');
    music.click();
    expect(music.querySelector('[data-audio-toggle-icon]').textContent).toBe('🎵');

    sfx.click();
    expect(sfx.querySelector('[data-audio-toggle-icon]').textContent).toBe('🔇');
    sfx.click();
    expect(sfx.querySelector('[data-audio-toggle-icon]').textContent).toBe('🔊');
  });

  it('sync() reflects external changes; destroy() detaches listeners', () => {
    const { root, music } = buildToggleRoot();
    const onToggle = vi.fn();
    const toggle = createAudioQuickToggle(root, { onToggle });

    toggle.sync({ musicEnabled: false, sfxEnabled: true });
    expect(music.getAttribute('aria-pressed')).toBe('false');

    toggle.destroy();
    music.click();
    // No further callbacks after destroy (the click handler was removed).
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('tolerates a missing root without throwing', () => {
    expect(() => createAudioQuickToggle(null, {})).not.toThrow();
    const noop = createAudioQuickToggle(null, {});
    expect(() => noop.sync({ musicEnabled: false })).not.toThrow();
    expect(() => noop.destroy()).not.toThrow();
  });
});

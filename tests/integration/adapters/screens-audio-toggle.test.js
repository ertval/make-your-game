/**
 * CI-12 dedicated integration tests for the persistent audio quick-toggle
 * DOM adapter (C-11B), covering rendering, click toggling, state updates,
 * and ARIA updates in isolation from the Settings overlay suite.
 *
 * Uses the same small purpose-built fake DOM as the other adapter suites
 * (no jsdom dependency): querySelector/querySelectorAll by attribute,
 * get/setAttribute, addEventListener + dispatch.
 */

import { describe, expect, it, vi } from 'vitest';

import { createAudioQuickToggle } from '../../../src/adapters/dom/screens-audio-toggle.js';

// ---- minimal DOM ----------------------------------------------------------

function createElement(tag, attrs = {}) {
  const attributes = new Map(Object.entries(attrs));
  const children = [];
  const listeners = new Map();

  function dispatch(target, type, extra = {}) {
    const handlers = listeners.get(type);
    if (!handlers) {
      return;
    }
    const event = { type, currentTarget: target, target, ...extra };
    for (const handler of handlers) {
      handler(event);
    }
  }

  const el = {
    tagName: tag.toUpperCase(),
    children,
    get textContent() {
      return attributes.get('__text') ?? '';
    },
    set textContent(v) {
      attributes.set('__text', String(v));
    },
    getAttribute: (n) => (attributes.has(n) ? attributes.get(n) : null),
    setAttribute: (n, v) => attributes.set(n, String(v)),
    removeAttribute: (n) => attributes.delete(n),
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    click() {
      dispatch(this, 'click', { currentTarget: this });
    },
    append(...nodes) {
      children.push(...nodes);
    },
    querySelector(selector) {
      const match = /\[([\w-]+)(?:="([^"]*)")?\]/.exec(selector);
      if (!match) {
        return null;
      }
      const [, attrName, attrValue] = match;
      return (
        children.find((child) => {
          const value = child.getAttribute(attrName);
          return attrValue === undefined ? value !== null : value === attrValue;
        }) ?? null
      );
    },
    querySelectorAll(selector) {
      const match = /\[([\w-]+)(?:="([^"]*)")?\]/.exec(selector);
      if (!match) {
        return [];
      }
      const [, attrName, attrValue] = match;
      return children.filter((child) => {
        const value = child.getAttribute(attrName);
        return attrValue === undefined ? value !== null : value === attrValue;
      });
    },
  };
  return el;
}

function buildToggleRoot(overrides = {}) {
  const root = createElement('div');
  const music = createElement('button', {
    'data-audio-toggle': 'musicEnabled',
    'data-icon-on': '🎵',
    'data-icon-off': '🔇',
    'aria-pressed': 'true',
    ...overrides.music,
  });
  const musicIcon = createElement('span', { 'data-audio-toggle-icon': '' });
  musicIcon.textContent = '🎵';
  music.append(musicIcon);

  const sfx = createElement('button', {
    'data-audio-toggle': 'sfxEnabled',
    'data-icon-on': '🔊',
    'data-icon-off': '🔇',
    'aria-pressed': 'true',
    ...overrides.sfx,
  });
  const sfxIcon = createElement('span', { 'data-audio-toggle-icon': '' });
  sfxIcon.textContent = '🔊';
  sfx.append(sfxIcon);

  root.append(music, sfx);
  return { root, music, sfx };
}

describe('screens-audio-toggle (CI-12 dedicated coverage)', () => {
  it('renders both quick-toggle buttons discoverable by [data-audio-toggle]', () => {
    const { root } = buildToggleRoot();
    createAudioQuickToggle(root, {});

    const buttons = root.querySelectorAll('[data-audio-toggle]');
    expect(buttons).toHaveLength(2);
    expect(buttons.map((b) => b.getAttribute('data-audio-toggle'))).toEqual([
      'musicEnabled',
      'sfxEnabled',
    ]);
  });

  it('flips aria-pressed and the icon, and reports the new state, on click', () => {
    const { root, music } = buildToggleRoot();
    const onToggle = vi.fn();
    createAudioQuickToggle(root, { onToggle });

    music.click();

    expect(music.getAttribute('aria-pressed')).toBe('false');
    expect(music.querySelector('[data-audio-toggle-icon]').textContent).toBe('🔇');
    expect(onToggle).toHaveBeenCalledWith('musicEnabled', false);
  });

  it('toggles back on with the correct aria-pressed and icon on a second click', () => {
    const { root, sfx } = buildToggleRoot();
    const onToggle = vi.fn();
    createAudioQuickToggle(root, { onToggle });

    sfx.click();
    sfx.click();

    expect(sfx.getAttribute('aria-pressed')).toBe('true');
    expect(sfx.querySelector('[data-audio-toggle-icon]').textContent).toBe('🔊');
    expect(onToggle).toHaveBeenNthCalledWith(2, 'sfxEnabled', true);
  });

  it('toggles music and sfx independently of one another', () => {
    const { root, music, sfx } = buildToggleRoot();
    const onToggle = vi.fn();
    createAudioQuickToggle(root, { onToggle });

    music.click();

    expect(music.getAttribute('aria-pressed')).toBe('false');
    expect(sfx.getAttribute('aria-pressed')).toBe('true');
    expect(onToggle).toHaveBeenCalledTimes(1);
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

  it("sync() reflects externally changed settings using each button's own icons", () => {
    const { root, music, sfx } = buildToggleRoot();
    const toggle = createAudioQuickToggle(root, {});

    toggle.sync({ musicEnabled: false, sfxEnabled: true });

    expect(music.getAttribute('aria-pressed')).toBe('false');
    expect(music.querySelector('[data-audio-toggle-icon]').textContent).toBe('🔇');
    expect(sfx.getAttribute('aria-pressed')).toBe('true');
    expect(sfx.querySelector('[data-audio-toggle-icon]').textContent).toBe('🔊');
  });

  it('sync() with a partial/missing settings object does not throw or change untouched keys', () => {
    const { root, music, sfx } = buildToggleRoot();
    const toggle = createAudioQuickToggle(root, {});

    expect(() => toggle.sync(undefined)).not.toThrow();
    expect(() => toggle.sync({})).not.toThrow();
    expect(music.getAttribute('aria-pressed')).toBe('true');
    expect(sfx.getAttribute('aria-pressed')).toBe('true');
  });

  it('destroy() detaches click listeners so further clicks are inert', () => {
    const { root, music } = buildToggleRoot();
    const onToggle = vi.fn();
    const toggle = createAudioQuickToggle(root, { onToggle });

    toggle.destroy();
    music.click();

    expect(onToggle).not.toHaveBeenCalled();
    expect(music.getAttribute('aria-pressed')).toBe('true');
  });

  it('falls back to the shared speaker icons when a button has no data-icon-on/off', () => {
    const root = createElement('div');
    const plain = createElement('button', {
      'data-audio-toggle': 'musicEnabled',
      'aria-pressed': 'true',
    });
    const icon = createElement('span', { 'data-audio-toggle-icon': '' });
    icon.textContent = '🔊';
    plain.append(icon);
    root.append(plain);

    createAudioQuickToggle(root, {});
    plain.click();

    expect(icon.textContent).toBe('🔇');
    plain.click();
    expect(icon.textContent).toBe('🔊');
  });

  it('tolerates a missing root without throwing, and returns a no-op controller', () => {
    expect(() => createAudioQuickToggle(null, {})).not.toThrow();
    const noop = createAudioQuickToggle(null, {});
    expect(() => noop.sync({ musicEnabled: false })).not.toThrow();
    expect(() => noop.destroy()).not.toThrow();
  });

  it('tolerates a root with no matching toggle buttons without throwing', () => {
    const root = createElement('div');
    expect(() => createAudioQuickToggle(root, {})).not.toThrow();
  });
});

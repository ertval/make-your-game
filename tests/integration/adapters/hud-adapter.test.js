/**
 * Unit tests for the Track C HUD adapter.
 *
 * Verifies HUD formatting rules, accessibility setup, and safe DOM sink usage
 * without depending on a browser DOM implementation.
 */

import { describe, expect, it, vi } from 'vitest';

import { ARIA_LIVE_THROTTLE_MS, createHudAdapter } from '../../../src/adapters/dom/hud-adapter.js';

function createHudElement() {
  let innerHtmlWrites = 0;
  let textContent = '';
  let textWrites = 0;

  const element = {
    attributes: new Map(),
    get textContent() {
      return textContent;
    },
    set textContent(value) {
      textWrites += 1;
      textContent = value;
    },
    get innerHTML() {
      return '';
    },
    set innerHTML(_value) {
      innerHtmlWrites += 1;
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
  };

  return {
    element,
    getInnerHtmlWrites() {
      return innerHtmlWrites;
    },
    getTextWrites() {
      return textWrites;
    },
  };
}

function createRootElement() {
  const entries = {
    bombs: createHudElement(),
    fire: createHudElement(),
    level: createHudElement(),
    lives: createHudElement(),
    score: createHudElement(),
    status: createHudElement(),
    timer: createHudElement(),
  };
  const selectorMap = new Map([
    ['[data-hud="bombs"]', entries.bombs.element],
    ['[data-hud="fire"]', entries.fire.element],
    ['[data-hud="level"]', entries.level.element],
    ['[data-hud="lives"]', entries.lives.element],
    ['[data-hud="score"]', entries.score.element],
    ['[data-hud="status"]', entries.status.element],
    ['[data-hud="timer"]', entries.timer.element],
  ]);

  return {
    entries,
    rootElement: {
      querySelector(selector) {
        return selectorMap.get(selector) || null;
      },
    },
  };
}

describe('hud-adapter', () => {
  it('handles undefined state safely', () => {
    const { entries, rootElement } = createRootElement();
    const adapter = createHudAdapter(rootElement);

    adapter.update(undefined);

    expect(entries.score.element.textContent).toBe('00000');
    expect(entries.timer.element.textContent).toBe('0:00');
    expect(entries.lives.element.textContent).toBe('');
  });

  it('updates score using the canonical five-digit padding rule', () => {
    const { entries, rootElement } = createRootElement();
    const adapter = createHudAdapter(rootElement);

    adapter.update({
      lives: 3,
      score: 42,
      timer: 0,
      bombs: 1,
      fire: 1,
      level: 1,
    });

    expect(entries.score.element.textContent).toBe('00042');
  });

  it('formats the timer as M:SS', () => {
    const { entries, rootElement } = createRootElement();
    const adapter = createHudAdapter(rootElement);

    adapter.update({
      lives: 3,
      score: 0,
      timer: 125,
      bombs: 1,
      fire: 1,
      level: 1,
    });

    expect(entries.timer.element.textContent).toBe('2:05');
  });

  it('renders lives as heart icons', () => {
    const { entries, rootElement } = createRootElement();
    const adapter = createHudAdapter(rootElement);

    adapter.update({
      lives: 3,
      score: 0,
      timer: 0,
      bombs: 1,
      fire: 1,
      level: 1,
    });

    expect(entries.lives.element.textContent).toBe('❤️❤️❤️');
  });

  it('updates bombs, fire and level as plain numbers', () => {
    const { entries, rootElement } = createRootElement();
    const adapter = createHudAdapter(rootElement);

    adapter.update({
      lives: 1,
      score: 0,
      timer: 0,
      bombs: 2,
      fire: 3,
      level: 4,
    });

    expect(entries.bombs.element.textContent).toBe('2');
    expect(entries.fire.element.textContent).toBe('3');
    expect(entries.level.element.textContent).toBe('4');
  });

  it('sets aria-live attributes on the status element', () => {
    const { entries, rootElement } = createRootElement();

    createHudAdapter(rootElement);

    expect(entries.status.element.attributes.get('aria-live')).toBe('polite');
    expect(entries.status.element.attributes.get('aria-atomic')).toBe('true');
  });

  it('updates the status message when lives change', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(1000);
    nowSpy.mockReturnValueOnce(2500);

    const { entries, rootElement } = createRootElement();
    const adapter = createHudAdapter(rootElement);

    adapter.update({
      lives: 3,
      score: 0,
      timer: 0,
      bombs: 0,
      fire: 0,
      level: 1,
    });
    adapter.update({
      lives: 2,
      score: 0,
      timer: 0,
      bombs: 0,
      fire: 0,
      level: 1,
    });

    expect(entries.status.element.textContent).toContain('Lives 2');

    nowSpy.mockRestore();
  });

  it('announces score, level, and critical timer changes after the throttle window', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(1000);
    nowSpy.mockReturnValueOnce(2200);
    nowSpy.mockReturnValueOnce(3400);
    nowSpy.mockReturnValueOnce(4600);

    const { entries, rootElement } = createRootElement();
    const adapter = createHudAdapter(rootElement);

    adapter.update({ lives: 3, score: 0, timer: 20, bombs: 0, fire: 0, level: 1 });
    adapter.update({ lives: 3, score: 50, timer: 20, bombs: 0, fire: 0, level: 1 });
    expect(entries.status.element.textContent).toContain('Score 00050');

    adapter.update({ lives: 3, score: 50, timer: 20, bombs: 0, fire: 0, level: 2 });
    expect(entries.status.element.textContent).toContain('Level 2');

    adapter.update({ lives: 3, score: 50, timer: 10, bombs: 0, fire: 0, level: 2 });
    expect(entries.status.element.textContent).toContain('Time 0:10 remaining');

    nowSpy.mockRestore();
  });

  it('does not rewrite unchanged HUD fields on repeated updates', () => {
    const { entries, rootElement } = createRootElement();
    const adapter = createHudAdapter(rootElement);
    const state = {
      lives: 2,
      score: 42,
      timer: 65,
      bombs: 1,
      fire: 3,
      level: 2,
    };

    adapter.update(state);
    const firstWriteCounts = {
      bombs: entries.bombs.getTextWrites(),
      fire: entries.fire.getTextWrites(),
      level: entries.level.getTextWrites(),
      lives: entries.lives.getTextWrites(),
      score: entries.score.getTextWrites(),
      timer: entries.timer.getTextWrites(),
    };

    adapter.update(state);

    expect(entries.bombs.getTextWrites()).toBe(firstWriteCounts.bombs);
    expect(entries.fire.getTextWrites()).toBe(firstWriteCounts.fire);
    expect(entries.level.getTextWrites()).toBe(firstWriteCounts.level);
    expect(entries.lives.getTextWrites()).toBe(firstWriteCounts.lives);
    expect(entries.score.getTextWrites()).toBe(firstWriteCounts.score);
    expect(entries.timer.getTextWrites()).toBe(firstWriteCounts.timer);
  });

  it('throttles aria-live announcements until the throttle window elapses', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(1000);
    nowSpy.mockReturnValueOnce(1000 + ARIA_LIVE_THROTTLE_MS - 1);
    nowSpy.mockReturnValueOnce(1000 + ARIA_LIVE_THROTTLE_MS + 1);

    const { entries, rootElement } = createRootElement();
    const adapter = createHudAdapter(rootElement);

    adapter.update({ lives: 3, score: 0, timer: 12, bombs: 0, fire: 0, level: 1 });
    const firstAnnouncement = entries.status.element.textContent;
    adapter.update({ lives: 2, score: 0, timer: 12, bombs: 0, fire: 0, level: 1 });
    expect(entries.status.element.textContent).toBe(firstAnnouncement);

    adapter.update({ lives: 1, score: 0, timer: 12, bombs: 0, fire: 0, level: 1 });
    expect(entries.status.element.textContent).toContain('Lives 1');

    nowSpy.mockRestore();
  });

  it('does not write through innerHTML', () => {
    const { entries, rootElement } = createRootElement();
    const adapter = createHudAdapter(rootElement);

    adapter.update({
      lives: 2,
      score: 7,
      timer: 61,
      bombs: 2,
      fire: 3,
      level: 4,
    });

    expect(entries.lives.getInnerHtmlWrites()).toBe(0);
    expect(entries.score.getInnerHtmlWrites()).toBe(0);
    expect(entries.timer.getInnerHtmlWrites()).toBe(0);
    expect(entries.bombs.getInnerHtmlWrites()).toBe(0);
    expect(entries.fire.getInnerHtmlWrites()).toBe(0);
    expect(entries.level.getInnerHtmlWrites()).toBe(0);
    expect(entries.status.getInnerHtmlWrites()).toBe(0);
  });

  it('falls back to Date.now when performance.now is unavailable', () => {
    const originalPerformance = globalThis.performance;
    const dateNowSpy = vi.spyOn(Date, 'now');
    dateNowSpy.mockReturnValueOnce(2500);
    dateNowSpy.mockReturnValueOnce(4000);
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: undefined,
    });

    const { entries, rootElement } = createRootElement();
    const adapter = createHudAdapter(rootElement);

    adapter.update({ lives: 1, score: 0, timer: 9, bombs: 0, fire: 0, level: 1 });
    adapter.update({ lives: 0, score: 0, timer: 9, bombs: 0, fire: 0, level: 1 });

    expect(entries.status.element.textContent).toContain('Lives 0');

    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: originalPerformance,
    });
    dateNowSpy.mockRestore();
  });
});

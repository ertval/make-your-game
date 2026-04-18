/**
 * Unit tests for the Track C screens adapter.
 *
 * Verifies show/hide behavior and deterministic keyboard navigation without a
 * real DOM implementation.
 */

import { describe, expect, it } from 'vitest';

import { createScreensAdapter } from '../../../src/adapters/dom/screens-adapter.js';

function createOptionElement() {
  let clickCount = 0;
  let focusCount = 0;

  const attributes = new Map();

  return {
    element: {
      click() {
        clickCount += 1;
      },
      focus() {
        focusCount += 1;
      },
      removeAttribute(name) {
        attributes.delete(name);
      },
      setAttribute(name, value) {
        attributes.set(name, value);
      },
      style: {
        display: '',
      },
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    getClickCount() {
      return clickCount;
    },
    getFocusCount() {
      return focusCount;
    },
  };
}

function createFocusableElement(documentState) {
  let focusCount = 0;

  return {
    element: {
      focus() {
        focusCount += 1;
        documentState.activeElement = this;
      },
    },
    getFocusCount() {
      return focusCount;
    },
  };
}

function createScreenElement(optionCount = 0, documentState) {
  const options = Array.from({ length: optionCount }, () => createOptionElement());

  for (const option of options) {
    const originalFocus = option.element.focus;
    option.element.focus = function focus() {
      originalFocus.call(this);
      documentState.activeElement = this;
    };
  }

  return {
    element: {
      querySelectorAll(selector) {
        if (selector === '[data-option]') {
          return options.map((option) => option.element);
        }

        return [];
      },
      style: {
        display: '',
      },
    },
    options,
  };
}

function createRootElement(optionCounts = {}) {
  const listeners = new Map();
  const documentState = {
    activeElement: null,
  };
  const screens = {
    gameOver: createScreenElement(optionCounts.gameOver || 0, documentState),
    levelComplete: createScreenElement(optionCounts.levelComplete || 0, documentState),
    pause: createScreenElement(optionCounts.pause || 0, documentState),
    start: createScreenElement(optionCounts.start || 0, documentState),
    victory: createScreenElement(optionCounts.victory || 0, documentState),
  };
  const selectorMap = new Map([
    ['[data-screen="game-over"]', screens.gameOver.element],
    ['[data-screen="level-complete"]', screens.levelComplete.element],
    ['[data-screen="pause"]', screens.pause.element],
    ['[data-screen="start"]', screens.start.element],
    ['[data-screen="victory"]', screens.victory.element],
  ]);
  const gameplayElement = createFocusableElement(documentState);

  return {
    rootElement: {
      addEventListener(eventName, handler) {
        listeners.set(eventName, handler);
      },
      ownerDocument: documentState,
      querySelector(selector) {
        return selectorMap.get(selector) || null;
      },
      removeEventListener(eventName) {
        listeners.delete(eventName);
      },
    },
    gameplayElement,
    screens,
    triggerKeydown(key) {
      const handler = listeners.get('keydown');
      const event = {
        key,
        preventDefault() {},
      };

      handler?.(event);
    },
  };
}

describe('screens-adapter', () => {
  it('showStart displays only the start screen', () => {
    const { rootElement, screens } = createRootElement();
    const adapter = createScreensAdapter(rootElement);

    adapter.showStart();

    expect(screens.start.element.style.display).toBe('block');
    expect(screens.pause.element.style.display).toBe('none');
    expect(screens.levelComplete.element.style.display).toBe('none');
    expect(screens.gameOver.element.style.display).toBe('none');
    expect(screens.victory.element.style.display).toBe('none');
  });

  it('showPause displays only the pause screen', () => {
    const { rootElement, screens } = createRootElement();
    const adapter = createScreensAdapter(rootElement);

    adapter.showPause();

    expect(screens.start.element.style.display).toBe('none');
    expect(screens.pause.element.style.display).toBe('block');
    expect(screens.levelComplete.element.style.display).toBe('none');
    expect(screens.gameOver.element.style.display).toBe('none');
    expect(screens.victory.element.style.display).toBe('none');
  });

  it('hideAll hides all screens', () => {
    const { rootElement, screens } = createRootElement();
    const adapter = createScreensAdapter(rootElement);

    adapter.showVictory();
    adapter.hideAll();

    expect(screens.start.element.style.display).toBe('none');
    expect(screens.pause.element.style.display).toBe('none');
    expect(screens.levelComplete.element.style.display).toBe('none');
    expect(screens.gameOver.element.style.display).toBe('none');
    expect(screens.victory.element.style.display).toBe('none');
  });

  it('marks the first option as active when a screen is shown', () => {
    const { rootElement, screens } = createRootElement({ start: 3 });
    const adapter = createScreensAdapter(rootElement);

    adapter.showStart();

    expect(screens.start.options[0].getAttribute('data-active')).toBe('true');
    expect(screens.start.options[1].getAttribute('data-active')).toBeUndefined();
    expect(screens.start.options[2].getAttribute('data-active')).toBeUndefined();
  });

  it('ArrowDown moves to the next option', () => {
    const { rootElement, screens, triggerKeydown } = createRootElement({ pause: 3 });
    const adapter = createScreensAdapter(rootElement);

    adapter.showPause();
    triggerKeydown('ArrowDown');

    expect(screens.pause.options[0].getAttribute('data-active')).toBeUndefined();
    expect(screens.pause.options[1].getAttribute('data-active')).toBe('true');
    expect(screens.pause.options[2].getAttribute('data-active')).toBeUndefined();
    expect(screens.pause.options[1].getFocusCount()).toBe(1);
  });

  it('ArrowUp moves to the previous option with wrap-around', () => {
    const { rootElement, screens, triggerKeydown } = createRootElement({ pause: 3 });
    const adapter = createScreensAdapter(rootElement);

    adapter.showPause();
    triggerKeydown('ArrowUp');

    expect(screens.pause.options[0].getAttribute('data-active')).toBeUndefined();
    expect(screens.pause.options[1].getAttribute('data-active')).toBeUndefined();
    expect(screens.pause.options[2].getAttribute('data-active')).toBe('true');
  });

  it('ArrowDown wraps from the last option to the first', () => {
    const { rootElement, screens, triggerKeydown } = createRootElement({ start: 2 });
    const adapter = createScreensAdapter(rootElement);

    adapter.showStart();
    triggerKeydown('ArrowDown');
    triggerKeydown('ArrowDown');

    expect(screens.start.options[0].getAttribute('data-active')).toBe('true');
    expect(screens.start.options[1].getAttribute('data-active')).toBeUndefined();
  });

  it('Enter triggers click on the active option', () => {
    const { rootElement, screens, triggerKeydown } = createRootElement({ gameOver: 2 });
    const adapter = createScreensAdapter(rootElement);

    adapter.showGameOver();
    triggerKeydown('ArrowDown');
    triggerKeydown('Enter');

    expect(screens.gameOver.options[0].getClickCount()).toBe(0);
    expect(screens.gameOver.options[1].getClickCount()).toBe(1);
  });

  it('does not crash when the active screen has no options', () => {
    const { rootElement, screens, triggerKeydown } = createRootElement({ victory: 0 });
    const adapter = createScreensAdapter(rootElement);

    adapter.showVictory();
    triggerKeydown('ArrowDown');
    triggerKeydown('ArrowUp');
    triggerKeydown('Enter');

    expect(screens.victory.element.style.display).toBe('block');
  });

  it('restores focus to the previously focused element when screens are hidden', () => {
    const { gameplayElement, rootElement } = createRootElement({ pause: 2 });
    const adapter = createScreensAdapter(rootElement);

    gameplayElement.element.focus();
    adapter.showPause();
    adapter.hideAll();

    expect(gameplayElement.getFocusCount()).toBe(2);
  });

  it('restores focus to the previously focused element on destroy', () => {
    const { gameplayElement, rootElement } = createRootElement({ start: 1 });
    const adapter = createScreensAdapter(rootElement);

    gameplayElement.element.focus();
    adapter.showStart();
    adapter.destroy();

    expect(gameplayElement.getFocusCount()).toBe(2);
  });
});

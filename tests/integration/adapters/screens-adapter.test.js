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
      getAttribute(name) {
        return attributes.get(name) ?? null;
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

function getOptionActions(screenKey, optionCount) {
  const screenActions = {
    gameOver: ['gameover-play-again'],
    levelComplete: ['level-next'],
    pause: ['pause-continue', 'pause-restart'],
    start: ['start-primary', 'start-secondary'],
    victory: ['victory-play-again'],
  };

  return Array.from(
    { length: optionCount },
    (_value, index) => screenActions[screenKey]?.[index] || '',
  );
}

function createScreenElement(screenKey, optionCount = 0, documentState) {
  const options = Array.from({ length: optionCount }, () => createOptionElement());
  const attributes = new Map();
  const classes = new Set();

  for (const [index, action] of getOptionActions(screenKey, optionCount).entries()) {
    options[index].element.setAttribute('data-action', action);
  }

  for (const option of options) {
    const originalFocus = option.element.focus;
    option.element.focus = function focus() {
      originalFocus.call(this);
      documentState.activeElement = this;
    };
  }

  return {
    element: {
      classList: {
        add(...tokens) {
          for (const token of tokens) {
            classes.add(token);
          }
        },
        contains(token) {
          return classes.has(token);
        },
        remove(...tokens) {
          for (const token of tokens) {
            classes.delete(token);
          }
        },
      },
      focus() {
        documentState.activeElement = this;
      },
      getAttribute(name) {
        return attributes.get(name) ?? null;
      },
      querySelectorAll(selector) {
        if (selector === '[data-option]') {
          return options.map((option) => option.element);
        }

        return [];
      },
      setAttribute(name, value) {
        attributes.set(name, value);
      },
    },
    hasClass(token) {
      return classes.has(token);
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    options,
  };
}

function createRootElement(optionCounts = {}, missingScreens = []) {
  const listeners = new Map();
  const documentState = {
    activeElement: null,
  };
  const screens = {
    gameOver: createScreenElement('gameOver', optionCounts.gameOver || 0, documentState),
    levelComplete: createScreenElement(
      'levelComplete',
      optionCounts.levelComplete || 0,
      documentState,
    ),
    pause: createScreenElement('pause', optionCounts.pause || 0, documentState),
    start: createScreenElement('start', optionCounts.start || 0, documentState),
    victory: createScreenElement('victory', optionCounts.victory || 0, documentState),
  };
  const selectorMap = new Map([
    ['[data-screen="game-over"]', screens.gameOver.element],
    ['[data-screen="level-complete"]', screens.levelComplete.element],
    ['[data-screen="pause"]', screens.pause.element],
    ['[data-screen="start"]', screens.start.element],
    ['[data-screen="victory"]', screens.victory.element],
  ]);
  for (const selector of missingScreens) {
    selectorMap.delete(selector);
  }
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

    expect(screens.start.hasClass('is-screen-visible')).toBe(true);
    expect(screens.pause.hasClass('is-screen-hidden')).toBe(true);
    expect(screens.levelComplete.hasClass('is-screen-hidden')).toBe(true);
    expect(screens.gameOver.hasClass('is-screen-hidden')).toBe(true);
    expect(screens.victory.hasClass('is-screen-hidden')).toBe(true);
    expect(screens.start.getAttribute('aria-hidden')).toBe('false');
  });

  it('showPause displays only the pause screen', () => {
    const { rootElement, screens } = createRootElement();
    const adapter = createScreensAdapter(rootElement);

    adapter.showPause();

    expect(screens.start.hasClass('is-screen-hidden')).toBe(true);
    expect(screens.pause.hasClass('is-screen-visible')).toBe(true);
    expect(screens.levelComplete.hasClass('is-screen-hidden')).toBe(true);
    expect(screens.gameOver.hasClass('is-screen-hidden')).toBe(true);
    expect(screens.victory.hasClass('is-screen-hidden')).toBe(true);
  });

  it('showLevelComplete and showGameOver display their dedicated overlays', () => {
    const { rootElement, screens } = createRootElement({ gameOver: 1, levelComplete: 1 });
    const adapter = createScreensAdapter(rootElement);

    adapter.showLevelComplete();
    expect(screens.levelComplete.hasClass('is-screen-visible')).toBe(true);
    expect(screens.gameOver.hasClass('is-screen-hidden')).toBe(true);

    adapter.showGameOver();
    expect(screens.gameOver.hasClass('is-screen-visible')).toBe(true);
    expect(screens.levelComplete.hasClass('is-screen-hidden')).toBe(true);
  });

  it('hideAll hides all screens', () => {
    const { rootElement, screens } = createRootElement();
    const adapter = createScreensAdapter(rootElement);

    adapter.showVictory();
    adapter.hideAll();

    expect(screens.start.hasClass('is-screen-hidden')).toBe(true);
    expect(screens.pause.hasClass('is-screen-hidden')).toBe(true);
    expect(screens.levelComplete.hasClass('is-screen-hidden')).toBe(true);
    expect(screens.gameOver.hasClass('is-screen-hidden')).toBe(true);
    expect(screens.victory.hasClass('is-screen-hidden')).toBe(true);
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

  it('ignores key presses when no screen is active', () => {
    const { rootElement, screens, triggerKeydown } = createRootElement({ start: 2 });
    createScreensAdapter(rootElement);

    triggerKeydown('ArrowDown');
    triggerKeydown('Enter');

    expect(screens.start.options[0].getClickCount()).toBe(0);
    expect(screens.start.options[1].getClickCount()).toBe(0);
  });

  it('does not crash when the active screen has no options', () => {
    const { rootElement, screens, triggerKeydown } = createRootElement({ victory: 0 });
    const adapter = createScreensAdapter(rootElement);

    adapter.showVictory();
    triggerKeydown('ArrowDown');
    triggerKeydown('ArrowUp');
    triggerKeydown('Enter');

    expect(screens.victory.hasClass('is-screen-visible')).toBe(true);
  });

  it('focuses the overlay container when a visible screen has no options', () => {
    const { rootElement, screens } = createRootElement({ levelComplete: 0 });
    const adapter = createScreensAdapter(rootElement);

    adapter.showLevelComplete();

    expect(rootElement.ownerDocument.activeElement).toBe(screens.levelComplete.element);
  });

  it('tolerates missing screen nodes without throwing', () => {
    const { rootElement } = createRootElement({}, ['[data-screen="level-complete"]']);
    const adapter = createScreensAdapter(rootElement);

    expect(() => adapter.showLevelComplete()).not.toThrow();
  });

  it('does not dispatch pause callbacks for non-pause overlay actions', () => {
    const actions = [];
    const { rootElement, triggerKeydown } = createRootElement({ start: 2 });
    const adapter = createScreensAdapter(rootElement, {
      onAction(action) {
        actions.push(action);
      },
      onRestart() {
        actions.push('restart-callback');
      },
      onResume() {
        actions.push('resume-callback');
      },
    });

    adapter.showStart();
    triggerKeydown('ArrowDown');
    triggerKeydown('Enter');

    expect(actions).toEqual(['start-secondary']);
  });

  it('restores the previous selected option when the same screen reopens', () => {
    const { rootElement, screens, triggerKeydown } = createRootElement({ pause: 3 });
    const adapter = createScreensAdapter(rootElement);

    adapter.showPause();
    triggerKeydown('ArrowDown');
    triggerKeydown('ArrowDown');
    adapter.hideAll();
    adapter.showPause();

    expect(screens.pause.options[2].getAttribute('data-active')).toBe('true');
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

  it('dispatches pause continue and restart actions through adapter callbacks', () => {
    const actions = [];
    const { rootElement, triggerKeydown } = createRootElement({ pause: 2 });
    const adapter = createScreensAdapter(rootElement, {
      onAction(action) {
        actions.push(action);
      },
      onRestart() {
        actions.push('restart-callback');
      },
      onResume() {
        actions.push('resume-callback');
      },
    });

    adapter.showPause();
    triggerKeydown('Enter');
    triggerKeydown('ArrowDown');
    triggerKeydown('Enter');

    expect(actions).toEqual([
      'pause-continue',
      'resume-callback',
      'pause-restart',
      'restart-callback',
    ]);
  });

  it('tolerates active option nodes without getAttribute', () => {
    const listeners = new Map();
    const documentState = { activeElement: null };
    const bareOption = {
      click() {},
      focus() {
        documentState.activeElement = this;
      },
      removeAttribute() {},
      setAttribute() {},
    };
    const startScreen = {
      classList: {
        add() {},
        remove() {},
      },
      focus() {
        documentState.activeElement = this;
      },
      querySelectorAll(selector) {
        return selector === '[data-option]' ? [bareOption] : [];
      },
      setAttribute() {},
    };
    const rootElement = {
      addEventListener(eventName, handler) {
        listeners.set(eventName, handler);
      },
      ownerDocument: documentState,
      querySelector(selector) {
        if (selector === '[data-screen="start"]') {
          return startScreen;
        }

        return null;
      },
      removeEventListener(eventName) {
        listeners.delete(eventName);
      },
    };
    const adapter = createScreensAdapter(rootElement);

    adapter.showStart();
    listeners.get('keydown')?.({
      key: 'Enter',
      preventDefault() {},
    });

    expect(documentState.activeElement).toBe(bareOption);
  });
});

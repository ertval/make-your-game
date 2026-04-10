/**
 * Unit tests for the B-02 keyboard input adapter.
 *
 * These checks protect the adapter contract for normalized key mapping,
 * ignored-key filtering, and repeat-safe edge buffering so later systems can
 * consume input deterministically per fixed simulation step.
 */

import { describe, expect, it } from 'vitest';

import {
  createInputAdapter,
  INPUT_INTENT,
  normalizeKeyboardIntent,
} from '../../../src/adapters/io/input-adapter.js';

function createEventTargetStub() {
  const listeners = new Map();

  return {
    addEventListener(eventName, handler) {
      listeners.set(eventName, handler);
    },
    dispatch(eventName, payload = {}) {
      const handler = listeners.get(eventName);
      if (handler) {
        handler(payload);
      }
    },
    removeEventListener(eventName) {
      listeners.delete(eventName);
    },
  };
}

function createDocumentStub() {
  const documentTarget = createEventTargetStub();
  documentTarget.hidden = false;
  return documentTarget;
}

describe('keyboard input adapter', () => {
  it('normalizes the canonical gameplay keys into stable intents', () => {
    expect(normalizeKeyboardIntent({ code: 'ArrowUp' })).toBe(INPUT_INTENT.UP);
    expect(normalizeKeyboardIntent({ code: 'ArrowDown' })).toBe(INPUT_INTENT.DOWN);
    expect(normalizeKeyboardIntent({ code: 'ArrowLeft' })).toBe(INPUT_INTENT.LEFT);
    expect(normalizeKeyboardIntent({ code: 'ArrowRight' })).toBe(INPUT_INTENT.RIGHT);
    expect(normalizeKeyboardIntent({ code: 'Space' })).toBe(INPUT_INTENT.BOMB);
    expect(normalizeKeyboardIntent({ code: 'Escape' })).toBe(INPUT_INTENT.PAUSE);
    expect(normalizeKeyboardIntent({ code: 'KeyP' })).toBe(INPUT_INTENT.PAUSE);
    expect(normalizeKeyboardIntent({ code: 'Enter' })).toBe(INPUT_INTENT.CONFIRM);
    expect(normalizeKeyboardIntent({ key: 'P' })).toBe(INPUT_INTENT.PAUSE);
    expect(normalizeKeyboardIntent({ key: ' ' })).toBe(INPUT_INTENT.BOMB);
  });

  it('captures recognized keydown and keyup events into held and pressed state', () => {
    const eventTarget = createEventTargetStub();
    const adapter = createInputAdapter({ eventTarget });
    const preventDefaultCalls = [];

    eventTarget.dispatch('keydown', {
      code: 'ArrowLeft',
      preventDefault() {
        preventDefaultCalls.push('down-left');
      },
      repeat: false,
    });
    eventTarget.dispatch('keydown', {
      code: 'Enter',
      preventDefault() {
        preventDefaultCalls.push('down-enter');
      },
      repeat: false,
    });

    expect(adapter.heldKeys.has(INPUT_INTENT.LEFT)).toBe(true);
    expect(adapter.heldKeys.has(INPUT_INTENT.CONFIRM)).toBe(true);

    const pressedKeys = adapter.drainPressedKeys();
    expect(pressedKeys.has(INPUT_INTENT.LEFT)).toBe(true);
    expect(pressedKeys.has(INPUT_INTENT.CONFIRM)).toBe(true);
    expect(adapter.pressedKeys.size).toBe(0);

    eventTarget.dispatch('keyup', {
      code: 'ArrowLeft',
      preventDefault() {
        preventDefaultCalls.push('up-left');
      },
    });
    eventTarget.dispatch('keyup', {
      code: 'Enter',
      preventDefault() {
        preventDefaultCalls.push('up-enter');
      },
    });

    expect(adapter.heldKeys.has(INPUT_INTENT.LEFT)).toBe(false);
    expect(adapter.heldKeys.has(INPUT_INTENT.CONFIRM)).toBe(false);
    expect(preventDefaultCalls).toEqual(['down-left', 'down-enter', 'up-left', 'up-enter']);

    adapter.destroy();
  });

  it('ignores unrelated keys and leaves adapter state untouched', () => {
    const eventTarget = createEventTargetStub();
    const adapter = createInputAdapter({ eventTarget });
    let prevented = false;

    eventTarget.dispatch('keydown', {
      code: 'KeyA',
      preventDefault() {
        prevented = true;
      },
      repeat: false,
    });

    expect(adapter.heldKeys.size).toBe(0);
    expect(adapter.pressedKeys.size).toBe(0);
    expect(prevented).toBe(false);

    adapter.destroy();
  });

  it('buffers one press edge regardless of repeated keydown events', () => {
    const eventTarget = createEventTargetStub();
    const adapter = createInputAdapter({ eventTarget });

    eventTarget.dispatch('keydown', {
      code: 'Space',
      repeat: false,
    });
    eventTarget.dispatch('keydown', {
      code: 'Space',
      repeat: true,
    });
    eventTarget.dispatch('keydown', {
      code: 'Space',
      repeat: true,
    });

    expect(adapter.heldKeys.has(INPUT_INTENT.BOMB)).toBe(true);
    expect(adapter.pressedKeys.size).toBe(1);
    expect([...adapter.drainPressedKeys()]).toEqual([INPUT_INTENT.BOMB]);

    // Repeated keydown after the first drain still must not synthesize new presses.
    eventTarget.dispatch('keydown', {
      code: 'Space',
      repeat: true,
    });

    expect(adapter.pressedKeys.size).toBe(0);

    // A fresh physical press after keyup should produce one new buffered edge.
    eventTarget.dispatch('keyup', {
      code: 'Space',
    });
    eventTarget.dispatch('keydown', {
      code: 'Space',
      repeat: false,
    });

    expect([...adapter.drainPressedKeys()]).toEqual([INPUT_INTENT.BOMB]);

    adapter.destroy();
  });

  it('clears held and pressed input state on window blur', () => {
    const eventTarget = createEventTargetStub();
    const windowTarget = createEventTargetStub();
    const adapter = createInputAdapter({
      eventTarget,
      windowTarget,
    });

    eventTarget.dispatch('keydown', {
      code: 'ArrowRight',
      repeat: false,
    });
    eventTarget.dispatch('keydown', {
      code: 'Space',
      repeat: false,
    });

    expect(adapter.heldKeys.size).toBe(2);
    expect(adapter.pressedKeys.size).toBe(2);

    windowTarget.dispatch('blur');

    expect(adapter.heldKeys.size).toBe(0);
    expect(adapter.pressedKeys.size).toBe(0);

    adapter.destroy();
  });

  it('clears input only when visibilitychange hides the document', () => {
    const eventTarget = createEventTargetStub();
    const documentTarget = createDocumentStub();
    const adapter = createInputAdapter({
      documentTarget,
      eventTarget,
    });

    eventTarget.dispatch('keydown', {
      code: 'ArrowUp',
      repeat: false,
    });
    documentTarget.hidden = false;
    documentTarget.dispatch('visibilitychange');

    expect(adapter.heldKeys.has(INPUT_INTENT.UP)).toBe(true);
    expect(adapter.pressedKeys.has(INPUT_INTENT.UP)).toBe(true);

    documentTarget.hidden = true;
    documentTarget.dispatch('visibilitychange');

    expect(adapter.heldKeys.size).toBe(0);
    expect(adapter.pressedKeys.size).toBe(0);

    adapter.destroy();
  });
});

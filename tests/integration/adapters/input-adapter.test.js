/**
 * Integration tests for the B-02 keyboard input adapter.
 *
 * These checks protect the adapter contract for normalized key mapping,
 * ignored-key filtering, repeat-safe edge buffering, and focus-loss recovery
 * so later systems can consume input deterministically per fixed simulation step.
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
  it('returns null for nullish and non-object inputs', () => {
    expect(normalizeKeyboardIntent()).toBeNull();
    expect(normalizeKeyboardIntent(null)).toBeNull();
    expect(normalizeKeyboardIntent('ArrowUp')).toBeNull();
    expect(normalizeKeyboardIntent(42)).toBeNull();
  });

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
    expect(normalizeKeyboardIntent({ key: 'Esc' })).toBe(INPUT_INTENT.PAUSE);
    expect(normalizeKeyboardIntent({ key: 'Spacebar' })).toBe(INPUT_INTENT.BOMB);
  });

  it('prefers KeyboardEvent.code over key when both are present', () => {
    expect(
      normalizeKeyboardIntent({
        code: 'KeyA',
        key: 'ArrowUp',
      }),
    ).toBeNull();
    expect(
      normalizeKeyboardIntent({
        code: 'ArrowLeft',
        key: 'q',
      }),
    ).toBe(INPUT_INTENT.LEFT);
  });

  it('captures recognized keydown and keyup events into held and pressed state', () => {
    const eventTarget = createEventTargetStub();
    const adapter = createInputAdapter({ eventTarget });
    const keydownPreventDefaultCalls = [];
    const keyupPreventDefault = {
      enter: 0,
      left: 0,
    };

    eventTarget.dispatch('keydown', {
      code: 'ArrowLeft',
      preventDefault() {
        keydownPreventDefaultCalls.push('down-left');
      },
      repeat: false,
    });
    eventTarget.dispatch('keydown', {
      code: 'Enter',
      preventDefault() {
        keydownPreventDefaultCalls.push('down-enter');
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
        keyupPreventDefault.left += 1;
      },
    });
    eventTarget.dispatch('keyup', {
      code: 'Enter',
      preventDefault() {
        keyupPreventDefault.enter += 1;
      },
    });

    expect(adapter.heldKeys.has(INPUT_INTENT.LEFT)).toBe(false);
    expect(adapter.heldKeys.has(INPUT_INTENT.CONFIRM)).toBe(false);
    expect(keydownPreventDefaultCalls).toEqual(['down-left', 'down-enter']);
    expect(keyupPreventDefault).toEqual({
      enter: 0,
      left: 0,
    });

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

    eventTarget.dispatch('keydown', {
      code: 'Space',
      repeat: true,
    });

    expect(adapter.pressedKeys.size).toBe(0);

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

  it('tracks simultaneous held keys independently', () => {
    const eventTarget = createEventTargetStub();
    const adapter = createInputAdapter({ eventTarget });

    eventTarget.dispatch('keydown', {
      code: 'ArrowUp',
      repeat: false,
    });
    eventTarget.dispatch('keydown', {
      code: 'ArrowRight',
      repeat: false,
    });

    expect(adapter.heldKeys.has(INPUT_INTENT.UP)).toBe(true);
    expect(adapter.heldKeys.has(INPUT_INTENT.RIGHT)).toBe(true);
    expect(adapter.heldKeys.size).toBe(2);

    eventTarget.dispatch('keyup', {
      code: 'ArrowUp',
    });

    expect(adapter.heldKeys.has(INPUT_INTENT.UP)).toBe(false);
    expect(adapter.heldKeys.has(INPUT_INTENT.RIGHT)).toBe(true);

    adapter.destroy();
  });

  it('reuses the drained pressed-key Set across calls', () => {
    const eventTarget = createEventTargetStub();
    const adapter = createInputAdapter({ eventTarget });

    eventTarget.dispatch('keydown', {
      code: 'Space',
      repeat: false,
    });

    const firstDrain = adapter.drainPressedKeys();
    expect(firstDrain.has(INPUT_INTENT.BOMB)).toBe(true);

    eventTarget.dispatch('keyup', {
      code: 'Space',
    });
    eventTarget.dispatch('keydown', {
      code: 'Enter',
      repeat: false,
    });

    const secondDrain = adapter.drainPressedKeys();
    expect(secondDrain).toBe(firstDrain);
    expect(secondDrain.has(INPUT_INTENT.BOMB)).toBe(false);
    expect(secondDrain.has(INPUT_INTENT.CONFIRM)).toBe(true);

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

  it('stops mutating state after destroy removes the listeners', () => {
    const eventTarget = createEventTargetStub();
    const adapter = createInputAdapter({ eventTarget });

    adapter.destroy();

    eventTarget.dispatch('keydown', {
      code: 'ArrowLeft',
      repeat: false,
    });

    expect(adapter.heldKeys.size).toBe(0);
    expect(adapter.pressedKeys.size).toBe(0);
  });
});

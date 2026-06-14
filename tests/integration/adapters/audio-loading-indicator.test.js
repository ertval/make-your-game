/*
 * C-09 tests: audio-loading indicator adapter + preloadWithIndicator orchestrator.
 *
 * Cover the loading-state contract without a real browser DOM or AudioContext:
 *   - fast preload (<= threshold) never shows the indicator (no flicker)
 *   - slow preload (> threshold) shows the indicator, then hides on completion
 *   - completion always hides the indicator (even on failure)
 *   - startup stays responsive (orchestration is async / non-blocking)
 */

import { describe, expect, it, vi } from 'vitest';

import { createAudioLoadingIndicator } from '../../../src/adapters/dom/audio-loading-indicator.js';
import {
  AUDIO_PRELOAD_INDICATOR_THRESHOLD_MS,
  preloadWithIndicator,
} from '../../../src/adapters/io/audio-integration.js';

function createIndicatorStub() {
  const calls = [];
  return {
    calls,
    show: () => calls.push('show'),
    hide: () => calls.push('hide'),
  };
}

// A controllable timer: preloadWithIndicator arms a setTimeout to show the
// indicator. We capture the callback and fire it manually to simulate "the
// threshold elapsed while preload was still running".
function createManualTimer() {
  const pending = new Map();
  let nextId = 1;
  return {
    pending,
    setTimeoutImpl(fn, _ms) {
      const id = nextId++;
      pending.set(id, fn);
      return id;
    },
    clearTimeoutImpl(id) {
      pending.delete(id);
    },
    fireAll() {
      for (const fn of pending.values()) {
        fn();
      }
      pending.clear();
    },
  };
}

describe('audio-loading-indicator adapter', () => {
  function createElementStub() {
    const classes = new Set(['is-screen-hidden']);
    const attrs = new Map();
    return {
      element: {
        classList: {
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          contains: (c) => classes.has(c),
        },
        setAttribute: (k, v) => attrs.set(k, v),
      },
      classes,
      attrs,
    };
  }

  it('shows by toggling visibility classes and aria-busy', () => {
    const { element, classes, attrs } = createElementStub();
    const root = { querySelector: () => element };
    const indicator = createAudioLoadingIndicator(root);

    indicator.show();

    expect(classes.has('is-screen-visible')).toBe(true);
    expect(classes.has('is-screen-hidden')).toBe(false);
    expect(attrs.get('aria-hidden')).toBe('false');
    expect(attrs.get('aria-busy')).toBe('true');
    expect(indicator.isVisible()).toBe(true);
  });

  it('hides by toggling visibility classes and aria-busy', () => {
    const { element, classes, attrs } = createElementStub();
    const root = { querySelector: () => element };
    const indicator = createAudioLoadingIndicator(root);

    indicator.show();
    indicator.hide();

    expect(classes.has('is-screen-hidden')).toBe(true);
    expect(classes.has('is-screen-visible')).toBe(false);
    expect(attrs.get('aria-hidden')).toBe('true');
    expect(attrs.get('aria-busy')).toBe('false');
    expect(indicator.isVisible()).toBe(false);
  });

  it('tolerates a missing indicator node without throwing', () => {
    const indicator = createAudioLoadingIndicator({ querySelector: () => null });
    expect(() => {
      indicator.show();
      indicator.hide();
    }).not.toThrow();
    expect(indicator.isVisible()).toBe(false);
  });
});

describe('preloadWithIndicator (C-09 orchestration)', () => {
  const CUES = ['sfx-bomb-place', 'sfx-pellet-collect'];
  const URLS = {
    'sfx-bomb-place': '/audio/bomb.wav',
    'sfx-pellet-collect': '/audio/pellet.wav',
  };

  it('never shows the indicator when preload completes before the threshold', async () => {
    const indicator = createIndicatorStub();
    const timer = createManualTimer();
    const audio = {
      preloadAudioAssets: vi
        .fn()
        .mockResolvedValue({ preloaded: CUES, cached: [], skipped: [], failed: [] }),
    };

    // Preload resolves immediately; we never fire the timer (it would have been
    // cleared before the threshold in real time).
    const result = await preloadWithIndicator({
      audio,
      indicator,
      cueIds: CUES,
      preloadOptions: { urls: URLS },
      setTimeoutImpl: timer.setTimeoutImpl,
      clearTimeoutImpl: timer.clearTimeoutImpl,
      now: () => 0,
    });

    expect(result.shown).toBe(false);
    expect(indicator.calls).not.toContain('show');
    // The show-timer was cleared on completion (no pending timers remain).
    expect(timer.pending.size).toBe(0);
    expect(audio.preloadAudioAssets).toHaveBeenCalledWith(CUES, { urls: URLS });
  });

  it('shows the indicator when preload exceeds the threshold, then hides it', async () => {
    const indicator = createIndicatorStub();
    const timer = createManualTimer();

    // Gate the preload promise so we can fire the threshold timer mid-flight.
    let resolvePreload;
    const audio = {
      preloadAudioAssets: vi.fn(
        () =>
          new Promise((resolve) => {
            resolvePreload = resolve;
          }),
      ),
    };

    const pending = preloadWithIndicator({
      audio,
      indicator,
      cueIds: CUES,
      preloadOptions: { urls: URLS },
      setTimeoutImpl: timer.setTimeoutImpl,
      clearTimeoutImpl: timer.clearTimeoutImpl,
      now: () => 0,
    });

    // Threshold elapses while preload is still running → indicator shows.
    timer.fireAll();
    expect(indicator.calls).toContain('show');

    // Preload completes → indicator hides.
    resolvePreload({ preloaded: CUES, cached: [], skipped: [], failed: [] });
    const result = await pending;

    expect(result.shown).toBe(true);
    expect(indicator.calls).toEqual(['show', 'hide']);
  });

  it('hides the indicator even when preload rejects (failure tolerant)', async () => {
    const indicator = createIndicatorStub();
    const timer = createManualTimer();
    const audio = {
      preloadAudioAssets: vi.fn().mockRejectedValue(new Error('decode blew up')),
    };

    let escaped = null;
    let result = null;
    try {
      result = await preloadWithIndicator({
        audio,
        indicator,
        cueIds: CUES,
        preloadOptions: { urls: URLS },
        setTimeoutImpl: timer.setTimeoutImpl,
        clearTimeoutImpl: timer.clearTimeoutImpl,
        now: () => 0,
      });
    } catch (error) {
      escaped = error;
    }

    expect(escaped).toBeNull();
    expect(indicator.calls).toContain('hide');
    expect(result.report).toBeNull();
  });

  it('is a no-op for a missing adapter or empty cue list (startup stays responsive)', async () => {
    const indicator = createIndicatorStub();

    expect(await preloadWithIndicator({ audio: null, indicator, cueIds: CUES })).toEqual({
      shown: false,
      durationMs: 0,
      report: null,
    });

    expect(
      await preloadWithIndicator({
        audio: { preloadAudioAssets: vi.fn() },
        indicator,
        cueIds: [],
      }),
    ).toEqual({ shown: false, durationMs: 0, report: null });

    // Nothing was shown for either no-op path.
    expect(indicator.calls).not.toContain('show');
  });

  it('exposes a 200ms default threshold', () => {
    expect(AUDIO_PRELOAD_INDICATOR_THRESHOLD_MS).toBe(200);
  });
});

/**
 * Integration tests for the C-06 runtime audio adapter
 * (`src/adapters/io/audio-adapter.js`).
 *
 * Path note: lives under `tests/integration/adapters/` because the Track C
 * ownership policy (see `scripts/policy-gate/lib/policy-utils.mjs`) allows
 * audio adapter tests only at `tests/integration/adapters/audio-*.test.js`.
 * Despite the directory, these checks remain deterministic and unit-shaped:
 * each test injects stubs for AudioContext, GainNode, AudioBufferSourceNode,
 * fetch, window, and document so the adapter contract can be exercised
 * without touching real audio hardware. All asynchronous work is awaited
 * explicitly — no setTimeout, no microtask races — so the suite is stable
 * in headless CI.
 *
 * Coverage targets (per ticket C-06 verification gate):
 * - async decode flow
 * - decoded buffers are cached
 * - playSfx creates independent playback nodes
 * - overlapping playback support
 * - missing clip fallback (warn + no-op + no throw)
 * - visibilitychange suspend/resume
 * - volume category updates
 * - music replacement stops previous track
 * - no runtime throw on failed fetch/decode
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioAdapter } from '../../../src/adapters/io/audio-adapter.js';

function createEventTargetStub() {
  const listeners = new Map();
  return {
    addEventListener(eventName, handler) {
      if (!listeners.has(eventName)) {
        listeners.set(eventName, new Set());
      }
      listeners.get(eventName).add(handler);
    },
    removeEventListener(eventName, handler) {
      const set = listeners.get(eventName);
      if (set) {
        set.delete(handler);
      }
    },
    dispatch(eventName, payload = {}) {
      const set = listeners.get(eventName);
      if (!set) {
        return;
      }
      // Iterate over a snapshot so { once: true } self-removal during dispatch
      // does not corrupt the iteration.
      for (const handler of [...set]) {
        handler(payload);
      }
    },
    listenerCount(eventName) {
      const set = listeners.get(eventName);
      return set ? set.size : 0;
    },
  };
}

function createDocumentStub() {
  const target = createEventTargetStub();
  target.hidden = false;
  return target;
}

function createMockGainNode() {
  return {
    gain: { value: 1 },
    connections: [],
    connect(destination) {
      this.connections.push(destination);
    },
    disconnect() {
      this.connections.length = 0;
    },
  };
}

function createMockBufferSource() {
  const source = {
    buffer: null,
    loop: false,
    onended: null,
    started: false,
    startedAt: null,
    stopped: false,
    stoppedAt: null,
    connections: [],
    connect(destination) {
      this.connections.push(destination);
    },
    disconnect() {
      this.connections.length = 0;
    },
    start(when = 0) {
      this.started = true;
      this.startedAt = when;
    },
    stop(when = 0) {
      this.stopped = true;
      this.stoppedAt = when;
    },
  };
  return source;
}

/**
 * Build a mock AudioContext class whose decode resolution and state can be
 * controlled per test. Returned object also tracks every node and call.
 */
function buildMockAudioContextCtor({
  decodeImpl,
  initialState = 'running',
  resumeRejectCount = 0,
} = {}) {
  const records = {
    instances: [],
    createdGainNodes: [],
    createdBufferSources: [],
  };

  class MockAudioContext {
    constructor() {
      this.state = initialState;
      this.destination = { kind: 'destination' };
      this.createdGainNodes = [];
      this.createdBufferSources = [];
      this.suspendCalls = 0;
      this.resumeCalls = 0;
      this.resumeRejectsRemaining = resumeRejectCount;
      this.closeCalls = 0;
      this.decodeCalls = [];
      records.instances.push(this);
    }

    createGain() {
      const node = createMockGainNode();
      this.createdGainNodes.push(node);
      records.createdGainNodes.push(node);
      return node;
    }

    createBufferSource() {
      const source = createMockBufferSource();
      this.createdBufferSources.push(source);
      records.createdBufferSources.push(source);
      return source;
    }

    // Real AudioContexts expose createBuffer; the adapter uses it to pre-render
    // the crossfaded seamless-loop buffer. The mock returns a minimal buffer
    // backed by Float32Array channels so the crossfade math runs for real.
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (channel) => data[channel],
      };
    }

    async decodeAudioData(arrayBuffer) {
      this.decodeCalls.push(arrayBuffer);
      if (typeof decodeImpl === 'function') {
        return decodeImpl(arrayBuffer);
      }
      // Default: synthesize a unique buffer per call so cache assertions can
      // distinguish "decoded again" from "served from cache".
      return { __mockBuffer: true, id: this.decodeCalls.length, src: arrayBuffer };
    }

    async suspend() {
      this.suspendCalls += 1;
      this.state = 'suspended';
    }

    async resume() {
      this.resumeCalls += 1;
      // Simulate a browser rejecting resume() for a gesture it does not accept
      // as audio activation (e.g. Firefox + arrow keys): stay suspended and
      // throw until the configured number of attempts is exhausted.
      if (this.resumeRejectsRemaining > 0) {
        this.resumeRejectsRemaining -= 1;
        throw new Error('resume rejected: gesture not accepted');
      }
      this.state = 'running';
    }

    async close() {
      this.closeCalls += 1;
      this.state = 'closed';
    }
  }

  return { MockAudioContext, records };
}

/**
 * Build a fetch stub that returns canned ArrayBuffer payloads per URL.
 * `failures` is a Set of URLs that should reject; everything else resolves.
 */
function buildFetchStub({ failures = new Set(), throwOnNetwork = new Set() } = {}) {
  const calls = [];
  async function fetchStub(url) {
    calls.push(url);
    if (throwOnNetwork.has(url)) {
      throw new Error(`network failure for ${url}`);
    }
    if (failures.has(url)) {
      return {
        ok: false,
        async arrayBuffer() {
          throw new Error('should not be read on non-ok response');
        },
      };
    }
    return {
      ok: true,
      async arrayBuffer() {
        // The buffer value just needs to be identifiable per URL.
        return { __mockArrayBuffer: true, url };
      },
    };
  }
  fetchStub.calls = calls;
  return fetchStub;
}

function setup(options = {}) {
  const windowTarget = createEventTargetStub();
  const documentTarget = createDocumentStub();
  const { MockAudioContext, records } = buildMockAudioContextCtor(options.context || {});
  const fetchImpl = options.fetchImpl || buildFetchStub(options.fetch || {});
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  // Mirror the browser UserActivation API so tests can simulate a gesture that
  // already happened before the adapter was constructed (hasBeenActive === true).
  const navigatorTarget =
    options.navigatorTarget !== undefined
      ? options.navigatorTarget
      : { userActivation: { hasBeenActive: false } };

  const adapter = createAudioAdapter({
    windowTarget,
    documentTarget,
    navigatorTarget,
    audioContextCtor: MockAudioContext,
    fetchImpl,
    autoUnlock: options.autoUnlock !== false,
  });

  return {
    adapter,
    windowTarget,
    documentTarget,
    navigatorTarget,
    MockAudioContext,
    records,
    fetchImpl,
    warnSpy,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('audio-adapter: AudioContext lifecycle', () => {
  it('binds pointerdown and keydown unlock listeners on construction', () => {
    const { windowTarget } = setup();
    expect(windowTarget.listenerCount('pointerdown')).toBe(1);
    expect(windowTarget.listenerCount('keydown')).toBe(1);
  });

  it('constructs the AudioContext lazily on first interaction and resumes it', async () => {
    const { adapter, windowTarget, records } = setup({
      context: { initialState: 'suspended' },
    });
    expect(records.instances.length).toBe(0);

    windowTarget.dispatch('pointerdown');
    expect(records.instances.length).toBe(1);
    const context = records.instances[0];
    // resume() is async — flush the microtask queue so the assertion is stable.
    await Promise.resolve();
    expect(context.resumeCalls).toBeGreaterThanOrEqual(1);
    expect(adapter.getAudioContext()).toBe(context);
  });

  it('unlocks on construction when the player already interacted (start-gesture race)', async () => {
    // The adapter is built asynchronously (after the map load), but input is
    // live earlier — so the player may press Enter / click to start the game
    // before the unlock listeners exist. navigator.userActivation.hasBeenActive
    // still reports that gesture, so the context must resume on construction.
    const { adapter, records } = setup({
      context: { initialState: 'suspended' },
      navigatorTarget: { userActivation: { hasBeenActive: true } },
    });

    await Promise.resolve();
    expect(records.instances.length).toBe(1);
    expect(records.instances[0].resumeCalls).toBeGreaterThanOrEqual(1);
    expect(adapter.getAudioContext()).toBe(records.instances[0]);
  });

  it('does not eagerly create the context when the player has not interacted', async () => {
    const { adapter, records } = setup({
      context: { initialState: 'suspended' },
      navigatorTarget: { userActivation: { hasBeenActive: false } },
    });

    await Promise.resolve();
    expect(records.instances.length).toBe(0);
    expect(adapter.getAudioContext()).toBe(null);
  });

  it('keeps retrying unlock when an earlier gesture is rejected by the autoplay policy', async () => {
    // Models Firefox rejecting resume() for an arrow key (not an accepted audio
    // gesture) while accepting the next one (Space/Enter/click). A one-shot
    // listener would be consumed by the rejected arrow and never retry — these
    // listeners must stay bound until the context is actually running.
    const { windowTarget, records } = setup({
      context: { initialState: 'suspended', resumeRejectCount: 1 },
    });

    windowTarget.dispatch('keydown', { code: 'ArrowRight' });
    await Promise.resolve();
    await Promise.resolve();
    const context = records.instances[0];
    expect(context.resumeCalls).toBe(1);
    expect(context.state).toBe('suspended');
    expect(windowTarget.listenerCount('keydown')).toBe(1);
    expect(windowTarget.listenerCount('pointerdown')).toBe(1);

    windowTarget.dispatch('keydown', { code: 'Space' });
    await Promise.resolve();
    await Promise.resolve();
    expect(context.resumeCalls).toBe(2);
    expect(context.state).toBe('running');
    expect(windowTarget.listenerCount('keydown')).toBe(0);
    expect(windowTarget.listenerCount('pointerdown')).toBe(0);
  });

  it('wires category gain nodes master -> destination and music/sfx/ui -> master', async () => {
    const { adapter, records } = setup();
    // Force context creation through the public API.
    await adapter.resume();
    const context = records.instances[0];
    expect(context.createdGainNodes.length).toBe(4);
    const [master, music, sfx, ui] = context.createdGainNodes;
    expect(master.connections).toContain(context.destination);
    expect(music.connections).toContain(master);
    expect(sfx.connections).toContain(master);
    expect(ui.connections).toContain(master);
  });
});

describe('audio-adapter: loadClips async decode flow', () => {
  it('fetches, decodes, and indexes every clip in the manifest', async () => {
    const { adapter, records, fetchImpl } = setup();
    const report = await adapter.loadClips({
      sfx: {
        pellet: '/audio/pellet.wav',
        bomb: '/audio/bomb.wav',
      },
      music: {
        'level-theme': '/audio/level-theme.ogg',
      },
    });

    expect(report.loaded.sort()).toEqual(['bomb', 'level-theme', 'pellet']);
    expect(report.failed).toEqual([]);
    expect(fetchImpl.calls.sort()).toEqual([
      '/audio/bomb.wav',
      '/audio/level-theme.ogg',
      '/audio/pellet.wav',
    ]);

    const context = records.instances[0];
    expect(context.decodeCalls.length).toBe(3);
  });

  it('serves cached buffers on subsequent playSfx calls without re-fetching', async () => {
    const { adapter, fetchImpl, records } = setup();
    await adapter.loadClips({ sfx: { pellet: '/audio/pellet.wav' } });
    expect(fetchImpl.calls.length).toBe(1);

    const sourceA = adapter.playSfx('pellet');
    const sourceB = adapter.playSfx('pellet');

    // No additional fetch or decode work — the buffer is reused from the Map.
    expect(fetchImpl.calls.length).toBe(1);
    const context = records.instances[0];
    expect(context.decodeCalls.length).toBe(1);

    // Both playbacks point at the same underlying decoded buffer.
    expect(sourceA.buffer).toBe(sourceB.buffer);
  });

  it('reports failed clips without throwing when fetch fails', async () => {
    const failures = new Set(['/audio/missing.wav']);
    const { adapter, warnSpy } = setup({ fetch: { failures } });
    const report = await adapter.loadClips({
      sfx: {
        pellet: '/audio/pellet.wav',
        missing: '/audio/missing.wav',
      },
    });

    expect(report.loaded).toEqual(['pellet']);
    expect(report.failed).toEqual(['missing']);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to load clip "missing"'),
      expect.anything(),
    );
  });

  it('reports failed clips without throwing when decodeAudioData rejects', async () => {
    const { adapter, warnSpy } = setup({
      context: {
        decodeImpl: async (payload) => {
          if (payload?.url === '/audio/corrupt.wav') {
            throw new Error('decode error');
          }
          return { __mockBuffer: true, src: payload };
        },
      },
    });

    const report = await adapter.loadClips({
      sfx: {
        good: '/audio/good.wav',
        corrupt: '/audio/corrupt.wav',
      },
    });

    expect(report.loaded).toEqual(['good']);
    expect(report.failed).toEqual(['corrupt']);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('survives a network-level fetch rejection without propagating', async () => {
    const throwOnNetwork = new Set(['/audio/bomb.wav']);
    const { adapter } = setup({ fetch: { throwOnNetwork } });

    let escaped = null;
    try {
      const report = await adapter.loadClips({ sfx: { bomb: '/audio/bomb.wav' } });
      expect(report.loaded).toEqual([]);
      expect(report.failed).toEqual(['bomb']);
    } catch (error) {
      escaped = error;
    }
    expect(escaped).toBeNull();
  });
});

describe('audio-adapter: playSfx', () => {
  it('creates an independent BufferSource per playback', async () => {
    const { adapter, records } = setup();
    await adapter.loadClips({ sfx: { pellet: '/audio/pellet.wav' } });

    const sourceA = adapter.playSfx('pellet');
    const sourceB = adapter.playSfx('pellet');

    expect(sourceA).not.toBe(sourceB);
    const context = records.instances[0];
    // Two sources created for the two playbacks (gain nodes were created
    // earlier during ensureContext; we count buffer sources specifically).
    expect(context.createdBufferSources.length).toBe(2);
  });

  it('supports overlapping playback (neither source stops the other)', async () => {
    const { adapter } = setup();
    await adapter.loadClips({ sfx: { pellet: '/audio/pellet.wav' } });

    const sourceA = adapter.playSfx('pellet');
    const sourceB = adapter.playSfx('pellet');

    expect(sourceA.started).toBe(true);
    expect(sourceB.started).toBe(true);
    expect(sourceA.stopped).toBe(false);
    expect(sourceB.stopped).toBe(false);
  });

  it('routes SFX playback through the sfx gain bus', async () => {
    const { adapter, records } = setup();
    await adapter.loadClips({ sfx: { pellet: '/audio/pellet.wav' } });
    const source = adapter.playSfx('pellet');
    const context = records.instances[0];
    const sfxBus = context.createdGainNodes[2];
    expect(source.connections).toContain(sfxBus);
  });

  it('routes UI cues through the ui gain bus', async () => {
    const { adapter, records } = setup();
    await adapter.loadClips({ ui: { confirm: '/audio/confirm.wav' } });
    const source = adapter.playSfx('confirm');
    const context = records.instances[0];
    const uiBus = context.createdGainNodes[3];
    expect(source.connections).toContain(uiBus);
  });

  it('warns and no-ops on missing clip without throwing', async () => {
    const { adapter, warnSpy } = setup();
    await adapter.loadClips({ sfx: { pellet: '/audio/pellet.wav' } });
    const result = adapter.playSfx('does-not-exist');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing sfx clip "does-not-exist"'),
    );
  });

  it('warns once per missing cue id even on repeated calls', async () => {
    const { adapter, warnSpy } = setup();
    await adapter.loadClips({ sfx: {} });
    adapter.playSfx('ghost');
    adapter.playSfx('ghost');
    adapter.playSfx('ghost');
    const ghostWarnings = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes('missing sfx clip "ghost"'),
    );
    expect(ghostWarnings.length).toBe(1);
  });

  it('returns null and does not throw when called with an invalid cue id', async () => {
    const { adapter } = setup();
    await adapter.loadClips({ sfx: {} });
    expect(() => adapter.playSfx('')).not.toThrow();
    expect(adapter.playSfx('')).toBeNull();
    expect(adapter.playSfx(null)).toBeNull();
    expect(adapter.playSfx(undefined)).toBeNull();
  });
});

describe('audio-adapter: looping SFX', () => {
  it('renders a crossfaded loop buffer over the trimmed region so wraps are seamless', async () => {
    const sampleRate = 1000;
    const length = 100;
    const data = new Float32Array(length); // silent edges (encoder padding)
    for (let i = 20; i < 80; i += 1) {
      data[i] = 0.5; // audible body: samples 20..79 -> region [20, 80), len 60
    }
    const decodedBuffer = {
      duration: length / sampleRate,
      length,
      sampleRate,
      numberOfChannels: 1,
      getChannelData: () => data,
    };
    const { adapter } = setup({ context: { decodeImpl: async () => decodedBuffer } });
    await adapter.loadClips({ sfx: { 'sfx-loop': '/audio/loop.mp3' } });

    const source = adapter.playSfxLoop('sfx-loop');

    expect(source).not.toBeNull();
    expect(source.loop).toBe(true);
    // The crossfade path loops a freshly rendered buffer from its start, so the
    // raw source loopStart/loopEnd splice is no longer used.
    expect(source.startedAt).toBe(0);
    expect(source.loopStart).toBeUndefined();
    expect(source.loopEnd).toBeUndefined();
    // Rendered length = trimmed region (~60) minus the fade folded back into the
    // head. fade = min(round(0.03*1000)=30, floor(60/2)=30) = 30, so the loop
    // body is ~30 samples (zero-snap may shift an edge by one).
    expect(source.buffer).not.toBe(decodedBuffer);
    expect(source.buffer.length).toBeGreaterThanOrEqual(28);
    expect(source.buffer.length).toBeLessThanOrEqual(31);
    expect(source.buffer.sampleRate).toBe(sampleRate);
  });

  it('equal-power crossfades the loop tail into its head for a continuous wrap', async () => {
    // Region body is a constant 0.5 except a 0.9 spike at the very first and a
    // 0.1 dip at the very last sample. After folding tail->head the boundary
    // samples become a blend, proving the crossfade ran (not a raw copy).
    // Region is 200 samples so it comfortably exceeds the 30-sample fade window,
    // leaving an untouched body to assert against.
    const sampleRate = 1000;
    const length = 300;
    const data = new Float32Array(length);
    for (let i = 50; i < 250; i += 1) {
      data[i] = 0.5; // region [50, 250), length 200
    }
    data[50] = 0.9; // head edge of region
    data[249] = 0.1; // tail edge of region
    const decodedBuffer = {
      duration: length / sampleRate,
      length,
      sampleRate,
      numberOfChannels: 1,
      getChannelData: () => data,
    };
    const { adapter } = setup({ context: { decodeImpl: async () => decodedBuffer } });
    await adapter.loadClips({ sfx: { 'sfx-loop': '/audio/loop.mp3' } });

    const source = adapter.playSfxLoop('sfx-loop');
    const rendered = source.buffer.getChannelData(0);

    // Rendered length = trimmed region minus the 30-sample fade folded into the
    // head. Zero-snap may nudge an edge by a sample, so assert the relationship
    // rather than an exact count: ~170, and strictly less than the full region.
    expect(rendered.length).toBeGreaterThanOrEqual(168);
    expect(rendered.length).toBeLessThan(200);
    // First sample = head*sin(t~0) + tail*cos(t~0); fade-in≈0, fade-out≈1, so it
    // is dominated by the faded-out tail (~0.5 body) rather than the 0.9 head
    // spike — proving the tail was mixed in.
    expect(rendered[0]).toBeLessThan(0.9);
    // Mid-buffer (index 50, past the 30-sample fade) is the untouched body level.
    expect(rendered[50]).toBeCloseTo(0.5, 5);
    // Every rendered sample stays within the source's amplitude envelope (no
    // crossfade overshoot/clipping).
    for (let i = 0; i < rendered.length; i += 1) {
      expect(Math.abs(rendered[i])).toBeLessThanOrEqual(0.9 + 1e-6);
    }
  });

  it('idempotently returns the existing loop source without restarting it', async () => {
    const { adapter } = setup();
    await adapter.loadClips({ sfx: { 'sfx-loop': '/audio/loop.mp3' } });

    const first = adapter.playSfxLoop('sfx-loop');
    const second = adapter.playSfxLoop('sfx-loop');

    expect(second).toBe(first);
  });
});

describe('audio-adapter: playMusic', () => {
  it('stops the previous music source before starting a new one', async () => {
    const { adapter } = setup();
    await adapter.loadClips({
      music: {
        themeA: '/audio/a.ogg',
        themeB: '/audio/b.ogg',
      },
    });

    const sourceA = adapter.playMusic('themeA', { loop: true });
    expect(sourceA.started).toBe(true);
    expect(sourceA.loop).toBe(true);
    expect(sourceA.stopped).toBe(false);
    expect(adapter.getActiveMusicId()).toBe('themeA');

    const sourceB = adapter.playMusic('themeB');
    expect(sourceA.stopped).toBe(true);
    expect(sourceB.started).toBe(true);
    expect(sourceB.loop).toBe(false);
    expect(adapter.getActiveMusicId()).toBe('themeB');
  });

  it('stopMusic stops the active track and clears the active id', async () => {
    const { adapter } = setup();
    await adapter.loadClips({ music: { theme: '/audio/theme.ogg' } });
    const source = adapter.playMusic('theme', { loop: true });
    expect(adapter.getActiveMusicId()).toBe('theme');

    adapter.stopMusic();
    expect(source.stopped).toBe(true);
    expect(adapter.getActiveMusicId()).toBeNull();
  });

  it('stopMusic is a safe no-op when no track is playing', () => {
    const { adapter } = setup();
    expect(() => adapter.stopMusic()).not.toThrow();
  });

  it('warns and no-ops on missing music track without throwing', async () => {
    const { adapter, warnSpy } = setup();
    const result = adapter.playMusic('not-loaded');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing music clip "not-loaded"'),
    );
  });

  it('refuses to play music cues through playSfx', async () => {
    const { adapter, warnSpy } = setup();
    await adapter.loadClips({ music: { theme: '/audio/theme.ogg' } });
    const result = adapter.playSfx('theme');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing sfx clip "theme"'));
  });
});

describe('audio-adapter: setVolume', () => {
  it('updates each category gain node when its volume changes', async () => {
    const { adapter, records } = setup();
    await adapter.resume();
    const [master, music, sfx, ui] = records.instances[0].createdGainNodes;

    adapter.setVolume('master', 0.25);
    adapter.setVolume('music', 0.5);
    adapter.setVolume('sfx', 0.75);
    adapter.setVolume('ui', 0.1);

    expect(master.gain.value).toBe(0.25);
    expect(music.gain.value).toBe(0.5);
    expect(sfx.gain.value).toBe(0.75);
    expect(ui.gain.value).toBe(0.1);
  });

  it('clamps gain values into the [0, 1] interval', async () => {
    const { adapter, records } = setup();
    await adapter.resume();
    const sfxBus = records.instances[0].createdGainNodes[2];

    adapter.setVolume('sfx', -1);
    expect(sfxBus.gain.value).toBe(0);
    adapter.setVolume('sfx', 5);
    expect(sfxBus.gain.value).toBe(1);
    adapter.setVolume('sfx', Number.NaN);
    expect(sfxBus.gain.value).toBe(0);
  });

  it('warns on an unknown category and leaves existing gains untouched', async () => {
    const { adapter, records, warnSpy } = setup();
    await adapter.resume();
    const sfxBus = records.instances[0].createdGainNodes[2];
    sfxBus.gain.value = 0.42;

    adapter.setVolume('bogus', 0.1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown volume category "bogus"'),
    );
    expect(sfxBus.gain.value).toBe(0.42);
  });

  it('honors volume values set before the AudioContext is constructed', async () => {
    const { adapter, records } = setup();
    // Volumes can be queued at startup, before any user gesture creates the
    // context — those values must be applied when the gain nodes appear.
    adapter.setVolume('music', 0.33);
    await adapter.resume();
    const musicBus = records.instances[0].createdGainNodes[1];
    expect(musicBus.gain.value).toBe(0.33);
  });
});

describe('audio-adapter: visibilitychange', () => {
  it('suspends a running context when the document becomes hidden', async () => {
    const { adapter, documentTarget, records } = setup();
    await adapter.resume();
    const context = records.instances[0];
    expect(context.state).toBe('running');

    documentTarget.hidden = true;
    documentTarget.dispatch('visibilitychange');
    await Promise.resolve();
    await Promise.resolve();

    expect(context.suspendCalls).toBeGreaterThanOrEqual(1);
    expect(context.state).toBe('suspended');
  });

  it('resumes a suspended context when the document becomes visible again', async () => {
    const { adapter, documentTarget, records } = setup();
    await adapter.resume();
    const context = records.instances[0];

    documentTarget.hidden = true;
    documentTarget.dispatch('visibilitychange');
    await Promise.resolve();
    await Promise.resolve();
    expect(context.state).toBe('suspended');

    documentTarget.hidden = false;
    documentTarget.dispatch('visibilitychange');
    await Promise.resolve();
    await Promise.resolve();

    expect(context.resumeCalls).toBeGreaterThanOrEqual(2);
    expect(context.state).toBe('running');
  });

  it('does nothing on visibilitychange when no context has been created yet', () => {
    const { documentTarget, records } = setup();
    documentTarget.hidden = true;
    expect(() => documentTarget.dispatch('visibilitychange')).not.toThrow();
    expect(records.instances.length).toBe(0);
  });
});

describe('audio-adapter: suspend/resume API', () => {
  it('suspend() forwards to the underlying AudioContext', async () => {
    const { adapter, records } = setup();
    await adapter.resume();
    const context = records.instances[0];
    await adapter.suspend();
    expect(context.suspendCalls).toBeGreaterThanOrEqual(1);
  });

  it('resume() creates the context on demand when called before any interaction', async () => {
    const { adapter, records } = setup({ context: { initialState: 'suspended' } });
    expect(records.instances.length).toBe(0);
    await adapter.resume();
    expect(records.instances.length).toBe(1);
    expect(records.instances[0].resumeCalls).toBeGreaterThanOrEqual(1);
  });
});

describe('audio-adapter: destroy', () => {
  it('clears playback state and closes the context', async () => {
    const { adapter, records } = setup();
    await adapter.loadClips({ music: { theme: '/audio/theme.ogg' } });
    adapter.playMusic('theme', { loop: true });

    await adapter.destroy();

    const context = records.instances[0];
    expect(context.closeCalls).toBeGreaterThanOrEqual(1);
    expect(adapter.getAudioContext()).toBeNull();
    expect(adapter.getActiveMusicId()).toBeNull();
  });
});

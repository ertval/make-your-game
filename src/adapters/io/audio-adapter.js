/*
 * Runtime audio adapter.
 *
 * This module owns the Web Audio API boundary for the ECS game. It centralizes
 * AudioContext lifecycle, decoded-buffer storage, and category gain routing so
 * gameplay systems can stay framework-agnostic and only need to dispatch cue
 * identifiers. HTMLAudioElement is intentionally not used for runtime playback
 * because Web Audio gives us deterministic latency, overlapping SFX support,
 * and category-level gain control in one place.
 *
 * Public API:
 * - createAudioAdapter(options): factory returning the adapter resource.
 *
 * Resource-key contract:
 *   ECS systems MUST consume audio through the world resource at the
 *   canonical key `'audio'` — i.e. `world.getResource('audio')`. Direct
 *   imports of this module from systems are forbidden because they bypass
 *   the bootstrap-managed lifecycle (slot pre-registration, fault-tolerant
 *   init, explicit teardown on runtime stop).
 *
 *   The runtime wiring that registers the adapter as the `'audio'` world
 *   resource lives in a separate Track A integration PR (bootstrap +
 *   main.ecs.js deltas + manifest module are out of Track C ownership scope).
 *   This module ships the boundary contract; consumers should expect the
 *   resource slot to become live once the integration PR lands.
 *
 * Adapter methods:
 * - loadClips(manifest): fetch + decodeAudioData each clip in the manifest.
 * - playSfx(cueId): play a one-shot SFX cue (overlapping playback supported).
 * - playSfxLoop(cueId) / stopSfxLoop(cueId): start/stop a looping SFX cue (e.g. bomb fuse).
 * - playMusic(trackId, options): play a music track, replacing any previous one.
 * - stopMusic(): stop the currently playing music track.
 * - setVolume(category, value): set linear gain for master/music/sfx/ui.
 * - suspend(): suspend the underlying AudioContext.
 * - resume(): resume the underlying AudioContext.
 * - destroy(): tear down listeners and close the context.
 *
 * Implementation notes:
 * - AudioContext construction is deferred until the first user interaction so
 *   the adapter complies with browser autoplay policies. We listen for
 *   pointerdown and keydown to perform the unlock.
 * - Each SFX playback allocates a fresh AudioBufferSourceNode because Web Audio
 *   forbids restarting a source node once it has been started.
 * - Missing clips warn once and no-op so a manifest typo never crashes the
 *   simulation loop.
 * - Category gain nodes (master/music/sfx/ui) are wired master -> destination,
 *   and music/sfx/ui -> master, which keeps per-category volume independent
 *   from the master mix.
 * - document.visibilitychange suspends the context while hidden and resumes
 *   when visible again so background tabs do not waste audio resources.
 */

const CATEGORY_NAMES = Object.freeze(['master', 'music', 'sfx', 'ui']);
const ROUTABLE_CATEGORIES = Object.freeze(['music', 'sfx', 'ui']);
const DEFAULT_VOLUMES = Object.freeze({
  master: 1,
  music: 1,
  sfx: 1,
  ui: 1,
});

function clampGain(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function resolveAudioContextCtor(windowTarget, override) {
  if (typeof override === 'function') {
    return override;
  }
  if (!windowTarget) {
    return null;
  }
  return windowTarget.AudioContext || windowTarget.webkitAudioContext || null;
}

function resolveFetch(windowTarget, override) {
  if (typeof override === 'function') {
    return override;
  }
  if (windowTarget && typeof windowTarget.fetch === 'function') {
    return windowTarget.fetch.bind(windowTarget);
  }
  if (typeof fetch === 'function') {
    return fetch;
  }
  return null;
}

/**
 * Create the runtime audio adapter.
 *
 * @param {{
 *   windowTarget?: (Window & typeof globalThis) | null,
 *   documentTarget?: Document | null,
 *   audioContextCtor?: typeof AudioContext | null,
 *   fetchImpl?: typeof fetch | null,
 *   autoUnlock?: boolean,
 * }} [options] - Optional adapter configuration.
 * @returns {object} The audio adapter resource.
 */
export function createAudioAdapter(options = {}) {
  const windowTarget = options.windowTarget || (typeof window !== 'undefined' ? window : null);
  const documentTarget =
    options.documentTarget || (typeof document !== 'undefined' ? document : null);
  const AudioContextCtor = resolveAudioContextCtor(windowTarget, options.audioContextCtor);
  const fetchImpl = resolveFetch(windowTarget, options.fetchImpl);
  const autoUnlock = options.autoUnlock !== false;

  /** @type {AudioContext | null} */
  let audioContext = null;
  /** @type {Map<string, GainNode>} */
  const gainNodes = new Map();
  /** @type {Map<string, AudioBuffer>} */
  const sfxBuffers = new Map();
  /** @type {Map<string, AudioBuffer>} */
  const musicBuffers = new Map();
  /** @type {Map<string, { category: string, buffers: Map<string, AudioBuffer> }>} */
  const clipIndex = new Map();
  const volumes = { ...DEFAULT_VOLUMES };
  const warnedMissing = new Set();
  /** @type {AudioBufferSourceNode | null} */
  let activeMusicSource = null;
  let activeMusicId = null;
  /** @type {Map<string, AudioBufferSourceNode>} Active looping SFX by cue id. */
  const loopSfxSources = new Map();
  let destroyed = false;
  let unlockBound = false;

  function ensureContext() {
    if (audioContext || destroyed) {
      return audioContext;
    }
    if (!AudioContextCtor) {
      return null;
    }
    try {
      audioContext = new AudioContextCtor();
    } catch (error) {
      console.warn('audio-adapter: failed to construct AudioContext', error);
      audioContext = null;
      return null;
    }

    for (const category of CATEGORY_NAMES) {
      const node = audioContext.createGain();
      node.gain.value = clampGain(volumes[category]);
      gainNodes.set(category, node);
    }

    const masterGain = gainNodes.get('master');
    if (masterGain) {
      masterGain.connect(audioContext.destination);
      for (const category of ROUTABLE_CATEGORIES) {
        const node = gainNodes.get(category);
        if (node) {
          node.connect(masterGain);
        }
      }
    }

    return audioContext;
  }

  function unlockContext() {
    const context = ensureContext();
    if (context && context.state === 'suspended' && typeof context.resume === 'function') {
      context.resume().catch((error) => {
        console.warn('audio-adapter: context resume failed', error);
      });
    }
    removeUnlockListeners();
  }

  function removeUnlockListeners() {
    if (!unlockBound) {
      return;
    }
    unlockBound = false;
    if (windowTarget && typeof windowTarget.removeEventListener === 'function') {
      windowTarget.removeEventListener('pointerdown', unlockContext);
      windowTarget.removeEventListener('keydown', unlockContext);
    }
  }

  function bindUnlockListeners() {
    if (unlockBound || !autoUnlock) {
      return;
    }
    if (!windowTarget || typeof windowTarget.addEventListener !== 'function') {
      return;
    }
    unlockBound = true;
    windowTarget.addEventListener('pointerdown', unlockContext, { once: true });
    windowTarget.addEventListener('keydown', unlockContext, { once: true });
  }

  function onVisibilityChange() {
    if (!audioContext || destroyed) {
      return;
    }
    if (documentTarget?.hidden) {
      if (audioContext.state === 'running' && typeof audioContext.suspend === 'function') {
        audioContext.suspend().catch((error) => {
          console.warn('audio-adapter: suspend on visibility change failed', error);
        });
      }
    } else if (audioContext.state === 'suspended' && typeof audioContext.resume === 'function') {
      audioContext.resume().catch((error) => {
        console.warn('audio-adapter: resume on visibility change failed', error);
      });
    }
  }

  function warnMissing(cueId, kind) {
    if (warnedMissing.has(cueId)) {
      return;
    }
    warnedMissing.add(cueId);
    console.warn(`audio-adapter: missing ${kind} clip "${cueId}"`);
  }

  function bufferStoreForCategory(category) {
    return category === 'music' ? musicBuffers : sfxBuffers;
  }

  async function decodeClip(context, url) {
    if (!fetchImpl) {
      throw new Error('no fetch implementation available');
    }
    const response = await fetchImpl(url);
    if (!response || (typeof response.ok === 'boolean' && !response.ok)) {
      throw new Error(`failed to fetch ${url}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return await context.decodeAudioData(arrayBuffer);
  }

  /**
   * Pre-decode every clip described by the manifest and index it by cue id.
   *
   * The manifest is shaped as:
   *   { sfx: { cueId: url, ... }, music: { trackId: url, ... }, ui: { cueId: url, ... } }
   *
   * UI cues are routed through the ui category but stored in the SFX buffer map
   * because they are also one-shot, non-looping playbacks.
   *
   * @param {{ sfx?: Record<string, string>, music?: Record<string, string>, ui?: Record<string, string> }} manifest - Clip manifest.
   * @returns {Promise<{ loaded: string[], failed: string[] }>} Load report.
   */
  async function loadClips(manifest) {
    const report = { loaded: [], failed: [] };
    if (!manifest || typeof manifest !== 'object') {
      return report;
    }

    const context = ensureContext();
    if (!context) {
      console.warn('audio-adapter: cannot load clips without an AudioContext');
      return report;
    }

    const entries = [];
    for (const category of ['sfx', 'music', 'ui']) {
      const section = manifest[category];
      if (!section || typeof section !== 'object') {
        continue;
      }
      for (const [cueId, url] of Object.entries(section)) {
        entries.push({ category, cueId, url });
      }
    }

    await Promise.all(
      entries.map(async ({ category, cueId, url }) => {
        try {
          const buffer = await decodeClip(context, url);
          const store = bufferStoreForCategory(category);
          store.set(cueId, buffer);
          clipIndex.set(cueId, { category, buffers: store });
          report.loaded.push(cueId);
        } catch (error) {
          console.warn(`audio-adapter: failed to load clip "${cueId}" from ${url}`, error);
          report.failed.push(cueId);
        }
      }),
    );

    return report;
  }

  function lookupBuffer(cueId, expectedCategory) {
    const entry = clipIndex.get(cueId);
    if (!entry) {
      return null;
    }
    if (expectedCategory && entry.category !== expectedCategory) {
      // Music tracks must not play through the sfx path and vice versa; the
      // mismatch usually means a manifest authoring mistake.
      return null;
    }
    return entry.buffers.get(cueId) || null;
  }

  function categoryDestinationFor(cueId) {
    const entry = clipIndex.get(cueId);
    if (entry && entry.category === 'ui') {
      return gainNodes.get('ui') || null;
    }
    if (entry && entry.category === 'music') {
      return gainNodes.get('music') || null;
    }
    return gainNodes.get('sfx') || null;
  }

  /**
   * Play a one-shot SFX or UI cue.
   *
   * Each call creates a brand-new AudioBufferSourceNode so overlapping
   * playback is safe. Missing cues warn once and no-op.
   *
   * @param {string} cueId - Cue identifier from the loaded manifest.
   * @returns {AudioBufferSourceNode | null} The started source, or null when no playback occurred.
   */
  function playSfx(cueId) {
    if (typeof cueId !== 'string' || !cueId) {
      return null;
    }
    const context = ensureContext();
    if (!context) {
      return null;
    }
    const entry = clipIndex.get(cueId);
    if (entry && entry.category === 'music') {
      // Music tracks must go through playMusic so loop/stop state stays consistent.
      warnMissing(cueId, 'sfx');
      return null;
    }
    const buffer = entry ? entry.buffers.get(cueId) : sfxBuffers.get(cueId);
    if (!buffer) {
      warnMissing(cueId, 'sfx');
      return null;
    }

    const destination = categoryDestinationFor(cueId);
    if (!destination) {
      return null;
    }

    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      source.start(0);
      return source;
    } catch (error) {
      console.warn(`audio-adapter: playSfx("${cueId}") failed`, error);
      return null;
    }
  }

  /**
   * Start a looping SFX cue (e.g. a bomb fuse) routed through the sfx/ui gain.
   *
   * Idempotent per cue: if the cue is already looping, the existing source is
   * returned rather than layering a second loop. Returns null (warn-once) when
   * the clip is missing or no AudioContext is available, so callers can retry.
   *
   * @param {string} cueId - Cue identifier from the loaded manifest.
   * @returns {AudioBufferSourceNode | null} The looping source, or null when no playback occurred.
   */
  function playSfxLoop(cueId) {
    if (typeof cueId !== 'string' || !cueId) {
      return null;
    }
    const existing = loopSfxSources.get(cueId);
    if (existing) {
      return existing;
    }
    const context = ensureContext();
    if (!context) {
      return null;
    }
    const entry = clipIndex.get(cueId);
    if (entry && entry.category === 'music') {
      warnMissing(cueId, 'sfx');
      return null;
    }
    const buffer = entry ? entry.buffers.get(cueId) : sfxBuffers.get(cueId);
    if (!buffer) {
      warnMissing(cueId, 'sfx');
      return null;
    }
    const destination = categoryDestinationFor(cueId);
    if (!destination) {
      return null;
    }

    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(destination);
      source.onended = () => {
        if (loopSfxSources.get(cueId) === source) {
          loopSfxSources.delete(cueId);
        }
      };
      source.start(0);
      loopSfxSources.set(cueId, source);
      return source;
    } catch (error) {
      console.warn(`audio-adapter: playSfxLoop("${cueId}") failed`, error);
      return null;
    }
  }

  /**
   * Stop a looping SFX cue started by playSfxLoop. Idempotent.
   *
   * @param {string} cueId - Cue identifier to stop.
   */
  function stopSfxLoop(cueId) {
    const source = loopSfxSources.get(cueId);
    if (!source) {
      return;
    }
    loopSfxSources.delete(cueId);
    try {
      source.onended = null;
      source.stop(0);
    } catch {
      // Already stopped / never started — safe to ignore.
    }
    try {
      source.disconnect();
    } catch {
      // Already disconnected.
    }
  }

  /**
   * Play a music track, replacing any currently playing music.
   *
   * @param {string} trackId - Music track identifier from the loaded manifest.
   * @param {{ loop?: boolean }} [playbackOptions] - Optional playback flags.
   * @returns {AudioBufferSourceNode | null} The started source, or null when no playback occurred.
   */
  function playMusic(trackId, playbackOptions = {}) {
    if (typeof trackId !== 'string' || !trackId) {
      return null;
    }
    const context = ensureContext();
    if (!context) {
      return null;
    }
    const buffer = lookupBuffer(trackId, 'music') || musicBuffers.get(trackId) || null;
    if (!buffer) {
      warnMissing(trackId, 'music');
      return null;
    }

    stopMusic();

    const musicGain = gainNodes.get('music');
    if (!musicGain) {
      return null;
    }

    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = playbackOptions.loop === true;
      source.connect(musicGain);
      source.onended = () => {
        if (activeMusicSource === source) {
          activeMusicSource = null;
          activeMusicId = null;
        }
      };
      source.start(0);
      activeMusicSource = source;
      activeMusicId = trackId;
      return source;
    } catch (error) {
      console.warn(`audio-adapter: playMusic("${trackId}") failed`, error);
      activeMusicSource = null;
      activeMusicId = null;
      return null;
    }
  }

  /**
   * Stop the currently playing music track, if any.
   */
  function stopMusic() {
    if (!activeMusicSource) {
      return;
    }
    const source = activeMusicSource;
    activeMusicSource = null;
    activeMusicId = null;
    try {
      source.onended = null;
      source.stop(0);
    } catch {
      // BufferSource throws if it was never started or already stopped; both
      // states are safe to ignore here.
    }
    try {
      source.disconnect();
    } catch {
      // Already disconnected.
    }
  }

  /**
   * Set the linear gain value for a category.
   *
   * @param {'master' | 'music' | 'sfx' | 'ui'} category - Category to adjust.
   * @param {number} value - Linear gain in the closed interval [0, 1].
   */
  function setVolume(category, value) {
    if (!CATEGORY_NAMES.includes(category)) {
      console.warn(`audio-adapter: unknown volume category "${category}"`);
      return;
    }
    const next = clampGain(value);
    volumes[category] = next;
    const node = gainNodes.get(category);
    if (node) {
      node.gain.value = next;
    }
  }

  /**
   * Suspend the underlying AudioContext.
   *
   * @returns {Promise<void>}
   */
  async function suspend() {
    if (!audioContext || typeof audioContext.suspend !== 'function') {
      return;
    }
    try {
      await audioContext.suspend();
    } catch (error) {
      console.warn('audio-adapter: suspend failed', error);
    }
  }

  /**
   * Resume the underlying AudioContext, constructing it on demand.
   *
   * @returns {Promise<void>}
   */
  async function resume() {
    const context = ensureContext();
    if (!context || typeof context.resume !== 'function') {
      return;
    }
    try {
      await context.resume();
    } catch (error) {
      console.warn('audio-adapter: resume failed', error);
    }
  }

  /**
   * Tear down listeners, stop playback, and close the AudioContext.
   *
   * @returns {Promise<void>}
   */
  async function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    removeUnlockListeners();
    if (documentTarget && typeof documentTarget.removeEventListener === 'function') {
      documentTarget.removeEventListener('visibilitychange', onVisibilityChange);
    }
    stopMusic();
    for (const cueId of [...loopSfxSources.keys()]) {
      stopSfxLoop(cueId);
    }
    sfxBuffers.clear();
    musicBuffers.clear();
    clipIndex.clear();
    gainNodes.clear();
    if (audioContext && typeof audioContext.close === 'function') {
      try {
        await audioContext.close();
      } catch (error) {
        console.warn('audio-adapter: close failed', error);
      }
    }
    audioContext = null;
  }

  /**
   * Return the currently playing music track id, or null when nothing is playing.
   *
   * @returns {string | null}
   */
  function getActiveMusicId() {
    return activeMusicId;
  }

  /**
   * Return the underlying AudioContext for advanced use cases or tests.
   *
   * @returns {AudioContext | null}
   */
  function getAudioContext() {
    return audioContext;
  }

  bindUnlockListeners();
  if (documentTarget && typeof documentTarget.addEventListener === 'function') {
    documentTarget.addEventListener('visibilitychange', onVisibilityChange);
  }

  return {
    loadClips,
    playSfx,
    playSfxLoop,
    stopSfxLoop,
    playMusic,
    stopMusic,
    setVolume,
    suspend,
    resume,
    destroy,
    getActiveMusicId,
    getAudioContext,
  };
}

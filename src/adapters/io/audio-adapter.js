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

/**
 * Nudge a loop boundary toward the quietest sample within a small window so the
 * loop wraps as close to zero amplitude as possible. This shaves the faint
 * click that remains when a trim boundary lands mid-waveform (a zero-crossing
 * snap). Returns the original index when no quieter sample is nearby.
 *
 * @param {Float32Array} data - Channel PCM samples.
 * @param {number} fromIndex - Starting sample index.
 * @param {number} direction - +1 to search forward, -1 to search backward.
 * @param {number} window - Maximum samples to search.
 * @returns {number} Index of the quietest sample found (or fromIndex).
 */
function snapToQuietestSample(data, fromIndex, direction, window) {
  let bestIndex = fromIndex;
  let bestAbs = Math.abs(data[fromIndex]);
  for (let step = 1; step <= window; step += 1) {
    const i = fromIndex + direction * step;
    if (i < 0 || i >= data.length) {
      break;
    }
    const abs = Math.abs(data[i]);
    if (abs < bestAbs) {
      bestAbs = abs;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * Find the seamless loop region of a decoded buffer by trimming near-silent
 * edges and snapping the boundaries toward zero-crossings. MP3 encoder
 * delay/padding decodes to a few ms of leading/trailing silence; with
 * `source.loop = true` that silence replays every iteration and is heard as a
 * gap. Looping only the non-silent region (with zero-snapped edges) removes the
 * gap and minimizes the loop-wrap click.
 *
 * Defensive: any buffer that does not expose PCM data (e.g. test mocks) falls
 * back to looping the whole buffer.
 *
 * @param {AudioBuffer} buffer - Decoded audio buffer.
 * @returns {{ loopStart: number, loopEnd: number }} Loop region in seconds.
 */
function computeLoopRegion(buffer) {
  const duration = Number.isFinite(buffer?.duration) ? buffer.duration : 0;
  const fallback = { loopStart: 0, loopEnd: duration };
  const length = Number.isInteger(buffer?.length) ? buffer.length : 0;
  const sampleRate = buffer?.sampleRate;

  if (typeof buffer?.getChannelData !== 'function' || length <= 0 || !sampleRate) {
    return fallback;
  }

  // ~ -56 dBFS: treats encoder padding / dead air as silence without trimming
  // an audible loop body.
  const SILENCE_THRESHOLD = 0.0015;
  const channelCount = buffer.numberOfChannels || 1;
  let firstNonSilent = length;
  let lastNonSilent = -1;

  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      if (Math.abs(data[i]) > SILENCE_THRESHOLD) {
        if (i < firstNonSilent) {
          firstNonSilent = i;
        }
        break;
      }
    }
    for (let i = length - 1; i >= 0; i -= 1) {
      if (Math.abs(data[i]) > SILENCE_THRESHOLD) {
        if (i > lastNonSilent) {
          lastNonSilent = i;
        }
        break;
      }
    }
  }

  if (lastNonSilent <= firstNonSilent) {
    return fallback;
  }

  // Snap each edge toward the nearest near-zero sample (≤10 ms in, bounded so we
  // never cross the midpoint) to shave the residual loop-wrap click.
  const channel0 = buffer.getChannelData(0);
  const snapWindow = Math.max(
    0,
    Math.min(Math.round(sampleRate * 0.01), Math.floor((lastNonSilent - firstNonSilent) / 2)),
  );
  const loopStartSample = snapToQuietestSample(channel0, firstNonSilent, 1, snapWindow);
  const loopEndSample = snapToQuietestSample(channel0, lastNonSilent, -1, snapWindow);

  return {
    loopStart: loopStartSample / sampleRate,
    loopEnd: (loopEndSample + 1) / sampleRate,
  };
}

/**
 * Pre-render a seamless looping buffer by crossfading the loop region's tail
 * back into its head. `computeLoopRegion` removes encoder padding and snaps to
 * zero-crossings, but the loop *body* itself may not be musically continuous —
 * the phrase at `loopEnd` rarely resolves back into the phrase at `loopStart`,
 * so a plain `source.loop = true` splice can still be heard as a "gap" where the
 * pattern restarts. Mixing the last `fade` samples (faded out) into the first
 * `fade` samples (faded in) with an equal-power curve blends the end of one
 * iteration into the start of the next, masking that restart regardless of how
 * the source clip was authored. The returned buffer loops cleanly over its full
 * `0..duration` range.
 *
 * Equal-power (cos/sin) rather than linear so the summed loudness stays
 * constant through the fade — a linear crossfade would dip ~3 dB at the midpoint
 * and be heard as a pulse. Done once per cue and cached; not on the hot path.
 *
 * Defensive: returns null when PCM data or `createBuffer` is unavailable (test
 * mocks) or the region is too short to fade, so callers fall back to the
 * original buffer + loopStart/loopEnd splice.
 *
 * @param {BaseAudioContext} context - Context used to allocate the new buffer.
 * @param {AudioBuffer} buffer - Decoded source buffer.
 * @param {{ loopStart: number, loopEnd: number }} region - Loop region (seconds).
 * @param {number} fadeSeconds - Target crossfade length in seconds.
 * @returns {AudioBuffer | null} Crossfaded loop buffer, or null to fall back.
 */
function buildSeamlessLoopBuffer(context, buffer, region, fadeSeconds) {
  if (
    typeof buffer?.getChannelData !== 'function' ||
    typeof context?.createBuffer !== 'function' ||
    !Number.isFinite(buffer?.sampleRate)
  ) {
    return null;
  }

  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.round(region.loopStart * sampleRate));
  const endSample = Math.min(buffer.length, Math.round(region.loopEnd * sampleRate));
  const regionLength = endSample - startSample;

  // Fade must fit inside the region and never exceed half of it (the head and
  // tail fade windows must not overlap). Bail on regions too short to matter.
  const fade = Math.min(Math.round(fadeSeconds * sampleRate), Math.floor(regionLength / 2));
  if (regionLength <= 0 || fade <= 0) {
    return null;
  }

  // The looped buffer is the region minus the tail we fold back into the head.
  const loopLength = regionLength - fade;
  const channelCount = buffer.numberOfChannels || 1;

  let out;
  try {
    out = context.createBuffer(channelCount, loopLength, sampleRate);
  } catch (error) {
    console.warn('audio-adapter: createBuffer for seamless loop failed', error);
    return null;
  }

  for (let channel = 0; channel < channelCount; channel += 1) {
    const src = buffer.getChannelData(channel);
    const dst = out.getChannelData(channel);
    // Copy the loop body verbatim.
    for (let i = 0; i < loopLength; i += 1) {
      dst[i] = src[startSample + i];
    }
    // Crossfade: the first `fade` samples are the head fading in while the tail
    // (the `fade` samples just past loopLength) fades out, summed equal-power.
    for (let i = 0; i < fade; i += 1) {
      const t = (i + 0.5) / fade; // sample-centred so the curve is symmetric
      const fadeIn = Math.sin((t * Math.PI) / 2);
      const fadeOut = Math.cos((t * Math.PI) / 2);
      const head = src[startSample + i];
      const tail = src[startSample + loopLength + i];
      dst[i] = head * fadeIn + tail * fadeOut;
    }
  }

  return out;
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

function resolveNavigator(windowTarget, override) {
  if (override) {
    return override;
  }
  if (windowTarget?.navigator) {
    return windowTarget.navigator;
  }
  return typeof navigator !== 'undefined' ? navigator : null;
}

/**
 * Whether the page has already received a user gesture this document lifetime.
 *
 * The audio adapter is constructed asynchronously (after the map load), but the
 * input adapter binds keystrokes immediately — so the player can press Enter to
 * start the game (an accepted gesture) before the unlock listeners exist. In
 * that race the gesture is gone, but `navigator.userActivation.hasBeenActive`
 * still reports it, letting us resume the context on construction instead of
 * waiting for the player to click. (Pure arrow movement does NOT grant audio
 * activation in Firefox, so this only helps once an accepted gesture occurred.)
 *
 * @param {Navigator | null} navigatorTarget - Navigator (or test stub) to probe.
 * @returns {boolean} True when a prior gesture is recorded.
 */
function hasPriorUserActivation(navigatorTarget) {
  return navigatorTarget?.userActivation?.hasBeenActive === true;
}

/**
 * Create the runtime audio adapter.
 *
 * @param {{
 *   windowTarget?: (Window & typeof globalThis) | null,
 *   documentTarget?: Document | null,
 *   navigatorTarget?: Navigator | null,
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
  const navigatorTarget = resolveNavigator(windowTarget, options.navigatorTarget);
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
  /** @type {Map<string, { loopStart: number, loopEnd: number }>} Cached seamless loop regions. */
  const loopRegions = new Map();
  /** @type {Map<string, AudioBuffer>} Cached crossfaded loop buffers (per cue). */
  const loopBuffers = new Map();
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
    if (!context) {
      return;
    }
    if (context.state !== 'suspended') {
      removeUnlockListeners();
      return;
    }
    if (typeof context.resume !== 'function') {
      return;
    }
    // Detach the listeners only once resume() actually leaves the suspended
    // state. Firefox silently keeps the context suspended for gestures it does
    // not accept as audio activation (notably arrow keys — Space/Enter/click are
    // accepted), so a one-shot listener would be consumed by a rejected arrow
    // press and never retry. Keeping the listeners bound until success means the
    // first accepted gesture still unlocks audio.
    context
      .resume()
      .then(() => {
        if (context.state !== 'suspended') {
          removeUnlockListeners();
        }
      })
      .catch((error) => {
        console.warn('audio-adapter: context resume failed', error);
      });
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
    // Not { once: true }: a single gesture may be rejected by the browser
    // autoplay policy, so the listeners must survive to retry on the next
    // gesture. unlockContext() detaches them itself once the context is running.
    windowTarget.addEventListener('pointerdown', unlockContext);
    windowTarget.addEventListener('keydown', unlockContext);

    // Race guard: the player may have already pressed Enter / clicked to start
    // the game before this (async-constructed) adapter bound its listeners. If
    // the browser still records that activation, unlock now instead of waiting
    // for another click.
    if (hasPriorUserActivation(navigatorTarget)) {
      unlockContext();
    }
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

    let region = loopRegions.get(cueId);
    if (!region) {
      region = computeLoopRegion(buffer);
      loopRegions.set(cueId, region);
    }

    // Crossfade the loop tail into its head once, then loop the whole rendered
    // buffer — this masks the restart "gap" even when the clip body is not
    // musically continuous. Cached per cue; null means fall back to the splice.
    let loopBuffer = loopBuffers.get(cueId);
    if (loopBuffer === undefined) {
      // ~30 ms: long enough to mask a discontinuity, short enough not to smear
      // a percussive loop body. Clamped to half the region inside the builder.
      loopBuffer = buildSeamlessLoopBuffer(context, buffer, region, 0.03);
      loopBuffers.set(cueId, loopBuffer);
    }

    try {
      const source = context.createBufferSource();
      if (loopBuffer) {
        // The rendered buffer already excludes padding and is wrap-continuous,
        // so loop its full range from the start.
        source.buffer = loopBuffer;
        source.loop = true;
      } else {
        source.buffer = buffer;
        source.loop = true;
        // Fallback: loop only the non-silent region so MP3 encoder padding does
        // not play a gap on every wrap. Starting at loopStart drops the
        // first-pass gap.
        source.loopStart = region.loopStart;
        source.loopEnd = region.loopEnd;
      }
      source.connect(destination);
      source.onended = () => {
        if (loopSfxSources.get(cueId) === source) {
          loopSfxSources.delete(cueId);
        }
      };
      source.start(0, loopBuffer ? 0 : region.loopStart);
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
    loopRegions.clear();
    loopBuffers.clear();
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

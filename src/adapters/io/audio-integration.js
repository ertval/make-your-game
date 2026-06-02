/*
 * C-07: Audio cue mapping & runtime integration driver.
 *
 * This module ships the Track C-owned glue layer that turns deterministic
 * gameplay events and game-state transitions into audio adapter calls. It is
 * intentionally framework-free and DOM-free: the only side effects allowed
 * here are calls into the injected audio adapter (which is itself the single
 * Web Audio boundary, see `src/adapters/io/audio-adapter.js`).
 *
 * Ownership / placement:
 *   Track C owns `src/adapters/io/audio-*.js` (see
 *   `scripts/policy-gate/lib/policy-utils.mjs`). Track C does NOT own
 *   `src/ecs/systems/`, so this integration is shipped as an adapter-side
 *   driver rather than an ECS system file. The Track A integration PR that
 *   wires audio into bootstrap (the same handoff that calls
 *   `setAudioAdapter(...)`) will register a thin system wrapper whose
 *   `update()` calls `audioCueRunner.tick(context)` — the wrapper does not
 *   add any audio logic, it only resolves resources from the world.
 *
 * Public API:
 * - AUDIO_CUE_MAPPING: frozen event type → SFX cue id table.
 * - MUSIC_STATE_MAPPING: frozen game-state → music track id table.
 * - resolveCueForEvent(eventType): map a gameplay event type to a cue id.
 * - resolveMusicForState(gameState): map a game state to a music track id.
 * - createAudioCueRunner(options): factory returning the runtime driver.
 *
 * Asset provenance:
 *   The cue ids in `AUDIO_CUE_MAPPING` and the track ids in
 *   `MUSIC_STATE_MAPPING` are forward references to the audio assets
 *   delivered by C-08 (Sound Effects & Music Production), at which point
 *   the audio manifest at `assets/manifests/audio-manifest.json` will
 *   register matching entries. Until C-08 lands, the audio adapter warns
 *   once per missing cue and no-ops — the runtime is unaffected because
 *   the runner does not validate cue presence (the C-06 adapter owns that
 *   responsibility).
 *
 * Driver contract (createAudioCueRunner):
 *   The runner exposes a single `tick({ audio, eventQueue, gameStatus })`
 *   method that:
 *     1. Drains the event queue in insertion order (frame, order).
 *     2. Calls `audio.playSfx(cueId)` for each mapped event.
 *     3. Compares `gameStatus.currentState` against the last seen state and
 *        starts / stops / replaces music as required.
 *   The runner never imports the world, the audio adapter module, or the
 *   event queue module directly — every collaborator is injected.
 *
 * Determinism notes:
 * - `drain(eventQueue)` is the canonical sync point (see D-01 contract);
 *   it sorts by (frame, order) and clears the queue. The runner does not
 *   peek, mutate, or cache events across frames.
 * - Music transitions are idempotent: replaying the same state does not
 *   restart playback. Re-entering `PLAYING` from `PAUSED` resumes by
 *   replaying the gameplay loop because the underlying adapter does not
 *   expose pause-music — the music-state table treats PAUSED as "silence",
 *   matching the design checklist in `docs/implementation/track-c.md`.
 * - Unknown event types are dropped silently in production. In development
 *   we emit a single `console.warn` per unknown type so the team notices
 *   gaps between gameplay event surfaces and the cue table.
 */

import { drain } from '../../ecs/resources/event-queue.js';
import { GAME_STATE } from '../../ecs/resources/game-status.js';

/**
 * Canonical event type → SFX cue id table.
 *
 * Keys are exact strings from gameplay event publishers (see
 * GAMEPLAY_EVENT_TYPE plus the additional life/level/state events emitted by
 * Track B / Track C systems once the matching event surfaces land). Keeping
 * this table data-driven lets new events join the audio loop without changing
 * runner code or sprinkling `playSfx` calls across gameplay systems.
 *
 * A value may be a single cue id OR an array of cue ids when one event should
 * trigger several overlapping SFX (e.g. the power pellet plays both the pickup
 * blip and the power-mode activation sting). Use `resolveCuesForEvent` to read
 * the normalized cue list.
 */
export const AUDIO_CUE_MAPPING = Object.freeze({
  // Track B emitters: these strings are the canonical
  // `GAMEPLAY_EVENT_TYPE.*` values (see
  // `src/ecs/systems/collision-gameplay-events.js`). They are inlined as
  // string literals to avoid an adapter→systems import.
  BombPlaced: 'sfx-bomb-place',
  BombDetonated: 'sfx-bomb-explode',
  WallDestroyed: 'sfx-wall-destroy',
  PelletCollected: 'sfx-pellet-collect',
  // The power pellet fires two overlapping cues: the pickup blip and the
  // power-mode (speed-boost) activation sting, matching the arcade feel.
  PowerPelletCollected: ['sfx-power-pellet-collect', 'sfx-speed-boost-on'],
  PowerUpCollected: 'sfx-powerup-collect',
  // Higher-level events emitted (or planned) by Track B/C systems.
  LifeLost: 'sfx-player-hit',
  GhostDefeated: 'sfx-ghost-kill',
  GhostStunned: 'sfx-ghost-stun',
  LevelCleared: 'sfx-level-complete',
  GameOver: 'sfx-game-over',
  Victory: 'sfx-victory',
});

/**
 * Game state → music track table.
 *
 * `null` means "no music" — the runner stops any active track on transition
 * into that state. PAUSED maps to `null` because the adapter only exposes
 * `playMusic` / `stopMusic`; suspending the AudioContext is handled by the
 * adapter's own `visibilitychange` integration, not by this driver.
 */
export const MUSIC_STATE_MAPPING = Object.freeze({
  [GAME_STATE.MENU]: 'music-menu',
  [GAME_STATE.PLAYING]: 'music-gameplay',
  [GAME_STATE.PAUSED]: null,
  [GAME_STATE.LEVEL_COMPLETE]: null,
  [GAME_STATE.GAME_OVER]: null,
  [GAME_STATE.VICTORY]: null,
});

/**
 * Looping SFX cue for the bomb fuse. Unlike the event-mapped cues, the fuse is
 * driven by live simulation state (any bomb active) rather than a one-shot
 * gameplay event: it loops while a bomb is ticking during PLAYING and stops the
 * moment none remain (detonation, level reset, leaving PLAYING).
 */
const FUSE_LOOP_CUE = 'sfx-bomb-fuse';

/**
 * Resolve a gameplay event type to its raw mapping value.
 *
 * The value may be a single cue id or an array of cue ids (see
 * AUDIO_CUE_MAPPING). Prefer `resolveCuesForEvent` for playback; this raw
 * accessor is kept for inspection/back-compat.
 *
 * @param {string} eventType
 * @returns {string | string[] | null} The mapped cue id(s), or null when no mapping exists.
 */
export function resolveCueForEvent(eventType) {
  if (typeof eventType !== 'string' || eventType.length === 0) {
    return null;
  }
  return Object.hasOwn(AUDIO_CUE_MAPPING, eventType) ? AUDIO_CUE_MAPPING[eventType] : null;
}

/**
 * Resolve a gameplay event type to its normalized list of cue ids.
 *
 * Single-cue mappings become a one-element array; multi-cue mappings are
 * returned as-is; unknown events yield an empty array. This is the shape the
 * runner iterates so one event can fire several overlapping SFX.
 *
 * @param {string} eventType
 * @returns {string[]} Cue ids to play (empty when no mapping exists).
 */
export function resolveCuesForEvent(eventType) {
  const mapped = resolveCueForEvent(eventType);
  if (mapped === null) {
    return [];
  }
  return Array.isArray(mapped) ? mapped : [mapped];
}

/**
 * Resolve a game state to its mapped music track id.
 *
 * Unknown states return `null` (silence) rather than throwing so a future
 * state added to GAME_STATE does not crash the audio loop before the table
 * is updated.
 *
 * @param {string} gameState
 * @returns {string | null}
 */
export function resolveMusicForState(gameState) {
  if (typeof gameState !== 'string' || gameState.length === 0) {
    return null;
  }
  return Object.hasOwn(MUSIC_STATE_MAPPING, gameState) ? MUSIC_STATE_MAPPING[gameState] : null;
}

function isDev() {
  // Detect Node / Vitest dev-mode without crashing in browser bundles where
  // `process` is undefined.
  try {
    return typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

/**
 * Create the C-07 audio cue runner.
 *
 * The runner holds only two pieces of state:
 *   - `warnedUnknown`: a Set of unknown event types we have already warned
 *     about, so the dev console stays readable across long sessions.
 *   - `lastState`: the last `gameStatus.currentState` we acted on, used to
 *     debounce music transitions so the same track is not restarted every
 *     frame.
 *
 * The runner does NOT store the audio adapter, event queue, or game status
 * — they are passed in per tick so the driver is safe to reuse across runs
 * (e.g., between Vitest tests) and so test code can inject spies without
 * rebuilding the runner.
 *
 * @param {{ warnUnknownEvents?: boolean }} [options]
 * @returns {{
 *   tick: (context: { audio: object, eventQueue: object, gameStatus: object }) => void,
 *   reset: () => void,
 * }}
 */
export function createAudioCueRunner(options = {}) {
  const warnUnknownEvents = options.warnUnknownEvents !== false;
  const warnedUnknown = new Set();
  let lastState = null;
  // Whether the looping fuse SFX is currently playing, so we only start/stop it
  // on edges instead of re-issuing the call every frame.
  let fusePlaying = false;

  function maybeWarnUnknown(type) {
    if (!warnUnknownEvents || !isDev()) {
      return;
    }
    if (warnedUnknown.has(type)) {
      return;
    }
    warnedUnknown.add(type);
    // eslint-disable-next-line no-console
    console.warn(`audio-integration: no cue mapping for event type "${type}"`);
  }

  function consumeEvents(audio, eventQueue) {
    if (!eventQueue || !Array.isArray(eventQueue.events)) {
      return;
    }
    // drain() returns events in deterministic (frame, order) sequence and
    // clears the queue. Audio is a downstream consumer; we do not republish.
    // The runner relies on the D-01 event-queue contract (enqueue always
    // pushes an object with type/frame/order/payload) and intentionally does
    // NOT sanitize the buffer here — that responsibility belongs to the
    // queue module, not to a downstream consumer.
    const events = drain(eventQueue);
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      if (!event || typeof event.type !== 'string') {
        continue;
      }
      const cueIds = resolveCuesForEvent(event.type);
      if (cueIds.length === 0) {
        maybeWarnUnknown(event.type);
        continue;
      }
      // Each playSfx allocates a fresh AudioBufferSourceNode (see
      // audio-adapter.js), so chained pellets / overlapping explosions / the
      // power pellet's twin cues overlap naturally without us serializing
      // playback.
      for (const cueId of cueIds) {
        try {
          audio.playSfx(cueId);
        } catch (error) {
          // The adapter's own contract is "warn + no-op"; if a downstream
          // adapter swap throws, we still must not crash the game loop.
          // eslint-disable-next-line no-console
          console.warn(`audio-integration: playSfx("${cueId}") threw`, error);
        }
      }
    }
  }

  function reconcileMusic(audio, gameStatus) {
    if (!gameStatus || typeof gameStatus.currentState !== 'string') {
      return;
    }
    const currentState = gameStatus.currentState;
    if (currentState === lastState) {
      return;
    }
    const desiredTrack = resolveMusicForState(currentState);
    try {
      if (desiredTrack === null) {
        // Transitioning into a "silent" state (PAUSED, terminal, etc.):
        // stop any active track; stopMusic is idempotent on the adapter.
        audio.stopMusic();
        lastState = currentState;
        return;
      }

      if (
        typeof audio.getActiveMusicId === 'function' &&
        audio.getActiveMusicId() === desiredTrack
      ) {
        // Same track already playing — do nothing (covers cases where the
        // runner is replayed after a stale lastState reset).
        lastState = currentState;
        return;
      }

      // playMusic stops the previous track internally before swapping in the
      // new one, so we do not need to call stopMusic first. It returns null
      // when the track buffer has not been decoded yet or the AudioContext is
      // still suspended (pre user-gesture). In that case we deliberately do
      // NOT advance lastState, so the runner retries the start on the next
      // tick until playback actually begins. This matters because the runtime
      // can transition into PLAYING at frame 0 — long before a large music
      // clip finishes decoding — and the music must still start once it is
      // ready rather than being lost to a single failed attempt.
      const started = audio.playMusic(desiredTrack, { loop: true });
      if (started) {
        lastState = currentState;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `audio-integration: music reconciliation for state "${currentState}" threw`,
        error,
      );
      // On a hard adapter error, advance anyway so the runner does not spin
      // on the same failing transition every frame.
      lastState = currentState;
    }
  }

  function reconcileFuse(audio, gameStatus, bombActive) {
    const isPlaying = gameStatus?.currentState === GAME_STATE.PLAYING;
    // Fuse only loops during live play: a bomb on the game-over screen or a
    // paused board should be silent.
    const shouldPlay = bombActive === true && isPlaying;

    if (shouldPlay === fusePlaying) {
      return;
    }

    try {
      if (shouldPlay) {
        // playSfxLoop returns null while the clip is still decoding; keep
        // fusePlaying false so we retry next tick until it actually starts.
        const started =
          typeof audio.playSfxLoop === 'function' ? audio.playSfxLoop(FUSE_LOOP_CUE) : null;
        fusePlaying = Boolean(started);
      } else {
        if (typeof audio.stopSfxLoop === 'function') {
          audio.stopSfxLoop(FUSE_LOOP_CUE);
        }
        fusePlaying = false;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('audio-integration: fuse loop reconciliation threw', error);
    }
  }

  function tick(context) {
    if (!context?.audio) {
      // No adapter wired yet (pre Track A integration handoff). Drop the
      // tick silently — gameplay continues without audio feedback.
      return;
    }
    consumeEvents(context.audio, context.eventQueue);
    reconcileMusic(context.audio, context.gameStatus);
    reconcileFuse(context.audio, context.gameStatus, context.bombActive);
  }

  function reset() {
    warnedUnknown.clear();
    lastState = null;
    fusePlaying = false;
  }

  return { tick, reset };
}

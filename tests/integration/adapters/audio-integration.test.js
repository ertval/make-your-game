/**
 * Integration tests for the C-07 audio cue mapping & runtime integration
 * driver (`src/adapters/io/audio-integration.js`).
 *
 * Path note: lives under `tests/integration/adapters/` because the Track C
 * ownership policy allows audio adapter tests only at
 * `tests/integration/adapters/audio-*.test.js`. Like the C-06 adapter
 * tests, this suite is unit-shaped — it injects an audio adapter spy and
 * fresh resource objects per test so there is no browser audio dependency
 * and no shared state across tests.
 *
 * Coverage targets (per C-07 verification gate):
 * - every documented event → cue mapping fires correctly
 * - queue-order playback preserves (frame, order) sequencing
 * - overlapping playback support (chained pellets/explosions)
 * - music transitions for every GAME_STATE
 * - unknown/malformed events are dropped safely
 * - pre-wiring tick (no adapter) is a no-op
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUDIO_CUE_MAPPING,
  createAudioCueRunner,
  MUSIC_STATE_MAPPING,
  resolveCueForEvent,
  resolveCuesForEvent,
  resolveMusicForState,
} from '../../../src/adapters/io/audio-integration.js';
import { createEventQueue, enqueue } from '../../../src/ecs/resources/event-queue.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';

function createAudioAdapterSpy() {
  const calls = {
    playSfx: [],
    playSfxLoop: [],
    stopSfxLoop: [],
    playMusic: [],
    stopMusic: 0,
  };
  let activeMusicId = null;
  return {
    calls,
    playSfx(cueId) {
      calls.playSfx.push(cueId);
      return { __spy: true, cueId };
    },
    playSfxLoop(cueId) {
      calls.playSfxLoop.push(cueId);
      return { __spy: true, cueId, loop: true };
    },
    stopSfxLoop(cueId) {
      calls.stopSfxLoop.push(cueId);
    },
    playMusic(trackId, options = {}) {
      calls.playMusic.push({ trackId, options });
      activeMusicId = trackId;
      return { __spy: true, trackId };
    },
    stopMusic() {
      calls.stopMusic += 1;
      activeMusicId = null;
    },
    getActiveMusicId() {
      return activeMusicId;
    },
  };
}

let consoleWarnSpy;

beforeEach(() => {
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  consoleWarnSpy.mockRestore();
});

describe('audio-integration: cue mapping table', () => {
  it('declares the full C-07 event → cue mapping required by the ticket', () => {
    expect(AUDIO_CUE_MAPPING).toMatchObject({
      BombPlaced: 'sfx-bomb-place',
      BombDetonated: 'sfx-bomb-explode',
      PelletCollected: 'sfx-pellet-collect',
      PowerPelletCollected: 'sfx-power-pellet-collect',
      PowerUpCollected: 'sfx-powerup-collect',
      LifeLost: 'sfx-player-hit',
      GhostDefeated: 'sfx-ghost-kill',
      GhostStunned: 'sfx-ghost-stun',
      LevelCleared: 'sfx-level-complete',
      GameOver: 'sfx-game-over',
      Victory: 'sfx-victory',
    });
  });

  it('is frozen so gameplay systems cannot mutate the cue table at runtime', () => {
    expect(Object.isFrozen(AUDIO_CUE_MAPPING)).toBe(true);
  });

  it('resolveCueForEvent returns the cue id for known events', () => {
    expect(resolveCueForEvent('BombPlaced')).toBe('sfx-bomb-place');
    expect(resolveCueForEvent('GhostDefeated')).toBe('sfx-ghost-kill');
  });

  it('resolveCueForEvent returns null for unknown / malformed event types', () => {
    expect(resolveCueForEvent('NotARealEvent')).toBeNull();
    expect(resolveCueForEvent('')).toBeNull();
    expect(resolveCueForEvent(null)).toBeNull();
    expect(resolveCueForEvent(undefined)).toBeNull();
    expect(resolveCueForEvent(123)).toBeNull();
  });

  it('resolveCuesForEvent normalizes single-cue mappings to a one-element array', () => {
    expect(resolveCuesForEvent('BombPlaced')).toEqual(['sfx-bomb-place']);
    expect(resolveCuesForEvent('PowerPelletCollected')).toEqual(['sfx-power-pellet-collect']);
    expect(resolveCuesForEvent('NotARealEvent')).toEqual([]);
  });
});

describe('audio-integration: bomb fuse loop', () => {
  // Use fuseLoopDelay: 0 to bypass the bomb-place sequencing delay in unit
  // tests — the delay behaviour is covered by the dedicated sequencing suite.
  it('starts the fuse loop while a bomb is active during PLAYING', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ fuseLoopDelay: 0 });

    runner.tick({ audio, eventQueue, gameStatus, bombActive: true });

    expect(audio.calls.playSfxLoop).toEqual(['sfx-bomb-fuse']);
    expect(audio.calls.stopSfxLoop).toEqual([]);
  });

  it('stops the fuse loop once no bomb is active', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ fuseLoopDelay: 0 });

    runner.tick({ audio, eventQueue, gameStatus, bombActive: true });
    runner.tick({ audio, eventQueue, gameStatus, bombActive: false });

    expect(audio.calls.playSfxLoop).toEqual(['sfx-bomb-fuse']);
    expect(audio.calls.stopSfxLoop).toEqual(['sfx-bomb-fuse']);
  });

  it('does not loop the fuse outside PLAYING even with an active bomb', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PAUSED);
    const runner = createAudioCueRunner({ fuseLoopDelay: 0 });

    runner.tick({ audio, eventQueue, gameStatus, bombActive: true });

    expect(audio.calls.playSfxLoop).toEqual([]);
  });

  it('retries starting the fuse loop until the clip is ready', () => {
    const audio = createAudioAdapterSpy();
    let ready = false;
    audio.playSfxLoop = (cueId) => {
      audio.calls.playSfxLoop.push(cueId);
      return ready ? { __spy: true, cueId } : null;
    };
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ fuseLoopDelay: 0 });

    runner.tick({ audio, eventQueue, gameStatus, bombActive: true });
    ready = true;
    runner.tick({ audio, eventQueue, gameStatus, bombActive: true });

    expect(audio.calls.playSfxLoop).toEqual(['sfx-bomb-fuse', 'sfx-bomb-fuse']);
  });

  it('holds the fuse loop for fuseLoopDelay ms after bomb placement', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    let fakeNow = 1000;
    const runner = createAudioCueRunner({ fuseLoopDelay: 500, now: () => fakeNow });

    // Tick at t=1000 — delay window [1000, 1500), fuse should not start yet.
    runner.tick({ audio, eventQueue, gameStatus, bombActive: true });
    expect(audio.calls.playSfxLoop).toEqual([]);

    // Advance clock past the delay window.
    fakeNow = 1500;
    runner.tick({ audio, eventQueue, gameStatus, bombActive: true });

    expect(audio.calls.playSfxLoop).toEqual(['sfx-bomb-fuse']);
  });

  it('resets the delay when bombActive drops and rises again', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ fuseLoopDelay: 0 });

    runner.tick({ audio, eventQueue, gameStatus, bombActive: true });
    runner.tick({ audio, eventQueue, gameStatus, bombActive: false });
    runner.tick({ audio, eventQueue, gameStatus, bombActive: true });

    // playSfxLoop called twice (once per rising edge), stopSfxLoop once.
    expect(audio.calls.playSfxLoop).toEqual(['sfx-bomb-fuse', 'sfx-bomb-fuse']);
    expect(audio.calls.stopSfxLoop).toEqual(['sfx-bomb-fuse']);
  });
});

describe('audio-integration: power-pellet frenzy loop', () => {
  it('plays only the pickup blip on PowerPelletCollected (frenzy SFX is not a one-shot)', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner();

    enqueue(eventQueue, 'PowerPelletCollected', {}, 0);
    runner.tick({ audio, eventQueue, gameStatus });

    expect(audio.calls.playSfx).toEqual(['sfx-power-pellet-collect']);
    expect(audio.calls.playSfx).not.toContain('sfx-speed-boost-on');
  });

  it('loops the frenzy SFX while the power pellet is active during PLAYING', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner();

    runner.tick({ audio, eventQueue, gameStatus, powerPelletActive: true });

    expect(audio.calls.playSfxLoop).toEqual(['sfx-speed-boost-on']);
    expect(audio.calls.stopSfxLoop).toEqual([]);
  });

  it('stops the frenzy loop once the power pellet window ends', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner();

    runner.tick({ audio, eventQueue, gameStatus, powerPelletActive: true });
    runner.tick({ audio, eventQueue, gameStatus, powerPelletActive: false });

    expect(audio.calls.playSfxLoop).toEqual(['sfx-speed-boost-on']);
    expect(audio.calls.stopSfxLoop).toEqual(['sfx-speed-boost-on']);
  });

  it('does not loop the frenzy SFX outside PLAYING even when active', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PAUSED);
    const runner = createAudioCueRunner();

    runner.tick({ audio, eventQueue, gameStatus, powerPelletActive: true });

    expect(audio.calls.playSfxLoop).toEqual([]);
  });
});

describe('audio-integration: music state mapping', () => {
  it('covers every GAME_STATE so unknown transitions cannot crash the runner', () => {
    for (const state of Object.values(GAME_STATE)) {
      expect(MUSIC_STATE_MAPPING).toHaveProperty(state);
    }
  });

  it('plays gameplay music during PLAYING and silences PAUSED / terminal states', () => {
    expect(resolveMusicForState(GAME_STATE.MENU)).toBe('music-menu');
    expect(resolveMusicForState(GAME_STATE.PLAYING)).toBe('music-gameplay');
    expect(resolveMusicForState(GAME_STATE.PAUSED)).toBeNull();
    expect(resolveMusicForState(GAME_STATE.LEVEL_COMPLETE)).toBeNull();
    expect(resolveMusicForState(GAME_STATE.GAME_OVER)).toBeNull();
    expect(resolveMusicForState(GAME_STATE.VICTORY)).toBeNull();
  });
});

describe('audio-integration: cue runner — event consumption', () => {
  it('fires playSfx for every mapped event type emitted in one frame', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ warnUnknownEvents: false });

    const mappedEvents = Object.keys(AUDIO_CUE_MAPPING);
    for (let i = 0; i < mappedEvents.length; i += 1) {
      enqueue(eventQueue, mappedEvents[i], {}, 0);
    }

    runner.tick({ audio, eventQueue, gameStatus });

    // Multi-cue events (e.g. PowerPelletCollected) expand to several playSfx
    // calls, so flatten the mapping to the normalized cue list.
    const expectedCues = mappedEvents.flatMap((type) => resolveCuesForEvent(type));
    expect(audio.calls.playSfx).toEqual(expectedCues);
  });

  it('preserves insertion order across frames when consuming the queue', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ warnUnknownEvents: false });

    enqueue(eventQueue, 'PelletCollected', {}, 5);
    enqueue(eventQueue, 'BombDetonated', {}, 4);
    enqueue(eventQueue, 'GhostDefeated', {}, 5);

    runner.tick({ audio, eventQueue, gameStatus });

    // drain() sorts by (frame, order); frame=4 must precede frame=5 cues,
    // and within frame=5 the original insertion order must hold.
    expect(audio.calls.playSfx).toEqual([
      'sfx-bomb-explode',
      'sfx-pellet-collect',
      'sfx-ghost-kill',
    ]);
  });

  it('supports overlapping playback for chained pellets and explosions', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ warnUnknownEvents: false });

    // Six pellets + three chained explosions in the same simulation frame.
    for (let i = 0; i < 6; i += 1) {
      enqueue(eventQueue, 'PelletCollected', { entityId: i }, 10);
    }
    for (let i = 0; i < 3; i += 1) {
      enqueue(eventQueue, 'BombDetonated', { chainDepth: i }, 10);
    }

    runner.tick({ audio, eventQueue, gameStatus });

    // Every event must produce its own playSfx call — the runner must
    // never coalesce overlapping cues.
    const pelletCalls = audio.calls.playSfx.filter((id) => id === 'sfx-pellet-collect');
    const explodeCalls = audio.calls.playSfx.filter((id) => id === 'sfx-bomb-explode');
    expect(pelletCalls).toHaveLength(6);
    expect(explodeCalls).toHaveLength(3);
  });

  it('drains the queue so events are not replayed on the next tick', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ warnUnknownEvents: false });

    enqueue(eventQueue, 'PelletCollected', {}, 1);
    runner.tick({ audio, eventQueue, gameStatus });
    runner.tick({ audio, eventQueue, gameStatus });

    expect(audio.calls.playSfx).toEqual(['sfx-pellet-collect']);
    expect(eventQueue.events).toHaveLength(0);
  });

  it('drops unknown event types without throwing and warns once per type in dev', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner();

    enqueue(eventQueue, 'NotARealEvent', {}, 0);
    enqueue(eventQueue, 'NotARealEvent', {}, 0);
    enqueue(eventQueue, 'AlsoNotReal', {}, 0);

    expect(() => runner.tick({ audio, eventQueue, gameStatus })).not.toThrow();
    expect(audio.calls.playSfx).toEqual([]);

    const unknownWarnings = consoleWarnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('no cue mapping'),
    );
    expect(unknownWarnings.length).toBeGreaterThanOrEqual(1);
    expect(unknownWarnings.length).toBeLessThanOrEqual(2);
  });

  it('tolerates malformed events (missing type, non-string type) without crashing', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ warnUnknownEvents: false });

    // Bypass enqueue() validation by pushing raw rows; the runner must
    // remain robust to bad data inserted by other systems. Null/undefined
    // rows are out of scope here — D-01's `enqueue` guarantees an object,
    // and null-row sanitization belongs in the queue module if ever needed.
    eventQueue.events.push({ type: null, frame: 0, order: 0, payload: {} });
    eventQueue.events.push({ type: 42, frame: 0, order: 1, payload: {} });
    eventQueue.events.push({ frame: 0, order: 2, payload: {} });
    eventQueue.orderCounter = 3;

    expect(() => runner.tick({ audio, eventQueue, gameStatus })).not.toThrow();
    expect(audio.calls.playSfx).toEqual([]);
  });

  it('isolates adapter playSfx errors so the game loop survives', () => {
    const audio = createAudioAdapterSpy();
    audio.playSfx = vi.fn(() => {
      throw new Error('synthetic adapter failure');
    });
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ warnUnknownEvents: false });

    enqueue(eventQueue, 'BombDetonated', {}, 0);
    enqueue(eventQueue, 'PelletCollected', {}, 0);

    expect(() => runner.tick({ audio, eventQueue, gameStatus })).not.toThrow();
    // Both events still attempted playback even though the first threw.
    expect(audio.playSfx).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when no audio adapter is wired yet (pre Track A handoff)', () => {
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ warnUnknownEvents: false });

    enqueue(eventQueue, 'BombDetonated', {}, 0);

    expect(() => runner.tick({ audio: null, eventQueue, gameStatus })).not.toThrow();
    // Queue is intentionally left intact so a later tick (after audio is
    // wired) still has the option to react — drain only runs when audio
    // is present.
    expect(eventQueue.events).toHaveLength(1);
  });
});

describe('audio-integration: cue runner — music state transitions', () => {
  it('starts gameplay music on the first PLAYING tick', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ warnUnknownEvents: false });

    runner.tick({ audio, eventQueue, gameStatus });

    expect(audio.calls.playMusic).toEqual([{ trackId: 'music-gameplay', options: { loop: true } }]);
    expect(audio.calls.stopMusic).toBe(0);
  });

  it('does not restart the same track on subsequent ticks (no spam)', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ warnUnknownEvents: false });

    runner.tick({ audio, eventQueue, gameStatus });
    runner.tick({ audio, eventQueue, gameStatus });
    runner.tick({ audio, eventQueue, gameStatus });

    expect(audio.calls.playMusic).toHaveLength(1);
  });

  it('stops music when entering PAUSED and resumes when returning to PLAYING', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ warnUnknownEvents: false });

    runner.tick({ audio, eventQueue, gameStatus });
    gameStatus.previousState = gameStatus.currentState;
    gameStatus.currentState = GAME_STATE.PAUSED;
    runner.tick({ audio, eventQueue, gameStatus });
    expect(audio.calls.stopMusic).toBe(1);

    gameStatus.previousState = gameStatus.currentState;
    gameStatus.currentState = GAME_STATE.PLAYING;
    runner.tick({ audio, eventQueue, gameStatus });

    expect(audio.calls.playMusic.map((c) => c.trackId)).toEqual([
      'music-gameplay',
      'music-gameplay',
    ]);
  });

  it('stops music on terminal transitions (GAME_OVER, VICTORY)', () => {
    const cases = [GAME_STATE.GAME_OVER, GAME_STATE.VICTORY];
    for (const terminal of cases) {
      const audio = createAudioAdapterSpy();
      const eventQueue = createEventQueue();
      const gameStatus = createGameStatus(GAME_STATE.PLAYING);
      const runner = createAudioCueRunner({ warnUnknownEvents: false });

      runner.tick({ audio, eventQueue, gameStatus });
      gameStatus.previousState = gameStatus.currentState;
      gameStatus.currentState = terminal;
      runner.tick({ audio, eventQueue, gameStatus });

      expect(audio.calls.stopMusic).toBe(1);
      expect(audio.calls.playMusic).toHaveLength(1);
    }
  });

  it('plays menu music on entry into MENU', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.MENU);
    const runner = createAudioCueRunner({ warnUnknownEvents: false });

    runner.tick({ audio, eventQueue, gameStatus });

    expect(audio.calls.playMusic).toEqual([{ trackId: 'music-menu', options: { loop: true } }]);
  });

  it('reset() clears lastState so a transition to a different state re-issues music', () => {
    const audio = createAudioAdapterSpy();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const runner = createAudioCueRunner({ warnUnknownEvents: false });

    runner.tick({ audio, eventQueue, gameStatus });
    expect(audio.calls.playMusic).toHaveLength(1);

    // Without reset, going PLAYING → MENU → PLAYING re-issues twice.
    // After reset, lastState is cleared but the adapter's active id
    // is still music-gameplay, so a same-state tick is correctly skipped.
    runner.reset();
    runner.tick({ audio, eventQueue, gameStatus });
    expect(audio.calls.playMusic).toHaveLength(1);

    // A genuine state change after reset still triggers playMusic.
    gameStatus.previousState = gameStatus.currentState;
    gameStatus.currentState = GAME_STATE.MENU;
    runner.tick({ audio, eventQueue, gameStatus });
    expect(audio.calls.playMusic.map((c) => c.trackId)).toEqual(['music-gameplay', 'music-menu']);
  });
});

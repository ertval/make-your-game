/**
 * C-05 screens bridge system unit tests.
 *
 * The screens-system is an edge-triggered render-phase bridge: on each
 * game-status change it drives the screens DOM adapter to show the matching
 * overlay, and on terminal states it persists the high score first. Coverage is
 * grouped into the issue's areas, mapped onto this module's real surface:
 *   - overlay class toggles: each GAME_STATE selects the right adapter overlay
 *     call (showStart / hideAll / showPause / ...).
 *   - screen transitions: edge-triggered dispatch — one call per change, no call
 *     when the state is unchanged, and the right method per transition.
 *   - terminal persistence: GAME_OVER / VICTORY save and forward the high score.
 *
 * Keyboard navigation lives in the screens DOM adapter, not this ECS system, so
 * it is covered by tests/integration/adapters/screens-adapter.test.js and the
 * tests/e2e/c-05-screens-navigation.spec.js end-to-end flow.
 */

import { describe, expect, it } from 'vitest';

import { GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createScreensSystem } from '../../../src/ecs/systems/screens-system.js';

/** Spy adapter recording every overlay call in order. */
function createSpyScreens() {
  const calls = [];
  const record =
    (name) =>
    (...args) =>
      calls.push({ name, args });
  return {
    calls,
    names: () => calls.map((call) => call.name),
    showStart: record('showStart'),
    hideAll: record('hideAll'),
    showPause: record('showPause'),
    showLevelComplete: record('showLevelComplete'),
    showGameOver: record('showGameOver'),
    showVictory: record('showVictory'),
  };
}

/** Spy storage provider recording saved scores and returning a fixed high score. */
function createSpyStorage(highScore = 0) {
  const saved = [];
  return {
    saved,
    saveHighScore: (value) => saved.push(value),
    getHighScore: () => highScore,
  };
}

function createMockWorld(resources) {
  return {
    getResource: (key) => (key in resources ? resources[key] : undefined),
  };
}

function createHarness({ score = 0, highScore = 0, withStorage = true, withScore = true } = {}) {
  const screens = createSpyScreens();
  const storage = withStorage ? createSpyStorage(highScore) : null;
  const scoreState = withScore ? { totalPoints: score } : null;
  const gameStatus = { currentState: GAME_STATE.MENU };
  const world = createMockWorld({
    gameStatus,
    screensAdapter: screens,
    scoreState,
    storageProvider: storage,
  });
  const system = createScreensSystem();

  function tick(state) {
    if (state !== undefined) gameStatus.currentState = state;
    system.update({ world });
  }

  return { screens, storage, scoreState, gameStatus, world, system, tick };
}

describe('screens-system', () => {
  describe('phase and resource config', () => {
    const system = createScreensSystem();

    it('runs in the render phase', () => {
      expect(system.phase).toBe('render');
    });

    it('declares read access to its status, adapter, score, and storage resources', () => {
      expect(system.resourceCapabilities.read).toEqual(
        expect.arrayContaining(['gameStatus', 'screensAdapter', 'scoreState', 'storageProvider']),
      );
    });

    it('exposes a stable name', () => {
      expect(system.name).toBe('screens-system');
    });
  });

  describe('overlay class toggles', () => {
    it.each([
      [GAME_STATE.MENU, 'showStart'],
      [GAME_STATE.PLAYING, 'hideAll'],
      [GAME_STATE.PAUSED, 'showPause'],
      [GAME_STATE.LEVEL_COMPLETE, 'showLevelComplete'],
    ])('shows the %s overlay via %s', (state, expectedCall) => {
      const { screens, tick } = createHarness();
      tick(state);
      expect(screens.names()).toEqual([expectedCall]);
    });

    it('ignores unmapped states without touching the adapter', () => {
      const { screens, tick } = createHarness();
      tick('BOOTING');
      expect(screens.calls).toHaveLength(0);
    });
  });

  describe('screen transitions (edge-triggered)', () => {
    it('dispatches once per change and stays silent while the state is unchanged', () => {
      const { screens, tick } = createHarness();
      tick(GAME_STATE.PLAYING);
      tick(GAME_STATE.PLAYING);
      tick(GAME_STATE.PLAYING);
      expect(screens.names()).toEqual(['hideAll']);
    });

    it('drives the matching overlay across a sequence of transitions', () => {
      const { screens, tick } = createHarness();
      tick(GAME_STATE.MENU);
      tick(GAME_STATE.PLAYING);
      tick(GAME_STATE.PAUSED);
      tick(GAME_STATE.PLAYING);
      expect(screens.names()).toEqual(['showStart', 'hideAll', 'showPause', 'hideAll']);
    });

    it('re-fires an overlay when the state is re-entered after a change', () => {
      const { screens, tick } = createHarness();
      tick(GAME_STATE.PAUSED);
      tick(GAME_STATE.PLAYING);
      tick(GAME_STATE.PAUSED);
      expect(screens.names()).toEqual(['showPause', 'hideAll', 'showPause']);
    });
  });

  describe('terminal high-score persistence', () => {
    it('saves the score then shows GAME_OVER with the stored high score', () => {
      const { screens, storage, tick } = createHarness({ score: 1234, highScore: 5000 });
      tick(GAME_STATE.GAME_OVER);
      expect(storage.saved).toEqual([1234]);
      expect(screens.calls).toEqual([{ name: 'showGameOver', args: [5000] }]);
    });

    it('saves the score then shows VICTORY with the stored high score', () => {
      const { screens, storage, tick } = createHarness({ score: 4200, highScore: 9000 });
      tick(GAME_STATE.VICTORY);
      expect(storage.saved).toEqual([4200]);
      expect(screens.calls).toEqual([{ name: 'showVictory', args: [9000] }]);
    });

    it('falls back to a zero score when scoreState is present but empty', () => {
      const { storage, tick } = createHarness({ score: undefined, highScore: 0 });
      tick(GAME_STATE.GAME_OVER);
      expect(storage.saved).toEqual([0]);
    });

    it('still shows the overlay with a null high score when no storage is registered', () => {
      const { screens, tick } = createHarness({ withStorage: false });
      tick(GAME_STATE.GAME_OVER);
      expect(screens.calls).toEqual([{ name: 'showGameOver', args: [null] }]);
    });

    it('does not save when no scoreState is registered', () => {
      const { screens, storage, tick } = createHarness({ withScore: false, highScore: 7 });
      tick(GAME_STATE.VICTORY);
      expect(storage.saved).toEqual([]);
      expect(screens.calls).toEqual([{ name: 'showVictory', args: [7] }]);
    });
  });

  describe('safe handling of missing resources', () => {
    it('no-ops when no game status is registered', () => {
      const world = createMockWorld({});
      const system = createScreensSystem();
      expect(() => system.update({ world })).not.toThrow();
    });

    it('no-ops when no screens adapter is registered (headless safety)', () => {
      const world = createMockWorld({ gameStatus: { currentState: GAME_STATE.MENU } });
      const system = createScreensSystem();
      expect(() => system.update({ world })).not.toThrow();
    });
  });
});

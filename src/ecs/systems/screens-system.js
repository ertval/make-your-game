/*
 * Screens bridge system — connects game-status FSM transitions to the
 * screens DOM adapter so the correct overlay is shown for each game state.
 *
 * This system runs in the render phase and is edge-triggered: it calls the
 * screens adapter only when the game status changes, not every frame.
 *
 * Public API:
 * - createScreensSystem(options) — ECS system factory.
 *
 * Implementation notes:
 * - Reads `gameStatus`, `screensAdapter`, `scoreState`, `storageProvider`
 *   from world resources.
 * - On terminal states (GAME_OVER, VICTORY) it saves the high score via
 *   the storage provider before showing the overlay.
 * - Gracefully no-ops when no screens adapter is registered, making it
 *   safe for headless test environments.
 */

import { GAME_STATE } from '../resources/game-status.js';

const DEFAULT_GAME_STATUS_KEY = 'gameStatus';
const DEFAULT_SCREENS_ADAPTER_KEY = 'screensAdapter';
const DEFAULT_SCORE_RESOURCE_KEY = 'scoreState';
const DEFAULT_STORAGE_PROVIDER_KEY = 'storageProvider';

function saveHighScoreIfNeeded(world, scoreResourceKey, storageProviderKey) {
  const scoreState = world.getResource(scoreResourceKey);
  const storage = world.getResource(storageProviderKey);
  if (!scoreState || !storage || typeof storage.saveHighScore !== 'function') {
    return;
  }
  storage.saveHighScore(scoreState.totalPoints || 0);
}

export function createScreensSystem(options = {}) {
  const gameStatusKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_KEY;
  const screensKey = options.screensAdapterResourceKey || DEFAULT_SCREENS_ADAPTER_KEY;
  const scoreKey = options.scoreResourceKey || DEFAULT_SCORE_RESOURCE_KEY;
  const storageKey = options.storageProviderResourceKey || DEFAULT_STORAGE_PROVIDER_KEY;

  let previousState = null;

  return {
    name: 'screens-system',
    phase: 'render',
    resourceCapabilities: {
      read: [gameStatusKey, screensKey, scoreKey, storageKey],
    },
    update(context) {
      const gameStatus = context.world.getResource(gameStatusKey);
      if (!gameStatus) return;

      const currentState = gameStatus.currentState;
      if (currentState === previousState) return;

      previousState = currentState;

      const screens = context.world.getResource(screensKey);
      if (!screens) return;

      switch (currentState) {
        case GAME_STATE.MENU:
          screens.showStart();
          break;
        case GAME_STATE.PLAYING:
          screens.hideAll();
          break;
        case GAME_STATE.PAUSED:
          screens.showPause();
          break;
        case GAME_STATE.LEVEL_COMPLETE:
          screens.showLevelComplete();
          break;
        case GAME_STATE.GAME_OVER: {
          saveHighScoreIfNeeded(context.world, scoreKey, storageKey);
          const storage = context.world.getResource(storageKey);
          const highScore =
            storage && typeof storage.getHighScore === 'function' ? storage.getHighScore() : null;
          screens.showGameOver(highScore);
          break;
        }
        case GAME_STATE.VICTORY: {
          saveHighScoreIfNeeded(context.world, scoreKey, storageKey);
          const storage = context.world.getResource(storageKey);
          const highScore =
            storage && typeof storage.getHighScore === 'function' ? storage.getHighScore() : null;
          screens.showVictory(highScore);
          break;
        }
        default:
          break;
      }
    },
  };
}

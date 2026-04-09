/*
 * Game level loading orchestration.
 *
 * This module owns level index bookkeeping and delegates map payload loading
 * to an injected provider so Track D can wire real map resources later.
 *
 * Public API:
 * - createLevelLoader({ world, mapResourceKey, loadMapForLevel })
 * - loadLevel(levelIndex, options)
 * - restartCurrentLevel()
 * - advanceLevel(options)
 * - getCurrentLevelIndex()
 */

function clampLevelIndex(levelIndex) {
  if (!Number.isFinite(levelIndex) || levelIndex < 0) {
    return 0;
  }

  return Math.floor(levelIndex);
}

export function createLevelLoader({
  world,
  mapResourceKey = 'mapResource',
  loadMapForLevel = null,
} = {}) {
  let currentLevelIndex = 0;

  function resolveMapForLevel(levelIndex, options = {}) {
    if (typeof loadMapForLevel !== 'function') {
      return null;
    }

    return loadMapForLevel(levelIndex, options);
  }

  function loadLevel(levelIndex, options = {}) {
    currentLevelIndex = clampLevelIndex(levelIndex);
    const mapResource = resolveMapForLevel(currentLevelIndex, options);

    if (world && typeof world.setResource === 'function') {
      world.setResource(mapResourceKey, mapResource);
    }

    return mapResource;
  }

  function restartCurrentLevel(options = {}) {
    return loadLevel(currentLevelIndex, {
      ...options,
      restart: true,
    });
  }

  function advanceLevel(options = {}) {
    return loadLevel(currentLevelIndex + 1, {
      ...options,
      advance: true,
    });
  }

  function getCurrentLevelIndex() {
    return currentLevelIndex;
  }

  return {
    advanceLevel,
    getCurrentLevelIndex,
    loadLevel,
    restartCurrentLevel,
  };
}

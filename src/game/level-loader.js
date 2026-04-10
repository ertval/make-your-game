/*
 * Game level loading orchestration.
 *
 * This module owns level index bookkeeping and delegates map payload loading
 * to an injected provider. The injected loadMapForLevel is called synchronously
 * and must return a parsed map resource (or null).
 *
 * For async preloading during initialization, use createMapResource from
 * ecs/resources/map-resource.js together with fetch() before creating the
 * level loader, or provide a sync factory that returns preloaded resources.
 *
 * Public API:
 * - createLevelLoader({ world, mapResourceKey, loadMapForLevel })
 * - loadLevel(levelIndex, options)
 * - restartCurrentLevel()
 * - advanceLevel(options)
 * - getCurrentLevelIndex()
 */

import { cloneMap } from '../ecs/resources/map-resource.js';

function clampLevelIndex(levelIndex, maxLevel) {
  if (!Number.isFinite(levelIndex) || levelIndex < 0) {
    return 0;
  }

  if (maxLevel !== undefined && levelIndex > maxLevel) {
    return maxLevel;
  }

  return Math.floor(levelIndex);
}

/**
 * Build a sync loadMapForLevel function from a preloaded map array.
 *
 * This is the recommended integration pattern: preload all maps
 * asynchronously during initialization, then pass the resulting
 * array to this factory to get a sync loader for the level-loader.
 *
 * @param {MapResource[]} preloadMaps — Array of pre-parsed map resources, indexed by levelIndex.
 * @returns {function} Sync loadMapForLevel(levelIndex, options) -> MapResource|null
 */
export function createSyncMapLoader(preloadMaps) {
  const canonicalMaps = Array.isArray(preloadMaps)
    ? preloadMaps.map((mapResource) => (mapResource ? cloneMap(mapResource) : mapResource))
    : [];

  return function loadMapForLevel(levelIndex, options = {}) {
    if (!Number.isFinite(levelIndex) || levelIndex < 0 || levelIndex >= canonicalMaps.length) {
      return null;
    }

    const baseMap = canonicalMaps[levelIndex];
    if (!baseMap) {
      return null;
    }

    // Always return a fresh clone so runtime mutations never taint canonical maps.
    if (options.restart) {
      return cloneMap(baseMap);
    }

    return cloneMap(baseMap);
  };
}

export function createLevelLoader({
  world,
  mapResourceKey = 'mapResource',
  loadMapForLevel = null,
  totalLevels = 3,
} = {}) {
  const maxLevelIndex = totalLevels - 1;
  let currentLevelIndex = 0;
  // Cache the last successfully loaded map for restart cloning.
  let cachedMapResource = null;

  function resolveMapForLevel(levelIndex, options = {}) {
    if (typeof loadMapForLevel !== 'function') {
      return null;
    }

    return loadMapForLevel(levelIndex, {
      ...options,
      cachedMapResource,
    });
  }

  function loadLevel(levelIndex, options = {}) {
    currentLevelIndex = clampLevelIndex(levelIndex, maxLevelIndex);
    const mapResource = resolveMapForLevel(currentLevelIndex, options);

    if (world && typeof world.setResource === 'function') {
      world.setResource(mapResourceKey, mapResource);
    }

    // Cache the loaded map for future restart cloning.
    if (mapResource) {
      cachedMapResource = mapResource;
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
    if (currentLevelIndex >= maxLevelIndex) {
      return null;
    }

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

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
 * - advanceLevel(reason)
 * - getCurrentLevelIndex()
 */

import * as mapResourceModule from '../ecs/resources/map-resource.js';
import { isRecord } from '../shared/type-guards.js';

const { cloneMap, createMapResource } = mapResourceModule;
const assertValidMapResource =
  typeof mapResourceModule.assertValidMapResource === 'function'
    ? mapResourceModule.assertValidMapResource
    : null;

function isRawMapPayload(candidate) {
  return (
    isRecord(candidate) &&
    isRecord(candidate.dimensions) &&
    Array.isArray(candidate.grid) &&
    isRecord(candidate.spawn)
  );
}

function normalizeLoadedMapPayload(payload) {
  if (!payload) {
    return null;
  }

  if (isRawMapPayload(payload)) {
    return createMapResource(payload);
  }

  // Keep loader compatibility while Track D map-resource guard export is integrating.
  if (assertValidMapResource) {
    assertValidMapResource(payload);
  }

  return cloneMap(payload);
}

function clampLevelIndex(levelIndex, maxLevel) {
  if (!Number.isFinite(levelIndex)) {
    return 0;
  }

  const boundedLevelIndex = Math.max(0, Math.floor(levelIndex));
  if (!Number.isFinite(maxLevel)) {
    return boundedLevelIndex;
  }

  return Math.max(0, Math.min(boundedLevelIndex, Math.floor(maxLevel)));
}

/**
 * Build a sync loadMapForLevel function from a preloaded map array.
 *
 * This is the recommended integration pattern: preload all maps
 * asynchronously during initialization, then pass the resulting
 * array to this factory to get a sync loader for the level-loader.
 *
 * @param {MapResource[]} preloadMaps — Array of pre-parsed map resources, indexed by levelIndex.
 * @returns {function} Sync loadMapForLevel(levelIndex) -> MapResource|null
 */
export function createSyncMapLoader(preloadMaps) {
  const canonicalMaps = Array.isArray(preloadMaps)
    ? preloadMaps.map((mapResource) => normalizeLoadedMapPayload(mapResource))
    : [];

  return function loadMapForLevel(levelIndex) {
    if (!Number.isFinite(levelIndex) || levelIndex < 0 || levelIndex >= canonicalMaps.length) {
      return null;
    }

    const baseMap = canonicalMaps[levelIndex];
    if (!baseMap) {
      return null;
    }

    // Always return a fresh clone so runtime mutations never taint canonical maps.
    return cloneMap(baseMap);
  };
}

export function createLevelLoader({
  world,
  mapResourceKey = 'mapResource',
  loadMapForLevel = null,
  onLevelLoaded = null,
  totalLevels = 3,
} = {}) {
  const maxLevelIndex = totalLevels - 1;
  let currentLevelIndex = 0;

  function resolveMapForLevel(levelIndex, loadOptions = {}) {
    if (typeof loadMapForLevel !== 'function') {
      return null;
    }

    return loadMapForLevel(levelIndex, loadOptions);
  }

  function loadLevel(levelIndex, options = {}) {
    const nextLevelIndex = clampLevelIndex(levelIndex, maxLevelIndex);
    const mapResource = normalizeLoadedMapPayload(resolveMapForLevel(nextLevelIndex, options));

    if (!mapResource) {
      return null;
    }

    // The optional level-loaded hook lets runtime bootstrap code synchronize
    // entity state from the freshly loaded map without coupling that work to
    // the map loader's core bookkeeping.
    if (typeof onLevelLoaded === 'function') {
      onLevelLoaded(mapResource, {
        ...options,
        levelIndex: nextLevelIndex,
      });
    }

    currentLevelIndex = nextLevelIndex;

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

  function advanceLevel(reason = 'level-advance') {
    if (currentLevelIndex >= maxLevelIndex) {
      return null;
    }

    const nextReason = typeof reason === 'string' ? reason : 'level-advance';

    const nextLevel = loadLevel(currentLevelIndex + 1, {
      reason: nextReason,
    });

    if (!nextLevel) {
      return false;
    }

    return nextLevel;
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

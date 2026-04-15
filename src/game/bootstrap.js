/*
 * Game runtime bootstrap assembly.
 *
 * This module wires core ECS resources and exposes a fixed-step frame driver
 * for the app entrypoint. It keeps simulation deterministic by using the
 * shared clock resource and explicit phase ordering from the world scheduler.
 *
 * Public API:
 * - createBootstrap(options)
 * - registerSystemsByPhase(world, systemsByPhase)
 */

import level1Map from '../../assets/maps/level-1.json';
import level2Map from '../../assets/maps/level-2.json';
import level3Map from '../../assets/maps/level-3.json';
import { advanceSimTime, createClock, resetClock, tickClock } from '../ecs/resources/clock.js';
import { FIXED_DT_MS, MAX_STEPS_PER_FRAME, TOTAL_LEVELS } from '../ecs/resources/constants.js';
import { createGameStatus } from '../ecs/resources/game-status.js';
import { DEFAULT_PHASE_ORDER, World } from '../ecs/world/world.js';
import { createGameFlow } from './game-flow.js';
import { createLevelLoader, createSyncMapLoader } from './level-loader.js';

const DEFAULT_LEVEL_MAPS = Object.freeze([level1Map, level2Map, level3Map]);
const DEFAULT_LOAD_MAP_FOR_LEVEL = createSyncMapLoader(DEFAULT_LEVEL_MAPS);

function normalizeManifest(manifest) {
  const version =
    manifest && typeof manifest.version === 'string' && manifest.version.trim().length > 0
      ? manifest.version
      : 'v0';
  const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];

  return Object.freeze({
    version,
    assets: Object.freeze(
      assets.map((asset) =>
        Object.freeze({
          ...asset,
        }),
      ),
    ),
  });
}

function createAssetPipelineResource(options = {}) {
  const visualManifest = normalizeManifest(options.visualManifest);
  const audioManifest = normalizeManifest(options.audioManifest);
  const byId = new Map();

  const insertAssets = (assets, kind) => {
    for (const asset of assets) {
      if (!asset || typeof asset.id !== 'string' || asset.id.trim().length === 0) {
        continue;
      }

      const normalizedId = asset.id.trim();
      if (byId.has(normalizedId)) {
        throw new Error(`Duplicate asset id in manifests: ${normalizedId}`);
      }

      byId.set(
        normalizedId,
        Object.freeze({
          ...asset,
          manifestKind: kind,
        }),
      );
    }
  };

  insertAssets(visualManifest.assets, 'visual');
  insertAssets(audioManifest.assets, 'audio');

  return Object.freeze({
    audioManifest,
    getAssetById(assetId) {
      if (typeof assetId !== 'string') {
        return null;
      }

      return byId.get(assetId) || null;
    },
    hasAsset(assetId) {
      if (typeof assetId !== 'string') {
        return false;
      }

      return byId.has(assetId);
    },
    visualManifest,
  });
}

function toFiniteTimestamp(nowMs) {
  if (!Number.isFinite(nowMs)) {
    return 0;
  }

  return nowMs;
}

function normalizeSystemRegistration(phase, registration, index) {
  if (typeof registration === 'function') {
    return {
      name: `${phase}-system-${index}`,
      phase,
      update: registration,
    };
  }

  if (registration && typeof registration.update === 'function') {
    // Detect mismatched phase declarations so configuration errors surface early.
    if (registration.phase && registration.phase !== phase) {
      throw new Error(
        `System "${registration.name || 'unnamed'}" declares phase "${registration.phase}" but is registered under "${phase}".`,
      );
    }

    if (registration.phase) {
      return registration;
    }

    return {
      ...registration,
      phase,
    };
  }

  throw new Error(`Invalid system registration for phase "${phase}" at index ${index}.`);
}

export function registerSystemsByPhase(world, systemsByPhase = {}) {
  for (const phase of DEFAULT_PHASE_ORDER) {
    const registrations = Array.isArray(systemsByPhase[phase]) ? systemsByPhase[phase] : [];

    for (let index = 0; index < registrations.length; index += 1) {
      world.registerSystem(normalizeSystemRegistration(phase, registrations[index], index));
    }
  }
}

export function createBootstrap(options = {}) {
  const nowMs = toFiniteTimestamp(options.now ?? 0);
  const world = options.world || new World();
  const clock = createClock(nowMs);
  const gameStatus = createGameStatus();
  const levelLoader = createLevelLoader({
    loadMapForLevel: options.loadMapForLevel || DEFAULT_LOAD_MAP_FOR_LEVEL,
    mapResourceKey: options.mapResourceKey || 'mapResource',
    totalLevels: TOTAL_LEVELS,
    world,
  });
  const gameFlow = createGameFlow({
    clock,
    gameStatus,
    levelLoader,
    onRestart: () => {
      // Reset simulation clock to zero so timers/counters start fresh.
      resetClock(clock, clock.realTimeMs);
    },
    world,
  });
  const assetPipeline = createAssetPipelineResource(options.assetPipeline || {});

  world.setResource('assetPipeline', assetPipeline);
  world.setResource('clock', clock);
  world.setResource('gameFlow', gameFlow);
  world.setResource('gameStatus', gameStatus);
  world.setResource('levelLoader', levelLoader);

  registerSystemsByPhase(world, options.systemsByPhase || {});

  function stepFrame(
    frameNowMs,
    { fixedDtMs = FIXED_DT_MS, maxStepsPerFrame = MAX_STEPS_PER_FRAME } = {},
  ) {
    const timestamp = toFiniteTimestamp(frameNowMs);
    const steps = tickClock(clock, timestamp, maxStepsPerFrame, fixedDtMs);

    for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
      advanceSimTime(clock, fixedDtMs);
      world.runFixedStep({
        alpha: clock.alpha,
        dtMs: fixedDtMs,
        frameIndex: world.frame,
        isPaused: clock.isPaused,
        simTimeMs: clock.simTimeMs,
      });
    }

    world.runRenderCommit({
      alpha: clock.alpha,
      dtMs: fixedDtMs,
      isPaused: clock.isPaused,
      simTimeMs: clock.simTimeMs,
      stepsThisFrame: steps,
    });

    return {
      alpha: clock.alpha,
      frame: world.frame,
      isPaused: clock.isPaused,
      renderFrame: world.renderFrame,
      simTimeMs: clock.simTimeMs,
      steps,
    };
  }

  function resyncTime(frameNowMs) {
    const timestamp = toFiniteTimestamp(frameNowMs);
    resetClock(clock, timestamp);
  }

  function getInputAdapter() {
    return world.getResource('inputAdapter') || world.getResource('input') || null;
  }

  return {
    clock,
    gameFlow,
    gameStatus,
    getInputAdapter,
    levelLoader,
    resyncTime,
    stepFrame,
    world,
  };
}

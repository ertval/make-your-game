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

import { createSpritePool } from '../adapters/dom/sprite-pool-adapter.js';
import {
  createInputStateStore,
  createPlayerStore,
  resetInputState,
  resetPlayer,
} from '../ecs/components/actors.js';
import {
  createPositionStore,
  createVelocityStore,
  resetPosition,
  resetVelocity,
} from '../ecs/components/spatial.js';
import { advanceSimTime, createClock, resetClock, tickClock } from '../ecs/resources/clock.js';
import { FIXED_DT_MS, MAX_STEPS_PER_FRAME, TOTAL_LEVELS } from '../ecs/resources/constants.js';
import { createGameStatus } from '../ecs/resources/game-status.js';
import { createInputSystem } from '../ecs/systems/input-system.js';
import {
  createPlayerMoveSystem,
  PLAYER_MOVE_REQUIRED_MASK,
} from '../ecs/systems/player-move-system.js';
import { DEFAULT_PHASE_ORDER, World } from '../ecs/world/world.js';
import { createGameFlow } from './game-flow.js';
import { createLevelLoader } from './level-loader.js';

const DEFAULT_PLAYER_RESOURCE_KEY = 'player';
const DEFAULT_POSITION_RESOURCE_KEY = 'position';
const DEFAULT_VELOCITY_RESOURCE_KEY = 'velocity';
const DEFAULT_INPUT_STATE_RESOURCE_KEY = 'inputState';
const DEFAULT_PLAYER_ENTITY_RESOURCE_KEY = 'playerEntity';

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

/**
 * Build the default runtime system stack for input sampling and player movement.
 *
 * @param {object} [options] - Optional resource-key overrides shared with bootstrap.
 * @returns {Record<string, Array<object>>} Phase-keyed ECS system registrations.
 */
function createDefaultSystemsByPhase(options = {}) {
  const adapterResourceKey = options.adapterResourceKey || 'inputAdapter';
  const inputStateResourceKey = options.inputStateResourceKey || DEFAULT_INPUT_STATE_RESOURCE_KEY;
  const playerResourceKey = options.playerResourceKey || DEFAULT_PLAYER_RESOURCE_KEY;
  const positionResourceKey = options.positionResourceKey || DEFAULT_POSITION_RESOURCE_KEY;
  const velocityResourceKey = options.velocityResourceKey || DEFAULT_VELOCITY_RESOURCE_KEY;
  const mapResourceKey = options.mapResourceKey || 'mapResource';

  const inputSystem = createInputSystem({
    adapterResourceKey,
    inputStateResourceKey,
  });
  inputSystem.resourceCapabilities = {
    read: [adapterResourceKey, inputStateResourceKey],
    write: [inputStateResourceKey],
  };

  const playerMoveSystem = createPlayerMoveSystem({
    inputStateResourceKey,
    mapResourceKey,
    playerResourceKey,
    positionResourceKey,
    velocityResourceKey,
  });
  playerMoveSystem.resourceCapabilities = {
    read: [
      inputStateResourceKey,
      mapResourceKey,
      playerResourceKey,
      positionResourceKey,
      velocityResourceKey,
    ],
    write: [playerResourceKey, positionResourceKey, velocityResourceKey],
  };

  return {
    input: [inputSystem],
    physics: [playerMoveSystem],
  };
}

/**
 * Merge default runtime systems with caller-provided registrations.
 *
 * @param {Record<string, Array<object>>} defaultSystemsByPhase - Built-in phase registrations.
 * @param {Record<string, Array<object>>} [systemsByPhase={}] - Additional registrations to append.
 * @returns {Record<string, Array<object>>} Combined phase registrations in deterministic order.
 */
function mergeSystemsByPhase(defaultSystemsByPhase, systemsByPhase = {}) {
  const mergedSystemsByPhase = {};

  for (const phase of DEFAULT_PHASE_ORDER) {
    mergedSystemsByPhase[phase] = [
      ...(Array.isArray(defaultSystemsByPhase[phase]) ? defaultSystemsByPhase[phase] : []),
      ...(Array.isArray(systemsByPhase[phase]) ? systemsByPhase[phase] : []),
    ];
  }

  return mergedSystemsByPhase;
}

/**
 * Ensure a world resource exists before runtime systems start reading it.
 *
 * @param {World} world - ECS world receiving the resource.
 * @param {string} resourceKey - Resource map key.
 * @param {Function} createResource - Factory for the missing resource.
 * @returns {unknown} The existing or newly created resource instance.
 */
function ensureWorldResource(world, resourceKey, createResource) {
  if (!world.hasResource(resourceKey)) {
    world.setResource(resourceKey, createResource());
  }

  return world.getResource(resourceKey);
}

/**
 * Allocate the movement stores required by the default runtime wiring.
 *
 * @param {World} world - ECS world receiving the component stores.
 * @param {object} [options] - Optional resource-key overrides shared with bootstrap.
 */
function initializeMovementResources(world, options = {}) {
  const playerResourceKey = options.playerResourceKey || DEFAULT_PLAYER_RESOURCE_KEY;
  const positionResourceKey = options.positionResourceKey || DEFAULT_POSITION_RESOURCE_KEY;
  const velocityResourceKey = options.velocityResourceKey || DEFAULT_VELOCITY_RESOURCE_KEY;
  const inputStateResourceKey = options.inputStateResourceKey || DEFAULT_INPUT_STATE_RESOURCE_KEY;
  const playerEntityResourceKey =
    options.playerEntityResourceKey || DEFAULT_PLAYER_ENTITY_RESOURCE_KEY;
  const maxEntities = world.entityStore.maxEntities;

  ensureWorldResource(world, playerResourceKey, () => createPlayerStore(maxEntities));
  ensureWorldResource(world, positionResourceKey, () => createPositionStore(maxEntities));
  ensureWorldResource(world, velocityResourceKey, () => createVelocityStore(maxEntities));
  ensureWorldResource(world, inputStateResourceKey, () => createInputStateStore(maxEntities));

  if (!world.hasResource(playerEntityResourceKey)) {
    world.setResource(playerEntityResourceKey, null);
  }
}

/**
 * Remove the currently tracked player entity handle from the world.
 *
 * @param {World} world - ECS world that owns the entity.
 * @param {string} playerEntityResourceKey - Resource key holding the player handle.
 */
function clearPlayerEntity(world, playerEntityResourceKey) {
  const playerHandle = world.getResource(playerEntityResourceKey);

  if (world.entityStore.isAlive(playerHandle)) {
    world.destroyEntity(playerHandle);
  }

  world.setResource(playerEntityResourceKey, null);
}

/**
 * Spawn or reset the runtime player entity from a freshly loaded map resource.
 *
 * @param {World} world - ECS world receiving the player state.
 * @param {MapResource | null | undefined} mapResource - Newly loaded map data.
 * @param {object} [options] - Optional resource-key overrides shared with bootstrap.
 * @returns {{ id: number, generation: number } | null} Alive player handle or null when no spawn exists.
 */
function syncPlayerEntityFromMap(world, mapResource, options = {}) {
  const playerResourceKey = options.playerResourceKey || DEFAULT_PLAYER_RESOURCE_KEY;
  const positionResourceKey = options.positionResourceKey || DEFAULT_POSITION_RESOURCE_KEY;
  const velocityResourceKey = options.velocityResourceKey || DEFAULT_VELOCITY_RESOURCE_KEY;
  const inputStateResourceKey = options.inputStateResourceKey || DEFAULT_INPUT_STATE_RESOURCE_KEY;
  const playerEntityResourceKey =
    options.playerEntityResourceKey || DEFAULT_PLAYER_ENTITY_RESOURCE_KEY;

  if (
    !mapResource ||
    !Number.isFinite(mapResource.playerSpawnRow) ||
    !Number.isFinite(mapResource.playerSpawnCol)
  ) {
    clearPlayerEntity(world, playerEntityResourceKey);
    return null;
  }

  let playerHandle = world.getResource(playerEntityResourceKey);
  if (!world.entityStore.isAlive(playerHandle)) {
    playerHandle = world.createEntity(PLAYER_MOVE_REQUIRED_MASK);
    world.setResource(playerEntityResourceKey, playerHandle);
  } else {
    playerHandle = world.setEntityMask(playerHandle, PLAYER_MOVE_REQUIRED_MASK);
  }

  const entityId = playerHandle.id;
  const playerStore = world.getResource(playerResourceKey);
  const positionStore = world.getResource(positionResourceKey);
  const velocityStore = world.getResource(velocityResourceKey);
  const inputState = world.getResource(inputStateResourceKey);
  const spawnRow = mapResource.playerSpawnRow;
  const spawnCol = mapResource.playerSpawnCol;

  // Resetting recycled slots avoids stale simulation data leaking across
  // level transitions or restart-driven entity recreation.
  resetPlayer(playerStore, entityId);
  resetPosition(positionStore, entityId);
  resetVelocity(velocityStore, entityId);
  resetInputState(inputState, entityId);

  // The player begins centered on the map-defined spawn tile with no pending move.
  positionStore.row[entityId] = spawnRow;
  positionStore.col[entityId] = spawnCol;
  positionStore.prevRow[entityId] = spawnRow;
  positionStore.prevCol[entityId] = spawnCol;
  positionStore.targetRow[entityId] = spawnRow;
  positionStore.targetCol[entityId] = spawnCol;

  return playerHandle;
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
  const playerEntityResourceKey =
    options.playerEntityResourceKey || DEFAULT_PLAYER_ENTITY_RESOURCE_KEY;
  const spritePoolResourceKey = options.spritePoolResourceKey || 'spritePool';
  const clock = createClock(nowMs);
  const gameStatus = createGameStatus();

  // Movement systems need their component stores present before fixed-step work begins.
  initializeMovementResources(world, options);

  // Pre-allocate the sprite pool if a container element is provided. The pool
  // is warmed up once here and reset on every level load so active elements
  // are reclaimed before entity state is rebuilt from the new map.
  const spritePool = options.spriteContainer
    ? createSpritePool({ document: options.document ?? globalThis.document, dev: options.dev })
    : null;

  if (spritePool && options.spriteContainer) {
    spritePool.warmUp(options.spriteContainer);
    world.setResource(spritePoolResourceKey, spritePool);
  }

  const levelLoader = createLevelLoader({
    loadMapForLevel: options.loadMapForLevel,
    mapResourceKey: options.mapResourceKey || 'mapResource',
    onLevelLoaded: (mapResource) => {
      // Reclaim all active sprite elements before entities are rebuilt from the
      // new map so the pool starts each level in a fully-idle state.
      if (spritePool) {
        spritePool.reset();
      }
      syncPlayerEntityFromMap(world, mapResource, options);
    },
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

  registerSystemsByPhase(
    world,
    mergeSystemsByPhase(createDefaultSystemsByPhase(options), options.systemsByPhase),
  );

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
    return world.getResource('inputAdapter') || null;
  }

  return {
    clock,
    gameFlow,
    gameStatus,
    getInputAdapter,
    levelLoader,
    playerEntityResourceKey,
    resyncTime,
    stepFrame,
    world,
  };
}

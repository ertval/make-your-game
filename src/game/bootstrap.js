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
 *
 * B-05 note: The default runtime registers an `eventQueue` resource so Track B
 * systems that support event emission (collision-system, player-move-system)
 * can enqueue events without importing bootstrap or adapter modules directly.
 * The resource key can be customised via `options.eventQueueResourceKey`.
 */

import { createBoardAdapter } from '../adapters/dom/renderer-adapter.js';
import { updateBoardCss } from '../adapters/dom/renderer-board-css.js';
import { createSpritePool } from '../adapters/dom/sprite-pool-adapter.js';
import { createAudioCueRunner } from '../adapters/io/audio-integration.js';
import { assertValidInputAdapter } from '../adapters/io/input-adapter.js';
import {
  createGhostStore,
  createInputStateStore,
  createPlayerStore,
  resetGhost,
  resetInputState,
  resetPlayer,
} from '../ecs/components/actors.js';
import { COMPONENT_MASK } from '../ecs/components/registry.js';
import {
  COLLIDER_TYPE,
  createPositionStore,
  createVelocityStore,
  resetPosition,
  resetVelocity,
} from '../ecs/components/spatial.js';
import {
  createRenderableStore,
  createVisualStateStore,
  RENDERABLE_KIND,
  resetRenderable,
  resetVisualState,
} from '../ecs/components/visual.js';
import { createRenderIntentBuffer, resetRenderIntentBuffer } from '../ecs/render-intent.js';
import {
  advanceSimTime,
  createClock,
  resetClock,
  resyncBaseline,
  tickClock,
} from '../ecs/resources/clock.js';
import {
  FIXED_DT_MS,
  GHOST_STATE,
  GHOST_TYPE,
  MAX_RENDER_INTENTS,
  MAX_STEPS_PER_FRAME,
  TOTAL_LEVELS,
} from '../ecs/resources/constants.js';
import { createEventQueue } from '../ecs/resources/event-queue.js';
import { createGameStatus } from '../ecs/resources/game-status.js';
import { createBoardSyncSystem } from '../ecs/systems/board-sync-system.js';
import { createCollisionSystem } from '../ecs/systems/collision-system.js';
import { createGhostAiSystem, GHOST_AI_REQUIRED_MASK } from '../ecs/systems/ghost-ai-system.js';
import { createGhostAnimationSystem } from '../ecs/systems/ghost-animation-system.js';
import { createHudSystem } from '../ecs/systems/hud-system.js';
import { createInputSystem } from '../ecs/systems/input-system.js';
import { createLevelProgressSystem } from '../ecs/systems/level-progress-system.js';
import { createLifeSystem } from '../ecs/systems/life-system.js';
import { createPauseInputSystem } from '../ecs/systems/pause-input-system.js';
import { createPauseSystem } from '../ecs/systems/pause-system.js';
import { createPlayerAnimationSystem } from '../ecs/systems/player-animation-system.js';
import {
  createPlayerMoveSystem,
  PLAYER_MOVE_REQUIRED_MASK,
} from '../ecs/systems/player-move-system.js';
import { createRenderCollectSystem } from '../ecs/systems/render-collect-system.js';
import { createRenderDomSystem } from '../ecs/systems/render-dom-system.js';
import { createDefaultScoreState, createScoringSystem } from '../ecs/systems/scoring-system.js';
import { createScreensSystem } from '../ecs/systems/screens-system.js';
import { createInitialSpawnState, createSpawnSystem } from '../ecs/systems/spawn-system.js';
import { createTimerSystem } from '../ecs/systems/timer-system.js';
import { DEFAULT_PHASE_ORDER, World } from '../ecs/world/world.js';
import { isDevelopment } from '../shared/env.js';
import { createGameFlow } from './game-flow.js';
import { createLevelLoader } from './level-loader.js';
import {
  createBombExplosionLogicSystems,
  initializeBombExplosionResources,
} from './runtime-bomb-explosion-wiring.js';

const DEFAULT_PLAYER_RESOURCE_KEY = 'player';
const DEFAULT_POSITION_RESOURCE_KEY = 'position';
const DEFAULT_VELOCITY_RESOURCE_KEY = 'velocity';
const DEFAULT_INPUT_ADAPTER_RESOURCE_KEY = 'inputAdapter';
const DEFAULT_INPUT_STATE_RESOURCE_KEY = 'inputState';
const DEFAULT_PLAYER_ENTITY_RESOURCE_KEY = 'playerEntity';
// D-01 canonical resource key for the cross-system deterministic event queue.
const DEFAULT_EVENT_QUEUE_RESOURCE_KEY = 'eventQueue';
const DEFAULT_GHOST_RESOURCE_KEY = 'ghost';
const DEFAULT_GHOST_ENTITIES_RESOURCE_KEY = 'ghostEntities';
const DEFAULT_GHOST_IDS_RESOURCE_KEY = 'ghostIds';
const DEFAULT_GHOST_SPAWN_STATE_RESOURCE_KEY = 'ghostSpawnState';
// Canonical world-resource key for the runtime audio adapter (C-06 contract).
const DEFAULT_AUDIO_RESOURCE_KEY = 'audio';

/**
 * Thin render-phase wrapper around the C-07 audio cue runner.
 *
 * The wrapper adds no audio logic; it only resolves world resources and
 * forwards them to the runner, which maps drained gameplay events onto SFX
 * cues and reconciles music against the current game state. It runs in the
 * `render` phase so it observes every logic-phase event emitted this frame.
 *
 * @param {{ eventQueueResourceKey?: string, gameStatusResourceKey?: string, audioResourceKey?: string }} [options]
 * @returns {object} A registrable render-phase system.
 */
function createAudioCueSystem(options = {}) {
  const eventQueueResourceKey = options.eventQueueResourceKey || DEFAULT_EVENT_QUEUE_RESOURCE_KEY;
  const gameStatusResourceKey = options.gameStatusResourceKey || 'gameStatus';
  const audioResourceKey = options.audioResourceKey || DEFAULT_AUDIO_RESOURCE_KEY;
  const bombAudioActiveResourceKey = options.bombAudioActiveResourceKey || 'bombAudioActive';
  const runner = createAudioCueRunner();

  return {
    name: 'audio-cue-system',
    phase: 'render',
    resourceCapabilities: {
      read: [
        audioResourceKey,
        eventQueueResourceKey,
        gameStatusResourceKey,
        bombAudioActiveResourceKey,
      ],
      // drain() clears the queue, so this system writes the event-queue resource.
      write: [eventQueueResourceKey],
    },
    update(context) {
      runner.tick({
        audio: context.world.getResource(audioResourceKey),
        eventQueue: context.world.getResource(eventQueueResourceKey),
        gameStatus: context.world.getResource(gameStatusResourceKey),
        bombActive: context.world.getResource(bombAudioActiveResourceKey) === true,
      });
    },
  };
}

// Full mask applied to a ghost entity once the spawn-system releases it. The
// AI query mask is widened with RENDERABLE and COLLIDER so the released ghost
// gets rendered and participates in collisions immediately.
const GHOST_RUNTIME_MASK =
  GHOST_AI_REQUIRED_MASK | COMPONENT_MASK.RENDERABLE | COMPONENT_MASK.COLLIDER;

/**
 * Resolve the input adapter resource key from bootstrap options.
 *
 * Both `inputAdapterResourceKey` and the older `adapterResourceKey` names are
 * honored so callers that wire the system directly do not silently break while
 * we migrate everything to the explicit bootstrap API.
 *
 * @param {object} [options={}] - Bootstrap options.
 * @returns {string} Resolved resource key for the input adapter slot.
 */
function resolveInputAdapterResourceKey(options = {}) {
  if (
    typeof options.inputAdapterResourceKey === 'string' &&
    options.inputAdapterResourceKey.length > 0
  ) {
    return options.inputAdapterResourceKey;
  }

  if (typeof options.adapterResourceKey === 'string' && options.adapterResourceKey.length > 0) {
    return options.adapterResourceKey;
  }

  return DEFAULT_INPUT_ADAPTER_RESOURCE_KEY;
}

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

function normalizeEntityCapacity(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return MAX_RENDER_INTENTS;
  }

  return Math.floor(value);
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
  const adapterResourceKey = resolveInputAdapterResourceKey(options);
  const inputStateResourceKey = options.inputStateResourceKey || DEFAULT_INPUT_STATE_RESOURCE_KEY;
  const playerResourceKey = options.playerResourceKey || DEFAULT_PLAYER_RESOURCE_KEY;
  const positionResourceKey = options.positionResourceKey || DEFAULT_POSITION_RESOURCE_KEY;
  const velocityResourceKey = options.velocityResourceKey || DEFAULT_VELOCITY_RESOURCE_KEY;
  const mapResourceKey = options.mapResourceKey || 'mapResource';
  // B-05: thread the event queue key so Track B systems can enqueue events
  // through the world resource API without importing bootstrap or adapters.
  const eventQueueResourceKey = options.eventQueueResourceKey || DEFAULT_EVENT_QUEUE_RESOURCE_KEY;

  const inputSystem = createInputSystem({
    adapterResourceKey,
    inputStateResourceKey,
  });
  inputSystem.resourceCapabilities = {
    read: [adapterResourceKey, inputStateResourceKey],
    write: [inputStateResourceKey],
  };

  // The player-move system declares its own resourceCapabilities (including
  // the conditional `write` capability on the event queue when wired), so we
  // pass the keys in and trust the system's own declaration.
  const playerMoveSystem = createPlayerMoveSystem({
    eventQueueResourceKey,
    inputStateResourceKey,
    mapResourceKey,
    playerResourceKey,
    positionResourceKey,
    velocityResourceKey,
  });

  const renderCollectSystem = createRenderCollectSystem();
  const renderDomSystem = createRenderDomSystem();
  const screensSystem = createScreensSystem({
    screensAdapterResourceKey: options.screensAdapterResourceKey,
    storageProviderResourceKey: options.storageProviderResourceKey,
  });

  return {
    meta: [inputSystem, createPauseInputSystem(), createPauseSystem()],
    physics: [playerMoveSystem, createGhostAiSystem()],
    render: [
      createHudSystem({ hudElementsResourceKey: options.hudElementsResourceKey }),
      screensSystem,
      renderCollectSystem,
      renderDomSystem,
      // Audio is a downstream feedback channel: appended last in `render` so it
      // drains every gameplay event emitted by the logic phase this frame.
      createAudioCueSystem({ eventQueueResourceKey }),
    ],
    logic: [
      createCollisionSystem({
        eventQueueResourceKey,
        mapResourceKey,
        positionResourceKey,
      }),
      createTimerSystem(),
      createScoringSystem(),
      createLifeSystem({ eventQueueResourceKey }),
      createLevelProgressSystem({ eventQueueResourceKey }),
      createSpawnSystem(),
      // The release-bridge must run after createSpawnSystem so it observes the
      // freshly updated releasedGhostIds list before the next physics phase.
      createGhostReleaseSystem(),
      // Ghost-animation-system writes renderable.spriteId and visualState bits
      // for every released ghost so the render phase can pick the right
      // per-personality walk frame, stunned, or dead variant.
      createGhostAnimationSystem(),
      ...createBombExplosionLogicSystems({
        ...options,
        eventQueueResourceKey,
        inputStateResourceKey,
        mapResourceKey,
        playerResourceKey,
        positionResourceKey,
      }),
    ],
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
  const maxEntities =
    Number.isFinite(options.maxEntities) && options.maxEntities > 0
      ? Math.floor(options.maxEntities)
      : world.getMaxEntities();

  ensureWorldResource(world, playerResourceKey, () => createPlayerStore(maxEntities));
  ensureWorldResource(world, positionResourceKey, () => createPositionStore(maxEntities));
  ensureWorldResource(world, velocityResourceKey, () => createVelocityStore(maxEntities));
  ensureWorldResource(world, inputStateResourceKey, () => createInputStateStore(maxEntities));
  ensureWorldResource(world, 'renderable', () => createRenderableStore(maxEntities));
  ensureWorldResource(world, 'visualState', () => createVisualStateStore(maxEntities));
  ensureWorldResource(world, DEFAULT_GHOST_RESOURCE_KEY, () => createGhostStore(maxEntities));

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

  if (world.isEntityAlive(playerHandle)) {
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

  const PLAYER_WITH_RENDERABLE_MASK =
    PLAYER_MOVE_REQUIRED_MASK | COMPONENT_MASK.RENDERABLE | COMPONENT_MASK.COLLIDER;

  let playerHandle = world.getResource(playerEntityResourceKey);
  if (!world.isEntityAlive(playerHandle)) {
    playerHandle = world.createEntity(PLAYER_WITH_RENDERABLE_MASK);
    world.setResource(playerEntityResourceKey, playerHandle);
  } else {
    world.setEntityMask(playerHandle, PLAYER_WITH_RENDERABLE_MASK);
  }

  const entityId = playerHandle.id;
  const playerStore = world.getResource(playerResourceKey);
  const positionStore = world.getResource(positionResourceKey);
  const velocityStore = world.getResource(velocityResourceKey);
  const inputState = world.getResource(inputStateResourceKey);
  const renderableStore = world.getResource('renderable');
  const visualStateStore = world.getResource('visualState');
  const spawnRow = mapResource.playerSpawnRow;
  const spawnCol = mapResource.playerSpawnCol;

  // Resetting recycled slots avoids stale simulation data leaking across
  // level transitions or restart-driven entity recreation.
  resetPlayer(playerStore, entityId);
  resetPosition(positionStore, entityId);
  resetVelocity(velocityStore, entityId);
  resetInputState(inputState, entityId);
  resetRenderable(renderableStore, entityId);
  resetVisualState(visualStateStore, entityId);
  const colliderStore = world.getResource('collider');
  if (colliderStore) {
    colliderStore.type[entityId] = COLLIDER_TYPE.PLAYER;
  }

  // Set renderable kind so player appears in render-collect-system queries
  renderableStore.kind[entityId] = RENDERABLE_KIND.PLAYER;
  renderableStore.spriteId[entityId] = 0;

  // The player begins centered on the map-defined spawn tile with no pending move.
  positionStore.row[entityId] = spawnRow;
  positionStore.col[entityId] = spawnCol;
  positionStore.prevRow[entityId] = spawnRow;
  positionStore.prevCol[entityId] = spawnCol;
  positionStore.targetRow[entityId] = spawnRow;
  positionStore.targetCol[entityId] = spawnCol;

  return playerHandle;
}

/**
 * Destroy any ghost entities tracked in the world resource and clear the
 * deterministic id list. Called before each level (re)load so recycled slots
 * never leak state between maps or restart cycles.
 *
 * @param {World} world - ECS world owning the ghost entities.
 * @param {string} ghostEntitiesResourceKey - Resource key holding the handle list.
 * @param {string} ghostIdsResourceKey - Resource key holding the deterministic id list.
 */
function clearGhostEntities(world, ghostEntitiesResourceKey, ghostIdsResourceKey) {
  const handles = world.getResource(ghostEntitiesResourceKey);
  if (Array.isArray(handles)) {
    for (const handle of handles) {
      if (handle && world.isEntityAlive(handle)) {
        world.destroyEntity(handle);
      }
    }
  }
  world.setResource(ghostEntitiesResourceKey, []);
  world.setResource(ghostIdsResourceKey, []);
}

/**
 * Create the ghost entities for the active map.
 *
 * Ghosts are created in the deterministic order defined by
 * `mapResource.activeGhostTypes` (Blinky, Pinky, Inky, Clyde) with an initial
 * mask of 0 so they do not appear in any ECS query until the spawn system
 * releases them per the staggered delays in `GHOST_SPAWN_DELAYS`. The
 * companion `ghost-release-system` flips each ghost's mask to
 * `GHOST_RUNTIME_MASK` the first time it shows up in
 * `ghostSpawnState.releasedGhostIds`.
 *
 * @param {World} world - ECS world receiving the ghost entities.
 * @param {MapResource | null | undefined} mapResource - Newly loaded map data.
 * @param {object} [options] - Optional resource-key overrides shared with bootstrap.
 */
function syncGhostEntitiesFromMap(world, mapResource, options = {}) {
  const ghostResourceKey = options.ghostResourceKey || DEFAULT_GHOST_RESOURCE_KEY;
  const positionResourceKey = options.positionResourceKey || DEFAULT_POSITION_RESOURCE_KEY;
  const velocityResourceKey = options.velocityResourceKey || DEFAULT_VELOCITY_RESOURCE_KEY;
  const ghostEntitiesResourceKey =
    options.ghostEntitiesResourceKey || DEFAULT_GHOST_ENTITIES_RESOURCE_KEY;
  const ghostIdsResourceKey = options.ghostIdsResourceKey || DEFAULT_GHOST_IDS_RESOURCE_KEY;

  clearGhostEntities(world, ghostEntitiesResourceKey, ghostIdsResourceKey);

  if (
    !mapResource ||
    !Number.isFinite(mapResource.ghostSpawnRow) ||
    !Number.isFinite(mapResource.ghostSpawnCol)
  ) {
    return;
  }

  const maxGhosts = Math.max(0, Math.floor(Number(mapResource.maxGhosts) || 0));
  if (maxGhosts === 0) {
    return;
  }

  const fallbackTypes = [GHOST_TYPE.BLINKY, GHOST_TYPE.PINKY, GHOST_TYPE.INKY, GHOST_TYPE.CLYDE];
  const activeTypes = Array.isArray(mapResource.activeGhostTypes)
    ? mapResource.activeGhostTypes
    : fallbackTypes;

  const ghostStore = world.getResource(ghostResourceKey);
  const positionStore = world.getResource(positionResourceKey);
  const velocityStore = world.getResource(velocityResourceKey);
  const renderableStore = world.getResource('renderable');
  const visualStateStore = world.getResource('visualState');
  const colliderStore = world.getResource('collider');

  if (!ghostStore || !positionStore || !velocityStore || !renderableStore || !visualStateStore) {
    return;
  }

  const spawnRow = mapResource.ghostSpawnRow;
  const spawnCol = mapResource.ghostSpawnCol;
  const ghostSpeed = Number(mapResource.ghostSpeed) || 0;

  const handles = [];
  const ghostIds = [];

  for (let index = 0; index < maxGhosts; index += 1) {
    // Ghost begins masked-out so it stays invisible and is skipped by the AI
    // query until the spawn system releases it on its staggered timer.
    const handle = world.createEntity(0);
    const entityId = handle.id;

    resetGhost(ghostStore, entityId);
    resetPosition(positionStore, entityId);
    resetVelocity(velocityStore, entityId);
    resetRenderable(renderableStore, entityId);
    resetVisualState(visualStateStore, entityId);

    const ghostType = activeTypes[index] ?? fallbackTypes[index] ?? GHOST_TYPE.BLINKY;
    ghostStore.type[entityId] = ghostType;
    ghostStore.state[entityId] = GHOST_STATE.NORMAL;
    ghostStore.timerMs[entityId] = 0;
    ghostStore.speed[entityId] = ghostSpeed;

    positionStore.row[entityId] = spawnRow;
    positionStore.col[entityId] = spawnCol;
    positionStore.prevRow[entityId] = spawnRow;
    positionStore.prevCol[entityId] = spawnCol;
    positionStore.targetRow[entityId] = spawnRow;
    positionStore.targetCol[entityId] = spawnCol;

    renderableStore.kind[entityId] = RENDERABLE_KIND.GHOST;
    renderableStore.spriteId[entityId] = 0;

    if (colliderStore) {
      colliderStore.type[entityId] = COLLIDER_TYPE.GHOST;
    }

    handles.push(handle);
    ghostIds.push(entityId);
  }

  world.setResource(ghostEntitiesResourceKey, handles);
  world.setResource(ghostIdsResourceKey, ghostIds);
}

/**
 * Bridge the C-03 spawn-timing state (`ghostSpawnState.releasedGhostIds`) with
 * the ECS query system by promoting each released ghost entity to the full
 * runtime mask the first time it appears in the released set.
 *
 * The mask transition is edge-triggered: once flipped to `GHOST_RUNTIME_MASK`
 * we leave it alone so the AI system can still process DEAD/eyes-return
 * frames during the respawn penalty (the spawn-system temporarily prunes the
 * dead ghost from `releasedGhostIds` while its respawn timer is pending).
 *
 * @param {object} [options] - Resource key overrides.
 * @returns {object} ECS logic-phase system descriptor.
 */
function createGhostReleaseSystem(options = {}) {
  const ghostEntitiesResourceKey =
    options.ghostEntitiesResourceKey || DEFAULT_GHOST_ENTITIES_RESOURCE_KEY;
  const spawnResourceKey = options.spawnResourceKey || DEFAULT_GHOST_SPAWN_STATE_RESOURCE_KEY;

  return {
    name: 'ghost-release-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [ghostEntitiesResourceKey, spawnResourceKey],
      write: [],
    },
    update(context) {
      const world = context.world;
      const handles = world.getResource(ghostEntitiesResourceKey);
      if (!Array.isArray(handles) || handles.length === 0) {
        return;
      }

      const spawnState = world.getResource(spawnResourceKey);
      const releasedIds = spawnState?.releasedGhostIds;
      if (!Array.isArray(releasedIds) || releasedIds.length === 0) {
        return;
      }

      const releasedSet = new Set(releasedIds);

      for (const handle of handles) {
        if (!handle || !world.isEntityAlive(handle)) {
          continue;
        }

        if (!releasedSet.has(handle.id)) {
          continue;
        }

        if (world.getEntityMask(handle) === 0) {
          // The per-system world view forbids direct entity-mask mutations
          // during a phase tick, so we defer the change to the post-phase
          // mutation flush instead.
          world.deferSetEntityMask(handle, GHOST_RUNTIME_MASK);
        }
      }
    },
  };
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
  let registeredRenderer = null;

  /**
   * Register (or clear) the frame renderer driven by the bootstrap step loop.
   *
   * The bootstrap calls `renderer.update(renderIntent)` once per `stepFrame`
   * after `runRenderCommit`. Passing `null` or `undefined` clears the slot and
   * invokes `previous.destroy()` if defined, mirroring `setInputAdapter`'s
   * teardown semantics so test runtimes can be cleanly stopped and restarted.
   *
   * @typedef {{ update(buffer: object): void, destroy?: () => void }} BootstrapRenderer
   * @param {BootstrapRenderer | null | undefined} renderer - Renderer to install,
   *   or null/undefined to clear the slot.
   * @returns {BootstrapRenderer | null} The renderer now stored in the slot.
   */
  function registerRenderer(renderer) {
    if (renderer === null || renderer === undefined) {
      const previous = registeredRenderer;
      registeredRenderer = null;
      if (previous && typeof previous.destroy === 'function') {
        previous.destroy();
      }
      return null;
    }

    if (typeof renderer.update !== 'function') {
      throw new Error('registerRenderer requires a renderer with an update(buffer) method.');
    }

    if (
      registeredRenderer &&
      registeredRenderer !== renderer &&
      typeof registeredRenderer.destroy === 'function'
    ) {
      registeredRenderer.destroy();
    }

    registeredRenderer = renderer;
    return renderer;
  }

  const nowMs = toFiniteTimestamp(options.now ?? 0);
  const requestedMaxEntities = normalizeEntityCapacity(options.maxEntities);
  const world = options.world || new World({ maxEntities: requestedMaxEntities });
  const maxEntities =
    typeof world.getMaxEntities === 'function' ? world.getMaxEntities() : requestedMaxEntities;
  const inputAdapterResourceKey = resolveInputAdapterResourceKey(options);
  const playerEntityResourceKey =
    options.playerEntityResourceKey || DEFAULT_PLAYER_ENTITY_RESOURCE_KEY;
  const clock = createClock(nowMs);
  const gameStatus = createGameStatus();

  // Resolve a single now-source for restart resyncs. Tests wire a synthetic
  // `nowProvider` so the restart path stays deterministic; production falls
  // back to `performance.now` (or `Date.now` in non-browser hosts) only when
  // no provider is supplied.
  const nowProvider =
    typeof options.nowProvider === 'function'
      ? options.nowProvider
      : () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // Movement systems need their component stores present before fixed-step work begins.
  initializeMovementResources(world, { ...options, maxEntities });
  // Bomb and explosion systems need prop stores and pooled entities before logic-phase ticks.
  initializeBombExplosionResources(world, { ...options, maxEntities });
  // Pre-register the adapter slot so runtime wiring has one explicit resource key
  // and systems never have to distinguish "never registered" from "registered null".
  ensureWorldResource(world, inputAdapterResourceKey, () => null);
  ensureWorldResource(world, options.hudAdapterResourceKey || 'hudAdapter', () => null);
  ensureWorldResource(world, options.screensAdapterResourceKey || 'screensAdapter', () => null);
  ensureWorldResource(world, options.storageProviderResourceKey || 'storageProvider', () => null);

  // Create sprite pool and board adapter early for onLevelLoaded callback.
  // Headless tests have no document, so DOM rendering safely no-ops there.
  const spritePool =
    typeof document !== 'undefined' ? createSpritePool({ dev: isDevelopment() }) : null;
  const boardAdapter = createBoardAdapter({ spritePool });
  const boardContainerElement = options.boardContainerElement || null;

  const levelLoader = createLevelLoader({
    loadMapForLevel: options.loadMapForLevel,
    mapResourceKey: options.mapResourceKey || 'mapResource',
    onLevelLoaded: (mapResource) => {
      if (boardContainerElement) {
        // The browser entrypoint resolves the board container once so level
        // reloads stay independent from a hard-coded DOM lookup.
        boardAdapter.generateBoard(mapResource, boardContainerElement);
      }
      updateBoardCss(mapResource);
      syncPlayerEntityFromMap(world, mapResource, options);
      syncGhostEntitiesFromMap(world, mapResource, options);
      // BUG-01: level transition must reset frame counters so fixed-step
      // progression restarts cleanly for the new level.
      world.frame = 0;
      world.renderFrame = 0;
    },
    totalLevels: TOTAL_LEVELS,
    world,
  });
  const gameFlow = createGameFlow({
    clock,
    gameStatus,
    levelLoader,
    onRestart: () => {
      // BUG-01: use the injected nowProvider so synthetic test clocks remain
      // deterministic across restarts, falling back to the real wall clock
      // only when no provider is supplied.
      resetClock(clock, toFiniteTimestamp(nowProvider()));
      // Restart should reset frame counters so fixed-step progression restarts cleanly.
      world.frame = 0;
      world.renderFrame = 0;
      // Reset quarantine state so failure-frame arrays and quarantinedUntilFrame
      // from the previous run don't reference stale absolute frame numbers.
      if (typeof world.resetFaultState === 'function') {
        world.resetFaultState();
      }
      // Restart destroys all entities, so runtime object pools must be rebuilt
      // before bomb and explosion systems can query pooled prop entities again.
      initializeBombExplosionResources(world, options);

      // C-05: Reset gameplay stats so a new game/restart doesn't leak old data.
      world.setResource('scoreState', createDefaultScoreState());
      world.setResource('levelTimer', { remainingSeconds: 0, activeLevel: -1 });
      world.setResource('playerLife', {
        lives: 3,
        isInvincible: false,
        invincibilityRemainingMs: 0,
      });
      world.setResource('ghostSpawnState', createInitialSpawnState());
      world.setResource('collisionIntents', []);
      world.setResource('deadGhostIds', []);
      world.setResource('pauseIntent', { restart: false, toggle: false });

      // D-09: Reset sprite pool so old sprites are returned to idle state.
      // This combined with render-dom-system's frame-0 map clear ensures
      // that sprites are correctly re-acquired for new entities.
      const spritePool = world.getResource('spritePool');
      if (spritePool && typeof spritePool.reset === 'function') {
        spritePool.reset();
      }
    },
    world,
  });
  // Auto-start in browser only to render the board for demo purposes
  if (typeof window !== 'undefined') {
    gameFlow.startGame();
  }
  const assetPipeline = createAssetPipelineResource(options.assetPipeline || {});

  world.setResource('assetPipeline', assetPipeline);
  world.setResource('clock', clock);
  // B-05: Register the canonical event queue resource so Track B simulation
  // systems can emit deterministic cross-system events without importing
  // bootstrap or adapter modules. Systems access this only via world.getResource.
  const eventQueueResourceKey = options.eventQueueResourceKey || DEFAULT_EVENT_QUEUE_RESOURCE_KEY;
  ensureWorldResource(world, eventQueueResourceKey, createEventQueue);
  world.setResource('gameFlow', gameFlow);
  world.setResource('gameStatus', gameStatus);
  world.setResource('levelLoader', levelLoader);
  world.setResource('renderIntent', createRenderIntentBuffer());
  world.setResource('spritePool', spritePool);

  // Initialize HUD-related resources
  world.setResource('scoreState', createDefaultScoreState());
  world.setResource('levelTimer', { remainingSeconds: 0, activeLevel: -1 });
  world.setResource('playerLife', { lives: 3, isInvincible: false, invincibilityRemainingMs: 0 });
  world.setResource('ghostSpawnState', createInitialSpawnState());
  world.setResource('collisionIntents', []); // B-04 requirement
  world.setResource('pauseIntent', { restart: false, toggle: false });
  world.setResource('deadGhostIds', []);
  world.setResource('levelFlow', {});
  // Bomb-tick writes this each frame; the audio cue system reads it to loop/stop
  // the fuse SFX. Pre-registered so the reader never sees an undefined slot.
  world.setResource('bombAudioActive', false);
  // Pre-register the audio adapter slot as null so the cue system can read it
  // safely before the app boundary constructs and injects the real adapter.
  world.setResource(options.audioAdapterResourceKey || DEFAULT_AUDIO_RESOURCE_KEY, null);
  world.setResource(options.hudElementsResourceKey || 'hudElements', options.hudElements || null);

  registerSystemsByPhase(
    world,
    mergeSystemsByPhase(
      createDefaultSystemsByPhase({
        ...options,
        inputAdapterResourceKey,
      }),
      options.systemsByPhase,
    ),
  );

  world.registerSystem(createBoardSyncSystem(boardAdapter));
  world.registerSystem(createPlayerAnimationSystem());

  function stepFrame(
    frameNowMs,
    { fixedDtMs = FIXED_DT_MS, maxStepsPerFrame = MAX_STEPS_PER_FRAME } = {},
  ) {
    const timestamp = toFiniteTimestamp(frameNowMs);
    world.runMeta({
      alpha: clock.alpha,
      dtMs: fixedDtMs,
      isPaused: clock.isPaused,
      simTimeMs: clock.simTimeMs,
    });
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

    // Reset the render-intent buffer at the start of the render commit phase
    // so render-collect systems append into a clean buffer each frame. Without
    // this, intents from previous frames pile up until capacity is hit and new
    // intents are silently dropped.
    const renderIntent = world.getResource('renderIntent');
    if (renderIntent) {
      resetRenderIntentBuffer(renderIntent);
    }

    world.runRenderCommit({
      alpha: clock.alpha,
      dtMs: fixedDtMs,
      isPaused: clock.isPaused,
      simTimeMs: clock.simTimeMs,
      stepsThisFrame: steps,
    });

    if (registeredRenderer && typeof registeredRenderer.update === 'function') {
      registeredRenderer.update(renderIntent);
    }

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
    resyncBaseline(clock, timestamp);
  }

  function getInputAdapter() {
    return world.getResource(inputAdapterResourceKey) || null;
  }

  /**
   * Validate and register the browser-facing input adapter resource.
   *
   * Passing `null` or `undefined` clears the registration and destroys any
   * previously stored adapter so blur/visibility teardown is explicit.
   * Any non-null value must satisfy the `assertValidInputAdapter` contract.
   *
   * @param {InputAdapter | null} adapter - Explicit adapter contract or null to clear it.
   * @returns {InputAdapter | null} The stored adapter resource, or null after clearing.
   */
  function setInputAdapter(adapter) {
    const previousAdapter = world.getResource(inputAdapterResourceKey) || null;

    if (adapter === null || adapter === undefined) {
      if (previousAdapter && typeof previousAdapter.destroy === 'function') {
        previousAdapter.destroy();
      }
      world.setResource(inputAdapterResourceKey, null);
      return null;
    }

    // Validate before any side effects so a bad adapter never replaces a good one.
    assertValidInputAdapter(adapter);

    if (
      previousAdapter &&
      previousAdapter !== adapter &&
      typeof previousAdapter.destroy === 'function'
    ) {
      previousAdapter.destroy();
    }

    world.setResource(inputAdapterResourceKey, adapter);
    return adapter;
  }

  function setHudAdapter(adapter) {
    const key = options.hudAdapterResourceKey || 'hudAdapter';
    if (adapter === null || adapter === undefined) {
      world.setResource(key, null);
      return null;
    }
    if (typeof adapter.update !== 'function') {
      throw new Error('HUD adapter must expose an update(state) method.');
    }
    world.setResource(key, adapter);
    return adapter;
  }

  function getHudAdapter() {
    return world.getResource(options.hudAdapterResourceKey || 'hudAdapter') || null;
  }

  function setScreensAdapter(adapter) {
    const key = options.screensAdapterResourceKey || 'screensAdapter';
    if (adapter === null || adapter === undefined) {
      const previous = world.getResource(key);
      if (previous && typeof previous.destroy === 'function') {
        previous.destroy();
      }
      world.setResource(key, null);
      return null;
    }
    world.setResource(key, adapter);
    return adapter;
  }

  function getScreensAdapter() {
    return world.getResource(options.screensAdapterResourceKey || 'screensAdapter') || null;
  }

  function setStorageProvider(provider) {
    const key = options.storageProviderResourceKey || 'storageProvider';
    if (provider === null || provider === undefined) {
      world.setResource(key, null);
      return null;
    }
    world.setResource(key, provider);
    return provider;
  }

  function getStorageProvider() {
    return world.getResource(options.storageProviderResourceKey || 'storageProvider') || null;
  }

  /**
   * Register (or clear) the runtime audio adapter as the canonical `'audio'`
   * world resource. Passing null/undefined destroys the previous adapter so
   * runtime teardown releases the AudioContext through one code path.
   *
   * @param {object | null} adapter - Audio adapter contract or null to clear it.
   * @returns {object | null} The stored adapter, or null after clearing.
   */
  function setAudioAdapter(adapter) {
    const key = options.audioAdapterResourceKey || DEFAULT_AUDIO_RESOURCE_KEY;
    const previous = world.getResource(key) || null;

    if (adapter === null || adapter === undefined) {
      if (previous && typeof previous.destroy === 'function') {
        previous.destroy();
      }
      world.setResource(key, null);
      return null;
    }

    if (typeof adapter.playSfx !== 'function') {
      throw new Error('Audio adapter must expose a playSfx(cueId) method.');
    }

    if (previous && previous !== adapter && typeof previous.destroy === 'function') {
      previous.destroy();
    }

    world.setResource(key, adapter);
    return adapter;
  }

  function getAudioAdapter() {
    return world.getResource(options.audioAdapterResourceKey || DEFAULT_AUDIO_RESOURCE_KEY) || null;
  }

  return {
    clock,
    eventQueueResourceKey,
    gameFlow,
    gameStatus,
    getAudioAdapter,
    getHudAdapter,
    getInputAdapter,
    getScreensAdapter,
    getStorageProvider,
    inputAdapterResourceKey,
    levelLoader,
    playerEntityResourceKey,
    registerRenderer,
    resyncTime,
    setAudioAdapter,
    setHudAdapter,
    setInputAdapter,
    setScreensAdapter,
    setStorageProvider,
    stepFrame,
    world,
  };
}

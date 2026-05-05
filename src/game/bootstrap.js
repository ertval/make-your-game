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
import { assertValidInputAdapter } from '../adapters/io/input-adapter.js';
import {
  createInputStateStore,
  createPlayerStore,
  resetInputState,
  resetPlayer,
} from '../ecs/components/actors.js';
import { COMPONENT_MASK } from '../ecs/components/registry.js';
import {
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
import { advanceSimTime, createClock, resetClock, tickClock } from '../ecs/resources/clock.js';
import { FIXED_DT_MS, MAX_STEPS_PER_FRAME, TOTAL_LEVELS } from '../ecs/resources/constants.js';
import { createEventQueue } from '../ecs/resources/event-queue.js';
import { createGameStatus } from '../ecs/resources/game-status.js';
import { createInputSystem } from '../ecs/systems/input-system.js';
import {
  createPlayerMoveSystem,
  PLAYER_MOVE_REQUIRED_MASK,
} from '../ecs/systems/player-move-system.js';
import { createRenderCollectSystem } from '../ecs/systems/render-collect-system.js';
import { createRenderDomSystem } from '../ecs/systems/render-dom-system.js';
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

  return {
    input: [inputSystem],
    physics: [playerMoveSystem],
    logic: createBombExplosionLogicSystems({
      ...options,
      eventQueueResourceKey,
      inputStateResourceKey,
      mapResourceKey,
      playerResourceKey,
      positionResourceKey,
    }),
    render: [renderCollectSystem, renderDomSystem],
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
  ensureWorldResource(world, 'renderable', () => createRenderableStore(maxEntities));
  ensureWorldResource(world, 'visualState', () => createVisualStateStore(maxEntities));

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

  const PLAYER_WITH_RENDERABLE_MASK = PLAYER_MOVE_REQUIRED_MASK | COMPONENT_MASK.RENDERABLE;

  let playerHandle = world.getResource(playerEntityResourceKey);
  if (!world.entityStore.isAlive(playerHandle)) {
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
  const world = options.world || new World();
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
  initializeMovementResources(world, options);
  // Bomb and explosion systems need prop stores and pooled entities before logic-phase ticks.
  initializeBombExplosionResources(world, options);
  // Pre-register the adapter slot so runtime wiring has one explicit resource key
  // and systems never have to distinguish "never registered" from "registered null".
  ensureWorldResource(world, inputAdapterResourceKey, () => null);

  // Create sprite pool and board adapter early for onLevelLoaded callback.
  // Headless tests have no document, so DOM rendering safely no-ops there.
  const spritePool =
    typeof document !== 'undefined' ? createSpritePool({ dev: isDevelopment() }) : null;
  const boardAdapter = createBoardAdapter({ spritePool });

  const levelLoader = createLevelLoader({
    loadMapForLevel: options.loadMapForLevel,
    mapResourceKey: options.mapResourceKey || 'mapResource',
    onLevelLoaded: (mapResource) => {
      if (typeof document !== 'undefined') {
        const gameBoard = document.getElementById('game-board');
        if (gameBoard) {
          boardAdapter.generateBoard(mapResource, gameBoard);
        }
      }
      updateBoardCss(mapResource);
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
      // BUG-01: use the injected nowProvider so synthetic test clocks remain
      // deterministic across restarts, falling back to the real wall clock
      // only when no provider is supplied.
      resetClock(clock, toFiniteTimestamp(nowProvider()));
      // Restart should reset frame counters so fixed-step progression restarts cleanly.
      world.frame = 0;
      world.renderFrame = 0;
      // Restart destroys all entities, so runtime object pools must be rebuilt
      // before bomb and explosion systems can query pooled prop entities again.
      initializeBombExplosionResources(world, options);
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
    resetClock(clock, timestamp);
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

  return {
    clock,
    eventQueueResourceKey,
    gameFlow,
    gameStatus,
    getInputAdapter,
    inputAdapterResourceKey,
    levelLoader,
    playerEntityResourceKey,
    registerRenderer,
    resyncTime,
    setInputAdapter,
    stepFrame,
    world,
  };
}

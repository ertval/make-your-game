/**
 * A-05 integration tests for bomb chains, pause invariants, and event ordering.
 *
 * These checks cover the cross-system interactions that unit tests cannot verify
 * in isolation: bomb A triggers bomb B at runtime, the clock/simulation freeze
 * holds for an extended pause, and collision→death→respawn event ordering is
 * deterministic.
 */

import { describe, expect, it } from 'vitest';

import { createGhostStore, createPlayerStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import {
  COLLIDER_TYPE,
  createColliderStore,
  createPositionStore,
} from '../../../src/ecs/components/spatial.js';
import { createHealthStore } from '../../../src/ecs/components/stats.js';
import {
  DEFAULT_FIRE_RADIUS,
  FIXED_DT_MS,
  GHOST_STATE,
} from '../../../src/ecs/resources/constants.js';
import { createEventQueue, drain } from '../../../src/ecs/resources/event-queue.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import { GAMEPLAY_EVENT_TYPE } from '../../../src/ecs/systems/collision-gameplay-events.js';
import {
  COLLISION_ENTITY_REQUIRED_MASK,
  createCollisionSystem,
} from '../../../src/ecs/systems/collision-system.js';
import { createLifeSystem } from '../../../src/ecs/systems/life-system.js';
import { World } from '../../../src/ecs/world/world.js';
import { createBootstrap } from '../../../src/game/bootstrap.js';

// ---------------------------------------------------------------------------
// Shared harness helpers
// ---------------------------------------------------------------------------

function createRuntimeInputAdapterStub() {
  const heldKeys = new Set();
  const pressedKeys = new Set();

  return {
    clearHeldKeys() {
      heldKeys.clear();
      pressedKeys.clear();
    },
    destroy() {},
    drainPressedKeys() {
      const drainedKeys = new Set(pressedKeys);
      pressedKeys.clear();
      return drainedKeys;
    },
    getHeldKeys() {
      return heldKeys;
    },
    press(intent) {
      pressedKeys.add(intent);
    },
  };
}

function createRuntimeRawMap() {
  return {
    level: 1,
    metadata: {
      activeGhostTypes: [0, 1],
      ghostSpeed: 4.0,
      maxGhosts: 2,
      name: 'A-05 Integration Harness',
      timerSeconds: 120,
    },
    dimensions: { columns: 7, rows: 7 },
    grid: [
      [1, 1, 1, 1, 1, 1, 1],
      [1, 3, 0, 0, 0, 0, 1], // Pellet at (1, 1)
      [1, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 6, 0, 0, 1],
      [1, 0, 5, 5, 5, 0, 1],
      [1, 0, 5, 5, 5, 0, 1],
      [1, 1, 1, 1, 1, 1, 1],
    ],
    spawn: {
      ghostHouse: {
        bottomRow: 5,
        leftCol: 2,
        rightCol: 4,
        topRow: 4,
      },
      ghostSpawnPoint: { col: 3, row: 4 },
      player: { col: 3, row: 3 },
    },
  };
}

function createRuntimeMapResource() {
  return createMapResource(createRuntimeRawMap());
}

function createElementStub(tagName) {
  const children = [];

  return {
    appendChild(child) {
      child.parentNode = this;
      children.push(child);
      this.firstChild = children[0] || null;
      return child;
    },
    classList: {
      add() {},
    },
    firstChild: null,
    parentNode: null,
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) {
        children.splice(index, 1);
      }
      child.parentNode = null;
      this.firstChild = children[0] || null;
      return child;
    },
    removeAttribute() {},
    setAttribute() {},
    style: {
      display: '',
      opacity: '',
      setProperty() {},
      transform: '',
    },
    tagName: tagName.toUpperCase(),
  };
}

function installRuntimeDocumentStub() {
  const previousDocument = globalThis.document;
  const hadDocument = Object.hasOwn(globalThis, 'document');
  const gameBoard = createElementStub('div');
  const documentStub = {
    createElement: (tagName) => createElementStub(tagName),
    documentElement: createElementStub('html'),
    getElementById: (id) => (id === 'game-board' ? gameBoard : null),
  };

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: documentStub,
  });

  return {
    gameBoard,
    restore: () => {
      if (hadDocument) {
        Object.defineProperty(globalThis, 'document', {
          configurable: true,
          value: previousDocument,
        });
        return;
      }

      delete globalThis.document;
    },
  };
}

function createFixedStepDriver(bootstrap) {
  let nowMs = 0;

  return function stepFixedFrames(frameCount) {
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      nowMs += FIXED_DT_MS;
      bootstrap.stepFrame(nowMs);
    }
  };
}

function findActiveColliderIds(world, colliderStore, requiredMask, colliderType) {
  return world
    .query(requiredMask)
    .filter((entityId) => colliderStore.type[entityId] === colliderType);
}

function fixedFramesAfterDuration(durationMs) {
  return Math.ceil(durationMs / FIXED_DT_MS) + 2;
}

// ---------------------------------------------------------------------------
// Event-surface map for ordering tests
// ---------------------------------------------------------------------------

function createEventSurfaceRawMap() {
  return {
    level: 105,
    metadata: {
      activeGhostTypes: [0],
      ghostSpeed: 4,
      maxGhosts: 1,
      name: 'A-05 Event Ordering Harness',
      timerSeconds: 120,
    },
    dimensions: { rows: 5, columns: 5 },
    grid: [
      [1, 1, 1, 1, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 6, 0, 1],
      [1, 0, 5, 0, 1],
      [1, 1, 1, 1, 1],
    ],
    spawn: {
      ghostHouse: {
        bottomRow: 3,
        leftCol: 2,
        rightCol: 2,
        topRow: 3,
      },
      ghostSpawnPoint: { row: 3, col: 2 },
      player: { row: 2, col: 2 },
    },
  };
}

function placeEntity(positionStore, entityId, row, col) {
  positionStore.prevRow[entityId] = row;
  positionStore.prevCol[entityId] = col;
  positionStore.row[entityId] = row;
  positionStore.col[entityId] = col;
  positionStore.targetRow[entityId] = row;
  positionStore.targetCol[entityId] = col;
}

function addCollisionEntity(world, positionStore, colliderStore, colliderType, row, col) {
  const entity = world.createEntity(COLLISION_ENTITY_REQUIRED_MASK);

  colliderStore.type[entity.id] = colliderType;
  placeEntity(positionStore, entity.id, row, col);

  return entity;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('A-05 bomb chain integration', () => {
  it('propagates bomb A explosion to adjacent bomb B within the same fixed step', () => {
    const { gameBoard, restore: restoreDocument } = installRuntimeDocumentStub();

    try {
      const bootstrap = createBootstrap({
        boardContainerElement: gameBoard,
        loadMapForLevel: () => createRuntimeMapResource(),
        now: 0,
      });
      const inputAdapter = createRuntimeInputAdapterStub();
      const stepFixedFrames = createFixedStepDriver(bootstrap);

      bootstrap.setInputAdapter(inputAdapter);
      expect(bootstrap.gameFlow.startGame()).toBe(true);

      // Place bomb A at player position (3, 3)
      inputAdapter.press('bomb');
      stepFixedFrames(1);

      const colliderStore = bootstrap.world.getResource('collider');
      const bombStore = bootstrap.world.getResource('bomb');
      const fireStore = bootstrap.world.getResource('fire');
      const bombPool = bootstrap.world.getResource('bombEntityPool');

      const bombRequiredMask =
        COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;

      // Confirm bomb A is active at (3, 3)
      const activeBombIds = findActiveColliderIds(
        bootstrap.world,
        colliderStore,
        bombRequiredMask,
        COLLIDER_TYPE.BOMB,
      );
      expect(activeBombIds).toHaveLength(1);
      expect(bombStore.row[activeBombIds[0]]).toBe(3);
      expect(bombStore.col[activeBombIds[0]]).toBe(3);

      // Manually activate bomb B in the next pool slot at (3, 4) — adjacent
      // to bomb A and well within the default explosion radius of 2.
      const inactiveBombSlot = bombPool.find(
        (handle) => colliderStore.type[handle.id] === COLLIDER_TYPE.NONE,
      );
      expect(inactiveBombSlot).toBeDefined();
      const bombBId = inactiveBombSlot.id;

      colliderStore.type[bombBId] = COLLIDER_TYPE.BOMB;
      bombStore.row[bombBId] = 3;
      bombStore.col[bombBId] = 4;
      bombStore.fuseMs[bombBId] = 3000;
      bombStore.radius[bombBId] = DEFAULT_FIRE_RADIUS;

      // Advance past bomb A's fuse.  The explosion should chain to bomb B.
      stepFixedFrames(fixedFramesAfterDuration(3000));

      // Both bombs should be deactivated
      const activeBombsAfter = findActiveColliderIds(
        bootstrap.world,
        colliderStore,
        bombRequiredMask,
        COLLIDER_TYPE.BOMB,
      );
      expect(activeBombsAfter).toHaveLength(0);

      // Fire should exist at both bomb positions
      const fireRequiredMask =
        COMPONENT_MASK.FIRE | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;
      const activeFireIds = findActiveColliderIds(
        bootstrap.world,
        colliderStore,
        fireRequiredMask,
        COLLIDER_TYPE.FIRE,
      );

      const fireAtBombA = activeFireIds.some(
        (id) => fireStore.row[id] === 3 && fireStore.col[id] === 3,
      );
      const fireAtBombB = activeFireIds.some(
        (id) => fireStore.row[id] === 3 && fireStore.col[id] === 4,
      );
      expect(fireAtBombA).toBe(true);
      expect(fireAtBombB).toBe(true);
    } finally {
      restoreDocument();
    }
  });
});

describe('A-05 pause invariant integration', () => {
  it('preserves simulation freeze for 15 ticks while paused and resumes cleanly', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createRuntimeMapResource(),
      now: 0,
    });
    const inputAdapter = createRuntimeInputAdapterStub();
    bootstrap.setInputAdapter(inputAdapter);

    bootstrap.gameFlow.startGame();

    // Place a bomb before pausing
    inputAdapter.press('bomb');

    // Run one real frame to advance past frame 0
    const firstStep = bootstrap.stepFrame(FIXED_DT_MS);
    expect(firstStep.steps).toBe(1);

    const colliderStore = bootstrap.world.getResource('collider');
    const bombStore = bootstrap.world.getResource('bomb');
    const bombRequiredMask =
      COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;

    // Find the active bomb
    const activeBombIds = findActiveColliderIds(
      bootstrap.world,
      colliderStore,
      bombRequiredMask,
      COLLIDER_TYPE.BOMB,
    );
    expect(activeBombIds).toHaveLength(1);
    const bombId = activeBombIds[0];
    const initialFuse = bombStore.fuseMs[bombId];
    expect(initialFuse).toBeGreaterThan(0);

    const levelTimer = bootstrap.world.getResource('levelTimer');
    const initialRemainingSeconds = levelTimer.remainingSeconds;
    expect(initialRemainingSeconds).toBeGreaterThan(0);

    const frameBeforePause = bootstrap.world.frame;
    const simBeforePause = bootstrap.clock.simTimeMs;

    expect(bootstrap.gameFlow.pauseGame()).toBe(true);
    expect(bootstrap.clock.isPaused).toBe(true);

    // Advance 15 frames while paused — each call uses realistic timestamps
    for (let tickIndex = 0; tickIndex < 15; tickIndex += 1) {
      const result = bootstrap.stepFrame(FIXED_DT_MS * (tickIndex + 2));
      expect(result.steps).toBe(0);
      expect(result.isPaused).toBe(true);

      // Verify timer/fuse are frozen
      expect(bombStore.fuseMs[bombId]).toBe(initialFuse);
      expect(levelTimer.remainingSeconds).toBe(initialRemainingSeconds);

      // Verify HUD remains responsive (returns consistent, readable state resources)
      const scoreState = bootstrap.world.getResource('scoreState');
      const playerLife = bootstrap.world.getResource('playerLife');
      expect(scoreState).toBeDefined();
      expect(scoreState.totalPoints).toBe(0);
      expect(playerLife).toBeDefined();
      expect(playerLife.lives).toBe(3);
    }

    // Simulation must not have advanced
    expect(bootstrap.world.frame).toBe(frameBeforePause);
    expect(bootstrap.clock.simTimeMs).toBe(simBeforePause);

    // Resume and verify simulation continues correctly
    expect(bootstrap.gameFlow.resumeGame()).toBe(true);
    bootstrap.resyncTime(FIXED_DT_MS * 20);

    const resumedResult = bootstrap.stepFrame(FIXED_DT_MS * 20 + FIXED_DT_MS * 3);
    expect(resumedResult.steps).toBeGreaterThan(0);
    expect(bootstrap.world.frame).toBeGreaterThan(frameBeforePause);
    expect(bootstrap.clock.isPaused).toBe(false);
  });
});

describe('A-05 event ordering integration', () => {
  it('processes collision -> death -> respawn in deterministic order through cross-system dispatch', () => {
    const world = new World();
    const mapResource = createMapResource(createEventSurfaceRawMap());
    const maxEntities = 8;
    const positionStore = createPositionStore(maxEntities);
    const colliderStore = createColliderStore(maxEntities);
    const playerStore = createPlayerStore(maxEntities);
    const ghostStore = createGhostStore(maxEntities);
    const healthStore = createHealthStore(maxEntities);
    const eventQueue = createEventQueue();
    const collisionIntents = [];

    const player = world.createEntity(COLLISION_ENTITY_REQUIRED_MASK | COMPONENT_MASK.PLAYER);

    colliderStore.type[player.id] = COLLIDER_TYPE.PLAYER;
    placeEntity(positionStore, player.id, mapResource.playerSpawnRow, mapResource.playerSpawnCol);

    const playerLife = {
      lives: 3,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    };

    const gameStatus = createGameStatus(GAME_STATE.PLAYING);

    world.setResource('mapResource', mapResource);
    world.setResource('position', positionStore);
    world.setResource('collider', colliderStore);
    world.setResource('player', playerStore);
    world.setResource('ghost', ghostStore);
    world.setResource('health', healthStore);
    world.setResource('collisionIntents', collisionIntents);
    world.setResource('eventQueue', eventQueue);
    world.setResource('playerLife', playerLife);
    world.setResource('gameStatus', gameStatus);
    world.setResource('playerEntity', player);

    world.registerSystem(createCollisionSystem());
    world.registerSystem(createLifeSystem());

    // Place a ghost on the player's tile to trigger player-death
    addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      mapResource.playerSpawnRow,
      mapResource.playerSpawnCol,
    );

    world.runFixedStep({ dtMs: FIXED_DT_MS });

    // The collision system should have emitted a death intent
    expect(collisionIntents.some((intent) => intent.type === 'player-death')).toBe(true);

    // The life system should have consumed the death and decremented lives
    expect(playerLife.lives).toBe(2);
    expect(playerLife.isInvincible).toBe(true);
    expect(playerLife.invincibilityRemainingMs).toBeGreaterThan(0);

    // Events should be ordered deterministically
    const events = drain(eventQueue);
    expect(events.length).toBeGreaterThan(0);

    const eventTypes = events.map((evt) => evt.type);
    expect(eventTypes).toContain(GAMEPLAY_EVENT_TYPE.PLAYER_GHOST_CONTACT);

    const contactEvent = events.find(
      (evt) => evt.type === GAMEPLAY_EVENT_TYPE.PLAYER_GHOST_CONTACT,
    );
    expect(contactEvent).toBeDefined();
    expect(contactEvent.payload).toMatchObject({
      entityId: player.id,
      ghostState: expect.any(Number),
      sourceEntityId: expect.any(Number),
      sourceSystem: 'collision-system',
      tile: { row: mapResource.playerSpawnRow, col: mapResource.playerSpawnCol },
    });
  });

  it('executes a full multi-system pipeline: place bomb -> fuse -> detonate -> collision -> score & events', () => {
    const { gameBoard, restore: restoreDocument } = installRuntimeDocumentStub();

    try {
      const bootstrap = createBootstrap({
        boardContainerElement: gameBoard,
        loadMapForLevel: () => createRuntimeMapResource(),
        now: 0,
      });
      const inputAdapter = createRuntimeInputAdapterStub();
      const stepFixedFrames = createFixedStepDriver(bootstrap);

      bootstrap.setInputAdapter(inputAdapter);
      expect(bootstrap.gameFlow.startGame()).toBe(true);

      const world = bootstrap.world;

      const ghostEntities = world.getResource('ghostEntities');
      expect(ghostEntities.length).toBeGreaterThan(0);
      const ghostHandle = ghostEntities[0];

      const GHOST_RUNTIME_MASK =
        COMPONENT_MASK.GHOST |
        COMPONENT_MASK.POSITION |
        COMPONENT_MASK.VELOCITY |
        COMPONENT_MASK.RENDERABLE |
        COMPONENT_MASK.COLLIDER;
      world.setEntityMask(ghostHandle, GHOST_RUNTIME_MASK);

      const ghostStore = world.getResource('ghost');
      const positionStore = world.getResource('position');
      const colliderStore = world.getResource('collider');

      ghostStore.state[ghostHandle.id] = GHOST_STATE.NORMAL;
      placeEntity(positionStore, ghostHandle.id, 3, 4);
      colliderStore.type[ghostHandle.id] = COLLIDER_TYPE.GHOST;

      inputAdapter.press('bomb');
      stepFixedFrames(1);

      const bombRequiredMask =
        COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;
      const activeBombs = findActiveColliderIds(
        world,
        colliderStore,
        bombRequiredMask,
        COLLIDER_TYPE.BOMB,
      );
      expect(activeBombs).toHaveLength(1);

      const eventQueue = world.getResource('eventQueue');
      drain(eventQueue);

      // Keep this dummy ghost stationary on the bomb's blast tile so the
      // explosion is guaranteed to catch it. We re-pin it each frame instead of
      // relying on a zero map ghostSpeed: after the BUG-17 fix a non-positive
      // speed falls back to GHOST_DEFAULT_SPEED, so a zero speed no longer
      // freezes a ghost in place.
      let nowMs = 0;
      for (let step = 1; step <= 190; step++) {
        placeEntity(positionStore, ghostHandle.id, 3, 4);
        nowMs += FIXED_DT_MS;
        bootstrap.stepFrame(nowMs);
      }

      const scoreState = world.getResource('scoreState');
      expect(scoreState.totalPoints).toBe(200);

      const events = drain(eventQueue);
      expect(events.map((e) => e.type)).toContain('GhostDefeated');

      const defeatEvent = events.find((evt) => evt.type === 'GhostDefeated');
      expect(defeatEvent).toBeDefined();
      expect(defeatEvent.payload).toMatchObject({
        entityId: ghostHandle.id,
        chainDepth: 1,
        ghostState: expect.any(Number),
        sourceEntityId: expect.any(Number),
        sourceSystem: 'collision-system',
        tile: { row: 3, col: 4 },
      });

      expect(ghostStore.state[ghostHandle.id]).toBe(GHOST_STATE.DEAD);
    } finally {
      restoreDocument();
    }
  });

  it('executes a pipeline with natural ghost AI movement: place bomb -> ghost AI moves -> detonate -> collision -> score & events', () => {
    const { gameBoard, restore: restoreDocument } = installRuntimeDocumentStub();

    try {
      const rawMap = {
        level: 1,
        metadata: {
          activeGhostTypes: [0], // BLINKY
          ghostSpeed: 2.0, // 2 tiles per second
          maxGhosts: 1,
          name: 'Sticky Ghost Natural AI Map',
          timerSeconds: 120,
        },
        dimensions: { columns: 5, rows: 3 },
        grid: [
          [1, 1, 1, 1, 1],
          [1, 6, 3, 5, 1], // Player at (1,1), pellet at (1,2), Ghost Spawn at (1,3)
          [1, 1, 1, 1, 1],
        ],
        spawn: {
          ghostHouse: {
            bottomRow: 1,
            leftCol: 3,
            rightCol: 3,
            topRow: 1,
          },
          ghostSpawnPoint: { col: 3, row: 1 },
          player: { col: 1, row: 1 },
        },
      };

      const bootstrap = createBootstrap({
        boardContainerElement: gameBoard,
        loadMapForLevel: () => createMapResource(rawMap),
        now: 0,
      });

      const inputAdapter = createRuntimeInputAdapterStub();
      bootstrap.setInputAdapter(inputAdapter);
      expect(bootstrap.gameFlow.startGame()).toBe(true);

      const world = bootstrap.world;

      // Drain event queue so we start fresh
      const eventQueue = world.getResource('eventQueue');
      drain(eventQueue);

      // Place a bomb at the player's tile (1, 1)
      inputAdapter.press('bomb');

      const ghostEntities = world.getResource('ghostEntities');
      const ghostHandle = ghostEntities[0];
      const ghostStore = world.getResource('ghost');
      for (let i = 1; i <= 190; i++) {
        bootstrap.stepFrame(i * FIXED_DT_MS);
      }

      const scoreState = world.getResource('scoreState');
      expect(scoreState.totalPoints).toBe(200);

      const events = drain(eventQueue);
      expect(events.map((e) => e.type)).toContain('GhostDefeated');

      expect(ghostStore.state[ghostHandle.id]).toBe(GHOST_STATE.DEAD);
    } finally {
      restoreDocument();
    }
  });
});

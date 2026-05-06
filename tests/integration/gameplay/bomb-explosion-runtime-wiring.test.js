/**
 * Integration tests for runtime bomb/explosion bootstrap wiring.
 *
 * These checks prove the default createBootstrap() path connects input
 * sampling, pooled bomb entities, fuse ticking, explosion resolution, and fire
 * lifetime cleanup without bypassing runtime resource assembly.
 */

import { describe, expect, it } from 'vitest';

import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { COLLIDER_TYPE } from '../../../src/ecs/components/spatial.js';
import {
  BOMB_FUSE_MS,
  FIRE_DURATION_MS,
  FIXED_DT_MS,
  POOL_FIRE,
  POOL_MAX_BOMBS,
} from '../../../src/ecs/resources/constants.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import { createBootstrap } from '../../../src/game/bootstrap.js';

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
      name: 'Bomb Explosion Runtime Harness',
      timerSeconds: 120,
    },
    dimensions: { columns: 7, rows: 7 },
    grid: [
      [1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 1],
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

describe('runtime bomb and explosion wiring', () => {
  it('places a bomb from runtime input and resolves it into expiring fire', () => {
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

      inputAdapter.press('bomb');
      stepFixedFrames(1);

      const colliderStore = bootstrap.world.getResource('collider');
      const bombStore = bootstrap.world.getResource('bomb');
      const fireStore = bootstrap.world.getResource('fire');
      const bombRequiredMask =
        COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;
      const fireRequiredMask =
        COMPONENT_MASK.FIRE | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;
      const activeBombIds = findActiveColliderIds(
        bootstrap.world,
        colliderStore,
        bombRequiredMask,
        COLLIDER_TYPE.BOMB,
      );

      expect(activeBombIds).toHaveLength(1);
      expect(bombStore.fuseMs[activeBombIds[0]]).toBe(BOMB_FUSE_MS);
      expect(bombStore.row[activeBombIds[0]]).toBe(3);
      expect(bombStore.col[activeBombIds[0]]).toBe(3);

      stepFixedFrames(fixedFramesAfterDuration(BOMB_FUSE_MS));

      expect(
        findActiveColliderIds(bootstrap.world, colliderStore, bombRequiredMask, COLLIDER_TYPE.BOMB),
      ).toHaveLength(0);

      const activeFireIds = findActiveColliderIds(
        bootstrap.world,
        colliderStore,
        fireRequiredMask,
        COLLIDER_TYPE.FIRE,
      );

      expect(activeFireIds.length).toBeGreaterThan(0);
      expect(fireStore.burnTimerMs[activeFireIds[0]]).toBe(FIRE_DURATION_MS);

      stepFixedFrames(fixedFramesAfterDuration(FIRE_DURATION_MS));

      expect(
        findActiveColliderIds(bootstrap.world, colliderStore, fireRequiredMask, COLLIDER_TYPE.FIRE),
      ).toHaveLength(0);

      for (const fireEntityId of activeFireIds) {
        expect(fireStore.burnTimerMs[fireEntityId]).toBe(0);
        expect(colliderStore.type[fireEntityId]).toBe(COLLIDER_TYPE.NONE);
      }
    } finally {
      restoreDocument();
    }
  });

  it('rebuilds bomb and fire pools so runtime placement still works after restart', () => {
    const { gameBoard, restore: restoreDocument } = installRuntimeDocumentStub();

    try {
      let nowMs = 0;
      const bootstrap = createBootstrap({
        boardContainerElement: gameBoard,
        loadMapForLevel: () => createRuntimeMapResource(),
        now: nowMs,
        nowProvider: () => nowMs,
      });
      const inputAdapter = createRuntimeInputAdapterStub();
      const stepFixedFrames = (frameCount) => {
        for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
          nowMs += FIXED_DT_MS;
          bootstrap.stepFrame(nowMs);
        }
      };
      const bombRequiredMask =
        COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;
      const fireRequiredMask =
        COMPONENT_MASK.FIRE | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;

      bootstrap.setInputAdapter(inputAdapter);
      expect(bootstrap.gameFlow.startGame()).toBe(true);

      inputAdapter.press('bomb');
      stepFixedFrames(1);

      const colliderStore = bootstrap.world.getResource('collider');
      expect(
        findActiveColliderIds(bootstrap.world, colliderStore, bombRequiredMask, COLLIDER_TYPE.BOMB),
      ).toHaveLength(1);

      expect(bootstrap.gameFlow.restartLevel()).toBe(true);

      const rebuiltBombPool = bootstrap.world.getResource('bombEntityPool');
      const rebuiltFirePool = bootstrap.world.getResource('fireEntityPool');

      expect(rebuiltBombPool).toHaveLength(POOL_MAX_BOMBS);
      expect(rebuiltFirePool).toHaveLength(POOL_FIRE);
      for (const handle of [...rebuiltBombPool, ...rebuiltFirePool]) {
        expect(bootstrap.world.isEntityAlive(handle)).toBe(true);
      }

      inputAdapter.press('bomb');
      stepFixedFrames(1);

      expect(
        findActiveColliderIds(bootstrap.world, colliderStore, bombRequiredMask, COLLIDER_TYPE.BOMB),
      ).toHaveLength(1);

      stepFixedFrames(fixedFramesAfterDuration(BOMB_FUSE_MS));

      expect(
        findActiveColliderIds(bootstrap.world, colliderStore, fireRequiredMask, COLLIDER_TYPE.FIRE)
          .length,
      ).toBeGreaterThan(0);
    } finally {
      restoreDocument();
    }
  });
});

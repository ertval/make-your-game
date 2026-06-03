/**
 * Test: b-09-lifecycle-event-hooks.test.js
 * Purpose: Verifies the B-09 integration wiring that emits the four remaining
 *   cross-system gameplay events from Track C systems — LifeLost + GameOver
 *   (life-system), GameOver (timer-system), and LevelCleared + Victory
 *   (level-progress-system) — through the real World dispatcher and D-01 event
 *   queue, with deterministic (frame, order) ordering.
 * Public API: N/A (test module).
 * Implementation Notes:
 * - Each harness drives a real World.runFixedStep so the frame/order envelope is
 *   exercised end-to-end exactly as the runtime game loop would produce it.
 * - The life/level harnesses assert the canonical "LifeLost → GameOver" and
 *   "LevelCleared → Victory" sequences drain in deterministic order.
 */

import { describe, expect, it } from 'vitest';

import { createPlayerStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { createPositionStore } from '../../../src/ecs/components/spatial.js';
import { FIXED_DT_MS } from '../../../src/ecs/resources/constants.js';
import { createEventQueue, drain } from '../../../src/ecs/resources/event-queue.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import {
  GAME_OVER_CAUSE,
  GAMEPLAY_EVENT_SOURCE,
  GAMEPLAY_EVENT_TYPE,
} from '../../../src/ecs/systems/collision-gameplay-events.js';
import { createLevelProgressSystem } from '../../../src/ecs/systems/level-progress-system.js';
import { createLifeSystem } from '../../../src/ecs/systems/life-system.js';
import { createTimerSystem } from '../../../src/ecs/systems/timer-system.js';
import { World } from '../../../src/ecs/world/world.js';

function placeEntity(positionStore, entityId, row, col) {
  positionStore.prevRow[entityId] = row;
  positionStore.prevCol[entityId] = col;
  positionStore.row[entityId] = row;
  positionStore.col[entityId] = col;
  positionStore.targetRow[entityId] = row;
  positionStore.targetCol[entityId] = col;
}

// --- LifeLost → GameOver harness (life-system) ---

function createLifeLostHarness({ lives }) {
  const world = new World();
  const positionStore = createPositionStore(8);
  const playerStore = createPlayerStore(8);
  const eventQueue = createEventQueue();
  const player = world.createEntity(COMPONENT_MASK.PLAYER);

  placeEntity(positionStore, player.id, 3, 4);

  world.setResource('position', positionStore);
  world.setResource('player', playerStore);
  world.setResource('playerEntity', player);
  world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
  world.setResource('playerLife', { lives, isInvincible: false, invincibilityRemainingMs: 0 });
  world.setResource('collisionIntents', [
    { type: 'player-death', entityId: player.id, row: 3, col: 4, cause: 'ghost' },
  ]);
  world.setResource('respawnIntent', false);
  world.setResource('eventQueue', eventQueue);
  // life-system reads the map only on the respawn path (lives > 0); a minimal
  // map keeps the non-terminal decrement scenario realistic.
  world.registerSystem(createLifeSystem());

  return { eventQueue, player, world };
}

function runLifeLostScenario({ lives }) {
  const { eventQueue, player, world } = createLifeLostHarness({ lives });
  world.runFixedStep({ dtMs: FIXED_DT_MS });
  return { events: drain(eventQueue), player };
}

// --- LevelCleared → Victory harness (level-progress-system) ---

function createClearedFinalLevelMap() {
  // Final level (level 3 with default totalLevels 3) whose grid carries no
  // pellets or power pellets, so the system immediately treats it as cleared.
  return createMapResource({
    level: 3,
    metadata: {
      activeGhostTypes: [0],
      ghostSpeed: 4,
      maxGhosts: 1,
      name: 'B-09 Cleared Final Level',
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
      ghostHouse: { bottomRow: 3, leftCol: 2, rightCol: 2, topRow: 3 },
      ghostSpawnPoint: { row: 3, col: 2 },
      player: { row: 2, col: 2 },
    },
  });
}

function createLevelClearedHarness() {
  const world = new World();
  const eventQueue = createEventQueue();

  world.setResource('mapResource', createClearedFinalLevelMap());
  world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
  world.setResource('levelFlow', {});
  world.setResource('eventQueue', eventQueue);
  world.registerSystem(createLevelProgressSystem());

  return { eventQueue, world };
}

function runLevelClearedScenario() {
  const { eventQueue, world } = createLevelClearedHarness();
  // Frame 0: PLAYING → LEVEL_COMPLETE emits LevelCleared.
  world.runFixedStep({ dtMs: FIXED_DT_MS });
  // Frame 1: LEVEL_COMPLETE → VICTORY (final level) emits Victory.
  world.runFixedStep({ dtMs: FIXED_DT_MS });
  return { events: drain(eventQueue), world };
}

// --- GameOver (time) harness (timer-system) ---

function createTimerGameOverHarness() {
  const world = new World();
  const eventQueue = createEventQueue();

  world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
  // Start with the countdown already drained so the single fixed step expires it.
  world.setResource('levelTimer', {
    activeLevel: 1,
    durationSeconds: 1,
    remainingSeconds: 0.001,
  });
  world.setResource('eventQueue', eventQueue);
  world.registerSystem(createTimerSystem());

  return { eventQueue, world };
}

describe('B-09 life-system lifecycle emission', () => {
  it('emits LifeLost then GameOver when the final life is consumed', () => {
    const { events, player } = runLifeLostScenario({ lives: 1 });

    expect(events).toEqual([
      {
        frame: 0,
        order: 0,
        payload: {
          entityId: player.id,
          livesRemaining: 0,
          sourceSystem: GAMEPLAY_EVENT_SOURCE.LIFE,
          tile: { row: 3, col: 4 },
        },
        type: GAMEPLAY_EVENT_TYPE.LIFE_LOST,
      },
      {
        frame: 0,
        order: 1,
        payload: {
          cause: GAME_OVER_CAUSE.LIVES,
          sourceSystem: GAMEPLAY_EVENT_SOURCE.LIFE,
        },
        type: GAMEPLAY_EVENT_TYPE.GAME_OVER,
      },
    ]);
  });

  it('emits only LifeLost (no GameOver) when lives remain after death', () => {
    const { events, player } = runLifeLostScenario({ lives: 3 });

    expect(events).toEqual([
      {
        frame: 0,
        order: 0,
        payload: {
          entityId: player.id,
          livesRemaining: 2,
          sourceSystem: GAMEPLAY_EVENT_SOURCE.LIFE,
          tile: { row: 3, col: 4 },
        },
        type: GAMEPLAY_EVENT_TYPE.LIFE_LOST,
      },
    ]);
  });

  it('produces identical LifeLost → GameOver streams across repeated runs', () => {
    expect(runLifeLostScenario({ lives: 1 }).events).toEqual(
      runLifeLostScenario({ lives: 1 }).events,
    );
  });
});

describe('B-09 level-progress lifecycle emission', () => {
  it('emits LevelCleared then Victory across the final-level transition', () => {
    const { events, world } = runLevelClearedScenario();

    expect(events).toEqual([
      {
        frame: 0,
        order: 0,
        payload: {
          level: 3,
          sourceSystem: GAMEPLAY_EVENT_SOURCE.LEVEL_PROGRESS,
        },
        type: GAMEPLAY_EVENT_TYPE.LEVEL_CLEARED,
      },
      {
        // The queue's order counter is monotonic until drained, so a Victory
        // emitted on the next frame keeps climbing past the LevelCleared order.
        frame: 1,
        order: 1,
        payload: {
          sourceSystem: GAMEPLAY_EVENT_SOURCE.LEVEL_PROGRESS,
        },
        type: GAMEPLAY_EVENT_TYPE.VICTORY,
      },
    ]);
    expect(world.getResource('gameStatus').currentState).toBe(GAME_STATE.VICTORY);
  });

  it('produces identical LevelCleared → Victory streams across repeated runs', () => {
    expect(runLevelClearedScenario().events).toEqual(runLevelClearedScenario().events);
  });
});

describe('B-09 timer-system lifecycle emission', () => {
  it('emits a single GameOver(time) on the expiry transition only', () => {
    const { eventQueue, world } = createTimerGameOverHarness();

    world.runFixedStep({ dtMs: FIXED_DT_MS });
    const firstFrame = drain(eventQueue);

    expect(firstFrame).toEqual([
      {
        frame: 0,
        order: 0,
        payload: {
          cause: GAME_OVER_CAUSE.TIME,
          sourceSystem: GAMEPLAY_EVENT_SOURCE.TIMER,
        },
        type: GAMEPLAY_EVENT_TYPE.GAME_OVER,
      },
    ]);
    expect(world.getResource('gameStatus').currentState).toBe(GAME_STATE.GAME_OVER);

    // A subsequent frame must not re-emit GameOver now that the state already
    // settled into GAME_OVER.
    world.runFixedStep({ dtMs: FIXED_DT_MS });
    expect(drain(eventQueue)).toEqual([]);
  });
});

/**
 * Integration test for BUG-20: Victory flow event emission.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createClock } from '../../../src/ecs/resources/clock.js';
import { CELL_TYPE } from '../../../src/ecs/resources/constants.js';
import { createEventQueue, drain } from '../../../src/ecs/resources/event-queue.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import {
  GAMEPLAY_EVENT_SOURCE,
  GAMEPLAY_EVENT_TYPE,
} from '../../../src/ecs/systems/collision-gameplay-events.js';
import { createLevelProgressSystem } from '../../../src/ecs/systems/level-progress-system.js';
import { World } from '../../../src/ecs/world/world.js';
import { createGameFlow } from '../../../src/game/game-flow.js';

describe('Victory Flow (BUG-20)', () => {
  it('transitions to LEVEL_COMPLETE and then emits Victory on next-level flow', () => {
    const world = new World();
    const eventQueue = createEventQueue();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);
    const clock = createClock(0);

    // Create a map with 0 pellets to trigger LEVEL_COMPLETE
    const root = path.resolve(import.meta.dirname, '../../..');
    const dataPath = path.join(root, 'assets/maps/level-3.json');
    const rawMap = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    // Clear all pellets
    for (let r = 0; r < rawMap.grid.length; r++) {
      for (let c = 0; c < rawMap.grid[r].length; c++) {
        if (
          rawMap.grid[r][c] === CELL_TYPE.PELLET ||
          rawMap.grid[r][c] === CELL_TYPE.POWER_PELLET
        ) {
          rawMap.grid[r][c] = CELL_TYPE.EMPTY;
        }
      }
    }
    const mapResource = createMapResource(rawMap);

    world.setResource('eventQueue', eventQueue);
    world.setResource('gameStatus', gameStatus);
    world.setResource('clock', clock);
    world.setResource('mapResource', mapResource);

    const levelLoader = {
      advanceLevel: vi.fn(() => null), // Indicates final level complete
    };

    const gameFlow = createGameFlow({ gameStatus, clock, levelLoader, world });
    const levelProgressSystem = createLevelProgressSystem();

    // Step 1: Step the world to trigger LEVEL_COMPLETE
    levelProgressSystem.update({ world, frame: 1 });
    expect(gameStatus.currentState).toBe(GAME_STATE.LEVEL_COMPLETE);

    // Step 2: Call startGame to trigger VICTORY and emit event
    const result = gameFlow.startGame();
    expect(result).toBe(true);
    expect(gameStatus.currentState).toBe(GAME_STATE.VICTORY);

    // Step 3: Assert Victory event was emitted
    const events = drain(eventQueue);
    const victoryEvent = events.find((e) => e.type === GAMEPLAY_EVENT_TYPE.VICTORY);
    expect(victoryEvent).toBeDefined();
    expect(victoryEvent.payload.sourceSystem).toBe(GAMEPLAY_EVENT_SOURCE.LEVEL_PROGRESS);
  });
});

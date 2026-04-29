/**
 * Unit tests for the C-03 ghost spawn timing system.
 *
 * These checks verify deterministic stagger timing, active-cap enforcement,
 * FIFO queue behavior, respawn requeue handling, and duplicate protection
 * with no DOM-facing dependencies or runtime bootstrap wiring.
 */

import { describe, expect, it } from 'vitest';

import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import {
  createInitialSpawnState,
  createSpawnSystem,
  DEFAULT_DEAD_GHOST_IDS_RESOURCE_KEY,
  DEFAULT_SPAWN_RESOURCE_KEY,
  getRespawnDelayMs,
  scheduleRespawn,
} from '../../../src/ecs/systems/spawn-system.js';
import { World } from '../../../src/ecs/world/world.js';

function updateSpawn(spawnSystem, world, dtMs = 0) {
  spawnSystem.update({ world, dtMs });
}

function advanceSpawnTime(spawnSystem, world, totalMs, stepMs = 1000) {
  let remainingMs = totalMs;

  while (remainingMs > 0) {
    const nextStepMs = Math.min(stepMs, remainingMs);
    updateSpawn(spawnSystem, world, nextStepMs);
    remainingMs -= nextStepMs;
  }
}

function createMapResourceStub(maxGhosts = 4) {
  return { maxGhosts };
}

function createSpawnHarness({
  gameState = GAME_STATE.PLAYING,
  ghostIds = [0, 1, 2, 3],
  maxGhosts = 4,
  deadGhostIds = undefined,
  spawnState = null,
} = {}) {
  const world = new World();
  const spawnSystem = createSpawnSystem();

  world.setResource('gameStatus', createGameStatus(gameState));
  world.setResource('mapResource', createMapResourceStub(maxGhosts));
  world.setResource('ghostIds', ghostIds);
  if (deadGhostIds !== undefined) {
    world.setResource(DEFAULT_DEAD_GHOST_IDS_RESOURCE_KEY, deadGhostIds);
  }

  if (spawnState) {
    world.setResource(DEFAULT_SPAWN_RESOURCE_KEY, spawnState);
  }

  return { spawnSystem, world };
}

function getSpawnState(world) {
  return world.getResource(DEFAULT_SPAWN_RESOURCE_KEY);
}

describe('spawn-system', () => {
  it('releases only the first ghost at 0ms', () => {
    const { spawnSystem, world } = createSpawnHarness();

    updateSpawn(spawnSystem, world, 0);

    expect(getSpawnState(world)).toEqual({
      elapsedMs: 0,
      releasedGhostIds: [0],
      queuedGhostIds: [],
      respawnQueue: [],
      activeGhostCap: 4,
    });
  });

  it('does not release the second ghost before 5000ms', () => {
    const { spawnSystem, world } = createSpawnHarness();

    advanceSpawnTime(spawnSystem, world, 4999);

    expect(getSpawnState(world).releasedGhostIds).toEqual([0]);
    expect(getSpawnState(world).queuedGhostIds).toEqual([]);
  });

  it('makes the second ghost eligible at 5000ms', () => {
    const { spawnSystem, world } = createSpawnHarness();

    advanceSpawnTime(spawnSystem, world, 5000);

    expect(getSpawnState(world).releasedGhostIds).toEqual([0, 1]);
    expect(getSpawnState(world).queuedGhostIds).toEqual([]);
  });

  it('enforces the active ghost cap and keeps additional eligible ghosts queued', () => {
    const { spawnSystem, world } = createSpawnHarness({
      maxGhosts: 2,
    });

    advanceSpawnTime(spawnSystem, world, 15000);

    expect(getSpawnState(world).activeGhostCap).toBe(2);
    expect(getSpawnState(world).releasedGhostIds).toEqual([0, 1]);
    expect(getSpawnState(world).queuedGhostIds).toEqual([2, 3]);
  });

  it('releases ghosts in deterministic FIFO order when slots free', () => {
    const { spawnSystem, world } = createSpawnHarness({
      maxGhosts: 2,
      spawnState: {
        elapsedMs: 15000,
        releasedGhostIds: [0, 1],
        queuedGhostIds: [2, 3],
        respawnQueue: [],
        activeGhostCap: 2,
      },
    });
    scheduleRespawn(getSpawnState(world), 0);

    updateSpawn(spawnSystem, world, 0);

    expect(getSpawnState(world).releasedGhostIds).toEqual([1, 2]);
    expect(getSpawnState(world).queuedGhostIds).toEqual([3]);
    expect(getSpawnState(world).respawnQueue).toEqual([
      { ghostId: 0, readyAtMs: 15000 + getRespawnDelayMs() },
    ]);
  });

  it('schedules respawn using elapsedMs plus the canonical 5000ms delay', () => {
    const spawnState = {
      elapsedMs: 4000,
      releasedGhostIds: [0, 1],
      queuedGhostIds: [],
      respawnQueue: [],
      activeGhostCap: 2,
    };

    scheduleRespawn(spawnState, 1);

    expect(spawnState.respawnQueue).toEqual([{ ghostId: 1, readyAtMs: 9000 }]);
  });

  it('does not release respawning ghosts before readyAtMs', () => {
    const { spawnSystem, world } = createSpawnHarness({
      maxGhosts: 2,
      spawnState: {
        elapsedMs: 4000,
        releasedGhostIds: [0, 1],
        queuedGhostIds: [],
        respawnQueue: [],
        activeGhostCap: 2,
      },
    });
    scheduleRespawn(getSpawnState(world), 1);

    advanceSpawnTime(spawnSystem, world, 1000);

    expect(getSpawnState(world).elapsedMs).toBe(5000);
    expect(getSpawnState(world).releasedGhostIds).toEqual([0]);
    expect(getSpawnState(world).queuedGhostIds).toEqual([]);
    expect(getSpawnState(world).respawnQueue).toEqual([
      { ghostId: 1, readyAtMs: 4000 + getRespawnDelayMs() },
    ]);
  });

  it('runs the full death to schedule to wait to release flow', () => {
    const { spawnSystem, world } = createSpawnHarness({
      maxGhosts: 2,
      deadGhostIds: [1],
      spawnState: {
        elapsedMs: 14000,
        releasedGhostIds: [0, 1],
        queuedGhostIds: [2],
        respawnQueue: [],
        activeGhostCap: 2,
      },
    });

    updateSpawn(spawnSystem, world, 0);

    expect(getSpawnState(world).elapsedMs).toBe(14000);
    expect(getSpawnState(world).releasedGhostIds).toEqual([0, 2]);
    expect(getSpawnState(world).queuedGhostIds).toEqual([]);
    expect(getSpawnState(world).respawnQueue).toEqual([
      { ghostId: 1, readyAtMs: 14000 + getRespawnDelayMs() },
    ]);
    expect(world.getResource(DEFAULT_DEAD_GHOST_IDS_RESOURCE_KEY)).toEqual([1]);

    advanceSpawnTime(spawnSystem, world, getRespawnDelayMs() - 1);

    expect(getSpawnState(world).elapsedMs).toBe(18999);
    expect(getSpawnState(world).releasedGhostIds).toEqual([0, 2]);
    expect(getSpawnState(world).queuedGhostIds).toEqual([3]);
    expect(getSpawnState(world).respawnQueue).toEqual([
      { ghostId: 1, readyAtMs: 14000 + getRespawnDelayMs() },
    ]);

    advanceSpawnTime(spawnSystem, world, 1);

    expect(getSpawnState(world).elapsedMs).toBe(19000);
    expect(getSpawnState(world).releasedGhostIds).toEqual([0, 2]);
    expect(getSpawnState(world).queuedGhostIds).toEqual([3, 1]);
    expect(getSpawnState(world).respawnQueue).toEqual([]);
  });

  it('never duplicates a ghost id in releasedGhostIds or respawnQueue', () => {
    const { spawnSystem, world } = createSpawnHarness({
      maxGhosts: 4,
      deadGhostIds: [2, 2, 3],
      spawnState: {
        elapsedMs: 15000,
        releasedGhostIds: [0, 1, 2],
        queuedGhostIds: [2, 3, 2],
        respawnQueue: [],
        activeGhostCap: 4,
      },
    });

    updateSpawn(spawnSystem, world, 0);

    expect(getSpawnState(world).releasedGhostIds).toEqual([0, 1]);
    expect(getSpawnState(world).queuedGhostIds).toEqual([]);
    expect(getSpawnState(world).respawnQueue).toEqual([
      { ghostId: 2, readyAtMs: 15000 + getRespawnDelayMs() },
      { ghostId: 3, readyAtMs: 15000 + getRespawnDelayMs() },
    ]);
  });

  it('initializes missing state with the canonical spawn-state defaults', () => {
    const { spawnSystem, world } = createSpawnHarness({
      ghostIds: [0, 1],
      maxGhosts: 2,
    });

    updateSpawn(spawnSystem, world, 0);

    expect(getSpawnState(world)).toEqual({
      ...createInitialSpawnState(),
      activeGhostCap: 2,
      releasedGhostIds: [0],
    });
  });
});

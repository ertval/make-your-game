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
  getGhostReleaseDelayMs,
  getRespawnDelayMs,
  resolveDeterministicGhostOrder,
  sanitizeSpawnState,
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

  it('updates activeGhostCap when mapResource.maxGhosts changes', () => {
    const { spawnSystem, world } = createSpawnHarness({
      maxGhosts: 2,
      spawnState: {
        elapsedMs: 10000,
        releasedGhostIds: [0, 1],
        queuedGhostIds: [],
        respawnQueue: [],
        activeGhostCap: 2,
      },
    });

    world.setResource('mapResource', { maxGhosts: 4 });

    updateSpawn(spawnSystem, world, 0);

    expect(getSpawnState(world).activeGhostCap).toBe(4);
  });

  it('fallback ghost order respects the active cap instead of forcing POOL_GHOSTS', () => {
    expect(resolveDeterministicGhostOrder([], 2)).toEqual([0, 1]);
    expect(resolveDeterministicGhostOrder([], 0)).toEqual([]);
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

  it('does not schedule respawn for invalid ghostId', () => {
    const spawnState = createInitialSpawnState();

    const result = scheduleRespawn(spawnState, 'invalid');

    expect(result).toBe(false);
    expect(spawnState.respawnQueue).toEqual([]);
  });

  it('does not schedule duplicate respawn entries', () => {
    const spawnState = createInitialSpawnState();
    spawnState.elapsedMs = 1000;

    scheduleRespawn(spawnState, 1);
    const result = scheduleRespawn(spawnState, 1);

    expect(result).toBe(false);
    expect(spawnState.respawnQueue.length).toBe(1);
  });

  it('sorts respawn entries by ghostId when readyAtMs ties', () => {
    const spawnState = createInitialSpawnState();

    scheduleRespawn(spawnState, 3);
    scheduleRespawn(spawnState, 1);

    expect(spawnState.respawnQueue).toEqual([
      { ghostId: 1, readyAtMs: getRespawnDelayMs() },
      { ghostId: 3, readyAtMs: getRespawnDelayMs() },
    ]);
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
    expect(world.getResource(DEFAULT_DEAD_GHOST_IDS_RESOURCE_KEY)).toEqual([]);

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

  it('does not reschedule a stale death intent after the respawn entry is consumed', () => {
    const { spawnSystem, world } = createSpawnHarness({
      maxGhosts: 4,
      deadGhostIds: [1],
      spawnState: {
        elapsedMs: 14000,
        releasedGhostIds: [0, 1, 2],
        queuedGhostIds: [3],
        respawnQueue: [],
        activeGhostCap: 4,
      },
    });

    updateSpawn(spawnSystem, world, 0);

    expect(getSpawnState(world).respawnQueue).toEqual([
      { ghostId: 1, readyAtMs: 14000 + getRespawnDelayMs() },
    ]);
    expect(world.getResource(DEFAULT_DEAD_GHOST_IDS_RESOURCE_KEY)).toEqual([]);

    advanceSpawnTime(spawnSystem, world, getRespawnDelayMs());

    expect(getSpawnState(world).respawnQueue).toEqual([]);
    expect(getSpawnState(world).queuedGhostIds).toEqual([]);
    expect(getSpawnState(world).releasedGhostIds).toEqual([0, 2, 3, 1]);

    updateSpawn(spawnSystem, world, 0);

    expect(getSpawnState(world).respawnQueue).toEqual([]);
    expect(getSpawnState(world).queuedGhostIds).toEqual([]);
    expect(getSpawnState(world).releasedGhostIds).toEqual([0, 2, 3, 1]);
    expect(world.getResource(DEFAULT_DEAD_GHOST_IDS_RESOURCE_KEY)).toEqual([]);
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

  it('sets activeGhostCap to 0 when mapResource is invalid', () => {
    const { spawnSystem, world } = createSpawnHarness({
      maxGhosts: null,
    });

    updateSpawn(spawnSystem, world, 0);

    expect(getSpawnState(world).activeGhostCap).toBe(0);
  });

  it('falls back to default ghost ids when ghostIds is invalid', () => {
    const { spawnSystem, world } = createSpawnHarness({
      ghostIds: null,
      maxGhosts: 2,
    });

    updateSpawn(spawnSystem, world, 0);

    const state = getSpawnState(world);

    expect(state.releasedGhostIds.length).toBeGreaterThan(0);
  });

  it('falls back to the final canonical delay when ghost release index exceeds the table', () => {
    expect(getGhostReleaseDelayMs(999)).toBe(15000);
  });

  it('falls back to generated ghost ids when the provided order has no finite entries', () => {
    expect(resolveDeterministicGhostOrder(['bad'], 2)).toEqual([0, 1]);
  });

  it('does not advance elapsedMs for invalid dtMs', () => {
    const { spawnSystem, world } = createSpawnHarness();

    updateSpawn(spawnSystem, world, -100);

    expect(getSpawnState(world).elapsedMs).toBe(0);
  });

  it('ignores invalid deadGhostIds resources without mutating released ghosts', () => {
    const { spawnSystem, world } = createSpawnHarness({
      spawnState: {
        elapsedMs: 0,
        releasedGhostIds: [0],
        queuedGhostIds: [],
        respawnQueue: [],
        activeGhostCap: 4,
      },
    });

    world.setResource(DEFAULT_DEAD_GHOST_IDS_RESOURCE_KEY, 'invalid');

    updateSpawn(spawnSystem, world, 0);

    expect(getSpawnState(world).releasedGhostIds).toEqual([0]);
    expect(getSpawnState(world).respawnQueue).toEqual([]);
  });

  it('does not advance time when game is not PLAYING', () => {
    const { spawnSystem, world } = createSpawnHarness({
      gameState: GAME_STATE.PAUSED,
    });

    updateSpawn(spawnSystem, world, 1000);

    expect(getSpawnState(world).elapsedMs).toBe(0);
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

  it('replaces invalid spawn state with initial state', () => {
    const world = new World();
    const spawnSystem = createSpawnSystem();

    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('mapResource', createMapResourceStub(2));
    world.setResource('ghostSpawnState', 'invalid');

    updateSpawn(spawnSystem, world, 0);

    expect(getSpawnState(world)).toMatchObject({
      elapsedMs: 0,
      activeGhostCap: 2,
    });
  });

  // BUG-09 regression: when a ghost's respawn becomes ready on the same tick
  // that `pruneRespawningGhostsFromReleasedIds` runs (i.e. another ghost is
  // still respawning while a released ghost is on the board), the respawning
  // membership snapshot used to re-queue ready ghosts must reflect the queue
  // *after* `processRespawns` drains it. The old code reused the pre-prune
  // snapshot, which still listed the just-readied ghost as "respawning", so it
  // was filtered out of the re-queue and silently lost forever.
  it('re-queues a ghost whose respawn completes while another ghost is still respawning', () => {
    const respawnDelay = getRespawnDelayMs();
    // ghostIds deliberately omits ghost 1 and 2 from the initial release order
    // so the only path that can bring a readied ghost back is the respawn
    // re-queue. (If they were in `ghostIds`, `enqueueNewlyEligibleInitialGhosts`
    // would mask the bug by re-adding them independently.) This mirrors a
    // respawned ghost id that is not part of the current initial spawn order.
    const { spawnSystem, world } = createSpawnHarness({
      maxGhosts: 4,
      ghostIds: [0],
      spawnState: {
        elapsedMs: 20000,
        // Ghost 0 is alive on the board; this is what makes prune fire (both
        // releasedGhostIds and respawnQueue are non-empty at tick start).
        releasedGhostIds: [0],
        queuedGhostIds: [],
        // Ghost 1 is ready exactly this tick; ghost 2 is still penalized.
        respawnQueue: [
          { ghostId: 1, readyAtMs: 20000 },
          { ghostId: 2, readyAtMs: 20000 + respawnDelay },
        ],
        activeGhostCap: 4,
      },
    });

    updateSpawn(spawnSystem, world, 0);

    const state = getSpawnState(world);

    // Ghost 1 must come back: queued then released (cap has room). It must NOT
    // be dropped. Ghost 2 stays in the respawn queue.
    expect(state.releasedGhostIds).toContain(1);
    expect(state.respawnQueue).toEqual([{ ghostId: 2, readyAtMs: 20000 + respawnDelay }]);
    // And ghost 1 is no longer anywhere in the respawn queue.
    expect(state.respawnQueue.some((entry) => entry.ghostId === 1)).toBe(false);
  });

  // BUG-11 regression: scratch membership state must be owned per system
  // instance, not by module globals. Two worlds sharing a module-level Set
  // would corrupt each other's spawn bookkeeping when interleaved.
  it('keeps spawn scratch state isolated between concurrent worlds', () => {
    const harnessA = createSpawnHarness({ maxGhosts: 4, ghostIds: [0, 1, 2, 3] });
    const harnessB = createSpawnHarness({ maxGhosts: 4, ghostIds: [0, 1, 2, 3] });

    // Interleave updates so any shared module-level scratch set would leak from
    // one world's pass into the other's mid-computation.
    advanceSpawnTime(harnessA.spawnSystem, harnessA.world, 5000);
    advanceSpawnTime(harnessB.spawnSystem, harnessB.world, 15000);
    updateSpawn(harnessA.spawnSystem, harnessA.world, 0);

    // World A only reached 5000ms => ghosts 0 and 1 released.
    expect(getSpawnState(harnessA.world).releasedGhostIds).toEqual([0, 1]);
    // World B reached 15000ms independently => all four released.
    expect(getSpawnState(harnessB.world).releasedGhostIds).toEqual([0, 1, 2, 3]);
  });

  it('sanitizes and deterministically sorts respawn queue entries', () => {
    expect(
      sanitizeSpawnState({
        elapsedMs: 4.9,
        releasedGhostIds: [3.9, 'bad'],
        queuedGhostIds: [2.2, null],
        respawnQueue: [
          { ghostId: 4, readyAtMs: 2000 },
          { ghostId: 1, readyAtMs: 2000 },
          { ghostId: 'bad', readyAtMs: 10 },
          null,
        ],
        activeGhostCap: 2.8,
      }),
    ).toEqual({
      elapsedMs: 4,
      releasedGhostIds: [3],
      queuedGhostIds: [2],
      respawnQueue: [
        { ghostId: 1, readyAtMs: 2000 },
        { ghostId: 4, readyAtMs: 2000 },
      ],
      activeGhostCap: 2,
    });
  });
});

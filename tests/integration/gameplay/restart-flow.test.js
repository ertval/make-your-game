/**
 * Integration tests for the game restart flow.
 *
 * Verifies that all gameplay-critical resources (score, timer, lives,
 * spawn state) and internal renderer mappings are correctly reset
 * when a restart is triggered.
 */

import { describe, expect, it, vi } from 'vitest';
import { COLLIDER_TYPE } from '../../../src/ecs/components/spatial.js';
import { FIXED_DT_MS } from '../../../src/ecs/resources/constants.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import { World } from '../../../src/ecs/world/world.js';
import { createBootstrap } from '../../../src/game/bootstrap.js';
import { initializeBombExplosionResources } from '../../../src/game/runtime-bomb-explosion-wiring.js';

function createTestMap() {
  return createMapResource({
    level: 1,
    metadata: {
      activeGhostTypes: [0, 1],
      ghostSpeed: 4.0,
      maxGhosts: 2,
      name: 'Restart Test Map',
      timerSeconds: 120,
    },
    dimensions: { columns: 7, rows: 7 },
    grid: [
      [1, 1, 1, 1, 1, 1, 1],
      [1, 3, 3, 3, 3, 3, 1],
      [1, 3, 3, 3, 3, 3, 1],
      [1, 3, 3, 6, 3, 3, 1],
      [1, 3, 5, 5, 5, 3, 1],
      [1, 3, 5, 5, 5, 3, 1],
      [1, 1, 1, 1, 1, 1, 1],
    ],
    spawn: {
      ghostHouse: { bottomRow: 5, leftCol: 2, rightCol: 4, topRow: 4 },
      ghostSpawnPoint: { col: 3, row: 4 },
      player: { col: 3, row: 3 },
    },
  });
}

describe('Game Restart Flow Integration', () => {
  it('resets score, lives, and timer to defaults on restart', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createTestMap(),
      now: 0,
    });

    // Start game and transition to PLAYING
    bootstrap.gameFlow.startGame({ levelIndex: 0 });

    // 1. Mutate resources to simulate gameplay progress
    const scoreState = bootstrap.world.getResource('scoreState');
    scoreState.totalPoints = 5000;
    scoreState.comboCounter = 5;

    const playerLife = bootstrap.world.getResource('playerLife');
    playerLife.lives = 1;

    const levelTimer = bootstrap.world.getResource('levelTimer');
    levelTimer.remainingSeconds = 10;

    const spawnState = bootstrap.world.getResource('ghostSpawnState');
    spawnState.elapsedMs = 30000;
    spawnState.releasedGhostIds = [0, 1];

    // 2. Trigger Restart
    bootstrap.gameFlow.restartLevel();

    // 3. Verify Resets
    const nextScore = bootstrap.world.getResource('scoreState');
    expect(nextScore.totalPoints).toBe(0);
    expect(nextScore.comboCounter).toBe(0);

    const nextLife = bootstrap.world.getResource('playerLife');
    expect(nextLife.lives).toBe(3);

    const nextTimer = bootstrap.world.getResource('levelTimer');
    // BUG-16: the reset is explicit and immediate — remainingSeconds is
    // already at the level's full duration right after restart, not
    // dependent on timer-system's next tick reinitializing a mismatched
    // activeLevel sentinel.
    expect(nextTimer.activeLevel).toBe(1);
    expect(nextTimer.remainingSeconds).toBe(nextTimer.durationSeconds);

    const nextSpawn = bootstrap.world.getResource('ghostSpawnState');
    expect(nextSpawn.elapsedMs).toBe(0);
    expect(nextSpawn.releasedGhostIds).toHaveLength(0);

    // Verify clock and frames
    expect(bootstrap.world.frame).toBe(0);
    expect(bootstrap.clock.simTimeMs).toBe(0);
  });

  it('resets levelTimer.remainingSeconds to the full level duration on restart', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createTestMap(),
      now: 0,
    });

    let nowMs = 0;
    bootstrap.gameFlow.startGame({ levelIndex: 0 });
    // Advance one fixed step so timer-system initializes levelTimer from the
    // level's canonical duration before we simulate elapsed playtime.
    nowMs += FIXED_DT_MS;
    bootstrap.stepFrame(nowMs);

    const fullDuration = bootstrap.world.getResource('levelTimer').durationSeconds;
    bootstrap.world.getResource('levelTimer').remainingSeconds = fullDuration - 30;

    bootstrap.gameFlow.restartLevel();

    // The restart path itself writes { remainingSeconds: 0, activeLevel: -1 }
    // and relies on timer-system's next tick to reinitialize remainingSeconds
    // from the canonical duration. Advance one more fixed step to observe the
    // value the running game actually presents after a restart.
    nowMs += FIXED_DT_MS;
    bootstrap.stepFrame(nowMs);

    const nextTimer = bootstrap.world.getResource('levelTimer');
    expect(nextTimer.remainingSeconds).toBeCloseTo(fullDuration, 1);
  });

  it('BUG-16: resets remainingSeconds explicitly, without depending on an activeLevel sentinel mismatch', () => {
    // Bootstrap's onRestart now writes levelTimer with activeLevel already set
    // to the CURRENT level (not the old -1 sentinel) and remainingSeconds
    // already at the canonical full duration. This proves the reset itself is
    // explicit: even with activeLevel matching from the start (the exact
    // condition that would make timer-system's needsInitialization branch a
    // no-op), remainingSeconds is still correctly at full duration immediately
    // after restart, with no dependency on a mismatched-activeLevel sentinel
    // forcing a later reinitialization.
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createTestMap(),
      now: 0,
    });

    let nowMs = 0;
    bootstrap.gameFlow.startGame({ levelIndex: 0 });
    nowMs += FIXED_DT_MS;
    bootstrap.stepFrame(nowMs);

    const fullDuration = bootstrap.world.getResource('levelTimer').durationSeconds;
    bootstrap.world.getResource('levelTimer').remainingSeconds = fullDuration - 30;

    bootstrap.gameFlow.restartLevel();

    const immediatelyAfterRestart = bootstrap.world.getResource('levelTimer');
    expect(immediatelyAfterRestart.activeLevel).toBe(1);
    expect(immediatelyAfterRestart.remainingSeconds).toBe(fullDuration);
  });

  it('resets the sprite pool and clears renderer mapping', () => {
    // We use a real bootstrap but with a mocked sprite pool to verify calls
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createTestMap(),
      now: 0,
    });

    const spritePool = bootstrap.world.getResource('spritePool');
    if (spritePool) {
      vi.spyOn(spritePool, 'reset');
    }

    bootstrap.gameFlow.startGame({ levelIndex: 0 });

    // Simulate one frame of rendering to fill the entityElementMap
    bootstrap.stepFrame(16);

    // Trigger restart
    bootstrap.gameFlow.restartLevel();

    if (spritePool) {
      expect(spritePool.reset).toHaveBeenCalled();
    }

    // Verify frame reset which triggers render-dom-system clear
    expect(bootstrap.world.frame).toBe(0);
  });

  it('BUG-11: rebuilding bomb/fire pools over recycled ids clears stale prop lanes', () => {
    // Reproduces the restart teardown at the layer the bug lives: a restart
    // destroys every entity and then rebuilds the pools from recycled ids via
    // initializeBombExplosionResources (bootstrap.js onRestart). The pool
    // builder — not an incidental deactivate pass elsewhere — must guarantee a
    // freshly pooled slot is inert.
    const maxEntities = 200;
    const world = new World({ maxEntities });
    initializeBombExplosionResources(world, { maxEntities });

    const colliderStore = world.getResource('collider');
    const bombStore = world.getResource('bomb');
    const fireStore = world.getResource('fire');

    // Activate a pooled bomb mid-fuse and a fire tile mid-burn — the live prop
    // state present in the SoA lanes at the instant a restart tears down.
    const stagedBombId = world.getResource('bombEntityPool')[0].id;
    colliderStore.type[stagedBombId] = COLLIDER_TYPE.BOMB;
    bombStore.fuseMs[stagedBombId] = 1500;
    bombStore.ownerId[stagedBombId] = 7;

    const stagedFireId = world.getResource('fireEntityPool')[0].id;
    colliderStore.type[stagedFireId] = COLLIDER_TYPE.FIRE;
    fireStore.burnTimerMs[stagedFireId] = 800;
    fireStore.chainDepth[stagedFireId] = 3;

    // Restart: destroy every entity (freeing the ids for recycling) then
    // rebuild the pools — the same two steps bootstrap's onRestart performs.
    world.deferDestroyAllEntities();
    world.flushDeferredMutations();
    initializeBombExplosionResources(world, { maxEntities });

    // Every rebuilt slot must read as fully inactive. Before the fix,
    // createInactivePooledPropEntity only reset the collider type, so a
    // recycled slot kept the prior entity's fuse/burn/owner/chain values.
    for (const handle of world.getResource('bombEntityPool')) {
      expect(bombStore.fuseMs[handle.id]).toBe(0);
      expect(bombStore.ownerId[handle.id]).toBe(-1);
      expect(colliderStore.type[handle.id]).toBe(COLLIDER_TYPE.NONE);
    }

    for (const handle of world.getResource('fireEntityPool')) {
      expect(fireStore.burnTimerMs[handle.id]).toBe(0);
      expect(fireStore.chainDepth[handle.id]).toBe(0);
      expect(colliderStore.type[handle.id]).toBe(COLLIDER_TYPE.NONE);
    }
  });

  it('clears transient intents to prevent stale actions after restart', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createTestMap(),
      now: 0,
    });

    bootstrap.gameFlow.startGame({ levelIndex: 0 });

    // Fill intents
    bootstrap.world.setResource('collisionIntents', [{ type: 'player-death' }]);
    bootstrap.world.setResource('deadGhostIds', [0, 1]);
    bootstrap.world.setResource('pauseIntent', { toggle: true });

    bootstrap.gameFlow.restartLevel();

    expect(bootstrap.world.getResource('collisionIntents')).toHaveLength(0);
    expect(bootstrap.world.getResource('deadGhostIds')).toHaveLength(0);
    expect(bootstrap.world.getResource('pauseIntent')).toEqual({ toggle: false });
  });
});

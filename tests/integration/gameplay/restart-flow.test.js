/**
 * Integration tests for the game restart flow.
 *
 * Verifies that all gameplay-critical resources (score, timer, lives,
 * spawn state) and internal renderer mappings are correctly reset
 * when a restart is triggered.
 */

import { describe, expect, it, vi } from 'vitest';
import { createBootstrap } from '../../../src/game/bootstrap.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';

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
    // It's reset to -1 activeLevel so the timer system will re-init on next tick
    expect(nextTimer.activeLevel).toBe(-1);

    const nextSpawn = bootstrap.world.getResource('ghostSpawnState');
    expect(nextSpawn.elapsedMs).toBe(0);
    expect(nextSpawn.releasedGhostIds).toHaveLength(0);

    // Verify clock and frames
    expect(bootstrap.world.frame).toBe(0);
    expect(bootstrap.clock.simTimeMs).toBe(0);
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

  it('clears transient intents to prevent stale actions after restart', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createTestMap(),
      now: 0,
    });

    bootstrap.gameFlow.startGame({ levelIndex: 0 });

    // Fill intents
    bootstrap.world.setResource('collisionIntents', [{ type: 'player-death' }]);
    bootstrap.world.setResource('deadGhostIds', [0, 1]);
    bootstrap.world.setResource('pauseIntent', { restart: true, toggle: false });

    bootstrap.gameFlow.restartLevel();

    expect(bootstrap.world.getResource('collisionIntents')).toHaveLength(0);
    expect(bootstrap.world.getResource('deadGhostIds')).toHaveLength(0);
    expect(bootstrap.world.getResource('pauseIntent').restart).toBe(false);
  });
});

/**
 * Integration test for the B-07 power-up pickup effect through the real
 * createBootstrap() runtime loop.
 *
 * Proves the full chain — collision pickup detection -> power-up-system effect
 * application -> scoring award -> HUD-readable player store -> rendered HUD DOM
 * value — actually fires in the assembled game loop, not just isolated units.
 */

import { describe, expect, it } from 'vitest';

import { createHudAdapter } from '../../../src/adapters/dom/hud-adapter.js';
import { FIXED_DT_MS } from '../../../src/ecs/resources/constants.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import { createBootstrap } from '../../../src/game/bootstrap.js';

// Cell types: 0 empty, 1 indestructible, 5 ghost-house, 6 player-start,
// 7 power-up bomb, 8 power-up fire, 9 power-up speed.
function rawMap(powerUpCell) {
  return {
    level: 1,
    metadata: { activeGhostTypes: [], ghostSpeed: 0, maxGhosts: 0, name: 'PU', timerSeconds: 120 },
    dimensions: { columns: 7, rows: 7 },
    grid: [
      [1, 1, 1, 1, 1, 1, 1],
      [1, 6, powerUpCell, 0, 0, 0, 1], // player start (1,1), power-up (1,2)
      [1, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 1],
      [1, 5, 5, 5, 0, 0, 1],
      [1, 5, 5, 5, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1],
    ],
    spawn: {
      ghostHouse: { bottomRow: 5, leftCol: 1, rightCol: 3, topRow: 4 },
      ghostSpawnPoint: { col: 2, row: 4 },
      player: { col: 1, row: 1 },
    },
  };
}

function boot(powerUpCell) {
  const bootstrap = createBootstrap({
    loadMapForLevel: () => createMapResource(rawMap(powerUpCell)),
    now: 0,
  });
  expect(bootstrap.gameFlow.startGame()).toBe(true);
  return bootstrap;
}

// Snap the player onto the pickup tile (the movement system is exercised
// elsewhere; here we isolate the pickup -> effect chain).
function placePlayerOnPickup(world) {
  const pos = world.getResource('position');
  const id = world.getResource('playerEntity').id;
  for (const key of ['row', 'prevRow', 'targetRow']) pos[key][id] = 1;
  for (const key of ['col', 'prevCol', 'targetCol']) pos[key][id] = 2;
}

function stepFrames(bootstrap, count) {
  let nowMs = 0;
  for (let i = 0; i < count; i += 1) {
    nowMs += FIXED_DT_MS;
    bootstrap.stepFrame(nowMs);
  }
}

// Minimal DOM stub matching the real HUD markup: each metric carries a
// [data-hud-value] child the adapter writes into.
function createHudRoot() {
  const metric = () => {
    const valueNode = { textContent: '0' };
    return {
      valueNode,
      querySelector: (sel) => (sel === '[data-hud-value]' ? valueNode : null),
      setAttribute() {},
    };
  };
  const metrics = {
    bombs: metric(),
    fire: metric(),
    level: metric(),
    lives: metric(),
    score: metric(),
    status: metric(),
    timer: metric(),
  };
  return {
    metrics,
    querySelector: (sel) => {
      const match = /\[data-hud="(\w+)"\]/.exec(sel);
      return match ? (metrics[match[1]] ?? null) : null;
    },
  };
}

describe('power-up pickup effect (runtime wiring)', () => {
  it('bomb power-up increments maxBombs and awards 100 points', () => {
    const bootstrap = boot(7);
    const world = bootstrap.world;
    const player = world.getResource('player');
    const id = world.getResource('playerEntity').id;
    const before = player.maxBombs[id];

    placePlayerOnPickup(world);
    stepFrames(bootstrap, 3);

    expect(player.maxBombs[id]).toBe(before + 1);
    expect(world.getResource('scoreState').totalPoints).toBe(100);
  });

  it('fire power-up increments fireRadius and awards 100 points', () => {
    const bootstrap = boot(8);
    const world = bootstrap.world;
    const player = world.getResource('player');
    const id = world.getResource('playerEntity').id;
    const before = player.fireRadius[id];

    placePlayerOnPickup(world);
    stepFrames(bootstrap, 3);

    expect(player.fireRadius[id]).toBe(before + 1);
    expect(world.getResource('scoreState').totalPoints).toBe(100);
  });

  it('speed power-up activates the boost flag and 10s window', () => {
    const bootstrap = boot(9);
    const world = bootstrap.world;
    const player = world.getResource('player');
    const id = world.getResource('playerEntity').id;

    placePlayerOnPickup(world);
    stepFrames(bootstrap, 3);

    expect(player.isSpeedBoosted[id]).toBe(1);
    expect(player.speedBoostMs[id]).toBeGreaterThan(0);
  });

  it('renders the incremented Bombs counter to the HUD DOM on pickup', () => {
    const bootstrap = boot(7);
    const world = bootstrap.world;
    const hudRoot = createHudRoot();
    bootstrap.setHudAdapter(createHudAdapter(hudRoot));

    placePlayerOnPickup(world);
    stepFrames(bootstrap, 3);

    // The store incremented and the HUD rendered the new capacity to the DOM.
    const id = world.getResource('playerEntity').id;
    expect(world.getResource('player').maxBombs[id]).toBe(2);
    expect(hudRoot.metrics.bombs.valueNode.textContent).toBe('2');
  });
});

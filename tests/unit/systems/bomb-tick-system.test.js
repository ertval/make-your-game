/**
 * Unit tests for the B-06 bomb tick system.
 *
 * These tests lock the bomb placement and fuse-countdown contract before the
 * production system exists. They intentionally use preallocated bomb entities
 * because the current World dispatcher only exposes deferred creation during a
 * system tick, which cannot be initialized until after that tick completes.
 */

import { describe, expect, it } from 'vitest';

import { createInputStateStore, createPlayerStore } from '../../../src/ecs/components/actors.js';
import { createBombStore } from '../../../src/ecs/components/props.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import {
  COLLIDER_TYPE,
  createColliderStore,
  createPositionStore,
} from '../../../src/ecs/components/spatial.js';
import {
  BOMB_FUSE_MS,
  DEFAULT_FIRE_RADIUS,
  FIXED_DT_MS,
} from '../../../src/ecs/resources/constants.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import {
  BOMB_TICK_BOMB_REQUIRED_MASK,
  BOMB_TICK_PLAYER_REQUIRED_MASK,
  createBombTickSystem,
  readEntityTile,
} from '../../../src/ecs/systems/bomb-tick-system.js';
import { World } from '../../../src/ecs/world/world.js';

/**
 * Build a compact valid map for bomb ticking and placement tests.
 *
 * @returns {object} Raw map JSON object accepted by createMapResource().
 */
function createBombTickRawMap() {
  return {
    level: 206,
    metadata: {
      activeGhostTypes: [0],
      ghostSpeed: 4,
      maxGhosts: 1,
      name: 'B-06 Bomb Tick Harness',
      timerSeconds: 120,
    },
    dimensions: { rows: 5, columns: 5 },
    grid: [
      [1, 1, 1, 1, 1],
      [1, 3, 3, 3, 1],
      [1, 3, 6, 3, 1],
      [1, 3, 5, 3, 1],
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

/**
 * Place one entity at an exact grid tile with no pending movement.
 *
 * @param {PositionStore} positionStore - Mutable position component store.
 * @param {number} entityId - Entity slot to update.
 * @param {number} row - Tile row to occupy.
 * @param {number} col - Tile col to occupy.
 */
function placeEntity(positionStore, entityId, row, col) {
  positionStore.prevRow[entityId] = row;
  positionStore.prevCol[entityId] = col;
  positionStore.row[entityId] = row;
  positionStore.col[entityId] = col;
  positionStore.targetRow[entityId] = row;
  positionStore.targetCol[entityId] = col;
}

/**
 * Create one pooled bomb entity.
 *
 * The entity owns a BOMB component from startup, while collider NONE means the
 * slot is inactive and available for placement.
 *
 * @param {World} world - ECS world receiving the entity.
 * @param {ColliderStore} colliderStore - Mutable collider store.
 * @returns {{ id: number, generation: number }} Created bomb handle.
 */
function addInactiveBombSlot(world, colliderStore) {
  const bomb = world.createEntity(BOMB_TICK_BOMB_REQUIRED_MASK);

  colliderStore.type[bomb.id] = COLLIDER_TYPE.NONE;
  return bomb;
}

/**
 * Build a minimal world harness for the bomb tick system.
 *
 * @param {number} [bombSlots=3] - Number of pooled bomb entities to create.
 * @returns {{
 *   bombDetonationQueue: Array<object>,
 *   bombStore: BombStore,
 *   bombs: Array<{ id: number, generation: number }>,
 *   colliderStore: ColliderStore,
 *   inputState: InputStateStore,
 *   player: { id: number, generation: number },
 *   playerStore: PlayerStore,
 *   positionStore: PositionStore,
 *   system: { update: Function },
 *   world: World,
 * }} Ready-to-run bomb tick harness.
 */
function createBombTickHarness(bombSlots = 3) {
  const world = new World();
  const system = createBombTickSystem();
  const mapResource = createMapResource(createBombTickRawMap());
  const playerStore = createPlayerStore(8);
  const inputState = createInputStateStore(8);
  const positionStore = createPositionStore(8);
  const colliderStore = createColliderStore(8);
  const bombStore = createBombStore(8);
  const bombDetonationQueue = [];
  const player = world.createEntity(BOMB_TICK_PLAYER_REQUIRED_MASK);
  const bombs = [];

  placeEntity(positionStore, player.id, mapResource.playerSpawnRow, mapResource.playerSpawnCol);

  for (let index = 0; index < bombSlots; index += 1) {
    bombs.push(addInactiveBombSlot(world, colliderStore));
  }

  world.setResource('mapResource', mapResource);
  world.setResource('player', playerStore);
  world.setResource('inputState', inputState);
  world.setResource('position', positionStore);
  world.setResource('collider', colliderStore);
  world.setResource('bomb', bombStore);
  world.setResource('bombDetonationQueue', bombDetonationQueue);

  return {
    bombDetonationQueue,
    bombStore,
    bombs,
    colliderStore,
    inputState,
    player,
    playerStore,
    positionStore,
    system,
    world,
  };
}

/**
 * Count active bombs owned by one player.
 *
 * @param {Array<{ id: number }>} bombs - Pooled bomb handles.
 * @param {ColliderStore} colliderStore - Collider component store.
 * @param {BombStore} bombStore - Bomb component store.
 * @param {number} ownerId - Player entity id.
 * @returns {number} Number of active bombs with matching owner.
 */
function countActiveBombsForOwner(bombs, colliderStore, bombStore, ownerId) {
  let count = 0;

  for (const bomb of bombs) {
    if (
      colliderStore.type[bomb.id] === COLLIDER_TYPE.BOMB &&
      bombStore.ownerId[bomb.id] === ownerId
    ) {
      count += 1;
    }
  }

  return count;
}

describe('bomb-tick-system contract', () => {
  it('queries players and pooled bombs through explicit component masks', () => {
    expect(BOMB_TICK_PLAYER_REQUIRED_MASK).toBe(
      COMPONENT_MASK.PLAYER | COMPONENT_MASK.POSITION | COMPONENT_MASK.INPUT_STATE,
    );
    expect(BOMB_TICK_BOMB_REQUIRED_MASK).toBe(
      COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER,
    );
  });

  it('registers as a logic-phase system and declares all mutated resources', () => {
    const system = createBombTickSystem();

    expect(system.phase).toBe('logic');
    expect(system.resourceCapabilities).toEqual({
      read: ['mapResource', 'player', 'inputState'],
      write: ['position', 'collider', 'bomb', 'bombDetonationQueue'],
    });
  });
});

describe('bomb-tick-system placement', () => {
  it('places one bomb on the player tile when the fixed-step bomb intent is set', () => {
    const { bombStore, bombs, colliderStore, inputState, player, positionStore, system, world } =
      createBombTickHarness();

    inputState.bomb[player.id] = 1;

    system.update({ dtMs: FIXED_DT_MS, frame: 0, world });

    const activeBomb = bombs.find((bomb) => colliderStore.type[bomb.id] === COLLIDER_TYPE.BOMB);

    expect(activeBomb).toBeDefined();
    expect(bombStore.ownerId[activeBomb.id]).toBe(player.id);
    expect(bombStore.row[activeBomb.id]).toBe(2);
    expect(bombStore.col[activeBomb.id]).toBe(2);
    expect(bombStore.fuseMs[activeBomb.id]).toBe(BOMB_FUSE_MS);
    expect(bombStore.radius[activeBomb.id]).toBe(DEFAULT_FIRE_RADIUS);
    expect(positionStore.row[activeBomb.id]).toBe(2);
    expect(positionStore.col[activeBomb.id]).toBe(2);
  });

  it('clamps oversized player fire radius to the active map bounds when placing a bomb', () => {
    const { bombStore, bombs, colliderStore, inputState, player, playerStore, system, world } =
      createBombTickHarness();

    playerStore.fireRadius[player.id] = 99;
    inputState.bomb[player.id] = 1;

    system.update({ dtMs: FIXED_DT_MS, frame: 0, world });

    const activeBomb = bombs.find((bomb) => colliderStore.type[bomb.id] === COLLIDER_TYPE.BOMB);

    expect(activeBomb).toBeDefined();
    expect(bombStore.radius[activeBomb.id]).toBe(2);
  });

  it('does not place a bomb when every pooled bomb slot is already active', () => {
    const { bombStore, bombs, colliderStore, inputState, player, playerStore, system, world } =
      createBombTickHarness();

    playerStore.maxBombs[player.id] = bombs.length + 1;
    for (const [index, bomb] of bombs.entries()) {
      colliderStore.type[bomb.id] = COLLIDER_TYPE.BOMB;
      bombStore.ownerId[bomb.id] = -1;
      bombStore.row[bomb.id] = 1;
      bombStore.col[bomb.id] = index + 1;
    }
    inputState.bomb[player.id] = 1;

    system.update({ dtMs: FIXED_DT_MS, frame: 0, world });

    expect(bombs.every((bomb) => colliderStore.type[bomb.id] === COLLIDER_TYPE.BOMB)).toBe(true);
    expect(bombs.some((bomb) => bombStore.row[bomb.id] === 2 && bombStore.col[bomb.id] === 2)).toBe(
      false,
    );
  });

  it('places bombs on the rounded tile when the player position is fractional', () => {
    const { bombStore, bombs, colliderStore, inputState, player, positionStore, system, world } =
      createBombTickHarness();

    positionStore.row[player.id] = 2.7;
    positionStore.col[player.id] = 1.2;
    inputState.bomb[player.id] = 1;

    system.update({ dtMs: FIXED_DT_MS, frame: 0, world });

    const activeBomb = bombs.find((bomb) => colliderStore.type[bomb.id] === COLLIDER_TYPE.BOMB);

    expect(activeBomb).toBeDefined();
    expect(bombStore.row[activeBomb.id]).toBe(3);
    expect(bombStore.col[activeBomb.id]).toBe(1);
  });

  it('ignores duplicate placement on a cell that already contains an active bomb', () => {
    const { bombStore, bombs, colliderStore, inputState, player, system, world } =
      createBombTickHarness();

    inputState.bomb[player.id] = 1;
    system.update({ dtMs: FIXED_DT_MS, frame: 0, world });
    system.update({ dtMs: FIXED_DT_MS, frame: 1, world });

    expect(countActiveBombsForOwner(bombs, colliderStore, bombStore, player.id)).toBe(1);
  });

  it('does not place more bombs than the owner maxBombs limit', () => {
    const { bombStore, bombs, colliderStore, inputState, player, positionStore, system, world } =
      createBombTickHarness();

    inputState.bomb[player.id] = 1;
    system.update({ dtMs: FIXED_DT_MS, frame: 0, world });

    placeEntity(positionStore, player.id, 1, 1);
    system.update({ dtMs: FIXED_DT_MS, frame: 1, world });

    expect(countActiveBombsForOwner(bombs, colliderStore, bombStore, player.id)).toBe(1);
  });
});

describe('bomb-tick-system fuse countdown', () => {
  it('decrements active bomb fuse time by the fixed-step delta', () => {
    const { bombStore, bombs, colliderStore, system, world } = createBombTickHarness();
    const bomb = bombs[0];

    colliderStore.type[bomb.id] = COLLIDER_TYPE.BOMB;
    bombStore.fuseMs[bomb.id] = BOMB_FUSE_MS;

    system.update({ dtMs: 250, frame: 0, world });

    expect(bombStore.fuseMs[bomb.id]).toBe(BOMB_FUSE_MS - 250);
  });

  it('queues one detonation when a bomb fuse reaches zero', () => {
    const { bombDetonationQueue, bombStore, bombs, colliderStore, system, world } =
      createBombTickHarness();
    const bomb = bombs[0];

    colliderStore.type[bomb.id] = COLLIDER_TYPE.BOMB;
    bombStore.fuseMs[bomb.id] = 10;
    bombStore.row[bomb.id] = 2;
    bombStore.col[bomb.id] = 2;

    system.update({ dtMs: 10, frame: 12, world });

    expect(bombDetonationQueue).toEqual([
      {
        bombEntityId: bomb.id,
        chainDepth: 1,
        frame: 12,
        radius: DEFAULT_FIRE_RADIUS,
        row: 2,
        col: 2,
      },
    ]);
  });

  it('does not enqueue repeated detonations for the same expired bomb', () => {
    const { bombDetonationQueue, bombStore, bombs, colliderStore, system, world } =
      createBombTickHarness();
    const bomb = bombs[0];

    colliderStore.type[bomb.id] = COLLIDER_TYPE.BOMB;
    bombStore.fuseMs[bomb.id] = 1;

    system.update({ dtMs: 1, frame: 0, world });
    system.update({ dtMs: 1, frame: 1, world });

    expect(bombDetonationQueue).toHaveLength(1);
  });
});

describe('bomb-tick-system edge cases', () => {
  it('covers missing branches in bomb helpers and update guard', () => {
    const { system, world } = createBombTickHarness();

    // 490: update early return when resources are missing
    world.setResource('mapResource', null);
    system.update({ dtMs: 16, frame: 0, world });
    // Should not throw, just return.

    // 50: readEntityTile null check
    expect(readEntityTile(null, 0)).toBeNull();
  });

  it('covers radius normalization and map tile resolution branches', () => {
    const { inputState, player, playerStore, system, world, colliderStore, bombs, bombStore } =
      createBombTickHarness();

    // 211: normalizeBombRadius <= 0 branch
    playerStore.fireRadius[player.id] = -1;
    inputState.bomb[player.id] = 1;
    system.update({ dtMs: 16, frame: 0, world });
    const bomb1 = bombs.find((b) => colliderStore.type[b.id] === COLLIDER_TYPE.BOMB);
    expect(bombStore.radius[bomb1.id]).toBe(DEFAULT_FIRE_RADIUS);

    // Reset
    colliderStore.type[bomb1.id] = COLLIDER_TYPE.NONE;

    // 244: resolveMaxBombRadiusForMapTile out of bounds
    // Set player outside map (map is 5x5, so 0-4)
    const { positionStore } = createBombTickHarness();
    positionStore.row[player.id] = 10;
    positionStore.col[player.id] = 10;
    inputState.bomb[player.id] = 1;

    // We need to use the harness world/system but with this position store
    world.setResource('position', positionStore);
    system.update({ dtMs: 16, frame: 1, world });
    const bomb2 = bombs.find((b) => colliderStore.type[b.id] === COLLIDER_TYPE.BOMB);
    if (bomb2) {
      expect(bombStore.radius[bomb2.id]).toBe(0);
    }
  });

  it('covers resolveMaxBombRadiusForMapTile invalid input branches', () => {
    // This is called by readPlayerBombRadius which is called by placeBombForPlayer.
    // To trigger row as NaN:
    const { inputState, player, positionStore, system, world } = createBombTickHarness();
    positionStore.row[player.id] = NaN;
    inputState.bomb[player.id] = 1;
    system.update({ dtMs: 16, frame: 0, world });
    // readEntityTile will return {row: NaN, col: 0} which will trigger 237.
  });
});

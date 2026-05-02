# Track A Handoff: Wire B6 Bomb/Explosion Runtime Path

## Ownership

Owner: Track A

Recommended ticket target: A-05 integration work, or a dedicated Track A integration branch before A-05 if runtime playability is needed earlier.

Reason: `src/game/bootstrap.js` is owned by Track A. B6 owns pure ECS bomb/explosion simulation systems, but default runtime assembly, resource registration, and system ordering live in Track A.

## Scope Decision

The only reviewed B6 merge concern that is out of Track B scope is runtime wiring in `src/game/bootstrap.js`.

`src/ecs/systems/collision-gameplay-events.js` is Track B-owned:

- It was introduced by B-05 as the Track B gameplay event surface.
- B-06 may use the minimal `BombDetonated` event support needed to emit chain depth.
- Full final event contract cleanup remains B-09.

## Problem

B6 added:

- `src/ecs/systems/bomb-tick-system.js`
- `src/ecs/systems/explosion-system.js`
- bomb/fire component stores and chain metadata

But the default runtime still registers only:

- `input-system`
- `player-move-system`

That means browser runtime gameplay does not currently execute:

- bomb placement from `Space`
- fuse countdown
- detonation queue processing
- fire spawning/lifetime cleanup

The B6 system-level implementation can be merged without this if the PR clearly states runtime wiring is deferred. If playable runtime behavior is required for B6 merge, Track A should take this handoff.

## Required Runtime Changes

Track A needs to update `src/game/bootstrap.js` to:

1. Register B6 component stores/resources:
   - `collider`
   - `bomb`
   - `fire`
   - `bombDetonationQueue`
   - `rng`
2. Preallocate pooled bomb/fire entities before fixed-step systems run.
3. Register B6 logic systems in deterministic order:
   - `bomb-tick-system`
   - `explosion-system`
4. Add tests proving the default runtime path can place a bomb and turn it into fire.

## Proposed Diff

This is the intended implementation shape. It is not applied in B6 because `bootstrap.js` is Track A-owned.

```diff
diff --git a/src/game/bootstrap.js b/src/game/bootstrap.js
--- a/src/game/bootstrap.js
+++ b/src/game/bootstrap.js
@@
 import {
   createInputStateStore,
   createPlayerStore,
   resetInputState,
   resetPlayer,
 } from '../ecs/components/actors.js';
+import { createBombStore, createFireStore } from '../ecs/components/props.js';
+import { COMPONENT_MASK } from '../ecs/components/registry.js';
 import {
+  COLLIDER_TYPE,
+  createColliderStore,
   createPositionStore,
   createVelocityStore,
   resetPosition,
   resetVelocity,
 } from '../ecs/components/spatial.js';
 import { createRenderIntentBuffer, resetRenderIntentBuffer } from '../ecs/render-intent.js';
 import { advanceSimTime, createClock, resetClock, tickClock } from '../ecs/resources/clock.js';
-import { FIXED_DT_MS, MAX_STEPS_PER_FRAME, TOTAL_LEVELS } from '../ecs/resources/constants.js';
+import {
+  FIXED_DT_MS,
+  MAX_STEPS_PER_FRAME,
+  POOL_FIRE,
+  POOL_MAX_BOMBS,
+  TOTAL_LEVELS,
+} from '../ecs/resources/constants.js';
 import { createEventQueue } from '../ecs/resources/event-queue.js';
 import { createGameStatus } from '../ecs/resources/game-status.js';
+import { createRNG } from '../ecs/resources/rng.js';
+import { createBombTickSystem } from '../ecs/systems/bomb-tick-system.js';
+import { createExplosionSystem } from '../ecs/systems/explosion-system.js';
 import { createInputSystem } from '../ecs/systems/input-system.js';
@@
 const DEFAULT_PLAYER_ENTITY_RESOURCE_KEY = 'playerEntity';
 // D-01 canonical resource key for the cross-system deterministic event queue.
 const DEFAULT_EVENT_QUEUE_RESOURCE_KEY = 'eventQueue';
+const DEFAULT_COLLIDER_RESOURCE_KEY = 'collider';
+const DEFAULT_BOMB_RESOURCE_KEY = 'bomb';
+const DEFAULT_FIRE_RESOURCE_KEY = 'fire';
+const DEFAULT_RNG_RESOURCE_KEY = 'rng';
+const DEFAULT_BOMB_DETONATION_QUEUE_RESOURCE_KEY = 'bombDetonationQueue';
+const DEFAULT_BOMB_POOL_RESOURCE_KEY = 'bombEntityPool';
+const DEFAULT_FIRE_POOL_RESOURCE_KEY = 'fireEntityPool';
@@
 function createDefaultSystemsByPhase(options = {}) {
@@
   const mapResourceKey = options.mapResourceKey || 'mapResource';
+  const colliderResourceKey = options.colliderResourceKey || DEFAULT_COLLIDER_RESOURCE_KEY;
+  const bombResourceKey = options.bombResourceKey || DEFAULT_BOMB_RESOURCE_KEY;
+  const fireResourceKey = options.fireResourceKey || DEFAULT_FIRE_RESOURCE_KEY;
+  const rngResourceKey = options.rngResourceKey || DEFAULT_RNG_RESOURCE_KEY;
+  const bombDetonationQueueResourceKey =
+    options.bombDetonationQueueResourceKey || DEFAULT_BOMB_DETONATION_QUEUE_RESOURCE_KEY;
@@
   const playerMoveSystem = createPlayerMoveSystem({
@@
   });
+
+  const bombTickSystem = createBombTickSystem({
+    bombDetonationQueueResourceKey,
+    bombResourceKey,
+    colliderResourceKey,
+    inputStateResourceKey,
+    mapResourceKey,
+    playerResourceKey,
+    positionResourceKey,
+  });
+
+  const explosionSystem = createExplosionSystem({
+    bombDetonationQueueResourceKey,
+    bombResourceKey,
+    colliderResourceKey,
+    eventQueueResourceKey,
+    fireResourceKey,
+    mapResourceKey,
+    positionResourceKey,
+    rngResourceKey,
+  });
 
   return {
     input: [inputSystem],
     physics: [playerMoveSystem],
+    logic: [bombTickSystem, explosionSystem],
   };
 }
@@
 function initializeMovementResources(world, options = {}) {
@@
 }
+
+/**
+ * Create one inactive pooled prop entity.
+ *
+ * The entity keeps its component mask for stable system queries while the
+ * collider type controls active/inactive gameplay participation.
+ *
+ * @param {World} world - ECS world receiving the entity.
+ * @param {ColliderStore} colliderStore - Collider store to initialize.
+ * @param {number} mask - Component mask for the pooled entity.
+ * @returns {{ id: number, generation: number }} Created entity handle.
+ */
+function createInactivePooledPropEntity(world, colliderStore, mask) {
+  const entity = world.createEntity(mask);
+
+  colliderStore.type[entity.id] = COLLIDER_TYPE.NONE;
+  return entity;
+}
+
+/**
+ * Ensure a fixed-size pooled entity handle array exists.
+ *
+ * This avoids allocating or structurally creating bomb/fire entities during
+ * fixed-step system dispatch.
+ *
+ * @param {World} world - ECS world receiving pool entities.
+ * @param {string} poolResourceKey - Resource key storing pool handles.
+ * @param {ColliderStore} colliderStore - Collider store for inactive setup.
+ * @param {number} count - Number of pooled entities.
+ * @param {number} mask - Component mask assigned to every pooled entity.
+ * @returns {Array<{ id: number, generation: number }>} Stable pool handles.
+ */
+function ensurePooledPropEntities(world, poolResourceKey, colliderStore, count, mask) {
+  const existingPool = world.getResource(poolResourceKey);
+  if (Array.isArray(existingPool) && existingPool.length === count) {
+    return existingPool;
+  }
+
+  const pool = [];
+  for (let index = 0; index < count; index += 1) {
+    pool.push(createInactivePooledPropEntity(world, colliderStore, mask));
+  }
+
+  world.setResource(poolResourceKey, pool);
+  return pool;
+}
+
+/**
+ * Allocate the B6 prop stores and pooled bomb/fire entities used by runtime systems.
+ *
+ * @param {World} world - ECS world receiving resources.
+ * @param {object} [options] - Optional resource-key overrides shared with bootstrap.
+ */
+function initializeBombExplosionResources(world, options = {}) {
+  const colliderResourceKey = options.colliderResourceKey || DEFAULT_COLLIDER_RESOURCE_KEY;
+  const positionResourceKey = options.positionResourceKey || DEFAULT_POSITION_RESOURCE_KEY;
+  const bombResourceKey = options.bombResourceKey || DEFAULT_BOMB_RESOURCE_KEY;
+  const fireResourceKey = options.fireResourceKey || DEFAULT_FIRE_RESOURCE_KEY;
+  const rngResourceKey = options.rngResourceKey || DEFAULT_RNG_RESOURCE_KEY;
+  const bombDetonationQueueResourceKey =
+    options.bombDetonationQueueResourceKey || DEFAULT_BOMB_DETONATION_QUEUE_RESOURCE_KEY;
+  const bombPoolResourceKey = options.bombPoolResourceKey || DEFAULT_BOMB_POOL_RESOURCE_KEY;
+  const firePoolResourceKey = options.firePoolResourceKey || DEFAULT_FIRE_POOL_RESOURCE_KEY;
+  const maxEntities = world.entityStore.maxEntities;
+
+  const colliderStore = ensureWorldResource(world, colliderResourceKey, () =>
+    createColliderStore(maxEntities),
+  );
+  ensureWorldResource(world, positionResourceKey, () => createPositionStore(maxEntities));
+  ensureWorldResource(world, bombResourceKey, () => createBombStore(maxEntities));
+  ensureWorldResource(world, fireResourceKey, () => createFireStore(maxEntities));
+  ensureWorldResource(world, rngResourceKey, () => createRNG(options.seed || 42));
+  ensureWorldResource(world, bombDetonationQueueResourceKey, () => []);
+
+  ensurePooledPropEntities(
+    world,
+    bombPoolResourceKey,
+    colliderStore,
+    POOL_MAX_BOMBS,
+    COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER,
+  );
+  ensurePooledPropEntities(
+    world,
+    firePoolResourceKey,
+    colliderStore,
+    POOL_FIRE,
+    COMPONENT_MASK.FIRE | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER,
+  );
+}
@@
   // Movement systems need their component stores present before fixed-step work begins.
   initializeMovementResources(world, options);
+  // B-06 systems need prop stores and pooled entities before logic-phase ticks.
+  initializeBombExplosionResources(world, options);
```

## Test Guide

Track A should add or update tests in its owned test surface.

Recommended unit coverage:

- `tests/unit/game/bootstrap.test.js`
  - `createBootstrap()` registers `collider`, `bomb`, `fire`, `bombDetonationQueue`, and `rng`.
  - default systems include `bomb-tick-system` and `explosion-system` in logic phase after movement.
  - bomb and fire pools are preallocated once and not duplicated on level reload.

Recommended integration coverage:

- `tests/integration/gameplay/b-06-runtime-wiring.test.js`
  - bootstrap with a loaded test map.
  - register an input adapter stub with `pressedKeys: ['bomb']`.
  - step one fixed frame and assert one active bomb exists on the player tile.
  - advance enough fixed frames for `BOMB_FUSE_MS`.
  - assert bomb detonates and at least one active fire tile exists.
  - assert fire clears after `FIRE_DURATION_MS`.

Suggested test skeleton:

```js
/**
 * Integration tests for Track A runtime wiring of B6 bomb/explosion systems.
 */

import { describe, expect, it } from 'vitest';

import { createInputAdapterStub } from '../helpers/input-adapter-stub.js';
import { COLLIDER_TYPE } from '../../../src/ecs/components/spatial.js';
import { BOMB_FUSE_MS, FIRE_DURATION_MS, FIXED_DT_MS } from '../../../src/ecs/resources/constants.js';
import { createBootstrap } from '../../../src/game/bootstrap.js';

describe('B6 runtime wiring', () => {
  it('places a bomb from runtime input and resolves it into fire', async () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => testMapResource,
      now: 0,
    });

    bootstrap.setInputAdapter(
      createInputAdapterStub({
        pressedKeys: ['bomb'],
      }),
    );

    bootstrap.levelLoader.loadLevel(1);
    bootstrap.stepFrame(FIXED_DT_MS);

    const colliderStore = bootstrap.world.getResource('collider');
    const bombStore = bootstrap.world.getResource('bomb');
    const fireStore = bootstrap.world.getResource('fire');

    const activeBombIds = bootstrap.world
      .query(COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER)
      .filter((entityId) => colliderStore.type[entityId] === COLLIDER_TYPE.BOMB);

    expect(activeBombIds).toHaveLength(1);
    expect(bombStore.fuseMs[activeBombIds[0]]).toBe(BOMB_FUSE_MS);

    for (let elapsedMs = 0; elapsedMs <= BOMB_FUSE_MS; elapsedMs += FIXED_DT_MS) {
      bootstrap.stepFrame(elapsedMs + FIXED_DT_MS);
    }

    const activeFireIds = bootstrap.world
      .query(COMPONENT_MASK.FIRE | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER)
      .filter((entityId) => colliderStore.type[entityId] === COLLIDER_TYPE.FIRE);

    expect(activeFireIds.length).toBeGreaterThan(0);

    bootstrap.stepFrame(BOMB_FUSE_MS + FIRE_DURATION_MS + FIXED_DT_MS);

    for (const fireId of activeFireIds) {
      expect(fireStore.burnTimerMs[fireId]).toBe(0);
      expect(colliderStore.type[fireId]).toBe(COLLIDER_TYPE.NONE);
    }
  });
});
```

The skeleton will need to match the existing test helper patterns in this repository. It is intentionally included as guidance, not a drop-in exact test file.

## Acceptance Criteria

- Runtime `Space` input can place a bomb through the default bootstrap path.
- Active bomb count respects B6 one-bomb-per-cell and max-bomb rules.
- Bomb fuse reaches zero and queues detonation.
- Explosion system consumes the queue and activates fire.
- Fire expires after `500ms`.
- No DOM APIs are imported by B6 systems.
- Existing checks remain green:
  - `npm run check`
  - `npm run test:unit`
  - `npm run test:integration`
  - relevant Playwright tests, if runtime behavior is exposed through the browser path.

## Notes For PR Description

Suggested wording:

> This Track A integration branch wires the already implemented Track B B6 bomb/explosion systems into the default runtime bootstrap path. It does not change bomb/explosion simulation behavior; it registers required resources, preallocates pooled bomb/fire entities, and proves the runtime `Space → bomb → explosion → fire expiry` path with integration tests.


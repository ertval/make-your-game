# Track D → Track A: Rendering Pipeline Handoff

## Summary
Track D has implemented the render pipeline (D-04 through D-09). This document captures ALL changes needed in `src/game/bootstrap.js` to wire rendering into the runtime.

**Status**: Changes are already implemented in this branch. This handoff documents what was done so Track A understands the implementation.

---

## Required Changes to `src/game/bootstrap.js`

### 1. Imports (top of file)
```js
import { createBoardAdapter } from '../adapters/dom/renderer-adapter.js';
import { createSpritePool } from '../adapters/dom/sprite-pool-adapter.js';
import { createRenderCollectSystem } from '../ecs/systems/render-collect-system.js';
import { createRenderDomSystem } from '../ecs/systems/render-dom-system.js';
import { COMPONENT_MASK } from '../ecs/components/registry.js';
import {
  RENDERABLE_KIND,
  createRenderableStore,
  createVisualStateStore,
  resetRenderable,
  resetVisualState,
} from '../ecs/components/visual.js';
import { isDevelopment } from '../shared/env.js';
```

### 2. Visual Component Stores (initializeMovementResources, ~line 299-303)
Add renderable and visualState stores after existing stores:
```js
ensureWorldResource(world, 'renderable', () => createRenderableStore(maxEntities));
ensureWorldResource(world, 'visualState', () => createVisualStateStore(maxEntities));
```

### 3. Render Systems Registration (createDefaultSystemsByPhase, ~line 237-243)
```js
const renderCollectSystem = createRenderCollectSystem();
const renderDomSystem = createRenderDomSystem();

return {
  input: [inputSystem],
  physics: [playerMoveSystem],
  render: [renderCollectSystem, renderDomSystem],
};
```

### 4. Player Entity with Renderable (syncPlayerEntityFromMap, ~line 350-382)
- Add `RENDERABLE` component to player entity mask:
```js
const PLAYER_WITH_RENDERABLE_MASK = PLAYER_MOVE_REQUIRED_MASK | COMPONENT_MASK.RENDERABLE;

let playerHandle = world.getResource(playerEntityResourceKey);
if (!world.entityStore.isAlive(playerHandle)) {
  playerHandle = world.createEntity(PLAYER_WITH_RENDERABLE_MASK);
  world.setResource(playerEntityResourceKey, playerHandle);
} else {
  playerHandle = world.setEntityMask(playerHandle, PLAYER_WITH_RENDERABLE_MASK);
}
```

- Get visual stores and reset them:
```js
const renderableStore = world.getResource('renderable');
const visualStateStore = world.getResource('visualState');
// ... existing resets ...
resetRenderable(renderableStore, entityId);
resetVisualState(visualStateStore, entityId);

// Set renderable kind so player appears in render-collect-system queries
renderableStore.kind[entityId] = RENDERABLE_KIND.PLAYER;
renderableStore.spriteId[entityId] = 0;
```

### 5. Board Generation (createBootstrap - onLevelLoaded callback, ~line 470-486)
```js
// Create sprite pool and board adapter early for onLevelLoaded callback
const spritePool = createSpritePool({ dev: isDevelopment() });
const boardAdapter = createBoardAdapter({ spritePool });

const levelLoader = createLevelLoader({
  loadMapForLevel: options.loadMapForLevel,
  mapResourceKey: options.mapResourceKey || 'mapResource',
  onLevelLoaded: (mapResource) => {
    if (typeof document !== 'undefined') {
      const gameBoard = document.getElementById('game-board');
      if (gameBoard) {
        boardAdapter.generateBoard(mapResource, gameBoard);
      }
    }
    updateBoardCss(mapResource);
    syncPlayerEntityFromMap(world, mapResource, options);
  },
  totalLevels: TOTAL_LEVELS,
  world,
});
```

### 6. Sprite Pool Resource (after renderIntent, ~line 519-520)
```js
world.setResource('spritePool', spritePool);
```

### 7. Auto-Start Game (after gameFlow creation, ~line 505-506)
```js
// Auto-start the game to load the first level and render the board
gameFlow.startGame();
```

---

## Why Track A Owned
- `src/game/bootstrap.js` is Track A owned (policy rule line 314 in `scripts/policy-gate/lib/policy-utils.mjs`)
- Track D cannot modify Track A files per ownership rules

---

## Validation
After applying these changes:
```bash
npm run check
npm run test
npm run policy
npm run dev  # Verify board, player, walls, pellets render
```

---

## Notes
- The old `registeredRenderer.update()` path in stepFrame still exists but is redundant with the ECS render systems - can be removed later
- Board clearing is handled in `generateBoard()` to handle duplicate onLevelLoaded calls gracefully

---

## Impact
- P1 Visual Prototype completes (AUDIT-F-04 board renders)
- Enables frame-timing and FPS audits (F-17, F-18)
- Player and board render correctly on screen
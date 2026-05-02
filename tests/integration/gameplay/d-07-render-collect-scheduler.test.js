/**
 * D-07: Render collect system scheduler integration tests.
 *
 * Verifies that createRenderCollectSystem() is registerable in the World's
 * 'render' phase, runs via World.runRenderCommit(), and populates the
 * render-intent buffer before any downstream DOM commit system would run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { createPositionStore } from '../../../src/ecs/components/spatial.js';
import {
  createRenderableStore,
  createVisualStateStore,
  RENDERABLE_KIND,
} from '../../../src/ecs/components/visual.js';
import { createRenderIntentBuffer, getRenderIntentView } from '../../../src/ecs/render-intent.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import {
  createRenderCollectSystem,
  RENDER_COLLECT_REQUIRED_MASK,
} from '../../../src/ecs/systems/render-collect-system.js';
import { World } from '../../../src/ecs/world/world.js';
import { createBootstrap } from '../../../src/game/bootstrap.js';

const MAX_ENTITIES = 16;
const root = path.resolve(import.meta.dirname, '../../..');

function loadMap(levelNumber = 1) {
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, `assets/maps/level-${levelNumber}.json`), 'utf8'),
  );
  return createMapResource(raw);
}

function createSchedulerHarness() {
  const world = new World();
  const position = createPositionStore(MAX_ENTITIES);
  const renderable = createRenderableStore(MAX_ENTITIES);
  const visualState = createVisualStateStore(MAX_ENTITIES);
  const buffer = createRenderIntentBuffer(MAX_ENTITIES);

  world.setResource('position', position);
  world.setResource('renderable', renderable);
  world.setResource('visualState', visualState);
  world.setResource('renderIntentBuffer', buffer);

  return { world, position, renderable, visualState, buffer };
}

describe('render-collect-system scheduler integration', () => {
  it('registers without throwing in the render phase', () => {
    const { world } = createSchedulerHarness();
    const system = createRenderCollectSystem();
    expect(() => world.registerSystem(system)).not.toThrow();
  });

  it('declares phase render so World.registerSystem() accepts it', () => {
    expect(createRenderCollectSystem().phase).toBe('render');
  });

  it('populates the render-intent buffer when dispatched via runRenderCommit', () => {
    const { world, position, renderable, buffer } = createSchedulerHarness();

    const entity = world.createEntity(RENDER_COLLECT_REQUIRED_MASK);
    renderable.kind[entity.id] = RENDERABLE_KIND.PLAYER;
    position.row[entity.id] = 3;
    position.col[entity.id] = 5;
    position.prevRow[entity.id] = 3;
    position.prevCol[entity.id] = 5;

    world.registerSystem(createRenderCollectSystem());
    world.runRenderCommit({ alpha: 1 });

    const intents = getRenderIntentView(buffer);
    expect(intents).toHaveLength(1);
    expect(intents[0].entityId).toBe(entity.id);
  });

  it('runs before a downstream render system registered after it', () => {
    const { world, position, renderable, buffer } = createSchedulerHarness();

    const entity = world.createEntity(RENDER_COLLECT_REQUIRED_MASK);
    renderable.kind[entity.id] = RENDERABLE_KIND.GHOST;
    position.row[entity.id] = 1;
    position.col[entity.id] = 2;
    position.prevRow[entity.id] = 1;
    position.prevCol[entity.id] = 2;

    const callOrder = [];
    const domCommitStub = {
      name: 'render-dom-system-stub',
      phase: 'render',
      update() {
        // By the time this runs, collect should have written intents
        callOrder.push({ name: 'dom-commit', intentCount: getRenderIntentView(buffer).length });
      },
    };

    // collect registered first → runs first in the render phase
    world.registerSystem(createRenderCollectSystem());
    world.registerSystem(domCommitStub);

    world.runRenderCommit({ alpha: 1 });

    expect(callOrder[0].name).toBe('dom-commit');
    expect(callOrder[0].intentCount).toBe(1);
  });

  it('integrates with createBootstrap via systemsByPhase.render', () => {
    const map = loadMap();
    const collectCalled = { count: 0 };

    const probeSystem = {
      name: 'render-collect-probe',
      phase: 'render',
      update() {
        collectCalled.count += 1;
      },
    };

    const { stepFrame } = createBootstrap({
      loadMapForLevel: () => map,
      systemsByPhase: { render: [probeSystem] },
    });

    stepFrame(20);
    expect(collectCalled.count).toBeGreaterThan(0);
  });
});

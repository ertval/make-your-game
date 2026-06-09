import { describe, expect, it } from 'vitest';
import { World } from '../../../src/ecs/world/world.js';

describe('deferred-mutation-phase-symmetry', () => {
  it('should apply deferred mutations across runFixedStep, runRenderCommit, and runMeta', () => {
    const world = new World();
    const e1 = world.createEntity(0b0001);
    const e2 = world.createEntity(0b0001);
    const e3 = world.createEntity(0b0001);

    world.registerSystem({
      phase: 'logic',
      name: 'logic-system',
      update: (ctx) => {
        ctx.world.deferDestroyEntity(e1);
      },
    });

    world.registerSystem({
      phase: 'render',
      name: 'render-system',
      update: (ctx) => {
        ctx.world.deferDestroyEntity(e2);
      },
    });

    world.registerSystem({
      phase: 'meta',
      name: 'meta-system',
      update: (ctx) => {
        ctx.world.deferDestroyEntity(e3);
      },
    });

    expect(world.getEntityCount()).toBe(3);

    // 1. runFixedStep should process logic-system and destroy e1
    world.runFixedStep();
    expect(world.isEntityAlive(e1)).toBe(false);
    expect(world.isEntityAlive(e2)).toBe(true);
    expect(world.isEntityAlive(e3)).toBe(true);
    expect(world.getEntityCount()).toBe(2);

    // 2. runRenderCommit should process render-system and destroy e2
    world.runRenderCommit();
    expect(world.isEntityAlive(e2)).toBe(false);
    expect(world.isEntityAlive(e3)).toBe(true);
    expect(world.getEntityCount()).toBe(1);

    // 3. runMeta should process meta-system and destroy e3
    world.runMeta();
    expect(world.isEntityAlive(e3)).toBe(false);
    expect(world.getEntityCount()).toBe(0);
  });
});

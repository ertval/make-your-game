import { describe, expect, it, vi } from 'vitest';

import { World } from '../../../src/ecs/world/world.js';

describe('World', () => {
  it('runs simulation phases in deterministic registration order and render in explicit commit order', () => {
    const world = new World();
    const order = [];

    world.registerSystem({ phase: 'logic', name: 'logic-1', update: () => order.push('logic-1') });
    world.registerSystem({ phase: 'input', name: 'input-1', update: () => order.push('input-1') });
    world.registerSystem({ phase: 'logic', name: 'logic-2', update: () => order.push('logic-2') });
    world.registerSystem({
      phase: 'render',
      name: 'render-1',
      update: () => order.push('render-1'),
    });

    world.runFixedStep();
    world.runRenderCommit();

    expect(order).toEqual(['input-1', 'logic-1', 'logic-2', 'render-1']);
  });

  it('does not execute render systems during fixed-step simulation dispatch', () => {
    const world = new World();
    const marker = [];

    world.registerSystem({
      phase: 'render',
      name: 'render-only',
      update: () => marker.push('render'),
    });

    world.runFixedStep();
    expect(marker).toEqual([]);

    world.runRenderCommit();
    expect(marker).toEqual(['render']);
  });

  it('applies deferred mutations at a single sync point after system execution', () => {
    const world = new World();

    world.registerSystem({
      phase: 'logic',
      name: 'defer-create',
      update: (context) => {
        context.world.deferCreateEntity(0b0001);
        expect(context.world.getEntityCount()).toBe(0);
      },
    });

    world.runFixedStep();

    expect(world.getEntityCount()).toBe(1);
    expect(world.query(0b0001)).toEqual([0]);
  });

  it('defers entity destruction to the fixed-step sync point', () => {
    const world = new World();
    const entity = world.createEntity(0b0001);

    world.registerSystem({
      phase: 'logic',
      name: 'defer-destroy',
      update: (context) => {
        context.world.deferDestroyEntity(entity);
        expect(context.world.getEntityCount()).toBe(1);
        expect(context.world.isEntityAlive(entity)).toBe(true);
      },
    });

    world.runFixedStep();

    expect(world.getEntityCount()).toBe(0);
    expect(world.query(0b0001)).toEqual([]);
  });

  it('defers mask updates to the fixed-step sync point', () => {
    const world = new World();
    const entity = world.createEntity(0b0001);

    world.registerSystem({
      phase: 'logic',
      name: 'defer-mask',
      update: (context) => {
        context.world.deferSetEntityMask(entity, 0b0010);
        expect(context.world.query(0b0010)).toEqual([]);
        expect(context.world.getEntityMask(entity)).toBe(0b0001);
      },
    });

    world.runFixedStep();

    expect(world.query(0b0010)).toEqual([entity.id]);
    expect(world.query(0b0001)).toEqual([]);
  });

  it('stores resources and increments frame after each fixed step', () => {
    const world = new World();
    const clock = { nowMs: 0 };

    world.setResource('clock', clock);

    expect(world.hasResource('clock')).toBe(true);
    expect(world.getResource('clock')).toBe(clock);
    expect(world.frame).toBe(0);

    world.runFixedStep();
    world.runFixedStep();

    expect(world.frame).toBe(2);
  });

  it('rejects stale handles when mutating entity masks', () => {
    const world = new World();
    const first = world.createEntity();

    expect(world.destroyEntity(first)).toBe(true);
    const recycled = world.createEntity();

    expect(recycled.id).toBe(first.id);
    expect(recycled.generation).toBe(first.generation + 1);
    expect(world.setEntityMask(first, 0b0010)).toBe(false);
    expect(world.getEntityMask(first)).toBeNull();
    expect(world.setEntityMask(recycled, 0b0010)).toBe(true);
    expect(world.getEntityMask(recycled)).toBe(0b0010);
    expect(world.query(0b0010)).toEqual([recycled.id]);
  });

  it('allows setting a zero mask to remove an entity from queries', () => {
    const world = new World();
    const entity = world.createEntity(0b0010);

    expect(world.query(0b0010)).toEqual([entity.id]);

    expect(world.setEntityMask(entity, 0)).toBe(true);
    expect(world.getEntityMask(entity)).toBe(0);
    expect(world.query(0b0010)).toEqual([]);
  });

  it('rejects stale handles across multiple recycling generations', () => {
    const world = new World();
    const staleHandles = [];

    let current = world.createEntity();

    for (let cycle = 0; cycle < 3; cycle += 1) {
      staleHandles.push(current);
      expect(world.destroyEntity(current)).toBe(true);

      const recycled = world.createEntity();
      expect(recycled.id).toBe(current.id);
      expect(recycled.generation).toBe(current.generation + 1);
      current = recycled;
    }

    for (let index = 0; index < staleHandles.length; index += 1) {
      expect(world.destroyEntity(staleHandles[index])).toBe(false);
      expect(world.setEntityMask(staleHandles[index], 0b0100)).toBe(false);
    }

    expect(world.setEntityMask(current, 0b0100)).toBe(true);
    expect(world.query(0b0100)).toEqual([current.id]);
  });

  it('catches system errors and continues dispatching remaining systems', () => {
    const world = new World();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const marker = [];

    world.registerSystem({
      phase: 'logic',
      name: 'broken',
      update: () => {
        throw new Error('boom');
      },
    });
    world.registerSystem({
      phase: 'logic',
      name: 'healthy',
      update: () => {
        marker.push('ran');
      },
    });

    world.runFixedStep();

    expect(marker).toEqual(['ran']);
    expect(consoleErrorSpy).toHaveBeenCalledOnce();

    consoleErrorSpy.mockRestore();
  });

  it('rejects immediate structural mutations during dispatch and requires deferred APIs', () => {
    const world = new World();

    world.registerSystem({
      phase: 'logic',
      name: 'guard-check',
      update: () => {
        expect(() => world.createEntity(0b0001)).toThrow('cannot be called during system dispatch');
        world.deferCreateEntity(0b0001);
      },
    });

    world.runFixedStep();

    expect(world.getEntityCount()).toBe(1);
    expect(world.query(0b0001)).toEqual([0]);
  });

  it('provides systems a safe world view without internal stores', () => {
    const world = new World();

    world.registerSystem({
      phase: 'logic',
      name: 'safe-view',
      update: (context) => {
        expect(context.world.entityStore).toBeUndefined();
        expect(context.world.pendingStructuralOps).toBeUndefined();
      },
    });

    world.runFixedStep();
  });

  it('enforces explicit resource capability declarations for systems', () => {
    const world = new World();
    const unauthorizedReads = [];

    world.setResource('clock', { nowMs: 0 });
    world.registerSystem({
      phase: 'logic',
      name: 'no-resource-capability',
      update: (context) => {
        try {
          context.world.getResource('clock');
        } catch (error) {
          unauthorizedReads.push(error.message);
        }
      },
    });

    world.runFixedStep();

    expect(unauthorizedReads).toHaveLength(1);
    expect(unauthorizedReads[0]).toContain('cannot read resource');
  });
  it('enforces explicit write resource capability declarations for systems', () => {
    const world = new World();
    const unauthorizedWrites = [];

    world.registerSystem({
      phase: 'logic',
      name: 'no-write-capability',
      update: (context) => {
        try {
          context.world.setResource('clock', { nowMs: 1 });
        } catch (error) {
          unauthorizedWrites.push(error.message);
        }
      },
    });

    world.runFixedStep();

    expect(unauthorizedWrites).toHaveLength(1);
    expect(unauthorizedWrites[0]).toContain('cannot write resource');
  });

  it('rejects registering system without update function', () => {
    const world = new World();
    expect(() => world.registerSystem({ phase: 'logic', name: 'bad' })).toThrow(
      'must provide an update function',
    );
  });

  it('rejects registering system to unknown phase', () => {
    const world = new World();
    expect(() => world.registerSystem({ phase: 'unknown', name: 'bad', update: () => {} })).toThrow(
      'Unknown system phase',
    );
  });

  it('quarantines failing systems when fault budget is exceeded', () => {
    const world = new World();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let runCount = 0;

    world.registerSystem({
      phase: 'logic',
      name: 'failing',
      update: () => {
        runCount++;
        throw new Error('boom');
      },
    });

    // Run until quarantine is hit. Default budget is typically 3-5 faults.
    for (let i = 0; i < 15; i++) {
      world.runFixedStep();
    }

    // It should stop running after hitting the budget.
    expect(runCount).toBeLessThan(15);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('supports deferDestroyAllEntities at the sync point', () => {
    const world = new World();
    world.createEntity();
    world.createEntity();

    world.registerSystem({
      phase: 'logic',
      name: 'destroy-all',
      update: () => {
        world.deferDestroyAllEntities();
      },
    });

    world.runFixedStep();
    expect(world.getEntityCount()).toBe(0);
  });

  it('protects against mid-tick deletions and handle destruction edge cases', () => {
    const world = new World();
    const handle = world.createEntity();

    world.registerSystem({
      phase: 'logic',
      name: 'double-destroy',
      update: () => {
        world.deferDestroyEntity(handle);
        world.deferDestroyEntity(handle);
      },
    });

    world.runFixedStep();
    expect(world.getEntityCount()).toBe(0);
  });

  it('returns false when destroying already destroyed entity directly', () => {
    const world = new World();
    const handle = world.createEntity();
    world.destroyEntity(handle);
    expect(world.destroyEntity(handle)).toBe(false);
  });

  it('covers missing branches in World API', () => {
    const world = new World();

    // 232: getPhaseOrder
    expect(world.getPhaseOrder()).toEqual(['input', 'physics', 'logic', 'render']);

    // 406-407: runRenderCommit with no systems
    world.runRenderCommit();
    expect(world.renderFrame).toBe(1);

    // 137, 131, 121: world view hasResource, deferDestroyAllEntities, and setResource
    world.registerSystem({
      phase: 'logic',
      name: 'view-coverage',
      resourceCapabilities: { read: ['test'], write: ['test'] },
      update: (ctx) => {
        // 110-114: has with and without capability
        expect(ctx.world.hasResource('test')).toBe(false);
        expect(() => ctx.world.hasResource('forbidden')).toThrow('cannot read resource');

        // 131: deferDestroyAllEntities via view
        ctx.world.deferDestroyAllEntities();

        // 121: set resource via view (if write capability)
        ctx.world.setResource('test', 'value');
        expect(ctx.world.getResource('test')).toBe('value');
      },
    });
    world.runFixedStep();

    // 422, 432: Render system quarantine and failure
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    world.registerSystem({
      phase: 'render',
      name: 'render-fail',
      update: () => {
        throw new Error('render boom');
      },
    });

    world.runRenderCommit();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('quarantines failing render systems when fault budget is exceeded', () => {
    const world = new World({ systemFailureBudget: 1 });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let runCount = 0;

    world.registerSystem({
      phase: 'render',
      name: 'failing-render',
      update: () => {
        runCount++;
        throw new Error('render boom');
      },
    });

    // First run: fails and gets quarantined
    world.runRenderCommit();
    expect(runCount).toBe(1);

    // Second run: should be skipped (422)
    world.runRenderCommit();
    expect(runCount).toBe(1);

    consoleErrorSpy.mockRestore();
  });
});

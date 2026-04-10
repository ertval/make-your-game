import { describe, expect, it, vi } from 'vitest';

import { World } from '../../../src/ecs/world/world.js';

describe('World', () => {
  it('runs systems in deterministic phase+registration order', () => {
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

    expect(order).toEqual(['input-1', 'logic-1', 'logic-2', 'render-1']);
  });

  it('applies deferred mutations at a single sync point after system execution', () => {
    const world = new World();

    world.registerSystem({
      phase: 'logic',
      name: 'defer-create',
      update: () => {
        world.deferCreateEntity(0b0001);
        expect(world.getEntityCount()).toBe(0);
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
      update: () => {
        world.deferDestroyEntity(entity);
        expect(world.getEntityCount()).toBe(1);
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
      update: () => {
        world.deferSetEntityMask(entity, 0b0010);
        expect(world.query(0b0010)).toEqual([]);
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
    expect(world.setEntityMask(recycled, 0b0010)).toBe(true);
    expect(world.query(0b0010)).toEqual([recycled.id]);
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
});

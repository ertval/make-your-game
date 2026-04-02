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

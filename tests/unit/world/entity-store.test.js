import { describe, expect, it } from 'vitest';

import { EntityStore } from '../../../src/ecs/world/entity-store.js';

describe('EntityStore', () => {
  it('creates stable sequential IDs before recycling', () => {
    const store = new EntityStore({ maxEntities: 3 });

    const first = store.create();
    const second = store.create();
    const third = store.create();

    expect(first).toEqual({ id: 0, generation: 0 });
    expect(second).toEqual({ id: 1, generation: 0 });
    expect(third).toEqual({ id: 2, generation: 0 });
  });

  it('recycles IDs with incremented generations and rejects stale handles', () => {
    const store = new EntityStore({ maxEntities: 2 });

    const first = store.create();
    const second = store.create();

    expect(store.destroy(first)).toBe(true);
    expect(store.isAlive(first)).toBe(false);

    const recycled = store.create();
    expect(recycled.id).toBe(first.id);
    expect(recycled.generation).toBe(first.generation + 1);

    expect(store.destroy(first)).toBe(false);
    expect(store.destroy(second)).toBe(true);
    expect(store.destroy(recycled)).toBe(true);
  });

  it('throws when exceeding max entity capacity', () => {
    const store = new EntityStore({ maxEntities: 1 });

    store.create();
    expect(() => store.create()).toThrow('Entity limit reached');
  });
});

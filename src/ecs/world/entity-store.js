/*
 * ECS entity storage with generation-based stale-handle protection.
 *
 * Public API:
 * - create(): allocates a new entity handle.
 * - destroy(handle): invalidates and recycles an entity id.
 * - isAlive(handle): validates handles against generation and active state.
 */

export class EntityStore {
  constructor({ maxEntities = 10_000 } = {}) {
    this.maxEntities = maxEntities;
    this.generations = [];
    this.activeFlags = [];
    this.freeIds = [];
    this.activeCount = 0;
  }

  isValidId(id) {
    return Number.isInteger(id) && id >= 0 && id < this.generations.length;
  }

  create() {
    let id;

    if (this.freeIds.length > 0) {
      id = this.freeIds.pop();
    } else {
      id = this.generations.length;
      if (id >= this.maxEntities) {
        throw new Error(`Entity limit reached: ${this.maxEntities}`);
      }

      this.generations.push(0);
      this.activeFlags.push(false);
    }

    this.activeFlags[id] = true;
    this.activeCount += 1;

    return {
      id,
      generation: this.generations[id],
    };
  }

  isAlive(handle) {
    if (!handle || !Number.isInteger(handle.id) || !Number.isInteger(handle.generation)) {
      return false;
    }

    const { id, generation } = handle;
    return (
      this.isValidId(id) && this.activeFlags[id] === true && this.generations[id] === generation
    );
  }

  destroy(handle) {
    if (!this.isAlive(handle)) {
      return false;
    }

    const { id } = handle;
    this.activeFlags[id] = false;
    this.generations[id] += 1;
    this.freeIds.push(id);
    this.activeCount -= 1;

    return true;
  }

  getActiveIds() {
    const activeIds = [];

    for (let id = 0; id < this.activeFlags.length; id += 1) {
      if (this.activeFlags[id] === true) {
        activeIds.push(id);
      }
    }

    return activeIds;
  }

  getActiveHandles() {
    const activeHandles = [];

    for (let id = 0; id < this.activeFlags.length; id += 1) {
      if (this.activeFlags[id] !== true) {
        continue;
      }

      activeHandles.push({
        id,
        generation: this.generations[id],
      });
    }

    return activeHandles;
  }
}

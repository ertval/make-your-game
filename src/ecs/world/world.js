/*
 * ECS world runtime orchestration.
 * Purpose: Coordinates fixed-step ECS execution phases, resources, and deferred structural mutations.
 *
 * The world owns system phase ordering, resource registration, entity/query
 * storage, and deferred structural mutations applied after each fixed step.
 *
 * Public API:
 * - World
 * - DEFAULT_PHASE_ORDER
 */

import { EntityStore } from './entity-store.js';
import { QueryIndex } from './query.js';

export const DEFAULT_PHASE_ORDER = ['input', 'physics', 'logic', 'render'];

export class World {
  constructor({ phaseOrder = DEFAULT_PHASE_ORDER, maxEntities } = {}) {
    this.phaseOrder = [...phaseOrder];
    this.systemsByPhase = new Map(this.phaseOrder.map((phase) => [phase, []]));
    this.resources = new Map();

    this.entityStore = new EntityStore({ maxEntities });
    this.queryIndex = new QueryIndex();

    this.pendingStructuralOps = [];
    this.frame = 0;
  }

  registerSystem(system) {
    if (!system || typeof system.update !== 'function') {
      throw new Error('System must provide an update function.');
    }

    if (!this.systemsByPhase.has(system.phase)) {
      throw new Error(`Unknown system phase: ${system.phase}`);
    }

    this.systemsByPhase.get(system.phase).push(system);
  }

  setResource(key, value) {
    this.resources.set(key, value);
  }

  getResource(key) {
    return this.resources.get(key);
  }

  hasResource(key) {
    return this.resources.has(key);
  }

  createEntity(initialMask = 0) {
    const handle = this.entityStore.create();
    this.queryIndex.setMask(handle.id, initialMask);
    return handle;
  }

  destroyEntity(handle) {
    return this.entityStore.destroy(handle);
  }

  setEntityMask(handle, mask) {
    if (!this.entityStore.isAlive(handle)) {
      return false;
    }

    this.queryIndex.setMask(handle.id, mask);
    return true;
  }

  getEntityCount() {
    return this.entityStore.activeCount;
  }

  query(requiredMask) {
    const activeIds = this.entityStore.getActiveIds();
    return this.queryIndex.match(requiredMask >>> 0, activeIds);
  }

  deferCreateEntity(initialMask = 0) {
    const op = {
      type: 'create',
      initialMask: initialMask >>> 0,
      resultHandle: null,
    };
    this.pendingStructuralOps.push(op);
    return op;
  }

  deferDestroyEntity(handle) {
    const op = {
      type: 'destroy',
      handle,
      applied: false,
    };
    this.pendingStructuralOps.push(op);
    return op;
  }

  deferSetEntityMask(handle, mask) {
    const op = {
      type: 'set-mask',
      handle,
      mask: mask >>> 0,
      applied: false,
    };
    this.pendingStructuralOps.push(op);
    return op;
  }

  applyDeferredMutations() {
    if (this.pendingStructuralOps.length === 0) {
      return;
    }

    const queue = this.pendingStructuralOps;
    this.pendingStructuralOps = [];

    for (const op of queue) {
      if (op.type === 'create') {
        op.resultHandle = this.createEntity(op.initialMask);
      } else if (op.type === 'destroy') {
        op.applied = this.destroyEntity(op.handle);
      } else if (op.type === 'set-mask') {
        op.applied = this.setEntityMask(op.handle, op.mask);
      }
    }
  }

  runFixedStep(stepContext = {}) {
    const context = {
      ...stepContext,
      frame: this.frame,
      world: this,
      resources: this.resources,
    };

    for (const phase of this.phaseOrder) {
      const systems = this.systemsByPhase.get(phase);
      for (const system of systems) {
        try {
          system.update(context);
        } catch (error) {
          console.error(
            `System "${system.name || 'anonymous'}" failed in phase "${phase}".`,
            error,
          );
        }
      }
    }

    this.applyDeferredMutations();
    this.frame += 1;
  }
}

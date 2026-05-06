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

const FULL_RESOURCE_ACCESS = '*';
const RENDER_PHASE = 'render';
const DEFAULT_SYSTEM_FAILURE_BUDGET = 3;
const DEFAULT_SYSTEM_FAILURE_WINDOW_FRAMES = 120;
const DEFAULT_SYSTEM_QUARANTINE_FRAMES = 240;

function toResourceCapabilitySet(values) {
  if (!Array.isArray(values)) {
    return new Set();
  }

  return new Set(values.filter((value) => value !== undefined && value !== null));
}

function normalizeSystemCapabilities(system) {
  const declared = system?.resourceCapabilities ?? {};

  return {
    read: toResourceCapabilitySet(declared.read),
    write: toResourceCapabilitySet(declared.write),
  };
}

function canReadResource(capabilities, key) {
  return capabilities.read.has(FULL_RESOURCE_ACCESS) || capabilities.read.has(key);
}

function canWriteResource(capabilities, key) {
  return capabilities.write.has(FULL_RESOURCE_ACCESS) || capabilities.write.has(key);
}

export class World {
  #entityStore;
  #isDispatching;
  #pendingStructuralOps;
  #phaseOrder;
  #queryIndex;
  #resources;
  #systemFailureBudget;
  #systemFailureWindowFrames;
  #systemFaultState;
  #systemQuarantineFrames;
  #systemsByPhase;

  constructor({
    phaseOrder = DEFAULT_PHASE_ORDER,
    maxEntities,
    systemFailureBudget = DEFAULT_SYSTEM_FAILURE_BUDGET,
    systemFailureWindowFrames = DEFAULT_SYSTEM_FAILURE_WINDOW_FRAMES,
    systemQuarantineFrames = DEFAULT_SYSTEM_QUARANTINE_FRAMES,
  } = {}) {
    this.#phaseOrder = [...phaseOrder];
    this.#systemsByPhase = new Map(this.#phaseOrder.map((phase) => [phase, []]));
    this.#resources = new Map();

    this.#entityStore = new EntityStore({ maxEntities });
    this.#queryIndex = new QueryIndex();

    this.#pendingStructuralOps = [];
    this.#isDispatching = false;
    this.#systemFailureBudget = Math.max(1, Math.floor(systemFailureBudget));
    this.#systemFailureWindowFrames = Math.max(1, Math.floor(systemFailureWindowFrames));
    this.#systemQuarantineFrames = Math.max(1, Math.floor(systemQuarantineFrames));
    this.#systemFaultState = new Map();
    this.frame = 0;
    this.renderFrame = 0;
  }

  #assertNotDispatching(methodName) {
    if (this.#isDispatching) {
      throw new Error(
        `${methodName} cannot be called during system dispatch. Use deferred world mutators instead.`,
      );
    }
  }

  #createSystemResourceApi(capabilities, systemName) {
    const deny = (operation, key) => {
      throw new Error(
        `System "${systemName}" cannot ${operation} resource "${String(key)}" without declared capability.`,
      );
    };

    return Object.freeze({
      get: (key) => {
        if (!canReadResource(capabilities, key) && !canWriteResource(capabilities, key)) {
          deny('read', key);
        }

        return this.#resources.get(key);
      },
      has: (key) => {
        if (!canReadResource(capabilities, key) && !canWriteResource(capabilities, key)) {
          deny('read', key);
        }

        return this.#resources.has(key);
      },
      set: (key, value) => {
        if (!canWriteResource(capabilities, key)) {
          deny('write', key);
        }

        this.#resources.set(key, value);
      },
    });
  }

  #createSystemWorldView(capabilities, systemName) {
    const resources = this.#createSystemResourceApi(capabilities, systemName);

    return Object.freeze({
      deferCreateEntity: (initialMask = 0) => this.deferCreateEntity(initialMask),
      deferDestroyAllEntities: () => this.deferDestroyAllEntities(),
      deferDestroyEntity: (handle) => this.deferDestroyEntity(handle),
      deferSetEntityMask: (handle, mask) => this.deferSetEntityMask(handle, mask),
      getEntityCount: () => this.getEntityCount(),
      getEntityMask: (handle) => this.getEntityMask(handle),
      getMaxEntities: () => this.getMaxEntities(),
      getResource: (key) => resources.get(key),
      hasResource: (key) => resources.has(key),
      isEntityAlive: (handle) => this.isEntityAlive(handle),
      query: (requiredMask) => this.query(requiredMask),
      setResource: (key, value) => resources.set(key, value),
    });
  }

  #getSystemFaultState(system) {
    let state = this.#systemFaultState.get(system);
    if (!state) {
      state = {
        failureFrames: [],
        quarantinedUntilFrame: -1,
      };
      this.#systemFaultState.set(system, state);
    }

    return state;
  }

  #pruneSystemFailures(state, frameIndex) {
    const minFrame = frameIndex - this.#systemFailureWindowFrames + 1;
    state.failureFrames = state.failureFrames.filter((value) => value >= minFrame);
  }

  #recordSystemFailure(entry, phase, frameIndex, error) {
    const state = this.#getSystemFaultState(entry.system);
    state.failureFrames.push(frameIndex);
    this.#pruneSystemFailures(state, frameIndex);

    if (state.failureFrames.length >= this.#systemFailureBudget) {
      state.quarantinedUntilFrame = frameIndex + this.#systemQuarantineFrames;
      state.failureFrames = [];
      console.error(
        `System "${entry.system.name || 'anonymous'}" exceeded runtime fault budget in phase "${phase}" and is quarantined until frame ${state.quarantinedUntilFrame}.`,
        error,
      );
      return;
    }

    console.error(
      `System "${entry.system.name || 'anonymous'}" failed in phase "${phase}".`,
      error,
    );
  }

  #isSystemQuarantined(entry, frameIndex) {
    const state = this.#getSystemFaultState(entry.system);
    return state.quarantinedUntilFrame > frameIndex;
  }

  registerSystem(system) {
    if (!system || typeof system.update !== 'function') {
      throw new Error('System must provide an update function.');
    }

    if (!this.#systemsByPhase.has(system.phase)) {
      throw new Error(`Unknown system phase: ${system.phase}`);
    }

    const capabilities = normalizeSystemCapabilities(system);
    const systemName = system.name || 'anonymous';

    this.#systemsByPhase.get(system.phase).push({
      resourceApi: this.#createSystemResourceApi(capabilities, systemName),
      system,
      worldView: this.#createSystemWorldView(capabilities, systemName),
    });
    this.#systemFaultState.set(system, {
      failureFrames: [],
      quarantinedUntilFrame: -1,
    });
  }

  setResource(key, value) {
    this.#resources.set(key, value);
  }

  get systemsByPhase() {
    return this.#systemsByPhase;
  }

  getMaxEntities() {
    return this.#entityStore.maxEntities;
  }

  getResource(key) {
    return this.#resources.get(key);
  }

  hasResource(key) {
    return this.#resources.has(key);
  }

  getPhaseOrder() {
    return [...this.#phaseOrder];
  }

  createEntity(initialMask = 0) {
    this.#assertNotDispatching('createEntity');

    const handle = this.#entityStore.create();
    this.#queryIndex.setMask(handle.id, initialMask);
    return handle;
  }

  destroyEntity(handle) {
    this.#assertNotDispatching('destroyEntity');
    return this.#entityStore.destroy(handle);
  }

  /**
   * Update an entity's component mask. Passing mask = 0 is valid and removes
   * the entity from all system queries.
   *
   * @param {{ id: number, generation: number }} handle - Entity handle to update.
   * @param {number} mask - Bitmask of component membership (0 disables queries).
   * @returns {boolean} True when the entity was alive and the mask was applied.
   */
  setEntityMask(handle, mask) {
    this.#assertNotDispatching('setEntityMask');

    if (!this.#entityStore.isAlive(handle)) {
      return false;
    }

    this.#queryIndex.setMask(handle.id, mask);
    return true;
  }

  getEntityMask(handle) {
    if (!this.#entityStore.isAlive(handle)) {
      return null;
    }

    return this.#queryIndex.getMask(handle.id);
  }

  isEntityAlive(handle) {
    return this.#entityStore.isAlive(handle);
  }

  getEntityCount() {
    return this.#entityStore.activeCount;
  }

  getActiveEntityHandles() {
    return this.#entityStore.getActiveHandles();
  }

  query(requiredMask) {
    const activeIds = this.#entityStore.getActiveIds();
    return this.#queryIndex.match(requiredMask >>> 0, activeIds);
  }

  deferCreateEntity(initialMask = 0) {
    const op = {
      type: 'create',
      initialMask: initialMask >>> 0,
      resultHandle: null,
    };
    this.#pendingStructuralOps.push(op);
    return op;
  }

  deferDestroyEntity(handle) {
    const op = {
      type: 'destroy',
      handle,
      applied: false,
    };
    this.#pendingStructuralOps.push(op);
    return op;
  }

  deferSetEntityMask(handle, mask) {
    const op = {
      type: 'set-mask',
      handle,
      mask: mask >>> 0,
      applied: false,
    };
    this.#pendingStructuralOps.push(op);
    return op;
  }

  deferDestroyAllEntities() {
    const op = {
      type: 'destroy-all',
      applied: false,
      destroyedCount: 0,
    };

    this.#pendingStructuralOps.push(op);
    return op;
  }

  flushDeferredMutations() {
    this.#assertNotDispatching('flushDeferredMutations');
    this.applyDeferredMutations();
  }

  applyDeferredMutations() {
    if (this.#pendingStructuralOps.length === 0) {
      return;
    }

    const queue = this.#pendingStructuralOps;
    this.#pendingStructuralOps = [];

    for (const op of queue) {
      if (op.type === 'create') {
        op.resultHandle = this.createEntity(op.initialMask);
      } else if (op.type === 'destroy') {
        op.applied = this.destroyEntity(op.handle);
      } else if (op.type === 'set-mask') {
        op.applied = this.setEntityMask(op.handle, op.mask);
      } else if (op.type === 'destroy-all') {
        const handles = this.getActiveEntityHandles();
        let destroyedCount = 0;

        for (const handle of handles) {
          if (this.destroyEntity(handle)) {
            destroyedCount += 1;
          }
        }

        op.applied = true;
        op.destroyedCount = destroyedCount;
      }
    }
  }

  runFixedStep(stepContext = {}) {
    const baseContext = {
      ...stepContext,
      frame: this.frame,
      world: this,
    };

    this.#isDispatching = true;

    try {
      for (const phase of this.#phaseOrder) {
        if (phase === RENDER_PHASE) {
          continue;
        }

        const entries = this.#systemsByPhase.get(phase) || [];
        for (const entry of entries) {
          if (this.#isSystemQuarantined(entry, this.frame)) {
            continue;
          }

          try {
            entry.system.update({
              ...baseContext,
              resources: entry.resourceApi,
              world: entry.worldView,
            });
          } catch (error) {
            this.#recordSystemFailure(entry, phase, this.frame, error);
          }
        }
      }
    } finally {
      this.#isDispatching = false;
    }

    this.applyDeferredMutations();
    this.frame += 1;
  }

  runRenderCommit(renderContext = {}) {
    const renderEntries = this.#systemsByPhase.get(RENDER_PHASE) || [];

    if (renderEntries.length === 0) {
      this.renderFrame += 1;
      return;
    }

    const baseContext = {
      ...renderContext,
      frame: this.frame,
      renderFrame: this.renderFrame,
      world: this,
    };

    this.#isDispatching = true;

    try {
      for (const entry of renderEntries) {
        if (this.#isSystemQuarantined(entry, this.renderFrame)) {
          continue;
        }

        try {
          entry.system.update({
            ...baseContext,
            resources: entry.resourceApi,
            world: entry.worldView,
          });
        } catch (error) {
          this.#recordSystemFailure(entry, RENDER_PHASE, this.renderFrame, error);
        }
      }
    } finally {
      this.#isDispatching = false;
    }

    this.renderFrame += 1;
  }
}

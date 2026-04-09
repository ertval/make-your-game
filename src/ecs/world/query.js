/*
 * Query helpers for bitmask-based ECS component matching.
 * Purpose: Provides deterministic bitmask query matching over active ECS entity ids.
 *
 * The query index stores per-entity masks and resolves deterministic
 * membership checks used by systems at fixed-step boundaries.
 *
 * Public API:
 * - hasAllComponents(entityMask, requiredMask)
 * - QueryIndex
 */

export function hasAllComponents(entityMask, requiredMask) {
  return (entityMask & requiredMask) === requiredMask;
}

export class QueryIndex {
  constructor() {
    this.entityMasks = [];
  }

  setMask(entityId, mask) {
    this.entityMasks[entityId] = mask >>> 0;
  }

  getMask(entityId) {
    return this.entityMasks[entityId] ?? 0;
  }

  match(requiredMask, entityIds) {
    const matches = [];

    for (const entityId of entityIds) {
      const entityMask = this.getMask(entityId);
      if (hasAllComponents(entityMask, requiredMask)) {
        matches.push(entityId);
      }
    }

    return matches;
  }
}

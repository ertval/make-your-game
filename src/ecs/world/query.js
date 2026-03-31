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

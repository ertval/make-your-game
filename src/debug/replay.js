/*
 * Deterministic simulation replay and state serialization utility.
 * Purpose: Allows recording player input traces, playing them back on a fresh world,
 * and serializing/hashing world state to check for simulation drift or non-determinism.
 *
 * Public API:
 * - serializeWorldState(world)
 * - hashWorldState(world)
 * - ReplayInputAdapter
 * - ReplayRecorder
 * - runReplay(bootstrap, trace, options)
 */

import { COMPONENT_MASK } from '../ecs/components/registry.js';

/**
 * Capture a complete, stable, JSON-serializable snapshot of the ECS world state.
 * Only serializes active components and resources relevant to simulation logic.
 *
 * @param {World} world - The ECS world to serialize.
 * @returns {object} JSON-serializable representation of the world state.
 */
export function serializeWorldState(world) {
  const state = {
    frame: world.frame,
    renderFrame: world.renderFrame,
    resources: {},
    entities: [],
  };

  // Clock
  const clock = world.getResource('clock');
  if (clock) {
    state.resources.clock = {
      accumulator: clock.accumulator,
      alpha: clock.alpha,
      isPaused: clock.isPaused,
      simTimeMs: clock.simTimeMs,
    };
  }

  // Game Status
  const gameStatus = world.getResource('gameStatus');
  if (gameStatus) {
    state.resources.gameStatus = {
      currentState: gameStatus.currentState,
    };
  }

  // Score State
  const scoreState = world.getResource('scoreState');
  if (scoreState) {
    state.resources.scoreState = {
      comboCounter: scoreState.comboCounter,
      levelClearBonusAwarded: scoreState.levelClearBonusAwarded,
      totalPoints: scoreState.totalPoints,
    };
  }

  // Level Timer
  const levelTimer = world.getResource('levelTimer');
  if (levelTimer) {
    state.resources.levelTimer = {
      activeLevel: levelTimer.activeLevel,
      remainingSeconds: levelTimer.remainingSeconds,
    };
  }

  // Player Life
  const playerLife = world.getResource('playerLife');
  if (playerLife) {
    state.resources.playerLife = {
      invincibilityRemainingMs: playerLife.invincibilityRemainingMs,
      isInvincible: playerLife.isInvincible,
      lives: playerLife.lives,
    };
  }

  // Ghost Spawn State
  const ghostSpawnState = world.getResource('ghostSpawnState');
  if (ghostSpawnState) {
    state.resources.ghostSpawnState = {
      activeGhostCap: ghostSpawnState.activeGhostCap,
      elapsedMs: ghostSpawnState.elapsedMs,
      queuedGhostIds: [...(ghostSpawnState.queuedGhostIds || [])],
      releasedGhostIds: [...(ghostSpawnState.releasedGhostIds || [])],
      respawnQueue: (ghostSpawnState.respawnQueue || []).map((entry) => ({
        ghostId: entry.ghostId,
        readyAtMs: entry.readyAtMs,
      })),
    };
  }

  // Event Queue
  const eventQueue = world.getResource('eventQueue');
  if (eventQueue) {
    state.resources.eventQueue = {
      events: (eventQueue.events || []).map((e) => ({
        frame: e.frame,
        order: e.order,
        payload: e.payload,
        type: e.type,
      })),
    };
  }

  // RNG
  const rng = world.getResource('rng');
  if (rng) {
    state.resources.rng = {
      state: rng.state,
    };
  }

  // Entities
  const activeHandles = world.getActiveEntityHandles() || [];
  // Sort by ID to ensure stable order
  activeHandles.sort((a, b) => a.id - b.id);

  for (const handle of activeHandles) {
    const entityId = handle.id;
    const mask = world.getEntityMask(handle);
    const entityData = {
      generation: handle.generation,
      id: entityId,
      mask,
    };

    const positionStore = world.getResource('position');
    if (positionStore && mask & COMPONENT_MASK.POSITION) {
      entityData.position = {
        col: positionStore.col[entityId],
        prevCol: positionStore.prevCol[entityId],
        prevRow: positionStore.prevRow[entityId],
        row: positionStore.row[entityId],
        targetCol: positionStore.targetCol[entityId],
        targetRow: positionStore.targetRow[entityId],
      };
    }

    const velocityStore = world.getResource('velocity');
    if (velocityStore && mask & COMPONENT_MASK.VELOCITY) {
      entityData.velocity = {
        colDelta: velocityStore.colDelta[entityId],
        rowDelta: velocityStore.rowDelta[entityId],
        speedTilesPerSecond: velocityStore.speedTilesPerSecond[entityId],
      };
    }

    const colliderStore = world.getResource('collider');
    if (colliderStore && mask & COMPONENT_MASK.COLLIDER) {
      entityData.collider = {
        type: colliderStore.type[entityId],
      };
    }

    const renderableStore = world.getResource('renderable');
    if (renderableStore && mask & COMPONENT_MASK.RENDERABLE) {
      entityData.renderable = {
        kind: renderableStore.kind[entityId],
        spriteId: renderableStore.spriteId[entityId],
      };
    }

    const visualStateStore = world.getResource('visualState');
    if (visualStateStore && mask & COMPONENT_MASK.VISUAL_STATE) {
      entityData.visualState = {
        classBits: visualStateStore.classBits[entityId],
      };
    }

    const playerStore = world.getResource('player');
    if (playerStore && mask & COMPONENT_MASK.PLAYER) {
      entityData.player = {
        fireRadius: playerStore.fireRadius[entityId],
        invincibilityMs: playerStore.invincibilityMs[entityId],
        isSpeedBoosted: playerStore.isSpeedBoosted[entityId],
        lives: playerStore.lives[entityId],
        maxBombs: playerStore.maxBombs[entityId],
        speedBoostMs: playerStore.speedBoostMs[entityId],
      };
    }

    const ghostStore = world.getResource('ghost');
    if (ghostStore && mask & COMPONENT_MASK.GHOST) {
      entityData.ghost = {
        speed: ghostStore.speed[entityId],
        state: ghostStore.state[entityId],
        timerMs: ghostStore.timerMs[entityId],
        type: ghostStore.type[entityId],
      };
    }

    const bombStore = world.getResource('bomb');
    if (bombStore && mask & COMPONENT_MASK.BOMB) {
      entityData.bomb = {
        col: bombStore.col[entityId],
        fuseMs: bombStore.fuseMs[entityId],
        ownerId: bombStore.ownerId[entityId],
        radius: bombStore.radius[entityId],
        row: bombStore.row[entityId],
      };
    }

    const fireStore = world.getResource('fire');
    if (fireStore && mask & COMPONENT_MASK.FIRE) {
      entityData.fire = {
        burnTimerMs: fireStore.burnTimerMs[entityId],
        chainDepth: fireStore.chainDepth[entityId],
        col: fireStore.col[entityId],
        row: fireStore.row[entityId],
        sourceBombId: fireStore.sourceBombId[entityId],
      };
    }

    const powerUpStore = world.getResource('powerUp');
    if (powerUpStore && mask & COMPONENT_MASK.POWER_UP) {
      entityData.powerUp = {
        type: powerUpStore.type[entityId],
      };
    }

    const pelletStore = world.getResource('pellet');
    if (pelletStore && mask & COMPONENT_MASK.PELLET) {
      entityData.pellet = {
        isPowerPellet: pelletStore.isPowerPellet[entityId],
      };
    }

    state.entities.push(entityData);
  }

  return state;
}

/**
 * Return a stable hexadecimal hash of the serialized world state.
 *
 * @param {World} world - The ECS world to hash.
 * @returns {string} Hexadecimal hash code.
 */
export function hashWorldState(world) {
  const state = serializeWorldState(world);
  const json = JSON.stringify(state);

  // DJB2 hash
  let hash = 5381;
  for (let i = 0; i < json.length; i += 1) {
    hash = (hash * 33) ^ json.charCodeAt(i);
  }

  return (hash >>> 0).toString(16);
}

/**
 * Input adapter that feeds pre-recorded held/pressed inputs.
 */
export class ReplayInputAdapter {
  constructor(trace) {
    this.trace = trace;
    this.index = 0;
  }

  getHeldKeys() {
    const snapshot = this.trace[this.index];
    return new Set(snapshot ? snapshot.held : []);
  }

  drainPressedKeys() {
    const snapshot = this.trace[this.index];
    // Mono-advance: increment frame index when input is drained by the meta system
    this.index += 1;
    return new Set(snapshot ? snapshot.pressed : []);
  }

  clearHeldKeys() {}
  destroy() {}
}

/**
 * Wrapper adapter that records inputs flowing to the game.
 */
export class ReplayRecorder {
  constructor(originalAdapter) {
    this.original = originalAdapter;
    this.trace = [];
    this.currentFrame = 0;
  }

  getHeldKeys() {
    return this.original ? this.original.getHeldKeys() : new Set();
  }

  drainPressedKeys() {
    const keys = this.original ? this.original.drainPressedKeys() : new Set();
    this.trace.push({
      frame: this.currentFrame,
      held: Array.from(this.getHeldKeys()),
      pressed: Array.from(keys),
    });
    this.currentFrame += 1;
    return keys;
  }

  clearHeldKeys() {
    if (this.original && typeof this.original.clearHeldKeys === 'function') {
      this.original.clearHeldKeys();
    }
  }

  destroy() {
    if (this.original && typeof this.original.destroy === 'function') {
      this.original.destroy();
    }
  }
}

/**
 * Step a bootstrap loop using a pre-recorded input trace.
 *
 * @param {object} bootstrap - ECS bootstrap instance.
 * @param {Array<object>} trace - Recorded input trace.
 * @returns {Array<object>} State hashes for each frame in the trace.
 */
export function runReplay(bootstrap, trace) {
  const replayAdapter = new ReplayInputAdapter(trace);
  bootstrap.setInputAdapter(replayAdapter);

  bootstrap.gameFlow.startGame();

  let nowMs = 0;
  const steps = [];

  for (let i = 0; i < trace.length; i += 1) {
    nowMs += 16.666666666666668; // ~60 FPS
    bootstrap.stepFrame(nowMs);
    steps.push({
      frame: bootstrap.world.frame,
      hash: hashWorldState(bootstrap.world),
    });
  }

  return steps;
}

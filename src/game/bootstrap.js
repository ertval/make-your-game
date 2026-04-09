/*
 * Game runtime bootstrap assembly.
 *
 * This module wires core ECS resources and exposes a fixed-step frame driver
 * for the app entrypoint. It keeps simulation deterministic by using the
 * shared clock resource and explicit phase ordering from the world scheduler.
 *
 * Public API:
 * - createBootstrap(options)
 * - registerSystemsByPhase(world, systemsByPhase)
 */

import { advanceSimTime, createClock, resetClock, tickClock } from '../ecs/resources/clock.js';
import { FIXED_DT_MS, MAX_STEPS_PER_FRAME } from '../ecs/resources/constants.js';
import { createGameStatus } from '../ecs/resources/game-status.js';
import { World } from '../ecs/world/world.js';
import { createGameFlow } from './game-flow.js';
import { createLevelLoader } from './level-loader.js';

const PHASE_ORDER = ['input', 'physics', 'logic', 'render'];

function toFiniteTimestamp(nowMs) {
  if (!Number.isFinite(nowMs)) {
    return 0;
  }

  return nowMs;
}

function normalizeSystemRegistration(phase, registration, index) {
  if (typeof registration === 'function') {
    return {
      name: `${phase}-system-${index}`,
      phase,
      update: registration,
    };
  }

  if (registration && typeof registration.update === 'function') {
    return {
      ...registration,
      phase,
    };
  }

  throw new Error(`Invalid system registration for phase "${phase}" at index ${index}.`);
}

export function registerSystemsByPhase(world, systemsByPhase = {}) {
  for (const phase of PHASE_ORDER) {
    const registrations = Array.isArray(systemsByPhase[phase]) ? systemsByPhase[phase] : [];

    for (let index = 0; index < registrations.length; index += 1) {
      world.registerSystem(normalizeSystemRegistration(phase, registrations[index], index));
    }
  }
}

export function createBootstrap(options = {}) {
  const nowMs = toFiniteTimestamp(options.now ?? 0);
  const world = options.world || new World();
  const clock = createClock(nowMs);
  const gameStatus = createGameStatus();
  const levelLoader = createLevelLoader({
    loadMapForLevel: options.loadMapForLevel,
    mapResourceKey: options.mapResourceKey || 'mapResource',
    world,
  });
  const gameFlow = createGameFlow({
    clock,
    gameStatus,
    levelLoader,
  });

  world.setResource('clock', clock);
  world.setResource('gameFlow', gameFlow);
  world.setResource('gameStatus', gameStatus);
  world.setResource('levelLoader', levelLoader);

  registerSystemsByPhase(world, options.systemsByPhase || {});

  function stepFrame(
    frameNowMs,
    { fixedDtMs = FIXED_DT_MS, maxStepsPerFrame = MAX_STEPS_PER_FRAME } = {},
  ) {
    const timestamp = toFiniteTimestamp(frameNowMs);
    const steps = tickClock(clock, timestamp, maxStepsPerFrame, fixedDtMs);

    for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
      advanceSimTime(clock, fixedDtMs);
      world.runFixedStep({
        alpha: clock.alpha,
        dtMs: fixedDtMs,
        frameIndex: world.frame,
        isPaused: clock.isPaused,
        simTimeMs: clock.simTimeMs,
      });
    }

    return {
      alpha: clock.alpha,
      frame: world.frame,
      isPaused: clock.isPaused,
      simTimeMs: clock.simTimeMs,
      steps,
    };
  }

  function resyncTime(frameNowMs) {
    const timestamp = toFiniteTimestamp(frameNowMs);
    resetClock(clock, timestamp);
  }

  function getInputAdapter() {
    return world.getResource('inputAdapter') || world.getResource('input') || null;
  }

  return {
    clock,
    gameFlow,
    gameStatus,
    getInputAdapter,
    levelLoader,
    resyncTime,
    stepFrame,
    world,
  };
}

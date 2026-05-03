/*
 * C-01 scoring system.
 *
 * This module implements the current runtime scoring contract using the
 * existing B-04 collision intent buffer. It owns score accumulation through a
 * world resource, applies deterministic point awards from ordered intents, and
 * exposes pure helpers for score sanitation and level-clear bonus computation.
 *
 * Public API:
 * - SCORE_* constants: canonical point values for scoring actions.
 * - computeChainGhostScore(chainIndex): deterministic chain-reaction score helper.
 * - computeLevelClearBonus(remainingSeconds): pure helper for C-04 to consume later.
 * - createDefaultScoreState(): canonical world-resource initializer.
 * - ensureScoreState(scoreState): sanitize a mutable score resource in place.
 * - createScoringSystem(options): logic-phase ECS scoring system factory.
 *
 * Implementation notes:
 * - The runtime currently has no level-complete event source, so the level
 *   clear bonus remains a pure helper and is not consumed automatically yet.
 * - Stunned ghost kills have an explicit fixed value in the game design. To
 *   keep that rule unambiguous, only non-stunned ghost deaths participate in
 *   the normal ghost chain sequence; stunned ghost kills always award +400 and
 *   do not advance or reset the normal-chain counter.
 * - A per-frame guard on the score resource prevents the same collision-intent
 *   snapshot from being scored twice if the system is invoked again before the
 *   world advances to the next fixed-step frame. The guard reads the explicit
 *   system context frame first, then falls back to the world frame when the
 *   caller does not provide one.
 */

import { GHOST_STATE } from '../resources/constants.js';
import { GAME_STATE } from '../resources/game-status.js';

const DEFAULT_COLLISION_INTENTS_RESOURCE_KEY = 'collisionIntents';
const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_SCORE_RESOURCE_KEY = 'scoreState';

/** Points for eating a regular pellet. */
export const SCORE_PELLET = 10;

/** Points for eating a power pellet. */
export const SCORE_POWER_PELLET = 50;

/** Points for collecting a power-up pickup. */
export const SCORE_POWER_UP = 100;

/** Base points for killing a normal-state ghost with a bomb. */
export const SCORE_GHOST_KILL = 200;

/** Fixed skill-bonus points for killing a stunned ghost with a bomb. */
export const SCORE_STUNNED_GHOST_KILL = 400;

/** Base points awarded when the player clears a level. */
export const SCORE_LEVEL_CLEAR = 1000;

/** Bonus multiplier applied to remaining whole/fractional seconds on clear. */
export const SCORE_TIME_BONUS_MULTIPLIER = 10;

/**
 * Compute the deterministic chain-reaction ghost score for a non-stunned kill.
 *
 * @param {number} chainIndex - One-based chain position for the ghost.
 * @returns {number} Canonical score for this chain slot.
 */
export function computeChainGhostScore(chainIndex) {
  const normalizedIndex = Math.max(1, Math.floor(chainIndex || 0));
  return SCORE_GHOST_KILL * 2 ** (normalizedIndex - 1);
}

/**
 * Compute the level-clear bonus from the remaining countdown time.
 *
 * This helper is intentionally pure because the current runtime does not yet
 * expose a dedicated level-complete event/resource for C-01 to consume.
 *
 * @param {number} remainingSeconds - Time left on the countdown when the level ends.
 * @returns {number} Canonical clear bonus.
 */
export function computeLevelClearBonus(remainingSeconds) {
  const safeRemainingSeconds =
    Number.isFinite(remainingSeconds) && remainingSeconds > 0 ? remainingSeconds : 0;

  return SCORE_LEVEL_CLEAR + safeRemainingSeconds * SCORE_TIME_BONUS_MULTIPLIER;
}

/**
 * Create the canonical score-state world resource.
 *
 * @returns {ScoreState} Fresh score state with zeroed totals and no frame guard.
 */
export function createDefaultScoreState() {
  return {
    totalPoints: 0,
    comboCounter: 0,
    lastProcessedFrame: null,
  };
}

/**
 * Sanitize the mutable score resource in place.
 *
 * @param {ScoreState | null | undefined} scoreState - Existing world resource.
 * @returns {ScoreState} Valid mutable score state.
 */
export function ensureScoreState(scoreState) {
  if (!scoreState || typeof scoreState !== 'object') {
    return createDefaultScoreState();
  }

  if (!Number.isFinite(scoreState.totalPoints)) {
    scoreState.totalPoints = 0;
  }
  scoreState.totalPoints = Math.max(0, Math.floor(scoreState.totalPoints));

  if (!Number.isFinite(scoreState.comboCounter)) {
    scoreState.comboCounter = 0;
  }
  scoreState.comboCounter = Math.max(0, Math.floor(scoreState.comboCounter));

  if (!Number.isFinite(scoreState.lastProcessedFrame)) {
    scoreState.lastProcessedFrame = null;
  } else {
    scoreState.lastProcessedFrame = Math.floor(scoreState.lastProcessedFrame);
  }

  return scoreState;
}

/**
 * Return a safe collision-intent list.
 *
 * @param {Array<object> | null | undefined} collisionIntents - Shared intent buffer.
 * @returns {Array<object>} Valid intent list or an immutable empty list.
 */
function readCollisionIntents(collisionIntents) {
  return Array.isArray(collisionIntents) ? collisionIntents : [];
}

/**
 * Resolve the fixed-step frame index used by the duplicate-scoring guard.
 *
 * @param {{ frame?: number, world?: { frame?: number } }} context - System update context.
 * @returns {number | null} Current frame index when available.
 */
function readFrameIndex(context) {
  const explicitFrame = context?.frame;
  if (Number.isFinite(explicitFrame)) {
    return Math.floor(explicitFrame);
  }

  const worldFrame = context?.world?.frame;
  if (Number.isFinite(worldFrame)) {
    return Math.floor(worldFrame);
  }

  return null;
}

/**
 * Apply one scoring intent to the mutable score state.
 *
 * @param {ScoreState} scoreState - Mutable score world resource.
 * @param {object | null | undefined} intent - One collision intent candidate.
 * @param {number} normalGhostChainCount - Current frame-local normal ghost chain count.
 * @returns {number} Updated frame-local normal ghost chain count.
 */
function applyIntentScore(scoreState, intent, normalGhostChainCount) {
  switch (intent?.type) {
    case 'pellet-collected':
      scoreState.totalPoints += SCORE_PELLET;
      return normalGhostChainCount;
    case 'power-pellet-collected':
      scoreState.totalPoints += SCORE_POWER_PELLET;
      return normalGhostChainCount;
    case 'power-up-collected':
      scoreState.totalPoints += SCORE_POWER_UP;
      return normalGhostChainCount;
    case 'ghost-death': {
      if (intent.ghostState === GHOST_STATE.STUNNED) {
        scoreState.totalPoints += SCORE_STUNNED_GHOST_KILL;
        return normalGhostChainCount;
      }

      const nextNormalGhostChainCount = normalGhostChainCount + 1;
      scoreState.totalPoints += computeChainGhostScore(nextNormalGhostChainCount);
      return nextNormalGhostChainCount;
    }
    default:
      return normalGhostChainCount;
  }
}

export function createScoringSystem(options = {}) {
  const collisionIntentsResourceKey =
    options.collisionIntentsResourceKey || DEFAULT_COLLISION_INTENTS_RESOURCE_KEY;
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const scoreResourceKey = options.scoreResourceKey || DEFAULT_SCORE_RESOURCE_KEY;

  return {
    name: 'scoring-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [collisionIntentsResourceKey, gameStatusResourceKey, scoreResourceKey],
      write: [scoreResourceKey],
    },
    update(context) {
      const gameStatus = context.world.getResource(gameStatusResourceKey);
      const existingScoreState = context.world.getResource(scoreResourceKey);
      const frameIndex = readFrameIndex(context);
      const collisionIntents = readCollisionIntents(
        context.world.getResource(collisionIntentsResourceKey),
      );

      const scoreState = ensureScoreState(existingScoreState);
      if (scoreState !== existingScoreState) {
        context.world.setResource(scoreResourceKey, scoreState);
      }

      if (gameStatus?.currentState !== GAME_STATE.PLAYING) {
        scoreState.comboCounter = 0;
        return;
      }

      if (frameIndex !== null && scoreState.lastProcessedFrame === frameIndex) {
        return;
      }

      // Only non-stunned ghost kills participate in the normal chain sequence:
      // 200, 400, 800, ... . Stunned ghost kills always award a fixed +400 and
      // intentionally do not advance the chain counter.
      let normalGhostChainCount = 0;

      for (const intent of collisionIntents) {
        normalGhostChainCount = applyIntentScore(scoreState, intent, normalGhostChainCount);
      }

      // comboCounter reflects only the current-frame normal ghost chain length.
      // It resets automatically on frames with no non-stunned ghost-death intents.
      scoreState.comboCounter = normalGhostChainCount;
      scoreState.lastProcessedFrame = frameIndex;
    },
  };
}

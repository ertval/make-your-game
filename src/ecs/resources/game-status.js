/**
 * D-01: Game Status Resource
 *
 * Finite state machine (FSM) enum for the top-level game flow.
 * Defines the canonical states and allowed transitions for the game
 * lifecycle: MENU → PLAYING ↔ PAUSED → LEVEL_COMPLETE → PLAYING/VICTORY
 * or GAME_OVER.
 *
 * This resource is consulted by the pause system, level progression system,
 * and screen adapters to determine what UI to show and what actions are valid.
 *
 * Public API:
 *   - GAME_STATE — enum object with all state IDs.
 *   - VALID_TRANSITIONS — adjacency map of allowed state transitions.
 *   - createGameStatus(initialState) — factory that returns a mutable status record.
 *   - canTransition(status, nextState) — check if a transition is valid.
 *   - transitionTo(status, nextState) — mutate to a new state (throws if invalid).
 *   - isPlaying(status), isPaused(status), isMenu(status), etc. — predicate helpers.
 *
 * Implementation notes:
 *   - The status record is a plain object with a single `currentState` field
 *     so it can be stored as a World resource and mutated in place.
 *   - Invalid transitions throw synchronously so that bugs in game flow logic
 *     are caught immediately rather than silently ignored.
 */

/**
 * Game state enum IDs.
 * These correspond to the FSM nodes in the game flow.
 */
export const GAME_STATE = {
  /** Initial state — start screen with "Start Game" and "High Scores". */
  MENU: 'MENU',
  /** Active gameplay — simulation running, player controlling character. */
  PLAYING: 'PLAYING',
  /** Simulation frozen, pause overlay visible with Continue/Restart. */
  PAUSED: 'PAUSED',
  /** All pellets cleared, showing stats and "Next Level" button. */
  LEVEL_COMPLETE: 'LEVEL_COMPLETE',
  /** All levels cleared — victory screen with final stats. */
  VICTORY: 'VICTORY',
  /** All lives lost or timer expired — game over screen. */
  GAME_OVER: 'GAME_OVER',
};

/**
 * Valid state transitions (adjacency map).
 * Each key is a source state; the value is an array of allowed target states.
 */
export const VALID_TRANSITIONS = {
  [GAME_STATE.MENU]: [GAME_STATE.PLAYING],
  [GAME_STATE.PLAYING]: [
    // Explicit PLAYING self-transition keeps restart semantics valid without a pause detour.
    GAME_STATE.PLAYING,
    GAME_STATE.PAUSED,
    GAME_STATE.LEVEL_COMPLETE,
    GAME_STATE.GAME_OVER,
    GAME_STATE.VICTORY,
  ],
  [GAME_STATE.PAUSED]: [GAME_STATE.PLAYING],
  [GAME_STATE.LEVEL_COMPLETE]: [GAME_STATE.PLAYING, GAME_STATE.VICTORY],
  [GAME_STATE.VICTORY]: [GAME_STATE.MENU],
  [GAME_STATE.GAME_OVER]: [GAME_STATE.MENU],
};

/**
 * Create a new game status record.
 *
 * @param {string} [initialState=GAME_STATE.MENU] — Starting state.
 * @returns {GameStatus}
 */
export function createGameStatus(initialState = GAME_STATE.MENU) {
  return {
    /** Current FSM state identifier. */
    currentState: initialState,
    /** Previous state (useful for undo/debug). */
    previousState: null,
  };
}

/**
 * Check whether a transition from the current state to the next state is valid.
 *
 * @param {GameStatus} status — Mutable game status record.
 * @param {string} nextState — Target state to transition to.
 * @returns {boolean}
 */
export function canTransition(status, nextState) {
  const allowed = VALID_TRANSITIONS[status.currentState];
  return allowed?.includes(nextState);
}

/**
 * Attempt to transition to a new state. Throws if the transition is invalid.
 *
 * @param {GameStatus} status — Mutable game status record.
 * @param {string} nextState — Target state to transition to.
 * @throws {Error} If the transition is not in the valid transitions map.
 */
export function transitionTo(status, nextState) {
  if (!canTransition(status, nextState)) {
    throw new Error(
      `Invalid transition: ${status.currentState} → ${nextState}. ` +
        `Allowed: ${VALID_TRANSITIONS[status.currentState]?.join(', ') ?? 'none'}`,
    );
  }

  status.previousState = status.currentState;
  status.currentState = nextState;
}

/**
 * Predicate: is the game currently in active gameplay?
 * @param {GameStatus} status
 * @returns {boolean}
 */
export function isPlaying(status) {
  return status.currentState === GAME_STATE.PLAYING;
}

/**
 * Predicate: is the game currently paused?
 * @param {GameStatus} status
 * @returns {boolean}
 */
export function isPaused(status) {
  return status.currentState === GAME_STATE.PAUSED;
}

/**
 * Predicate: is the game at the main menu?
 * @param {GameStatus} status
 * @returns {boolean}
 */
export function isMenu(status) {
  return status.currentState === GAME_STATE.MENU;
}

/**
 * Predicate: is the game in a terminal state (victory or game over)?
 * @param {GameStatus} status
 * @returns {boolean}
 */
export function isTerminal(status) {
  return status.currentState === GAME_STATE.VICTORY || status.currentState === GAME_STATE.GAME_OVER;
}

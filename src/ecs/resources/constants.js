/**
 * D-01: Constants Resource
 *
 * Canonical gameplay constants used across all systems and resources.
 * Centralizing these values ensures a single source of truth and makes
 * tuning the game balance straightforward without touching system logic.
 *
 * Public API:
 *   - All constants are exported as named const values.
 *   - VISUAL_FLAGS bitmask is used by render-intent to encode sprite state.
 *   - GHOST_TARGET multipliers are used by the AI system for pathfinding math.
 *
 * Implementation notes:
 *   - SIMULATION_HZ drives the fixed-step timestep; changing it affects
 *     every time-based calculation through FIXED_DT_MS.
 *   - Pool sizes are derived from maximum concurrent entities to avoid
 *     runtime allocation bursts in the sprite pool adapter (D-09).
 */

// --- Core Loop ---

/** Fixed simulation updates per second. */
export const SIMULATION_HZ = 60;

/** Fixed timestep in milliseconds (= 1000 / SIMULATION_HZ ≈ 16.6667ms). */
export const FIXED_DT_MS = 1000 / SIMULATION_HZ;

/** Maximum fixed steps to execute in a single frame to prevent spiral-of-death. */
export const MAX_STEPS_PER_FRAME = 5;

// --- Player ---

/** Starting lives for the player. */
export const PLAYER_START_LIVES = 3;

/** Maximum simultaneous bombs the player can place at level start. */
export const PLAYER_START_MAX_BOMBS = 1;

/** Base movement speed in tiles per second. */
export const PLAYER_BASE_SPEED = 5.0;

/** Invincibility duration after respawn (ms). */
export const INVINCIBILITY_MS = 2000;

/** Speed boost movement multiplier. */
export const SPEED_BOOST_MULTIPLIER = 1.5;

/** Speed boost duration (ms). Non-stacking; collecting another resets the timer. */
export const SPEED_BOOST_MS = 10000;

// --- Bomb ---

/** Bomb fuse countdown before detonation (ms). */
export const BOMB_FUSE_MS = 3000;

/** Default explosion radius in tiles (cross pattern, each arm). */
export const DEFAULT_FIRE_RADIUS = 2;

/** Duration fire tiles remain visible after detonation (ms). */
export const FIRE_DURATION_MS = 500;

/** Maximum chain depth for bomb chain-reaction scoring. */
export const MAX_CHAIN_DEPTH = 10;

// --- Ghost ---

/** Stunned duration after eating a power pellet (ms). */
export const STUN_MS = 5000;

/** Dead ghost respawn delay after reaching the ghost house (ms). */
export const GHOST_RESPAWN_MS = 5000;

/** Staggered ghost spawn delays from the ghost house (ms). */
export const GHOST_SPAWN_DELAYS = [0, 5000, 10000, 15000];

/** Ghost personality type IDs. */
export const GHOST_TYPE = {
  BLINKY: 0,
  PINKY: 1,
  INKY: 2,
  CLYDE: 3,
};

/** Ghost state IDs. */
export const GHOST_STATE = {
  CHASING: 0,
  FLEEING: 1,
  DEAD: 2,
};

/** Clyde distance threshold for target switching (tiles). */
export const CLYDE_DISTANCE_THRESHOLD = 8;

/** Pinky target offset ahead of player (tiles). */
export const PINKY_TARGET_OFFSET = 4;

/** Inky reference offset ahead of player (tiles). */
export const INKY_REFERENCE_OFFSET = 2;

/** Minimum valid exits at an intersection for ghost pathfinding. */
export const GHOST_INTERSECTION_MIN_EXITS = 3;

// --- Level ---

/** Per-level timer durations in seconds. */
export const LEVEL_TIMERS = [120, 180, 240];

/** Per-level maximum active ghosts. */
export const LEVEL_MAX_GHOSTS = [2, 3, 4];

/** Per-level ghost normal speed in tiles per second. */
export const LEVEL_GHOST_SPEED = [4.0, 4.5, 5.0];

/** Stunned ghost speed (constant across all levels). */
export const GHOST_STUNNED_SPEED = 2.0;

/** Total number of levels in the game. */
export const TOTAL_LEVELS = 3;

// --- Scoring ---

/** Points for eating a regular pellet. */
export const SCORE_PELLET = 10;

/** Points for eating a power pellet. */
export const SCORE_POWER_PELLET = 50;

/** Points for killing a normal-state ghost with a bomb. */
export const SCORE_GHOST_KILL = 200;

/** Points for killing a stunned ghost with a bomb (skill bonus). */
export const SCORE_STUNNED_GHOST_KILL = 400;

/** Points for collecting a power-up. */
export const SCORE_POWER_UP = 100;

/** Base points for clearing a level. */
export const SCORE_LEVEL_CLEAR = 1000;

/** Multiplier for remaining seconds converted to bonus points. */
export const SCORE_TIME_BONUS_MULTIPLIER = 10;

// --- Power-Up Drop Rates ---

/** Probability map for power-up drops when a destructible wall is destroyed.
 *  Values sum to 1.0. Index aligns with POWER_UP_TYPE enum. */
export const POWER_UP_DROP_CHANCES = {
  NONE: 0.85,
  BOMB: 0.05,
  FIRE: 0.05,
  SPEED: 0.05,
};

/** Power-up type IDs. */
export const POWER_UP_TYPE = {
  NONE: 0,
  BOMB: 1,
  FIRE: 2,
  SPEED: 3,
};

// --- Map Cell Types ---

/** Cell type IDs for the static grid. */
export const CELL_TYPE = {
  EMPTY: 0,
  INDESTRUCTIBLE: 1,
  DESTRUCTIBLE: 2,
  PELLET: 3,
  POWER_PELLET: 4,
  GHOST_HOUSE: 5,
  PLAYER_START: 6,
  POWER_UP_BOMB: 7,
  POWER_UP_FIRE: 8,
  POWER_UP_SPEED: 9,
};

// --- Visual State Bit Flags ---

/** Bitmask flags for the classBits field in RenderIntent.
 *  Combined with bitwise OR to encode sprite visual state without
 *  per-frame string array allocations. */
export const VISUAL_FLAGS = {
  STUNNED: 1,
  INVINCIBLE: 2,
  HIDDEN: 4,
  DEAD: 8,
  SPEED_BOOST: 16,
};

// --- Sprite Pool Sizes ---

/** Maximum concurrent bombs on the field (player max bombs + chain reaction headroom). */
export const POOL_MAX_BOMBS = 10;

/** Maximum fire tiles per bomb explosion (radius * 4 arms + center). */
export const POOL_FIRE_PER_BOMB = DEFAULT_FIRE_RADIUS * 4 + 1;

/** Total fire tile pool size (max bombs * fire per bomb). */
export const POOL_FIRE = POOL_MAX_BOMBS * POOL_FIRE_PER_BOMB;

/** Maximum pellets on a level (upper bound for a fully open 15x11 map). */
export const POOL_PELLETS = 15 * 11;

/** Maximum ghosts active simultaneously (level 3 max). */
export const POOL_GHOSTS = 4;

/** Maximum render intents per frame.
 *  Computed as: ghosts + bombs + fire tiles + pellets + player + wall cells.
 *  The wall cell budget (200) covers the 15×11=165 cell grid with headroom
 *  for larger maps. Once D-02 defines canonical map dimensions, this can be
 *  tightened to the exact maximum wall count. */
export const MAX_RENDER_INTENTS = POOL_GHOSTS + POOL_MAX_BOMBS + POOL_FIRE + POOL_PELLETS + 1 + 200;

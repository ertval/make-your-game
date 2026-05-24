/**
 * D-10: Player Animation System
 *
 * Updates the player's spriteId each simulation tick based on movement direction
 * and a walk-cycle timer. Runs in the simulation phase so render-collect-system
 * reads the updated spriteId in the same frame.
 *
 * Public API:
 * - createPlayerAnimationSystem(options) — factory; returns a simulation-phase system.
 *
 * Implementation notes:
 * - Direction is derived from velocity.rowDelta / velocity.colDelta.
 * - Frame alternates every WALK_FRAME_INTERVAL_MS regardless of tile boundaries.
 * - When the player is idle (speed === 0), spriteId is held at frame 1 of the
 *   last direction so the player visibly faces where they were last moving.
 * - spriteId values match the sprite-handoff.json array index order.
 * - Must run before render-collect-system in the simulation phase.
 */

const WALK_FRAME_INTERVAL_MS = 100;

const SPRITE_ID = Object.freeze({
  IDLE: 0,
  WALK_UP_01: 2,
  WALK_UP_02: 3,
  WALK_DOWN_01: 4,
  WALK_DOWN_02: 5,
  WALK_LEFT_01: 6,
  WALK_LEFT_02: 7,
  WALK_RIGHT_01: 8,
  WALK_RIGHT_02: 9,
});

const WALK_FRAMES = Object.freeze({
  up: [SPRITE_ID.WALK_UP_01, SPRITE_ID.WALK_UP_02],
  down: [SPRITE_ID.WALK_DOWN_01, SPRITE_ID.WALK_DOWN_02],
  left: [SPRITE_ID.WALK_LEFT_01, SPRITE_ID.WALK_LEFT_02],
  right: [SPRITE_ID.WALK_RIGHT_01, SPRITE_ID.WALK_RIGHT_02],
});

export function createPlayerAnimationSystem(options = {}) {
  const playerEntityKey = options.playerEntityResourceKey || 'playerEntity';
  const velocityKey = options.velocityResourceKey || 'velocity';
  const renderableKey = options.renderableResourceKey || 'renderable';

  let walkTimer = 0;
  let frameIndex = 0;
  let lastDirection = 'right';

  return {
    name: 'player-animation-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [playerEntityKey, velocityKey],
      write: [renderableKey],
    },
    update(context) {
      const playerHandle = context.world.getResource(playerEntityKey);
      if (!playerHandle || !context.world.isEntityAlive(playerHandle)) return;

      const velocity = context.world.getResource(velocityKey);
      const renderable = context.world.getResource(renderableKey);
      if (!velocity || !renderable) return;

      const id = playerHandle.id;
      const rowDelta = velocity.rowDelta[id];
      const colDelta = velocity.colDelta[id];
      const dtMs = Number(context.dtMs) || 0;

      // Player is idle when no directional movement is armed. Note: speed
      // alone is not a reliable signal — player-move-system writes the
      // configured base speed each tick even when the player is stationary.
      if (rowDelta === 0 && colDelta === 0) {
        renderable.spriteId[id] = WALK_FRAMES[lastDirection][0];
        walkTimer = 0;
        frameIndex = 0;
        return;
      }

      if (rowDelta < 0) lastDirection = 'up';
      else if (rowDelta > 0) lastDirection = 'down';
      else if (colDelta < 0) lastDirection = 'left';
      else if (colDelta > 0) lastDirection = 'right';

      walkTimer += dtMs;
      if (walkTimer >= WALK_FRAME_INTERVAL_MS) {
        walkTimer -= WALK_FRAME_INTERVAL_MS;
        frameIndex = 1 - frameIndex;
      }

      renderable.spriteId[id] = WALK_FRAMES[lastDirection][frameIndex];
    },
  };
}

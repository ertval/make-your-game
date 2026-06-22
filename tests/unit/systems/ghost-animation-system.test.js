/**
 * D-10 ghost animation system unit tests.
 *
 * Validates the ghost walk-cycle animation in isolation, grouped into the three
 * required areas:
 *   - direction mapping: velocity row/col deltas resolve to up/down/left/right.
 *   - sprite index calc: the resolved direction + global frame index select the
 *     correct WALK_FRAMES sprite id (and ghost state mirrors into classBits).
 *   - animation ticks: accumulated dtMs flips the shared walk frame at
 *     GHOST_WALK_FRAME_INTERVAL_MS and holds the sprite while idle.
 */

import { describe, expect, it } from 'vitest';

import { createGhostStore } from '../../../src/ecs/components/actors.js';
import { createVelocityStore } from '../../../src/ecs/components/spatial.js';
import {
  createRenderableStore,
  createVisualStateStore,
} from '../../../src/ecs/components/visual.js';
import { GHOST_STATE, VISUAL_FLAGS } from '../../../src/ecs/resources/constants.js';
import {
  createGhostAnimationSystem,
  GHOST_ANIMATION_REQUIRED_MASK,
  GHOST_WALK_FRAME_INTERVAL_MS,
} from '../../../src/ecs/systems/ghost-animation-system.js';
import { World } from '../../../src/ecs/world/world.js';

const MAX_ENTITIES = 8;
const RENDERABLE_DEFAULT_SPRITE = -1;

// IDs mirror render-dom-system's GHOST_SPRITE_FRAMES table so the test fails
// loudly if the system or manifest order ever drifts.
const SPRITE_ID = {
  WALK_UP_01: 2,
  WALK_UP_02: 3,
  WALK_DOWN_01: 4,
  WALK_DOWN_02: 5,
  WALK_LEFT_01: 6,
  WALK_LEFT_02: 7,
  WALK_RIGHT_01: 8,
  WALK_RIGHT_02: 9,
};

function createHarness(ghostCount = 1) {
  const world = new World();
  const ghost = createGhostStore(MAX_ENTITIES);
  const velocity = createVelocityStore(MAX_ENTITIES);
  const renderable = createRenderableStore(MAX_ENTITIES);
  const visualState = createVisualStateStore(MAX_ENTITIES);

  const ghosts = [];
  for (let i = 0; i < ghostCount; i += 1) {
    ghosts.push(world.createEntity(GHOST_ANIMATION_REQUIRED_MASK));
  }

  world.setResource('ghost', ghost);
  world.setResource('velocity', velocity);
  world.setResource('renderable', renderable);
  world.setResource('visualState', visualState);

  const system = createGhostAnimationSystem();

  function setGhost(handle, { rowDelta = 0, colDelta = 0, state = GHOST_STATE.NORMAL } = {}) {
    velocity.rowDelta[handle.id] = rowDelta;
    velocity.colDelta[handle.id] = colDelta;
    ghost.state[handle.id] = state;
  }

  function tick(dtMs) {
    system.update({ world, dtMs });
  }

  const spriteOf = (handle) => renderable.spriteId[handle.id];
  const classBitsOf = (handle) => visualState.classBits[handle.id];

  return {
    world,
    ghost,
    velocity,
    renderable,
    visualState,
    ghosts,
    system,
    setGhost,
    tick,
    spriteOf,
    classBitsOf,
  };
}

describe('ghost-animation-system', () => {
  describe('phase and resource config', () => {
    const system = createGhostAnimationSystem();

    it('runs in the logic phase, before render reads spriteId', () => {
      expect(system.phase).toBe('logic');
    });

    it('declares read access to ghost and velocity', () => {
      expect(system.resourceCapabilities.read).toEqual(
        expect.arrayContaining(['ghost', 'velocity']),
      );
    });

    it('declares write access to renderable and visualState', () => {
      expect(system.resourceCapabilities.write).toEqual(
        expect.arrayContaining(['renderable', 'visualState']),
      );
    });

    it('exposes a stable name', () => {
      expect(system.name).toBe('ghost-animation-system');
    });
  });

  describe('direction mapping', () => {
    it.each([
      ['up', { rowDelta: -1, colDelta: 0 }, SPRITE_ID.WALK_UP_01],
      ['down', { rowDelta: 1, colDelta: 0 }, SPRITE_ID.WALK_DOWN_01],
      ['left', { rowDelta: 0, colDelta: -1 }, SPRITE_ID.WALK_LEFT_01],
      ['right', { rowDelta: 0, colDelta: 1 }, SPRITE_ID.WALK_RIGHT_01],
    ])('maps %s velocity to its walk frame', (_label, deltas, expectedSpriteId) => {
      const { ghosts, setGhost, tick, spriteOf } = createHarness();
      setGhost(ghosts[0], deltas);
      tick(16);
      expect(spriteOf(ghosts[0])).toBe(expectedSpriteId);
    });

    it('prioritizes vertical over horizontal when both deltas are non-zero', () => {
      const { ghosts, setGhost, tick, spriteOf } = createHarness();
      setGhost(ghosts[0], { rowDelta: -1, colDelta: 1 });
      tick(16);
      expect(spriteOf(ghosts[0])).toBe(SPRITE_ID.WALK_UP_01);
    });
  });

  describe('sprite index calc', () => {
    it('selects frame 01 on the leading index and frame 02 after the index flips', () => {
      const { ghosts, setGhost, tick, spriteOf } = createHarness();
      setGhost(ghosts[0], { rowDelta: -1 });

      tick(16); // frame index 0
      expect(spriteOf(ghosts[0])).toBe(SPRITE_ID.WALK_UP_01);

      tick(GHOST_WALK_FRAME_INTERVAL_MS); // crosses threshold -> frame index 1
      expect(spriteOf(ghosts[0])).toBe(SPRITE_ID.WALK_UP_02);
    });

    it('shares one global frame index across every ghost so walk cycles stay in sync', () => {
      const { ghosts, setGhost, tick, spriteOf } = createHarness(2);
      setGhost(ghosts[0], { rowDelta: -1 }); // up
      setGhost(ghosts[1], { colDelta: 1 }); // right

      tick(GHOST_WALK_FRAME_INTERVAL_MS); // both advance to frame 02 together
      expect(spriteOf(ghosts[0])).toBe(SPRITE_ID.WALK_UP_02);
      expect(spriteOf(ghosts[1])).toBe(SPRITE_ID.WALK_RIGHT_02);
    });

    it('mirrors ghost STUNNED / DEAD state into classBits without disturbing other flags', () => {
      const { ghosts, setGhost, tick, visualState, classBitsOf } = createHarness();
      // A flag owned by another system must survive the state refresh.
      visualState.classBits[ghosts[0].id] = VISUAL_FLAGS.INVINCIBLE;

      setGhost(ghosts[0], { colDelta: 1, state: GHOST_STATE.STUNNED });
      tick(16);
      expect(classBitsOf(ghosts[0]) & VISUAL_FLAGS.STUNNED).toBe(VISUAL_FLAGS.STUNNED);
      expect(classBitsOf(ghosts[0]) & VISUAL_FLAGS.INVINCIBLE).toBe(VISUAL_FLAGS.INVINCIBLE);

      setGhost(ghosts[0], { colDelta: 1, state: GHOST_STATE.DEAD });
      tick(16);
      expect(classBitsOf(ghosts[0]) & VISUAL_FLAGS.DEAD).toBe(VISUAL_FLAGS.DEAD);
      expect(classBitsOf(ghosts[0]) & VISUAL_FLAGS.STUNNED).toBe(0);

      setGhost(ghosts[0], { colDelta: 1, state: GHOST_STATE.NORMAL });
      tick(16);
      expect(classBitsOf(ghosts[0]) & (VISUAL_FLAGS.STUNNED | VISUAL_FLAGS.DEAD)).toBe(0);
      expect(classBitsOf(ghosts[0]) & VISUAL_FLAGS.INVINCIBLE).toBe(VISUAL_FLAGS.INVINCIBLE);
    });
  });

  describe('animation ticks', () => {
    it('flips the walk frame only once the interval is crossed', () => {
      const { ghosts, setGhost, tick, spriteOf } = createHarness();
      setGhost(ghosts[0], { colDelta: 1 });

      tick(100); // under 150ms
      expect(spriteOf(ghosts[0])).toBe(SPRITE_ID.WALK_RIGHT_01);

      tick(60); // 160ms total -> crosses, carries 10ms remainder
      expect(spriteOf(ghosts[0])).toBe(SPRITE_ID.WALK_RIGHT_02);

      tick(140); // 150ms total -> crosses back
      expect(spriteOf(ghosts[0])).toBe(SPRITE_ID.WALK_RIGHT_01);
    });

    it('does not flip within a single sub-threshold tick', () => {
      const { ghosts, setGhost, tick, spriteOf } = createHarness();
      setGhost(ghosts[0], { colDelta: 1 });
      tick(50);
      tick(50);
      expect(spriteOf(ghosts[0])).toBe(SPRITE_ID.WALK_RIGHT_01);
    });

    it('treats missing dtMs as zero (no flip)', () => {
      const { ghosts, setGhost, tick, spriteOf } = createHarness();
      setGhost(ghosts[0], { colDelta: 1 });
      tick(undefined);
      expect(spriteOf(ghosts[0])).toBe(SPRITE_ID.WALK_RIGHT_01);
    });

    it('holds the previous sprite while idle instead of flickering to idle', () => {
      const { ghosts, setGhost, tick, spriteOf } = createHarness();

      setGhost(ghosts[0], { colDelta: -1 });
      tick(16);
      expect(spriteOf(ghosts[0])).toBe(SPRITE_ID.WALK_LEFT_01);

      setGhost(ghosts[0], { rowDelta: 0, colDelta: 0 });
      tick(16);
      expect(spriteOf(ghosts[0])).toBe(SPRITE_ID.WALK_LEFT_01);
    });

    it('leaves the sprite untouched for a ghost idle since spawn', () => {
      const { ghosts, setGhost, tick, spriteOf } = createHarness();
      setGhost(ghosts[0], { rowDelta: 0, colDelta: 0 });
      tick(500);
      expect(spriteOf(ghosts[0])).toBe(RENDERABLE_DEFAULT_SPRITE);
    });
  });

  describe('safe handling of missing resources', () => {
    it.each([
      'ghost',
      'velocity',
      'renderable',
      'visualState',
    ])('no-ops when the %s resource is missing', (missingKey) => {
      const { world, ghosts, setGhost, system } = createHarness();
      setGhost(ghosts[0], { colDelta: 1 });
      world.setResource(missingKey, null);
      expect(() => system.update({ world, dtMs: 16 })).not.toThrow();
    });
  });
});

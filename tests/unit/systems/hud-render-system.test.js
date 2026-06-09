/**
 * Unit tests for the ARCH-01 HUD render system.
 *
 * The render-phase system is the single HUD→DOM boundary: it reads the
 * data-only `hudState` buffer and delegates to the HUD adapter. These checks
 * verify the buffer is forwarded verbatim and that missing adapter/buffer
 * resources are tolerated as no-ops.
 */

import { describe, expect, it, vi } from 'vitest';
import { createHudRenderSystem } from '../../../src/ecs/systems/hud-render-system.js';
import { createHudState } from '../../../src/ecs/systems/hud-system.js';
import { World } from '../../../src/ecs/world/world.js';

function setupWorld({ hudState, hudAdapter } = {}) {
  const world = new World();
  if (hudState !== undefined) {
    world.setResource('hudState', hudState);
  }
  if (hudAdapter !== undefined) {
    world.setResource('hudAdapter', hudAdapter);
  }
  return world;
}

describe('hud-render-system', () => {
  it('is a render-phase system that reads hudState and hudAdapter only', () => {
    const system = createHudRenderSystem();

    expect(system.phase).toBe('render');
    expect(system.resourceCapabilities.read).toEqual(['hudState', 'hudAdapter']);
    expect(system.resourceCapabilities.write).toBeUndefined();
  });

  it('forwards the hudState buffer to the adapter', () => {
    const update = vi.fn();
    const hudState = {
      ...createHudState(),
      lives: 2,
      score: 1500,
      timer: 42,
      bombs: 3,
      fire: 4,
      level: 2,
    };
    const world = setupWorld({ hudState, hudAdapter: { update } });
    const system = createHudRenderSystem();

    system.update({ world });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      lives: 2,
      score: 1500,
      timer: 42,
      bombs: 3,
      fire: 4,
      level: 2,
    });
  });

  it('is a no-op when no adapter is registered', () => {
    const world = setupWorld({ hudState: createHudState(), hudAdapter: null });
    const system = createHudRenderSystem();

    expect(() => system.update({ world })).not.toThrow();
  });

  it('is a no-op when the adapter has no update method', () => {
    const world = setupWorld({ hudState: createHudState(), hudAdapter: {} });
    const system = createHudRenderSystem();

    expect(() => system.update({ world })).not.toThrow();
  });

  it('is a no-op when the hudState buffer is missing', () => {
    const update = vi.fn();
    const world = setupWorld({ hudAdapter: { update } });
    const system = createHudRenderSystem();

    system.update({ world });

    expect(update).not.toHaveBeenCalled();
  });
});

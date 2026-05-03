/**
 * Unit tests for the B-02 fixed-step input snapshot system.
 *
 * These checks verify that the browser-facing adapter state is sampled once per
 * fixed step and copied into the player input-state component deterministically.
 */

import { describe, expect, it } from 'vitest';

import { createInputStateStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { createInputSystem } from '../../../src/ecs/systems/input-system.js';
import { World } from '../../../src/ecs/world/world.js';

function createAdapterStub({ heldKeys = [], pressedKeys = [] } = {}) {
  const adapter = {
    heldKeys: new Set(heldKeys),
    pressedKeys: new Set(pressedKeys),
  };

  adapter.getHeldKeys = () => adapter.heldKeys;
  adapter.drainPressedKeys = () => {
    const drainedKeys = new Set(adapter.pressedKeys);
    adapter.pressedKeys.clear();
    return drainedKeys;
  };

  return adapter;
}

describe('input-system', () => {
  it('declares the adapter and input snapshot resources it reads', () => {
    const inputSystem = createInputSystem({
      adapterResourceKey: 'customAdapter',
      inputStateResourceKey: 'customInputState',
    });

    expect(inputSystem.resourceCapabilities).toEqual({
      read: ['customAdapter', 'customInputState'],
      write: ['customInputState'],
    });
  });

  it('writes held movement keys and one-shot intents into the player snapshot', () => {
    const world = new World();
    const inputSystem = createInputSystem();
    const inputState = createInputStateStore(8);
    const player = world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.INPUT_STATE);

    world.setResource(
      'inputAdapter',
      createAdapterStub({
        heldKeys: ['up', 'left'],
        pressedKeys: ['bomb', 'pause', 'confirm'],
      }),
    );
    world.setResource('inputState', inputState);

    inputSystem.update({ world });

    expect(inputState.up[player.id]).toBe(1);
    expect(inputState.down[player.id]).toBe(0);
    expect(inputState.left[player.id]).toBe(1);
    expect(inputState.right[player.id]).toBe(0);
    expect(inputState.bomb[player.id]).toBe(1);
    expect(inputState.pause[player.id]).toBe(1);
    expect(inputState.confirm[player.id]).toBe(1);
  });

  it('drains one-shot pressed intents once per fixed step', () => {
    const world = new World();
    const inputSystem = createInputSystem();
    const inputState = createInputStateStore(4);
    const adapter = createAdapterStub({
      heldKeys: ['right'],
      pressedKeys: ['bomb'],
    });
    const player = world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.INPUT_STATE);

    world.setResource('inputAdapter', adapter);
    world.setResource('inputState', inputState);

    inputSystem.update({ world });
    expect(inputState.right[player.id]).toBe(1);
    expect(inputState.bomb[player.id]).toBe(1);

    inputSystem.update({ world });
    expect(inputState.right[player.id]).toBe(1);
    expect(inputState.bomb[player.id]).toBe(0);
  });

  it('rewrites the full snapshot each step so stale values do not leak forward', () => {
    const world = new World();
    const inputSystem = createInputSystem();
    const inputState = createInputStateStore(4);
    const adapter = createAdapterStub({
      heldKeys: ['down'],
      pressedKeys: ['pause'],
    });
    const player = world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.INPUT_STATE);

    world.setResource('inputAdapter', adapter);
    world.setResource('inputState', inputState);

    inputSystem.update({ world });

    adapter.heldKeys.clear();
    inputSystem.update({ world });

    expect(inputState.up[player.id]).toBe(0);
    expect(inputState.down[player.id]).toBe(0);
    expect(inputState.left[player.id]).toBe(0);
    expect(inputState.right[player.id]).toBe(0);
    expect(inputState.bomb[player.id]).toBe(0);
    expect(inputState.pause[player.id]).toBe(0);
    expect(inputState.confirm[player.id]).toBe(0);
  });

  it('updates only player entities with input-state components', () => {
    const world = new World();
    const inputSystem = createInputSystem();
    const inputState = createInputStateStore(6);
    const player = world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.INPUT_STATE);
    const nonPlayer = world.createEntity(COMPONENT_MASK.INPUT_STATE);

    world.setResource(
      'inputAdapter',
      createAdapterStub({
        heldKeys: ['right'],
        pressedKeys: ['confirm'],
      }),
    );
    world.setResource('inputState', inputState);

    inputState.left[nonPlayer.id] = 1;
    inputState.confirm[nonPlayer.id] = 1;

    inputSystem.update({ world });

    expect(inputState.right[player.id]).toBe(1);
    expect(inputState.confirm[player.id]).toBe(1);
    expect(inputState.left[nonPlayer.id]).toBe(1);
    expect(inputState.confirm[nonPlayer.id]).toBe(1);
  });

  it('clears the player snapshot when the input adapter resource is missing', () => {
    const world = new World();
    const inputSystem = createInputSystem();
    const inputState = createInputStateStore(4);
    const player = world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.INPUT_STATE);

    world.setResource('inputState', inputState);

    inputState.up[player.id] = 1;
    inputState.right[player.id] = 1;
    inputState.bomb[player.id] = 1;
    inputState.pause[player.id] = 1;
    inputState.confirm[player.id] = 1;

    inputSystem.update({ world });

    expect(inputState.up[player.id]).toBe(0);
    expect(inputState.down[player.id]).toBe(0);
    expect(inputState.left[player.id]).toBe(0);
    expect(inputState.right[player.id]).toBe(0);
    expect(inputState.bomb[player.id]).toBe(0);
    expect(inputState.pause[player.id]).toBe(0);
    expect(inputState.confirm[player.id]).toBe(0);
  });

  it('returns early without throwing when the input-state resource is missing', () => {
    const world = new World();
    const inputSystem = createInputSystem();
    const player = world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.INPUT_STATE);

    world.setResource(
      'inputAdapter',
      createAdapterStub({
        heldKeys: ['left'],
        pressedKeys: ['confirm'],
      }),
    );

    expect(() => {
      inputSystem.update({ world });
    }).not.toThrow();
    expect(player.id).toBeGreaterThanOrEqual(0);
  });

  it('throws when a registered adapter does not expose the explicit contract', () => {
    const world = new World();
    const inputSystem = createInputSystem();
    const inputState = createInputStateStore(4);

    world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.INPUT_STATE);
    world.setResource('inputState', inputState);
    world.setResource('inputAdapter', {
      heldKeys: new Set(['left']),
    });

    expect(() => {
      inputSystem.update({ world });
    }).toThrow('must expose getHeldKeys()');
  });
});

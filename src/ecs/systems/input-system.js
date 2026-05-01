/*
 * B-02 fixed-step input snapshot system.
 *
 * This system reads the browser-facing input adapter once per simulation step
 * and writes a deterministic input snapshot into the input-state component for
 * player-controlled entities. It keeps the adapter boundary outside the rest of
 * gameplay simulation by translating Sets of held and pressed intents into
 * stable 0/1 component data.
 *
 * Public API:
 * - createInputSystem(options)
 *
 * Implementation notes:
 * - The system queries only entities with both PLAYER and INPUT_STATE masks so
 *   non-player entities never receive player keyboard input.
 * - Held directions are sampled from `adapter.getHeldKeys()` without consuming
 *   them.
 * - One-shot actions are sampled from `adapter.drainPressedKeys()` exactly
 *   once per fixed step so bomb, pause, and confirm never depend on OS key
 *   repeat.
 */

import { COMPONENT_MASK } from '../components/registry.js';

const DEFAULT_REQUIRED_MASK = COMPONENT_MASK.PLAYER | COMPONENT_MASK.INPUT_STATE;
const EMPTY_INTENT_SET = new Set();

function assertInputAdapterContract(adapter, adapterResourceKey) {
  // Keep this contract check local to the system so ECS simulation code does
  // not import the DOM-facing adapter module directly.
  if (typeof adapter.getHeldKeys !== 'function') {
    throw new Error(`Input adapter resource "${adapterResourceKey}" must expose getHeldKeys().`);
  }

  if (typeof adapter.drainPressedKeys !== 'function') {
    throw new Error(
      `Input adapter resource "${adapterResourceKey}" must expose drainPressedKeys().`,
    );
  }
}

/**
 * Create the input snapshot system.
 *
 * @param {{
 *   adapterResourceKey?: string,
 *   inputStateResourceKey?: string,
 *   requiredMask?: number,
 * }} [options] - Optional resource keys and query mask overrides for tests.
 * @returns {{ name: string, phase: string, update: Function }} ECS system registration.
 */
export function createInputSystem(options = {}) {
  const adapterResourceKey = options.adapterResourceKey || 'inputAdapter';
  const inputStateResourceKey = options.inputStateResourceKey || 'inputState';
  const requiredMask = options.requiredMask ?? DEFAULT_REQUIRED_MASK;

  return {
    name: 'input-system',
    phase: 'input',
    // Resource capabilities document the adapter and snapshot stores this
    // system reads so policy and tooling can inspect its world dependencies.
    resourceCapabilities: {
      read: [adapterResourceKey, inputStateResourceKey],
      write: [inputStateResourceKey],
    },
    update(context) {
      const adapter = context.world.getResource(adapterResourceKey);
      const inputState = context.world.getResource(inputStateResourceKey);

      if (!inputState) {
        return;
      }

      let heldKeys = EMPTY_INTENT_SET;
      let pressedKeys = EMPTY_INTENT_SET;

      if (adapter !== null && adapter !== undefined) {
        assertInputAdapterContract(adapter, adapterResourceKey);
        heldKeys = adapter.getHeldKeys();
        pressedKeys = adapter.drainPressedKeys();

        if (!(heldKeys instanceof Set)) {
          throw new Error(
            `Input adapter resource "${adapterResourceKey}" getHeldKeys() must return a Set.`,
          );
        }

        if (!(pressedKeys instanceof Set)) {
          throw new Error(
            `Input adapter resource "${adapterResourceKey}" drainPressedKeys() must return a Set.`,
          );
        }
      }

      const playerEntityIds = context.world.query(requiredMask);

      for (const entityId of playerEntityIds) {
        // Rewrite every snapshot field every step so stale inputs never leak forward.
        inputState.up[entityId] = heldKeys.has('up') ? 1 : 0;
        inputState.down[entityId] = heldKeys.has('down') ? 1 : 0;
        inputState.left[entityId] = heldKeys.has('left') ? 1 : 0;
        inputState.right[entityId] = heldKeys.has('right') ? 1 : 0;
        inputState.bomb[entityId] = pressedKeys.has('bomb') ? 1 : 0;
        inputState.pause[entityId] = pressedKeys.has('pause') ? 1 : 0;
        inputState.restart[entityId] = pressedKeys.has('restart') ? 1 : 0;
        // Confirm is intentionally edge-triggered like other one-shot actions.
        inputState.confirm[entityId] = pressedKeys.has('confirm') ? 1 : 0;
      }
    },
  };
}

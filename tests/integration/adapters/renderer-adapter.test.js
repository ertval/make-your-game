/**
 * D-06: Board Adapter Tests
 *
 * Verifies renderer-adapter generates board using safe DOM APIs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoardAdapter } from '../../../src/adapters/dom/renderer-adapter.js';

function createMockDocument() {
  return {
    createElement: vi.fn(() => ({
      classList: { add: vi.fn() },
      style: { setProperty: vi.fn() },
      children: [],
      innerHTML: '',
      setAttribute: vi.fn(),
      appendChild: vi.fn(),
      parentNode: null,
    })),
  };
}

describe('board-adapter', () => {
  let mockDoc;
  let adapter;
  let container;

  beforeEach(() => {
    mockDoc = createMockDocument();
    adapter = createBoardAdapter({ document: mockDoc });
    container = mockDoc.createElement('div');
  });

  it('creates a board adapter factory', () => {
    expect(adapter).toBeDefined();
    expect(typeof adapter.generateBoard).toBe('function');
  });

  it('generates board elements using createElement', () => {
    const map = { rows: 2, cols: 3, grid: new Uint8Array(6), grid2D: [], activeGhostTypes: [] };
    adapter.generateBoard(map, container);

    expect(mockDoc.createElement).toHaveBeenCalled();
  });

  it('throws on invalid map', () => {
    expect(() => adapter.generateBoard(null, container)).toThrow();
    expect(() => adapter.generateBoard({}, container)).toThrow();
  });

  it('returns the generated board element via getBoard', () => {
    const map = { rows: 2, cols: 3, grid: new Uint8Array(6), grid2D: [], activeGhostTypes: [] };
    adapter.generateBoard(map, container);

    const board = adapter.getBoard();
    expect(board).not.toBeNull();
    expect(typeof board).toBe('object');
  });

  it('returns null from getBoard before any board is generated', () => {
    expect(adapter.getBoard()).toBeNull();
  });

  it('removes the board element from the document when clearBoard is called', () => {
    const map = { rows: 2, cols: 3, grid: new Uint8Array(6), grid2D: [], activeGhostTypes: [] };
    const parent = { children: [], appendChild: vi.fn(), removeChild: vi.fn() };
    const boardElement = {
      classList: { add: vi.fn() },
      style: { setProperty: vi.fn() },
      parentNode: parent,
      children: [],
      appendChild: vi.fn(),
      innerHTML: '',
      setAttribute: vi.fn(),
    };
    const adapterWithBoard = createBoardAdapter({
      document: {
        createElement: vi.fn(() => boardElement),
      },
    });

    adapterWithBoard.generateBoard(map, container);
    adapterWithBoard.clearBoard();

    expect(parent.removeChild).toHaveBeenCalledWith(boardElement);
    expect(adapterWithBoard.getBoard()).toBeNull();
  });

  it('clearBoard does nothing when board is already null', () => {
    const adapterWithNoBoard = createBoardAdapter({
      document: {
        createElement: vi.fn(() => ({ parentNode: null })),
      },
    });

    adapterWithNoBoard.clearBoard();
    expect(adapterWithNoBoard.getBoard()).toBeNull();
  });

  it('clears existing container children before generating new board', () => {
    const mockDoc = {
      createElement: vi.fn(() => ({
        classList: { add: vi.fn() },
        style: { setProperty: vi.fn() },
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        parentNode: null,
      })),
    };
    const adapter2 = createBoardAdapter({ document: mockDoc });
    const child1 = { removed: false };
    const child2 = { removed: false };
    const container2 = {
      firstChild: child1,
      removeChild: vi.fn((child) => {
        child.removed = true;
        // Simulate removal
        if (container2.firstChild === child) {
          container2.firstChild = child === child1 ? child2 : null;
        }
      }),
      appendChild: vi.fn(),
    };

    // Pre-populate container with children
    container2.firstChild = child1;

    const map = { rows: 1, cols: 1, grid: new Uint8Array(1), grid2D: [], activeGhostTypes: [] };
    adapter2.generateBoard(map, container2);

    expect(container2.removeChild).toHaveBeenCalledTimes(2);
    expect(child1.removed).toBe(true);
    expect(child2.removed).toBe(true);
  });

  it('calls spritePool.warmUp on generateBoard when spritePool is provided', () => {
    const warmUp = vi.fn();
    const reset = vi.fn();
    const mockDoc = {
      createElement: vi.fn(() => ({
        classList: { add: vi.fn() },
        style: { setProperty: vi.fn() },
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        parentNode: null,
      })),
    };
    const adapterWithPool = createBoardAdapter({
      document: mockDoc,
      spritePool: { warmUp, reset },
    });
    const container3 = { firstChild: null, appendChild: vi.fn(), removeChild: vi.fn() };
    const map = { rows: 1, cols: 1, grid: new Uint8Array(1), grid2D: [], activeGhostTypes: [] };

    adapterWithPool.generateBoard(map, container3);

    expect(warmUp).toHaveBeenCalledTimes(1);
    expect(warmUp).toHaveBeenCalledWith(expect.any(Object));
  });

  it('calls spritePool.reset on clearBoard when spritePool is provided', () => {
    const warmUp = vi.fn();
    const reset = vi.fn();
    const boardEl = {
      classList: { add: vi.fn() },
      style: { setProperty: vi.fn() },
      setAttribute: vi.fn(),
      parentNode: { removeChild: vi.fn() },
      appendChild: vi.fn(),
    };
    const mockDoc = {
      createElement: vi.fn(() => boardEl),
    };
    const adapterWithPool = createBoardAdapter({
      document: mockDoc,
      spritePool: { warmUp, reset },
    });
    const container4 = { firstChild: null, appendChild: vi.fn(), removeChild: vi.fn() };
    const map = { rows: 1, cols: 1, grid: new Uint8Array(1), grid2D: [], activeGhostTypes: [] };

    adapterWithPool.generateBoard(map, container4);
    adapterWithPool.clearBoard();

    expect(reset).toHaveBeenCalledTimes(1);
  });
});

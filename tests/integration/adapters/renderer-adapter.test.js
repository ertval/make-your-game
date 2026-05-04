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
    const boardElement = { classList: { add: vi.fn() }, style: { setProperty: vi.fn() }, parentNode: parent, children: [], appendChild: vi.fn(), innerHTML: '', setAttribute: vi.fn() };
    const adapterWithBoard = createBoardAdapter({ document: {
      createElement: vi.fn(() => boardElement),
    } });

    adapterWithBoard.generateBoard(map, container);
    adapterWithBoard.clearBoard();

    expect(parent.removeChild).toHaveBeenCalledWith(boardElement);
    expect(adapterWithBoard.getBoard()).toBeNull();
  });

  it('clearBoard does nothing when board is already null', () => {
    const adapterWithNoBoard = createBoardAdapter({ document: {
      createElement: vi.fn(() => ({ parentNode: null })),
    } });

    adapterWithNoBoard.clearBoard();
    expect(adapterWithNoBoard.getBoard()).toBeNull();
  });
});

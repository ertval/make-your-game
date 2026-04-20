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
});

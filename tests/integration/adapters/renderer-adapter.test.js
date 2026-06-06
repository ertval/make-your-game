/**
 * D-06: Board Adapter Tests
 *
 * Verifies renderer-adapter generates board using safe DOM APIs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoardAdapter } from '../../../src/adapters/dom/renderer-adapter.js';
import { createBoardSyncSystem } from '../../../src/ecs/systems/board-sync-system.js';
import { World } from '../../../src/ecs/world/world.js';

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

  describe('updateCell', () => {
    function createTrackingDoc() {
      const created = [];
      return {
        created,
        document: {
          createElement: vi.fn(() => {
            const removed = [];
            const added = [];
            const el = {
              classList: {
                add: vi.fn((cls) => added.push(cls)),
                remove: vi.fn((cls) => removed.push(cls)),
              },
              style: { setProperty: vi.fn() },
              setAttribute: vi.fn(),
              appendChild: vi.fn(),
              parentNode: null,
              _added: added,
              _removed: removed,
            };
            created.push(el);
            return el;
          }),
        },
      };
    }

    it('targets the correct cell element by row/col', () => {
      const { created, document } = createTrackingDoc();
      const adapter2 = createBoardAdapter({ document });
      const container2 = { firstChild: null, appendChild: vi.fn(), removeChild: vi.fn() };
      const map = { rows: 2, cols: 3, grid: new Uint8Array([3, 3, 3, 1, 1, 1]) };

      adapter2.generateBoard(map, container2);

      // Board element is created first, then 6 cells. Cell (1, 2) is the last created cell.
      const cellElements = created.slice(1); // skip board element
      const targetCell = cellElements[1 * 3 + 2];
      const before = targetCell._added.length;

      adapter2.updateCell(1, 2, 0);

      expect(targetCell._removed).toEqual(expect.arrayContaining(['cell-pellet']));
      expect(targetCell._added.slice(before)).toEqual(['cell-empty']);
    });

    it('is a no-op for out-of-range coordinates', () => {
      const { document } = createTrackingDoc();
      const adapter2 = createBoardAdapter({ document });
      const container2 = { firstChild: null, appendChild: vi.fn(), removeChild: vi.fn() };
      adapter2.generateBoard({ rows: 1, cols: 1, grid: new Uint8Array([3]) }, container2);

      expect(() => adapter2.updateCell(99, 99, 0)).not.toThrow();
    });

    it('does nothing before generateBoard has been called', () => {
      const { document } = createTrackingDoc();
      const adapter2 = createBoardAdapter({ document });
      expect(() => adapter2.updateCell(0, 0, 0)).not.toThrow();
    });

    it('falls back to cell-empty for unknown cell types', () => {
      const { created, document } = createTrackingDoc();
      const adapter2 = createBoardAdapter({ document });
      const container2 = { firstChild: null, appendChild: vi.fn(), removeChild: vi.fn() };
      adapter2.generateBoard({ rows: 1, cols: 1, grid: new Uint8Array([3]) }, container2);

      const cellEl = created[1];
      const before = cellEl._added.length;
      adapter2.updateCell(0, 0, 999);

      expect(cellEl._added.slice(before)).toEqual(['cell-empty']);
    });

    it('maps power-up cell types 7/8/9 to cell-powerup-bomb/fire/speed', () => {
      // Mirrors the explosion-system power-up drop flow: a destructible wall
      // (CELL_TYPE.DESTRUCTIBLE = 2) becomes a power-up cell (7/8/9) when
      // explosion-system sets the type. updateCell must strip the prior
      // class and add the new one.
      const cases = [
        { type: 7, expectedClass: 'cell-powerup-bomb' },
        { type: 8, expectedClass: 'cell-powerup-fire' },
        { type: 9, expectedClass: 'cell-powerup-speed' },
      ];

      for (const { type, expectedClass } of cases) {
        const { created, document } = createTrackingDoc();
        const adapter2 = createBoardAdapter({ document });
        const container2 = {
          firstChild: null,
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        };
        adapter2.generateBoard({ rows: 1, cols: 1, grid: new Uint8Array([2]) }, container2);

        const cellEl = created[1];
        const before = cellEl._added.length;
        adapter2.updateCell(0, 0, type);

        // Prior cell-destructible class must be stripped via the class-removal
        // loop; the new power-up class must be the only one added in this call.
        expect(cellEl._removed).toEqual(expect.arrayContaining(['cell-destructible']));
        expect(cellEl._added.slice(before)).toEqual([expectedClass]);
      }
    });

    it('end-to-end: explosion-system drop type 7 flows through board-sync to the DOM', () => {
      // Mirrors the existing destructible → empty transition pattern: a board
      // is generated, the map grid is mutated to a power-up cell type, and
      // the real board-sync-system runs against the real renderer-adapter.
      // The DOM cell must carry the new power-up class (and no longer the
      // destructible one) without any direct updateCell call from the test.
      const { created, document } = createTrackingDoc();
      const boardAdapter = createBoardAdapter({ document });
      const container2 = {
        firstChild: null,
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      };
      const map = { rows: 1, cols: 1, grid: new Uint8Array([2]) };
      boardAdapter.generateBoard(map, container2);

      const cellEl = created[1];

      // Prime the snapshot so the next frame is a real diff.
      const world = new World();
      world.setResource('mapResource', map);
      const syncSystem = createBoardSyncSystem(boardAdapter);
      syncSystem.update({ world });

      // Simulate explosion-system writing a power-up drop.
      map.grid[0] = 7;
      syncSystem.update({ world });

      expect(cellEl._removed).toEqual(expect.arrayContaining(['cell-destructible']));
      expect(cellEl._added).toEqual(expect.arrayContaining(['cell-powerup-bomb']));
    });
  });

  describe('board-fit scaling', () => {
    /**
     * Build a document whose defaultView exposes a viewport + getComputedStyle
     * returning the given CSS layout tokens, and whose board element records
     * every setProperty call so we can read back --fit-scale.
     */
    function createFitDoc({ innerWidth, innerHeight, cssVars }) {
      const listeners = {};
      const setProps = new Map();
      const boardEl = {
        classList: { add: vi.fn() },
        style: {
          setProperty: vi.fn((name, value) => setProps.set(name, value)),
          getProperty: (name) => setProps.get(name),
        },
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        parentNode: { removeChild: vi.fn() },
      };
      const win = {
        innerWidth,
        innerHeight,
        getComputedStyle: () => ({ getPropertyValue: (name) => cssVars[name] ?? '' }),
        addEventListener: vi.fn((type, fn) => {
          listeners[type] = fn;
        }),
        removeEventListener: vi.fn((type) => {
          delete listeners[type];
        }),
      };
      let cellCount = 0;
      const document = {
        defaultView: win,
        documentElement: {},
        createElement: vi.fn(() => {
          // First createElement is the board; the rest are cells.
          if (cellCount === 0) {
            cellCount += 1;
            return boardEl;
          }
          cellCount += 1;
          return {
            classList: { add: vi.fn() },
            style: { setProperty: vi.fn() },
            setAttribute: vi.fn(),
            appendChild: vi.fn(),
            parentNode: null,
          };
        }),
      };
      return { document, win, boardEl, setProps, listeners };
    }

    const CSS_VARS = {
      '--tile-size': '32px',
      '--space-md': '16px',
      '--hud-row-height': '72px',
      '--board-max-scale': '4',
    };

    it('sets --fit-scale from the true board geometry (rows×cols×tile), not the root size', () => {
      // 15×11 board (480×352px) in a 1440×900 viewport.
      // min((1440-64)/480, (900-72-128)/352, 4) = min(2.867, 1.989, 4) = ~1.9886.
      const { document, boardEl, setProps } = createFitDoc({
        innerWidth: 1440,
        innerHeight: 900,
        cssVars: CSS_VARS,
      });
      const adapter2 = createBoardAdapter({ document });
      const container2 = { firstChild: null, appendChild: vi.fn(), removeChild: vi.fn() };
      adapter2.generateBoard({ rows: 11, cols: 15, grid: new Uint8Array(15 * 11) }, container2);

      expect(boardEl).toBe(adapter2.getBoard());
      const fitScale = Number.parseFloat(setProps.get('--fit-scale'));
      expect(fitScale).toBeCloseTo((900 - 72 - 128) / 352, 4);
    });

    it('caps the scale at --board-max-scale for tiny boards', () => {
      // 1×1 board (32px). Uncapped scale would be huge; must clamp to 4.
      const { document, setProps } = createFitDoc({
        innerWidth: 1440,
        innerHeight: 900,
        cssVars: CSS_VARS,
      });
      const adapter2 = createBoardAdapter({ document });
      const container2 = { firstChild: null, appendChild: vi.fn(), removeChild: vi.fn() };
      adapter2.generateBoard({ rows: 1, cols: 1, grid: new Uint8Array(1) }, container2);

      expect(Number.parseFloat(setProps.get('--fit-scale'))).toBe(4);
    });

    it('registers a resize listener on generate and removes it on clear', () => {
      const { document, win, listeners } = createFitDoc({
        innerWidth: 1440,
        innerHeight: 900,
        cssVars: CSS_VARS,
      });
      const adapter2 = createBoardAdapter({ document });
      const container2 = { firstChild: null, appendChild: vi.fn(), removeChild: vi.fn() };
      adapter2.generateBoard({ rows: 2, cols: 2, grid: new Uint8Array(4) }, container2);

      expect(win.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(typeof listeners.resize).toBe('function');

      adapter2.clearBoard();
      expect(win.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(listeners.resize).toBeUndefined();
    });

    it('re-fits the board when the resize listener fires', () => {
      const ctx = createFitDoc({ innerWidth: 1440, innerHeight: 900, cssVars: CSS_VARS });
      const adapter2 = createBoardAdapter({ document: ctx.document });
      const container2 = { firstChild: null, appendChild: vi.fn(), removeChild: vi.fn() };
      adapter2.generateBoard({ rows: 11, cols: 15, grid: new Uint8Array(15 * 11) }, container2);

      const initial = Number.parseFloat(ctx.setProps.get('--fit-scale'));

      // Shrink the viewport and fire the registered resize handler.
      ctx.win.innerWidth = 375;
      ctx.win.innerHeight = 667;
      ctx.listeners.resize();

      const resized = Number.parseFloat(ctx.setProps.get('--fit-scale'));
      expect(resized).toBeLessThan(initial);
      expect(resized).toBeCloseTo((375 - 64) / 480, 4);
    });
  });
});

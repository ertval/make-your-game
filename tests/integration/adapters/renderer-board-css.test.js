/**
 * Unit tests for ARCH-X02 board-css-adapter.
 *
 * Verifies that canonical map dimensions are correctly synchronized
 * with CSS custom properties on the target element.
 */

import { describe, expect, it, vi } from 'vitest';
import { updateBoardCss } from '../../../src/adapters/dom/renderer-board-css.js';

describe('board-css-adapter', () => {
  it('sets CSS variables on the target element', () => {
    const mockElement = {
      style: {
        setProperty: (name, value) => {
          mockElement.style[name] = value;
        },
      },
    };

    const mapResource = {
      rows: 11,
      cols: 15,
    };

    updateBoardCss(mapResource, mockElement);

    expect(mockElement.style['--board-rows']).toBe('11');
    expect(mockElement.style['--board-columns']).toBe('15');
  });

  it('handles missing map resource gracefully', () => {
    const mockElement = {
      style: {
        setProperty: () => {},
      },
    };

    // Should not throw
    updateBoardCss(null, mockElement);
  });

  it('guards against undefined target without throwing', () => {
    const mapResource = { rows: 10, cols: 10 };
    // Should not throw ReferenceError: document is not defined
    expect(() => updateBoardCss(mapResource, null)).not.toThrow();
  });

  it('skips setting --board-rows when rows is non-finite', () => {
    const setProperty = vi.fn();
    const mockElement = { style: { setProperty } };

    updateBoardCss({ rows: NaN, cols: 10 }, mockElement);

    expect(setProperty).not.toHaveBeenCalledWith('--board-rows', expect.anything());
    expect(setProperty).toHaveBeenCalledWith('--board-columns', '10');
  });

  it('skips setting --board-rows when rows is zero or negative', () => {
    const setProperty = vi.fn();
    const mockElement = { style: { setProperty } };

    updateBoardCss({ rows: 0, cols: 8 }, mockElement);
    expect(setProperty).not.toHaveBeenCalledWith('--board-rows', expect.anything());

    updateBoardCss({ rows: -1, cols: 8 }, mockElement);
    expect(setProperty).not.toHaveBeenCalledWith('--board-rows', expect.anything());
  });

  it('skips setting --board-columns when cols is non-finite', () => {
    const setProperty = vi.fn();
    const mockElement = { style: { setProperty } };

    updateBoardCss({ rows: 5, cols: Infinity }, mockElement);

    expect(setProperty).toHaveBeenCalledWith('--board-rows', '5');
    expect(setProperty).not.toHaveBeenCalledWith('--board-columns', expect.anything());
  });

  it('skips setting --board-columns when cols is zero or negative', () => {
    const setProperty = vi.fn();
    const mockElement = { style: { setProperty } };

    updateBoardCss({ rows: 5, cols: 0 }, mockElement);
    expect(setProperty).not.toHaveBeenCalledWith('--board-columns', expect.anything());
  });
});

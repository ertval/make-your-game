/**
 * Unit tests for ARCH-X02 board-css-adapter.
 *
 * Verifies that canonical map dimensions are correctly synchronized
 * with CSS custom properties on the target element.
 */

import { describe, expect, it } from 'vitest';
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
});

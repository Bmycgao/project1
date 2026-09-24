import { describe, expect, it } from 'vitest';

import { placeColumnFilterPopover } from './print-column-filter-place';

const size = { height: 300, width: 300 };

describe('placeColumnFilterPopover', () => {
  it('sits under the arrow when the viewport has room', () => {
    expect(
      placeColumnFilterPopover(
        { left: 120, right: 134, top: 200, bottom: 216 },
        size,
        { width: 1280, height: 800 },
      ),
    ).toEqual({ x: 120, y: 220 });
  });

  it('flips above the arrow only when the panel would overflow the bottom', () => {
    expect(
      placeColumnFilterPopover(
        { left: 120, right: 134, top: 520, bottom: 536 },
        size,
        { width: 1280, height: 800 },
      ),
    ).toEqual({ x: 120, y: 216 });
  });

  it('keeps the panel inside the viewport when neither side fully fits', () => {
    expect(
      placeColumnFilterPopover(
        { left: 200, right: 214, top: 80, bottom: 96 },
        { height: 760, width: 300 },
        { width: 400, height: 200 },
      ),
    ).toEqual({ x: 8, y: 8 });
  });
});

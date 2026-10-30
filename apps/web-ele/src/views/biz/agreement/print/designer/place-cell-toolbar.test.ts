import { describe, expect, it } from 'vitest';

import { placeCellToolbar } from './place-cell-toolbar';

describe('单元格工具条定位', () => {
  const bounds = { left: 100, right: 800, top: 200, bottom: 700 };
  const size = { width: 340, height: 38 };

  it('默认放在选区上方，不遮住选中格', () => {
    expect(
      placeCellToolbar(
        { left: 200, right: 350, top: 400, bottom: 424 },
        bounds,
        size,
      ),
    ).toMatchObject({ left: 200, top: 354 });
  });
  it('选区靠近画布顶部时放到下方', () => {
    expect(
      placeCellToolbar(
        { left: 200, right: 350, top: 210, bottom: 234 },
        bounds,
        size,
      ),
    ).toMatchObject({ top: 242 });
  });
  it('靠近右下角时向左收进画布，展开行高面板仍保持可见', () => {
    const placed = placeCellToolbar(
      { left: 700, right: 800, top: 650, bottom: 674 },
      bounds,
      { width: 340, height: 180 },
    );
    expect(placed.left).toBe(460);
    expect(placed.top + 180).toBeLessThan(650);
    expect(placed.top).toBeGreaterThanOrEqual(bounds.top);
  });
  it('可用画布比工具条窄时限制尺寸，允许工具条内部滚动', () => {
    expect(
      placeCellToolbar(
        { left: 230, right: 260, top: 220, bottom: 244 },
        { left: 200, right: 400, top: 200, bottom: 300 },
        { width: 340, height: 180 },
      ),
    ).toMatchObject({ left: 200, top: 200, maxWidth: 200, maxHeight: 100 });
  });
});

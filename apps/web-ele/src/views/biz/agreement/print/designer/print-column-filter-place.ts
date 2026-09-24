/** 列头筛选浮层：贴着 ▾ 定位，避免估算高度把弹窗翻到页面顶上 */

export type ColumnFilterAnchor = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

/**
 * 把筛选层贴在 ▾ 下方；只有下方真的放不下才翻到箭头上方
 * @param anchor ▾ 的视口矩形
 * @param size 浮层宽高（可先估后按实测再调一次）
 * @param viewport 视口宽高，测试可注入
 */
export function placeColumnFilterPopover(
  anchor: ColumnFilterAnchor,
  size: { height: number; width: number } = { height: 338, width: 300 },
  viewport: { height: number; width: number } = {
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
    width: typeof window === 'undefined' ? 1200 : window.innerWidth,
  },
) {
  const margin = 8;
  const gap = 4;
  const maxX = Math.max(margin, viewport.width - size.width - margin);
  let x = anchor.left;
  if (x + size.width > viewport.width - margin) x = anchor.right - size.width;
  x = Math.min(Math.max(margin, x), maxX);
  const below = anchor.bottom + gap;
  const above = anchor.top - size.height - gap;
  const y =
    below + size.height <= viewport.height - margin
      ? below
      : above >= margin
        ? above
        : Math.max(margin, viewport.height - size.height - margin);
  return { x, y };
}

/** 工具条优先放在选区上方；空间不足时换到下方，始终限制在可见画布内。 */
export function placeCellToolbar(
  anchor: { bottom: number; left: number; right: number; top: number },
  bounds: { bottom: number; left: number; right: number; top: number },
  size: { height: number; width: number },
) {
  const gap = 8;
  const width = Math.min(size.width, Math.max(0, bounds.right - bounds.left));
  const height = Math.min(size.height, Math.max(0, bounds.bottom - bounds.top));
  const above = anchor.top - height - gap;
  const below = anchor.bottom + gap;
  let top;
  if (above >= bounds.top) {
    top = above;
  } else {
    top =
      below + height <= bounds.bottom
        ? below
        : Math.max(bounds.top, Math.min(above, bounds.bottom - height));
  }
  return {
    left: Math.max(bounds.left, Math.min(anchor.left, bounds.right - width)),
    top,
    maxWidth: Math.max(0, bounds.right - bounds.left),
    maxHeight: Math.max(0, bounds.bottom - bounds.top),
  };
}

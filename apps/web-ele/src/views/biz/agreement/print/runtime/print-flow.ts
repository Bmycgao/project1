/** 正文默认在本页顺排；分组只管理共有设置，固定位置单独配置。 */
type PrintEl = {
  options?: Record<string, any>;
  printElementType?: { type?: string };
  type?: string;
};
type FlowFloatMode = 'left' | 'none' | 'right';
type Cut = { end: number; start: number };

export function getFlowGroupName(el: PrintEl): string {
  return String(el.options?.agreeFlowGroup || '').trim();
}

/** 兼容未配置排版方式的模板：正文自动补位，码图和装饰默认固定。 */
export function isAutoFlowElement(el: PrintEl): boolean {
  const options = el.options || {};
  if (options.agreeFlowMode === 'fixed') return false;
  if (options.agreeFlowMode === 'auto') return true;
  if (options.fixed || ['barcode', 'qrcode'].includes(options.textType))
    return false;
  return ['dynamicText', 'longText', 'staticTitle', 'table', 'text'].includes(
    el.type || el.printElementType?.type || 'text',
  );
}

/** 组内设置以首个明确配置为准；面板修改时同步到本页全部成员。 */
export function getFlowGroupSettings(elements: PrintEl[]) {
  const float = elements.find((el) =>
    ['left', 'none', 'right'].includes(el.options?.agreeFlowFloat),
  )?.options?.agreeFlowFloat as FlowFloatMode | undefined;
  return {
    collapse:
      elements.find((el) => typeof el.options?.agreeFlowCollapse === 'boolean')
        ?.options?.agreeFlowCollapse !== false,
    float: float || 'left',
    stretch:
      elements.find((el) => typeof el.options?.agreeFlowStretch === 'boolean')
        ?.options?.agreeFlowStretch === true,
  };
}

function top(el: PrintEl) {
  return Number(el.options?.top) || 0;
}
function height(el: PrintEl) {
  return Math.max(0, Number(el.options?.height) || 0);
}
function left(el: PrintEl) {
  return Number(el.options?.left) || 0;
}
function width(el: PrintEl) {
  return Math.max(0, Number(el.options?.width) || 0);
}

export interface PrintFlowGroupSnap {
  name: string;
  /** 仅保留元素身份；全部坐标在应用回流前统一拍快照。 */
  origRows: PrintEl[][];
}

export function snapshotFlowGroups(elements: PrintEl[]): PrintFlowGroupSnap[] {
  const buckets = new Map<string, PrintEl[]>();
  for (const el of elements) {
    if (!isAutoFlowElement(el)) continue;
    const name = getFlowGroupName(el);
    if (!name) continue;
    const members = buckets.get(name) || [];
    members.push(el);
    buckets.set(name, members);
  }
  return [...buckets].map(([name, members]) => {
    const rows: PrintEl[][] = [];
    for (const el of members.toSorted(
      (a, b) => top(a) - top(b) || left(a) - left(b),
    )) {
      const row = rows.at(-1);
      if (row?.[0] && Math.abs(top(el) - top(row[0])) <= 8) row.push(el);
      else rows.push([el]);
    }
    return { name, origRows: rows };
  });
}

/** 同行补位保持元素宽度；只有明确打开拉宽开关时才改变宽度。 */
function compactRow(
  row: PrintEl[],
  live: Set<PrintEl>,
  settings: ReturnType<typeof getFlowGroupSettings>,
) {
  const visible = row.filter((el) => live.has(el));
  if (
    !settings.collapse ||
    settings.float === 'none' ||
    !visible.length ||
    visible.length === row.length
  )
    return;
  const start = Math.min(...row.map(left));
  const end = Math.max(...row.map((el) => left(el) + width(el)));
  // 已重叠的通栏和半格不是一行可横排的字段，保持其设计布局。
  const sorted = row.toSorted((a, b) => left(a) - left(b));
  if (
    sorted.some(
      (el, index) =>
        index > 0 &&
        left(el) < left(sorted[index - 1]!) + width(sorted[index - 1]!),
    )
  )
    return;
  const gaps = sorted
    .slice(1)
    .map((el, index) => left(el) - left(sorted[index]!) - width(sorted[index]!))
    .sort((a, b) => a - b);
  const gap = gaps[Math.floor(gaps.length / 2)] || 0;
  const total =
    visible.reduce((sum, el) => sum + width(el), 0) +
    gap * (visible.length - 1);
  let cursor = settings.float === 'right' ? end - total : start;
  for (const el of visible) {
    if (!el.options) continue;
    el.options.left = cursor;
    cursor += width(el) + gap;
  }
  if (settings.stretch && visible.length === 1 && visible[0]?.options) {
    visible[0].options.left = start;
    visible[0].options.width = end - start;
  }
}

/** 重叠的隐藏区间只扣除一次，避免不同组的位移叠加成负坐标。 */
function mergeCuts(cuts: Cut[]) {
  const merged: Cut[] = [];
  for (const cut of cuts.toSorted((a, b) => a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous && cut.start <= previous.end)
      previous.end = Math.max(previous.end, cut.end);
    else merged.push({ ...cut });
  }
  return merged;
}

export function compactPanelFlow(
  panel: Record<string, any>,
  snaps: PrintFlowGroupSnap[],
  originalElements: PrintEl[] = panel.printElements || [],
) {
  const remaining = (panel.printElements || []) as PrintEl[];
  const live = new Set(remaining);
  const all = [
    ...new Set([
      ...originalElements,
      ...remaining,
      ...snaps.flatMap((snap) => snap.origRows.flat()),
    ]),
  ];
  const positions = new Map(
    all.map((el) => [el, { start: top(el), end: top(el) + height(el) }]),
  );
  const reserved = new Set(all.filter((el) => !isAutoFlowElement(el)));
  const settingsByElement = new Map(
    all.map((el) => [el, getFlowGroupSettings([el])]),
  );
  for (const snap of snaps) {
    const settings = getFlowGroupSettings(snap.origRows.flat());
    snap.origRows.flat().forEach((el) => settingsByElement.set(el, settings));
    if (!settings.collapse) {
      snap.origRows.flat().forEach((el) => reserved.add(el));
    }
  }
  for (const el of all) {
    if (!settingsByElement.get(el)!.collapse) reserved.add(el);
  }
  // 纵向顺序来自整页正文，不由组名决定。删除一行时一起移除它后面的行间距。
  const bodyRows: PrintEl[][] = [];
  for (const el of all
    .filter(isAutoFlowElement)
    .toSorted((a, b) => top(a) - top(b))) {
    const row = bodyRows.at(-1);
    if (row?.[0] && Math.abs(top(el) - top(row[0])) <= 8) row.push(el);
    else bodyRows.push([el]);
  }
  const cuts: Cut[] = [];
  bodyRows.forEach((row, index) => {
    if (row.some((el) => live.has(el) || reserved.has(el))) return;
    const nextRow = bodyRows[index + 1];
    const start = Math.max(
      0,
      Math.min(...row.map((el) => positions.get(el)!.start)),
    );
    const end = nextRow
      ? Math.min(...nextRow.map((el) => positions.get(el)!.start))
      : Math.max(...row.map((el) => positions.get(el)!.end));
    const occupiedEnd = Math.max(
      end,
      ...row.map((el) => positions.get(el)!.end),
    );
    // 不删除仍被其他内容或“保留空位”的元素占用的空间。
    const occupied = all.some((el) => {
      if (!live.has(el) && !reserved.has(el)) return false;
      const box = positions.get(el)!;
      return box.start < occupiedEnd && box.end > start;
    });
    if (end > start && !occupied) cuts.push({ start, end });
  });
  const merged = mergeCuts(cuts);
  for (const el of remaining) {
    if (!el.options || !isAutoFlowElement(el)) continue;
    const originalTop = positions.get(el)!.start;
    // 固定内容构成排版边界，不让后面的组穿过固定元素向上补位。
    const barrier = Math.max(
      0,
      ...[...reserved]
        .filter((item) => !isAutoFlowElement(item))
        .map((item) => positions.get(item)!.end)
        .filter((end) => end <= originalTop),
    );
    const removed = merged.reduce(
      (sum, cut) =>
        sum +
        (cut.end <= originalTop && cut.start >= barrier
          ? cut.end - cut.start
          : 0),
      0,
    );
    el.options.top = originalTop - removed;
  }
  for (const snap of snaps) {
    const settings = getFlowGroupSettings(snap.origRows.flat());
    for (const row of snap.origRows) compactRow(row, live, settings);
  }
}

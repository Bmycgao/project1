/**
 * 打印流式分组：隐藏后按「设计行」回流，并把组下方整体上移
 * - 同一行少一个半格：剩下的按向左/向右策略收拢；只剩一个时可拉成通栏
 * - 通栏字段（协议名称）永远自己一行，不钻进半格
 * - 整行都被藏掉才塌缩；业务块（标题+表）同组才能消灭大洞
 * hiprint 是绝对定位，必须在 preparePrintTemplate 里改 top
 */

const DEFAULT_FLOW_GAP = 6;
const OVERLAP_GUTTER = 8;
/** 原 top 差在此范围内视为同一行（协议编号 / 签约日期） */
const FLOW_ROW_BAND = 8;
/** 宽度占该行总跨度 70% 以上视为通栏，禁止钻半格 */
const SPAN_RATIO = 0.7;

/** 旧模板没打标时，按字段补进 header 组 */
const DEFAULT_HEADER_FIELDS = new Set([
  'acquirer',
  'agreementName',
  'agreementNo',
  'compensatee',
  'signDate',
]);

/** 业务段：小标题 + 表共用组名，整段隐藏后下方上移 */
const DEFAULT_SECTION_FLOWS: {
  field: string;
  group: string;
  titleRe: RegExp;
}[] = [
  { field: 'houses', titleRe: /房屋明细/, group: 'houses' },
  { field: 'compensationItems', titleRe: /补偿安置/, group: 'compensation' },
  { field: 'rewardItems', titleRe: /奖励补贴/, group: 'rewards' },
];

/** 过滤前拍下的一组流式元素（含随后被隐藏的） */
export interface PrintFlowGroupSnap {
  /** agreeFlowGroup 名，如 header / houses */
  name: string;
  origTop: number;
  origBottom: number;
  gap: number;
  /** 过滤前的设计行（元素引用，过滤后仍可判断谁还在） */
  origRows: PrintEl[][];
}

type PrintEl = {
  options?: Record<string, any>;
};

type FlowFloatMode = 'left' | 'none' | 'right';

/**
 * 读流式组名，空则不参与压缩
 * @param el 纸面元素
 */
export function getFlowGroupName(el: PrintEl): string {
  return String(el?.options?.agreeFlowGroup || '').trim();
}

function elTop(el: PrintEl) {
  return Number(el?.options?.top) || 0;
}

function elHeight(el: PrintEl) {
  return Number(el?.options?.height) || 0;
}

function elLeft(el: PrintEl) {
  return Number(el?.options?.left) || 0;
}

function elWidth(el: PrintEl) {
  return Number(el?.options?.width) || 0;
}

function elBottom(el: PrintEl) {
  return elTop(el) + elHeight(el);
}

/**
 * 同行隐藏后的横向收拢方式。
 * - left（默认）：从原行左边开始依次补齐空位
 * - right：从原行右边开始依次补齐空位
 * - none：只做纵向回流，不改同行的横坐标
 *
 * 这个选项放在组内任一元素上即可，读取原始快照时会优先使用已配置值，
 * 因此用户不需要逐个元素重复设置。
 */
function getFlowFloatMode(elements: PrintEl[]): FlowFloatMode {
  for (const el of elements) {
    const mode = String(el?.options?.agreeFlowFloat || '').trim();
    if (mode === 'left' || mode === 'right' || mode === 'none') return mode;
  }
  return 'left';
}

/**
 * 该行设计上的左右跨度
 * @param row 同一设计行的元素
 */
function rowSpanBox(row: PrintEl[]) {
  const left = Math.min(...row.map((el) => elLeft(el)));
  const right = Math.max(...row.map((el) => elLeft(el) + elWidth(el)));
  return { left, right, width: Math.max(0, right - left) };
}

/** 计算原设计行中相邻元素的典型横向间距。 */
function inferRowGap(row: PrintEl[]) {
  const sorted = [...row].toSorted((a, b) => elLeft(a) - elLeft(b));
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (!previous || !current) continue;
    const gap = elLeft(current) - (elLeft(previous) + elWidth(previous));
    if (gap >= 0 && gap < 120) gaps.push(gap);
  }
  if (gaps.length === 0) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] || 0;
}

/**
 * 是否通栏（协议名称那种），不能拿去填半格
 * @param el 元素
 * @param rowWidth 该行总跨度
 */
function isSpanEl(el: PrintEl, rowWidth: number) {
  const w = elWidth(el);
  if (w >= 400) return true;
  return rowWidth > 0 && w >= rowWidth * SPAN_RATIO;
}

/**
 * 用组内相邻「行」的间距推断紧贴间距（同一行的左右格不算行距）
 * @param members 同组元素（过滤前）
 */
function inferFlowGap(members: PrintEl[]): number {
  const rows = clusterFlowRows(members);
  const gaps: number[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (!prev?.length || !cur?.length) continue;
    const prevBottom = Math.max(...prev.map((el) => elBottom(el)));
    const curTop = Math.min(...cur.map((el) => elTop(el)));
    const gap = curTop - prevBottom;
    if (gap >= 0 && gap < 40) gaps.push(gap);
  }
  if (gaps.length === 0) return DEFAULT_FLOW_GAP;
  gaps.sort((a, b) => a - b);
  const mid = gaps[Math.floor(gaps.length / 2)];
  return typeof mid === 'number' ? mid : DEFAULT_FLOW_GAP;
}

/**
 * 按原 top 把同组元素收成行（左右配对）
 * @param members 同组元素
 */
function clusterFlowRows(members: PrintEl[]): PrintEl[][] {
  const sorted = [...members]
    .filter((el) => el?.options)
    .toSorted((a, b) => elTop(a) - elTop(b) || elLeft(a) - elLeft(b));
  const rows: PrintEl[][] = [];
  for (const el of sorted) {
    const last = rows[rows.length - 1];
    const bandTop = last?.[0] ? elTop(last[0]) : null;
    if (
      last &&
      bandTop !== null &&
      Math.abs(elTop(el) - bandTop) <= FLOW_ROW_BAND
    ) {
      last.push(el);
    } else {
      rows.push([el]);
    }
  }
  return rows;
}

/**
 * 给旧模板补默认流式组：页眉键值 + 房屋/补偿/奖励（标题和表同组）
 * @param elements printElements
 */
export function ensureDefaultFlowGroups(elements: PrintEl[]) {
  for (const el of elements) {
    const field = String(el?.options?.field || '');
    if (!DEFAULT_HEADER_FIELDS.has(field) || !el.options) continue;
    if (!getFlowGroupName(el)) el.options.agreeFlowGroup = 'header';
  }
  for (const spec of DEFAULT_SECTION_FLOWS) {
    const table = elements.find(
      (el) => String(el?.options?.field || '') === spec.field,
    );
    if (!table?.options) continue;
    if (!getFlowGroupName(table)) table.options.agreeFlowGroup = spec.group;
    const groupName = getFlowGroupName(table) || spec.group;
    for (const el of elements) {
      if (!el.options) continue;
      const title = String(el.options.title || '');
      const field = String(el.options.field || '');
      if (field || !spec.titleRe.test(title)) continue;
      if (!getFlowGroupName(el)) el.options.agreeFlowGroup = groupName;
    }
  }
}

/**
 * 兼容旧名：整页补默认流式组
 * @param elements printElements
 */
export function ensureDefaultHeaderFlow(elements: PrintEl[]) {
  ensureDefaultFlowGroups(elements);
}

/**
 * 过滤显隐之前拍照，才能知道被藏掉的格子占了多高
 * @param elements 尚未过滤的 printElements
 */
export function snapshotFlowGroups(elements: PrintEl[]): PrintFlowGroupSnap[] {
  const buckets = new Map<string, PrintEl[]>();
  for (const el of elements) {
    const name = getFlowGroupName(el);
    if (!name) continue;
    const list = buckets.get(name) || [];
    list.push(el);
    buckets.set(name, list);
  }
  const snaps: PrintFlowGroupSnap[] = [];
  for (const [name, members] of buckets) {
    if (members.length === 0) continue;
    const tops = members.map((el) => elTop(el));
    const bottoms = members.map((el) => elBottom(el));
    snaps.push({
      name,
      origTop: Math.min(...tops),
      origBottom: Math.max(...bottoms),
      gap: inferFlowGap(members),
      origRows: clusterFlowRows(members),
    });
  }
  snaps.sort((a, b) => a.origTop - b.origTop);
  return snaps;
}

/**
 * 同一行只剩一个半格搭档时拉成通栏；通栏字段不参与互撑
 * @param visible 该行还在的元素
 * @param origRow 过滤前该行全部元素
 */
function stretchLonePeer(
  visible: PrintEl[],
  origRow: PrintEl[],
  mode: FlowFloatMode = 'left',
) {
  if (visible.length !== 1 || origRow.length < 2) return;
  const el = visible[0];
  if (!el?.options) return;
  const box = rowSpanBox(origRow);
  if (box.width < 40) return;
  if (origRow.some((item) => isSpanEl(item, box.width))) return;
  if (isSpanEl(el, box.width)) return;
  if (mode === 'none') return;
  if (mode === 'right') {
    el.options.left = box.right - elWidth(el);
    return;
  }
  el.options.left = box.left;
  el.options.width = box.width;
}

/**
 * 同一设计行少了一个或多个字段时，把剩余字段横向收拢，避免截图中出现中间留白。
 * 只处理普通半格元素；通栏标题等 span 元素仍保持原位置，避免撞列。
 */
function compactRowHorizontally(
  visible: PrintEl[],
  origRow: PrintEl[],
  mode: FlowFloatMode,
) {
  if (mode === 'none' || visible.length >= origRow.length) return;
  const box = rowSpanBox(origRow);
  if (
    box.width < 40 ||
    origRow.some((item) => isSpanEl(item, box.width)) ||
    visible.some((item) => isSpanEl(item, box.width))
  ) {
    return;
  }
  if (visible.length === 1) {
    stretchLonePeer(visible, origRow, mode);
    return;
  }

  const gap = inferRowGap(origRow);
  const totalWidth = visible.reduce((sum, el) => sum + elWidth(el), 0);
  const totalGap = gap * Math.max(0, visible.length - 1);
  let cursor = mode === 'right' ? box.right - totalWidth - totalGap : box.left;
  for (const el of visible) {
    if (!el.options) continue;
    el.options.left = cursor;
    cursor += elWidth(el) + gap;
  }
}

/**
 * 按过滤前的设计行紧贴：空行塌掉，半格搭档拉通栏
 * @param origRows 过滤前的行
 * @param remaining 过滤后仍在纸上的同组元素
 * @param startTop 组顶（已计入上方组的上移）
 * @param gap 行距
 */
function packOrigRows(
  origRows: PrintEl[][],
  remaining: PrintEl[],
  startTop: number,
  gap: number,
  floatMode: FlowFloatMode,
) {
  const live = new Set(remaining);
  let cursor = startTop;
  for (const origRow of origRows) {
    const visible = origRow.filter((el) => live.has(el));
    if (visible.length === 0) continue;
    compactRowHorizontally(visible, origRow, floatMode);
    const rowH = Math.max(...visible.map((el) => elHeight(el)));
    for (const el of visible) {
      if (!el.options) continue;
      el.options.top = cursor;
    }
    cursor += rowH + gap;
  }
}

function rectsOverlap(a: PrintEl, b: PrintEl) {
  const al = elLeft(a);
  const ar = al + elWidth(a);
  const at = elTop(a);
  const ab = elBottom(a);
  const bl = elLeft(b);
  const br = bl + elWidth(b);
  const bt = elTop(b);
  const bb = elBottom(b);
  return al < br && ar > bl && at < bb && ab > bt;
}

/**
 * 上移后若仍有矩形重叠（通栏撞半格），把较左的宽度收窄
 * @param members 同组剩余元素
 */
function resolveFlowOverlaps(members: PrintEl[]) {
  for (let i = 0; i < members.length; i += 1) {
    const a = members[i];
    if (!a?.options) continue;
    for (let j = i + 1; j < members.length; j += 1) {
      const b = members[j];
      if (!b?.options || !rectsOverlap(a, b)) continue;
      const leftEl = elLeft(a) <= elLeft(b) ? a : b;
      const rightEl = leftEl === a ? b : a;
      const maxW = elLeft(rightEl) - elLeft(leftEl) - OVERLAP_GUTTER;
      if (maxW > 40 && elWidth(leftEl) > maxW && leftEl.options) {
        leftEl.options.width = maxW;
      }
    }
  }
}

/**
 * 压缩一个 panel 上的全部流式组，并上移组下方元素
 * @param panel hiprint panel（printElements 已按显隐过滤）
 * @param snaps 过滤前的组快照
 */
export function compactPanelFlow(
  panel: Record<string, any>,
  snaps: PrintFlowGroupSnap[],
) {
  if (snaps.length === 0) return;
  const remaining = (panel.printElements || []) as PrintEl[];
  let yShift = 0;

  for (const snap of snaps) {
    const members = remaining.filter(
      (el) => getFlowGroupName(el) === snap.name,
    );
    const originalMembers = snap.origRows.flat();
    const allMembersVisible = members.length === originalMembers.length;
    const hasManualLargeGap = snap.origRows.some((row, rowIndex) => {
      if (rowIndex === 0) return false;
      const previous = snap.origRows[rowIndex - 1];
      if (!previous?.length || !row?.length) return false;
      const previousBottom = Math.max(...previous.map((el) => elBottom(el)));
      const currentTop = Math.min(...row.map((el) => elTop(el)));
      return currentTop - previousBottom > 40;
    });

    /**
     * 设计器允许用户手动拉开同组标题与表格的距离。所有成员都可见时，
     * 这里不能把较大的间距当成“空洞”重新压紧，否则拖动表格会在下一帧
     * 被 preparePrintTemplate 拉回标题下方。只有组内发生显隐变化时，才
     * 使用原设计行重新排版；如果只是受前面隐藏组影响，则整体平移并保留
     * 组内相对位置。
     */
    if (allMembersVisible && hasManualLargeGap) {
      if (Math.abs(yShift) >= 0.5) {
        members.forEach((el) => {
          if (el.options) el.options.top = elTop(el) + yShift;
        });
      }
      continue;
    }
    const startTop = snap.origTop + yShift;
    const floatMode = getFlowFloatMode(snap.origRows.flat());
    packOrigRows(snap.origRows, members, startTop, snap.gap, floatMode);
    resolveFlowOverlaps(members);

    const newBottom =
      members.length > 0
        ? Math.max(...members.map((el) => elBottom(el)))
        : startTop;
    const origBottomShifted = snap.origBottom + yShift;
    const delta = Math.max(0, origBottomShifted - newBottom);
    if (delta < 0.5) continue;

    for (const el of remaining) {
      if (getFlowGroupName(el) === snap.name || !el.options) continue;
      const top = Number(el.options.top) || 0;
      if (top >= origBottomShifted - 0.5) {
        el.options.top = top - delta;
      }
    }
    yShift -= delta;
  }
}

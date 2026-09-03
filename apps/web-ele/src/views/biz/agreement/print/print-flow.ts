/**
 * 打印流式分组：隐藏后按「设计行」回流，并把组下方整体上移
 * - 同一行少一个半格：剩下的拉成通栏（被征收人 / 征收人互为搭档）
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
 * 该行设计上的左右跨度
 * @param row 同一设计行的元素
 */
function rowSpanBox(row: PrintEl[]) {
  const left = Math.min(...row.map((el) => elLeft(el)));
  const right = Math.max(...row.map((el) => elLeft(el) + elWidth(el)));
  return { left, right, width: Math.max(0, right - left) };
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
function stretchLonePeer(visible: PrintEl[], origRow: PrintEl[]) {
  if (visible.length !== 1 || origRow.length < 2) return;
  const el = visible[0];
  if (!el?.options) return;
  const box = rowSpanBox(origRow);
  if (box.width < 40) return;
  if (origRow.some((item) => isSpanEl(item, box.width))) return;
  if (isSpanEl(el, box.width)) return;
  el.options.left = box.left;
  el.options.width = box.width;
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
) {
  const live = new Set(remaining);
  let cursor = startTop;
  for (const origRow of origRows) {
    const visible = origRow.filter((el) => live.has(el));
    if (visible.length === 0) continue;
    stretchLonePeer(visible, origRow);
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
    const startTop = snap.origTop + yShift;
    packOrigRows(snap.origRows, members, startTop, snap.gap);
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

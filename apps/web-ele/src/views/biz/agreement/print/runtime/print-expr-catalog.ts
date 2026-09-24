/**
 * 打印表达式帮助目录：各入口共用完整函数分组，仅「可用值」按场景切换。
 */
import {
  AGREE_PRINT_DERIVED_FIELDS,
  AGREE_PRINT_TABLE_FIELDS,
  AGREE_PRINT_TEXT_FIELDS,
} from '../data/fields';

/** 设计器里需要手写表达式的入口 */
export type PrintExprHelpScene =
  | 'cell'
  | 'color'
  | 'column'
  | 'filter'
  | 'visible';

/** 可点插入的字段芯片 */
export interface PrintExprHelpField {
  group: string;
  label: string;
  value: string;
}

/** 运算符 / 函数芯片 */
export interface PrintExprHelpChip {
  insert: string;
  label: string;
}

/** 输入框宿主（Element Plus Input 实例或原生框） */
export type PrintExprInputHost = {
  input?: HTMLInputElement;
  textarea?: HTMLTextAreaElement;
} | null;

const SKIP_PROTOCOL_FIELDS = new Set([
  'amountCn',
  'barcodeContent',
  'printMeta',
  'qrcodeContent',
]);

/** 第一层摘要：能做什么、结果必须是什么 */
export const PRINT_EXPR_SCENE_META: Record<
  PrintExprHelpScene,
  { note: string; result: string; summary: string }
> = {
  cell: {
    note: '只改当前这一格，会盖掉该列逐行公式。直接写字段名，不要写 row.字段。',
    result: '结果是这一格要显示的值',
    summary: '可用：本行字段 · 四则与 IF · 空值兜底',
  },
  color: {
    note: 'value 是本列算完后的值；其它字段名引用当前行。直接写字段名，不要写 row.字段。',
    result: '写出真/假：真则改文字颜色',
    summary: '可用：本行字段 · value(本列结果) · 比较',
  },
  column: {
    note: '每一行都会算一遍；整列求和请走「合计」。直接写字段名，不要写 row.字段。',
    result: '结果是这一列每一行要显示的值',
    summary: '可用：本行字段 · 四则与 IF · ROUND/空值',
  },
  filter: {
    note: '直接写列名，不要写 row.字段。不支持赋值、脚本和数组下标。',
    result: '写出真/假：真则打印该行',
    summary: '可用：本行列字段 · 比较与且或 · EMPTY/IN',
  },
  visible: {
    note: '整块显隐用协议字段和整表统计；表内筛行请用「筛行」。不要写 row.字段。',
    result: '写出真/假：真才显示整块',
    summary: '可用：协议字段 · 合计与整表 · 比较',
  },
};

/** 比较与逻辑（各入口完整列出，点插入） */
export const PRINT_EXPR_OPERATOR_CHIPS: PrintExprHelpChip[] = [
  { insert: ' > ', label: '>' },
  { insert: ' >= ', label: '>=' },
  { insert: ' < ', label: '<' },
  { insert: ' <= ', label: '<=' },
  { insert: ' == ', label: '==' },
  { insert: ' != ', label: '!=' },
  { insert: ' && ', label: '且 &&' },
  { insert: ' || ', label: '或 ||' },
  { insert: '!', label: '非 !' },
];

/** 完整函数分组，标签给人看，insert 写进输入框 */
const PRINT_EXPR_CONDITION_GROUPS: {
  items: PrintExprHelpChip[];
  title: string;
}[] = [
  {
    title: '条件',
    items: [
      { insert: 'IF(, , )', label: 'IF(条件, 真, 假)' },
      { insert: ' ?  : ', label: '三元 条件 ? 真 : 假' },
      { insert: 'IFS(, , )', label: 'IFS(条件, 结果, …)' },
      { insert: 'AND()', label: 'AND(...)' },
      { insert: 'OR()', label: 'OR(...)' },
      { insert: 'NOT()', label: 'NOT(...)' },
      { insert: 'IN(, )', label: 'IN(值, a, b)' },
      { insert: 'NOT_IN(, )', label: 'NOT_IN(...)' },
    ],
  },
  {
    title: '空值与包含',
    items: [
      { insert: 'EMPTY()', label: 'EMPTY(字段)' },
      { insert: 'CONTAINS(, )', label: 'CONTAINS(文本, 片段)' },
      { insert: 'COALESCE()', label: 'COALESCE(...)' },
    ],
  },
];

/** 判断 Tab：比较符 + 条件函数 */
export const PRINT_EXPR_JUDGE_GROUPS = PRINT_EXPR_CONDITION_GROUPS;

/** 函数 Tab：数字 / 文本 / 表统计 */
export const PRINT_EXPR_CALC_GROUPS: {
  items: PrintExprHelpChip[];
  title: string;
}[] = [
  {
    title: '数字',
    items: [
      { insert: 'ROUND(, 2)', label: 'ROUND(值, 小数位)' },
      { insert: 'ABS()', label: 'ABS(...)' },
      { insert: 'CEIL()', label: 'CEIL(...)' },
      { insert: 'FLOOR()', label: 'FLOOR(...)' },
      { insert: 'MIN()', label: 'MIN(...)' },
      { insert: 'MAX()', label: 'MAX(...)' },
      { insert: 'POW(, )', label: 'POW(底, 指数)' },
      { insert: 'SQRT()', label: 'SQRT(...)' },
      { insert: 'MOD(, )', label: 'MOD(值, 除数)' },
      { insert: 'CLAMP(, , )', label: 'CLAMP(值, 最小, 最大)' },
      { insert: 'NUMBER(, 0)', label: 'NUMBER(值, 兜底)' },
    ],
  },
  {
    title: '文本与格式',
    items: [
      { insert: 'CONCAT()', label: 'CONCAT(...)' },
      { insert: 'LEN()', label: 'LEN(...)' },
      { insert: 'UPPER()', label: 'UPPER(...)' },
      { insert: 'LOWER()', label: 'LOWER(...)' },
      { insert: 'FORMAT_MONEY(, 2)', label: 'FORMAT_MONEY(金额, 小数位)' },
      { insert: 'FORMAT_DATE(, "date")', label: 'FORMAT_DATE(日期, 格式)' },
    ],
  },
  {
    title: '表统计',
    items: [
      { insert: 'COUNT()', label: 'COUNT(表)' },
      { insert: 'SUM(, "")', label: 'SUM(表, "字段")' },
      { insert: 'AVG(, "")', label: 'AVG(表, "字段")' },
      { insert: 'MAX_COL(, "")', label: 'MAX_COL(表, "字段")' },
      { insert: 'MIN_COL(, "")', label: 'MIN_COL(表, "字段")' },
    ],
  },
];

/** 完整清单（测试 / 其它入口复用） */
export const PRINT_EXPR_FUNCTION_GROUPS = [
  ...PRINT_EXPR_JUDGE_GROUPS,
  ...PRINT_EXPR_CALC_GROUPS,
];

/** 各场景默认展示的字段分组，其余进「更多值」 */
const PRIMARY_FIELD_GROUPS: Record<PrintExprHelpScene, string[]> = {
  cell: ['本行列'],
  color: ['本列', '本行列'],
  column: ['本行列'],
  filter: ['本行列'],
  visible: ['协议字段'],
};

/**
 * 把字段拆成默认可见 / 更多值，避免一展开铺满弹窗
 * @param scene 当前入口
 * @param fields 该入口全部可插入字段
 */
export function splitPrintExprHelpFields(
  scene: PrintExprHelpScene,
  fields: PrintExprHelpField[],
) {
  const primaryNames = new Set(PRIMARY_FIELD_GROUPS[scene]);
  const primary: PrintExprHelpField[] = [];
  const extra: PrintExprHelpField[] = [];
  for (const field of fields) {
    (primaryNames.has(field.group) ? primary : extra).push(field);
  }
  if (primary.length === 0) return { extra: [], primary: extra };
  return { extra, primary };
}

/**
 * 按 group 聚合成芯片分组
 * @param fields 字段列表
 */
export function groupPrintExprHelpFields(fields: PrintExprHelpField[]) {
  const map = new Map<string, PrintExprHelpField[]>();
  for (const field of fields) {
    const list = map.get(field.group) || [];
    list.push(field);
    map.set(field.group, list);
  }
  return [...map.entries()].map(([title, items]) => ({ items, title }));
}

/**
 * 插入后光标应停在括号内或三元问号后，方便接着填字段
 * @param token 将写入的片段
 */
export function printExprInsertCursor(token: string) {
  const q = token.indexOf('?');
  const colon = token.lastIndexOf(':');
  if (q >= 0 && colon > q) return q + 1;
  const open = token.lastIndexOf('(');
  if (open < 0 || !token.endsWith(')')) return token.length;
  return open + 1;
}

/**
 * 把片段拼进当前表达式
 * @param current 现有文本
 * @param token 插入片段
 * @param start 选区起点
 * @param end 选区终点
 */
export function splicePrintExprToken(
  current: string,
  token: string,
  start = current.length,
  end = start,
) {
  const from = Math.max(0, Math.min(start, current.length));
  const to = Math.max(from, Math.min(end, current.length));
  return {
    cursor: from + printExprInsertCursor(token),
    next: `${current.slice(0, from)}${token}${current.slice(to)}`,
  };
}

/**
 * 取出 Element Plus 输入框里的原生节点
 * @param host ElInput 实例
 */
export function printExprInputEl(host: PrintExprInputHost) {
  return host?.textarea || host?.input || null;
}

/**
 * 按当前光标插入，并在微任务里回焦
 * @param current 现有表达式
 * @param token 插入片段
 * @param el 原生 input/textarea，缺省则追加到末尾
 */
export function applyPrintExprInsert(
  current: string,
  token: string,
  el?: HTMLInputElement | HTMLTextAreaElement | null,
) {
  const focused = !!el && document.activeElement === el;
  const start = focused
    ? (el.selectionStart ?? current.length)
    : current.length;
  const end = focused ? (el.selectionEnd ?? start) : current.length;
  const spliced = splicePrintExprToken(current, token, start, end);
  if (el) {
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(spliced.cursor, spliced.cursor);
    });
  }
  return spliced.next;
}

/**
 * 协议级字段（整块显隐、以及行场景里的合计/整表）
 */
export function protocolPrintExprFields(): PrintExprHelpField[] {
  return [
    ...AGREE_PRINT_TEXT_FIELDS.filter(
      (item) => !SKIP_PROTOCOL_FIELDS.has(item.field),
    ).map((item) => ({
      group: '协议字段',
      label: item.text,
      value: item.field,
    })),
    ...AGREE_PRINT_DERIVED_FIELDS.map((item) => ({
      group: '合计与派生',
      label: item.text,
      value: item.field,
    })),
    ...AGREE_PRINT_TABLE_FIELDS.map((item) => ({
      group: '整表',
      label: item.text,
      value: item.field,
    })),
  ];
}

/**
 * 行上下文字段：本行列 + 合计/整表 + 行号
 * @param columns 当前表叶子列
 */
export function rowPrintExprFields(
  columns: Array<{ field?: string; title?: string }>,
): PrintExprHelpField[] {
  const rowFields = columns
    .filter((col) => String(col.field || '').trim())
    .map((col) => ({
      group: '本行列',
      label: String(col.title || col.field),
      value: String(col.field),
    }));
  return [
    ...rowFields,
    ...protocolPrintExprFields().filter((item) => item.group !== '协议字段'),
    { group: '行位置', label: '行号 i', value: 'i' },
    { group: '行位置', label: '行号 index', value: 'index' },
  ];
}

/**
 * 颜色条件额外提供 value（本列计算后的值）
 * @param columns 当前表叶子列
 */
export function colorPrintExprFields(
  columns: Array<{ field?: string; title?: string }>,
): PrintExprHelpField[] {
  return [
    { group: '本列', label: '本列计算结果', value: 'value' },
    ...rowPrintExprFields(columns),
  ];
}

/**
 * 筛行：本行列优先，也允许协议合计（例如 rewardTotal > 0）
 * @param columns 可筛选列
 */
export function filterPrintExprFields(
  columns: Array<{ field?: string; title?: string }>,
): PrintExprHelpField[] {
  const row = rowPrintExprFields(columns);
  const protocol = protocolPrintExprFields().filter(
    (item) => item.group === '协议字段',
  );
  const rest = row.filter((item) => item.group !== '本行列');
  return [
    ...row.filter((item) => item.group === '本行列'),
    ...protocol,
    ...rest,
  ];
}

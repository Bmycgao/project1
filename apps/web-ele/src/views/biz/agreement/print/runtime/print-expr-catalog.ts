/**
 * 打印表达式帮助目录：各入口共用完整函数分组，仅「可用值」按场景切换。
 */
import {
  AGREE_PRINT_DERIVED_FIELDS,
  AGREE_PRINT_TABLE_FIELDS,
  AGREE_PRINT_TEXT_FIELDS,
} from '../data/fields';
import {
  PRINT_EXPR_FUNCTIONS,
  printExprFunctionTemplate,
} from './print-expr-functions';

/** 设计器里需要手写表达式的入口 */
export type PrintExprHelpScene =
  | 'cell'
  | 'color'
  | 'column'
  | 'filter'
  | 'text'
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
export type PrintExprInputHost = null | {
  input?: HTMLInputElement;
  textarea?: HTMLTextAreaElement;
};

const SKIP_PROTOCOL_FIELDS = new Set([
  'barcodeContent',
  'printMeta',
  'qrcodeContent',
]);

/** 第一层摘要：能做什么、结果必须是什么 */
export const PRINT_EXPR_SCENE_META: Record<
  PrintExprHelpScene,
  { note: string; result: string; summary: string }
> = {
  text: {
    note: '表达式返回文字或数字，插入正文时自动包上 {{…}}。内容块的显示条件单独设置。',
    result: '结果是插入正文的值',
    summary: '可用：协议字段 · 条件取值 · 格式与统计',
  },
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
  { insert: ' + ', label: '加 +' },
  { insert: ' - ', label: '减 −' },
  { insert: ' * ', label: '乘 ×' },
  { insert: ' / ', label: '除 ÷' },
  { insert: ' % ', label: '取余 %' },
  { insert: ' > ', label: '>' },
  { insert: ' >= ', label: '>=' },
  { insert: ' < ', label: '<' },
  { insert: ' <= ', label: '<=' },
  { insert: ' == ', label: '==' },
  { insert: ' != ', label: '!=' },
  { insert: ' && ', label: '且 &&' },
  { insert: ' || ', label: '或 ||' },
  { insert: '!', label: '非 !' },
  { insert: '()', label: '括号 ( )' },
  { insert: ' ?  : ', label: '条件 ? 真值 : 假值' },
];

/** 兼容旧入口的分组也由同一份函数目录生成。 */
export const PRINT_EXPR_FUNCTION_GROUPS = [
  '条件',
  '空值与包含',
  '数字',
  '文本与格式',
  '表统计',
].map((title) => ({
  title,
  items: PRINT_EXPR_FUNCTIONS.filter((item) => item.group === title).map(
    (item) => ({
      label: `${item.name}(${item.parameters.map((p) => p.label).join(', ')})`,
      insert: printExprFunctionTemplate(item),
    }),
  ),
}));
export const PRINT_EXPR_JUDGE_GROUPS = PRINT_EXPR_FUNCTION_GROUPS.slice(0, 2);
export const PRINT_EXPR_CALC_GROUPS = PRINT_EXPR_FUNCTION_GROUPS.slice(2);

/** 各场景默认展示的字段分组，其余进「更多值」 */
const PRIMARY_FIELD_GROUPS: Record<PrintExprHelpScene, string[]> = {
  cell: ['本行列'],
  color: ['本列', '本行列'],
  column: ['本行列'],
  filter: ['本行列'],
  text: ['协议字段'],
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
  if (q !== -1 && colon > q && !token.slice(q + 1, colon).trim()) return q + 1;
  const open = token.lastIndexOf('(');
  const bare = token.replaceAll(/(['"])(?:\\.|(?!\1).)*\1/g, '""');
  if (
    open === -1 ||
    !token.endsWith(')') ||
    !/(?:\(\s*[,)]|,\s*[,)]|\(\s*$)/.test(bare)
  )
    return token.length;
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
  // 原生输入框失焦后仍保留选区；填写函数参数期间也要回到原插入位置。
  const start = el?.selectionStart ?? current.length;
  const end = el?.selectionEnd ?? start;
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
    ...protocolPrintExprFields().filter(
      (item) => !rowFields.some((row) => row.value === item.value),
    ),
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
  return rowPrintExprFields(columns);
}

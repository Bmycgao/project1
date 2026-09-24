import type { AgreePrintData } from '../types';

import { TABLE_COLUMN_PRESETS } from '../data/fields';
import { formatPrintValue } from '../data/format-print-value';
import { listLeafTableCells } from '../template/print-element-meta';
import { filterPrintRows } from './print-expr';

/** 行筛选比较符 */
export type PrintFilterOp =
  | 'contains'
  | 'empty'
  | 'eq'
  | 'gt'
  | 'gte'
  | 'in'
  | 'lt'
  | 'lte'
  | 'neq'
  | 'notEmpty'
  | 'notIn';

/** 单条筛选条件 */
export interface PrintFilterCond {
  field: string;
  op: PrintFilterOp;
  value: string;
}

export const PRINT_FILTER_OP_OPTIONS: {
  label: string;
  value: PrintFilterOp;
}[] = [
  { label: '等于', value: 'eq' },
  { label: '不等于', value: 'neq' },
  { label: '大于', value: 'gt' },
  { label: '大于等于', value: 'gte' },
  { label: '小于', value: 'lt' },
  { label: '小于等于', value: 'lte' },
  { label: '包含', value: 'contains' },
  { label: '属于（多个值）', value: 'in' },
  { label: '不属于', value: 'notIn' },
  { label: '为空', value: 'empty' },
  { label: '不为空', value: 'notEmpty' },
];

/** 常见数值 field（户名等文本列不要误判） */
const NUMERIC_FIELDS = new Set([
  'amount',
  'buildArea',
  'evalValue',
  'expropriatedArea',
  'index',
  'quantity',
  'unitPrice',
]);

/** field 名里带这些片段也当数值列 */
const NUMERIC_FIELD_RE =
  /amount|price|area|value|qty|quantity|total|count|index|unitPrice|evalValue/i;

/** 筛选列（可带对齐 / 合计，用于判断数值列） */
export interface PrintFilterColumn {
  agreeColFormat?: string;
  align?: 'center' | 'left' | 'right';
  field: string;
  tableSummary?: boolean;
  title: string;
}

/** 按当前表列生成的快捷筛选 */
export interface PrintFilterPreset {
  conds: PrintFilterCond[];
  join: 'and' | 'or';
  label: string;
}

/**
 * 比较符是否需要填写值
 * @param op 比较符
 */
export function filterOpNeedsValue(op: PrintFilterOp) {
  return op !== 'empty' && op !== 'notEmpty';
}

/**
 * 是否数值列（合计下拉、快捷「>0」、表达式不加引号）
 * @param field 列 field
 * @param col 可选：合计开关 / 右对齐也视为数值
 */
export function isNumericPrintField(
  field: string,
  col?: Pick<PrintFilterColumn, 'align' | 'tableSummary'>,
) {
  const key = String(field || '');
  if (!key) return false;
  if (NUMERIC_FIELDS.has(key) || NUMERIC_FIELD_RE.test(key)) return true;
  if (col?.tableSummary) return true;
  if (col?.align === 'right') return true;
  return false;
}

/**
 * 只准备 1～2 个高频筛行预填：隐藏金额为 0、隐藏名称为空。
 * 点选后仍可改比较值和运算符，不按列机械铺满。
 * @param columns 当前表列
 */
export function buildFilterPresets(
  columns: PrintFilterColumn[],
): PrintFilterPreset[] {
  const cols = columns.filter((c) => String(c.field || '').trim());
  const out: PrintFilterPreset[] = [];
  const amountCol =
    cols.find((c) => c.field === 'amount') ||
    cols.find((c) => c.field === 'evalValue') ||
    cols.find((c) => c.field !== 'index' && isNumericPrintField(c.field, c));
  if (amountCol) {
    const title = amountCol.title || amountCol.field;
    out.push({
      label: `隐藏${title}为 0 的行`,
      join: 'and',
      conds: [{ field: amountCol.field, op: 'gt', value: '0' }],
    });
  }
  const nameCol =
    cols.find((c) => c.field === 'name') ||
    cols.find((c) => c.field === 'householdName') ||
    cols.find(
      (c) => /name|title/i.test(c.field) && !isNumericPrintField(c.field, c),
    );
  if (nameCol) {
    const title = nameCol.title || nameCol.field;
    out.push({
      label: `隐藏${title}为空的行`,
      join: 'and',
      conds: [{ field: nameCol.field, op: 'notEmpty', value: '' }],
    });
  }
  return out;
}

/**
 * 是否按数值写表达式（不加引号）
 * @param field 列 field
 * @param value 输入值
 */
function useNumericLiteral(field: string, value: string) {
  if (!isNumericPrintField(field)) return false;
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n);
}

/**
 * 把字面量写成表达式片段
 * @param field 列
 * @param value 用户输入
 */
function literalExpr(field: string, value: string) {
  const v = value.trim();
  if (useNumericLiteral(field, v)) return v;
  return JSON.stringify(v);
}

/**
 * IN / NOT_IN 的多个候选值
 * @param field 列
 * @param value 逗号分隔
 */
function listLiterals(field: string, value: string) {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((v) => literalExpr(field, v))
    .join(', ');
}

/**
 * 单条条件编译为 agreeRowFilter 片段
 * @param cond 条件
 */
export function compileFilterCond(cond: PrintFilterCond): string {
  const field = String(cond.field || '').trim();
  if (!field) return '';
  const op = cond.op;
  if (op === 'empty') return `EMPTY(${field})`;
  if (op === 'notEmpty') return `!EMPTY(${field})`;
  if (op === 'in') {
    const list = listLiterals(field, cond.value);
    return list ? `IN(${field}, ${list})` : `IN(${field})`;
  }
  if (op === 'notIn') {
    const list = listLiterals(field, cond.value);
    return list ? `NOT_IN(${field}, ${list})` : '';
  }
  if (!filterOpNeedsValue(op)) return '';
  const lit = literalExpr(field, cond.value);
  if (op === 'contains') return `CONTAINS(${field}, ${lit})`;
  if (op === 'eq') return `${field} == ${lit}`;
  if (op === 'neq') return `${field} != ${lit}`;
  if (op === 'gt') return `${field} > ${lit}`;
  if (op === 'gte') return `${field} >= ${lit}`;
  if (op === 'lt') return `${field} < ${lit}`;
  if (op === 'lte') return `${field} <= ${lit}`;
  return '';
}

/**
 * 多条件编译（且 / 或）
 * @param conds 条件列表
 * @param join and | or
 */
export function compileFilterConds(
  conds: PrintFilterCond[],
  join: 'and' | 'or',
): string {
  const parts = conds.map((c) => compileFilterCond(c)).filter(Boolean);
  if (parts.length === 0) return '';
  const sep = join === 'or' ? ' || ' : ' && ';
  return parts.map((p) => (parts.length > 1 ? `(${p})` : p)).join(sep);
}

/**
 * 去掉最外层成对括号
 * @param raw 片段
 */
function unwrapParens(raw: string) {
  let t = raw.trim();
  while (t.startsWith('(') && t.endsWith(')')) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

/**
 * 尝试把简单表达式拆回条件（拆不了则 advanced=true，走高级编辑）
 * @param expr agreeRowFilter
 */
export function parseFilterExpr(expr: string): {
  advanced: boolean;
  conds: PrintFilterCond[];
  join: 'and' | 'or';
} {
  const raw = String(expr || '').trim();
  if (!raw) {
    return { conds: [emptyCond()], join: 'and', advanced: false };
  }
  if (raw.includes('&&') && raw.includes('||')) {
    return { conds: [emptyCond()], join: 'and', advanced: true };
  }
  const join: 'and' | 'or' = raw.includes('||') ? 'or' : 'and';
  const chunks = raw
    .split(join === 'or' ? '||' : '&&')
    .map((s) => unwrapParens(s))
    .filter(Boolean);
  const conds = chunks.map((chunk) => parseOneCond(chunk));
  if (conds.some((c) => !c.field)) {
    return { conds: [emptyCond()], join: 'and', advanced: true };
  }
  return { conds, join, advanced: false };
}

/**
 * 空条件
 */
export function emptyCond(): PrintFilterCond {
  return { field: '', op: 'eq', value: '' };
}

/**
 * 解析一条比较
 * @param chunk 片段
 */
function parseOneCond(chunk: string): PrintFilterCond {
  const text = unwrapParens(chunk);
  let m = text.match(/^!EMPTY\((\w+)\)$/);
  if (m?.[1]) return { field: m[1], op: 'notEmpty', value: '' };
  m = text.match(/^EMPTY\((\w+)\)$/);
  if (m?.[1]) return { field: m[1], op: 'empty', value: '' };
  m = text.match(/^CONTAINS\((\w+)\s*,\s*(.+)\)$/);
  if (m?.[1] && m[2] !== undefined) {
    return { field: m[1], op: 'contains', value: unquote(m[2].trim()) };
  }
  m = text.match(/^NOT_IN\((\w+)\s*,\s*(.+)\)$/);
  if (m?.[1] && m[2] !== undefined) {
    return { field: m[1], op: 'notIn', value: unquoteList(m[2]) };
  }
  m = text.match(/^IN\((\w+)\)$/);
  if (m?.[1]) return { field: m[1], op: 'in', value: '' };
  m = text.match(/^IN\((\w+)\s*,\s*(.+)\)$/);
  if (m?.[1] && m[2] !== undefined) {
    return { field: m[1], op: 'in', value: unquoteList(m[2]) };
  }
  m = text.match(/^(\w+)\s*==\s*(.+)$/);
  if (m?.[1] && m[2] !== undefined) {
    return { field: m[1], op: 'eq', value: unquote(m[2].trim()) };
  }
  m = text.match(/^(\w+)\s*!=\s*(.+)$/);
  if (m?.[1] && m[2] !== undefined) {
    return { field: m[1], op: 'neq', value: unquote(m[2].trim()) };
  }
  m = text.match(/^(\w+)\s*>=\s*(.+)$/);
  if (m?.[1] && m[2] !== undefined) {
    return { field: m[1], op: 'gte', value: unquote(m[2].trim()) };
  }
  m = text.match(/^(\w+)\s*<=\s*(.+)$/);
  if (m?.[1] && m[2] !== undefined) {
    return { field: m[1], op: 'lte', value: unquote(m[2].trim()) };
  }
  m = text.match(/^(\w+)\s*>\s*(.+)$/);
  if (m?.[1] && m[2] !== undefined) {
    return { field: m[1], op: 'gt', value: unquote(m[2].trim()) };
  }
  m = text.match(/^(\w+)\s*<\s*(.+)$/);
  if (m?.[1] && m[2] !== undefined) {
    return { field: m[1], op: 'lt', value: unquote(m[2].trim()) };
  }
  return emptyCond();
}

/**
 * 去掉字符串引号
 * @param raw 字面量
 */
function unquote(raw: string) {
  const s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    try {
      return JSON.parse(`"${s.slice(1, -1).replaceAll('"', String.raw`\"`)}"`);
    } catch {
      return s.slice(1, -1);
    }
  }
  return s;
}

/**
 * IN 参数列表还原成逗号分隔
 * @param raw IN(...) 内除字段外的部分
 */
function unquoteList(raw: string) {
  return raw
    .split(',')
    .map((s) => unquote(s.trim()))
    .filter(Boolean)
    .join(', ');
}

/**
 * 从 hiprint columns（可能是多行表头）抽出带 field 的叶子列
 * @param columns options.columns
 */
export function collectLeafColumns(columns: unknown): PrintFilterColumn[] {
  return listLeafTableCells(columns)
    .filter((col) => col.field)
    .map((col) => ({
      field: col.field,
      title: col.title || col.field,
      align: col.align,
      tableSummary: col.tableSummary,
      agreeColFormat: String(col.agreeColFormat || ''),
    }));
}

/**
 * 当前表可筛选的列
 * @param tableField 数据源
 * @param columns 画布列（可空）
 */
export function listFilterColumns(
  tableField: string,
  columns?: PrintFilterColumn[],
): PrintFilterColumn[] {
  if (columns?.some((c) => c.field)) {
    return columns.filter((c) => c.field);
  }
  return (TABLE_COLUMN_PRESETS[tableField] || []).map((c) => ({
    field: c.field,
    title: c.title,
    align: c.align,
    tableSummary: !!c.tableSummary,
  }));
}

/**
 * 合计/平均值只给数值列
 * @param tableField 数据源
 * @param columns 画布列
 */
export function listNumericColumns(
  tableField: string,
  columns?: PrintFilterColumn[],
) {
  const cols = columns?.length
    ? columns
    : (TABLE_COLUMN_PRESETS[tableField] || []).map((c) => ({
        field: c.field,
        title: c.title,
        align: c.align,
        tableSummary: !!c.tableSummary,
      }));
  const numeric = cols.filter((c) => isNumericPrintField(c.field, c));
  if (numeric.length > 0) return numeric;
  return (TABLE_COLUMN_PRESETS[tableField] || [])
    .filter((c) =>
      isNumericPrintField(c.field, {
        tableSummary: !!c.tableSummary,
        align: c.align,
      }),
    )
    .map((c) => ({
      field: c.field,
      title: c.title,
      align: c.align,
      tableSummary: !!c.tableSummary,
    }));
}

/**
 * 样例数据过滤后剩余行数
 * @param tableField 表
 * @param expr 过滤表达式
 * @param sample 样例 printData
 */
export function previewFilterRowCount(
  tableField: string,
  expr: string,
  sample: AgreePrintData,
): { kept: number; total: number } {
  const rows = (sample as unknown as Record<string, unknown>)[tableField];
  const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  const total = list.length;
  if (!expr.trim()) return { kept: total, total };
  const kept = filterPrintRows(
    list,
    expr,
    sample as unknown as Record<string, unknown>,
    { silent: true },
  ).length;
  return { kept, total };
}

/**
 * 单条条件说成中文，供芯片和列头浮层复用
 * @param cond 条件
 * @param columns 列中文名
 */
export function describeFilterCond(
  cond: PrintFilterCond,
  columns: PrintFilterColumn[],
) {
  const title =
    columns.find((col) => col.field === cond.field)?.title || cond.field;
  const op =
    PRINT_FILTER_OP_OPTIONS.find((item) => item.value === cond.op)?.label ||
    cond.op;
  if (!filterOpNeedsValue(cond.op)) return `${title} ${op}`;
  if (cond.op === 'in' || cond.op === 'notIn') {
    const n = cond.value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '').length;
    if (n === 0) return `${title} 不含任何值`;
    if (n > 3) return `${title} ${op} ${n} 项`;
  }
  return `${title} ${op} ${cond.value}`;
}

/**
 * 把筛选条件说成中文摘要
 * @param expr agreeRowFilter
 * @param columns 列中文名
 */
export function describeFilterExpr(expr: string, columns: PrintFilterColumn[]) {
  const raw = String(expr || '').trim();
  if (!raw) return '未筛选（打印全部行）';
  const parsed = parseFilterExpr(raw);
  if (parsed.advanced) return raw;
  const joinWord = parsed.join === 'or' ? ' 或 ' : ' 且 ';
  return parsed.conds
    .filter((c) => c.field)
    .map((c) => describeFilterCond(c, columns))
    .join(joinWord);
}

/** 检视器芯片：一列一条，高级表达式整段一颗 */
export interface PrintFilterChip {
  advanced: boolean;
  field: string;
  joinBefore: '' | '且' | '或';
  label: string;
}

/**
 * 把 agreeRowFilter 拆成可关闭的芯片
 * @param expr 当前筛选
 * @param columns 列中文名
 */
export function listFilterChips(
  expr: string,
  columns: PrintFilterColumn[],
): PrintFilterChip[] {
  const raw = String(expr || '').trim();
  if (!raw) return [];
  const parsed = parseFilterExpr(raw);
  if (parsed.advanced) {
    return [{ advanced: true, field: '', joinBefore: '', label: raw }];
  }
  const joinWord: '且' | '或' = parsed.join === 'or' ? '或' : '且';
  return parsed.conds
    .filter((c) => c.field)
    .map((c, index) => ({
      advanced: false,
      field: c.field,
      joinBefore: index > 0 ? joinWord : '',
      label: describeFilterCond(c, columns),
    }));
}

/**
 * 列头点选时的默认比较符：数值列大于，文本列不为空
 * @param field 列 field
 * @param col 可选列元数据
 */
export function defaultFilterOp(
  field: string,
  col?: Pick<PrintFilterColumn, 'align' | 'tableSummary'>,
): PrintFilterOp {
  return isNumericPrintField(field, col) ? 'gt' : 'notEmpty';
}

/**
 * 取出某列在可视化筛选中的那一条；高级表达式返回 null
 * @param expr agreeRowFilter
 * @param field 列 field
 */
export function condForField(
  expr: string,
  field: string,
): PrintFilterCond | null {
  const key = String(field || '').trim();
  if (!key) return null;
  const parsed = parseFilterExpr(expr);
  if (parsed.advanced) return null;
  return parsed.conds.find((c) => c.field === key) || null;
}

/**
 * 表达式里是否约束了这一列（列头三角标记用）
 * @param expr agreeRowFilter
 * @param field 列 field
 */
export function fieldInFilterExpr(expr: string, field: string) {
  const key = String(field || '').trim();
  const raw = String(expr || '').trim();
  if (!key || !raw) return false;
  const parsed = parseFilterExpr(raw);
  if (!parsed.advanced) return parsed.conds.some((c) => c.field === key);
  return new RegExp(`\\b${key}\\b`).test(raw);
}

/**
 * 用一列的条件替换/删除 AND·OR 里该列片段。
 * 高级表达式不能静默改写，blocked=true 时请走「更多条件」。
 * @param expr 当前 agreeRowFilter
 * @param field 列 field
 * @param cond 新条件；null 表示去掉该列
 */
export function upsertFieldFilter(
  expr: string,
  field: string,
  cond: PrintFilterCond | null,
): { blocked: boolean; expr: string } {
  const key = String(field || '').trim();
  const raw = String(expr || '').trim();
  if (!key) return { blocked: false, expr: raw };
  const parsed = parseFilterExpr(raw);
  if (parsed.advanced) return { blocked: true, expr: raw };
  const rest = parsed.conds.filter((c) => c.field && c.field !== key);
  const next =
    cond && String(cond.field || key).trim()
      ? [...rest, { ...cond, field: key }]
      : rest;
  return {
    blocked: false,
    expr: compileFilterConds(next, parsed.join),
  };
}

/** Excel 列筛选里的一个唯一值 */
export interface PrintColumnValueOption {
  count: number;
  empty: boolean;
  key: string;
  label: string;
}

/**
 * 列出本列唯一值（先套其它列筛选，再计数），供列头勾选
 * @param tableField 表格数据源
 * @param field 当前列
 * @param expr 整表 agreeRowFilter
 * @param sample 样例 printData
 * @param format 列显示格式
 */
export function listColumnUniqueValues(
  tableField: string,
  field: string,
  expr: string,
  sample: AgreePrintData,
  format?: string,
): PrintColumnValueOption[] {
  const key = String(field || '').trim();
  if (!key) return [];
  const rows = (sample as unknown as Record<string, unknown>)[tableField];
  const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  const others = upsertFieldFilter(expr, key, null);
  const scoped = filterPrintRows(
    list,
    others.blocked ? expr : others.expr,
    sample as unknown as Record<string, unknown>,
    { silent: true },
  );
  const counts = new Map<
    string,
    { count: number; empty: boolean; raw: unknown }
  >();
  for (const row of scoped) {
    const raw = row[key];
    const empty =
      raw === null || raw === undefined || String(raw).trim() === '';
    const itemKey = empty ? '' : String(raw);
    const prev = counts.get(itemKey);
    if (prev) prev.count += 1;
    else counts.set(itemKey, { count: 1, empty, raw });
  }
  return [...counts.entries()]
    .map(([itemKey, item]) => ({
      key: itemKey,
      empty: item.empty,
      count: item.count,
      label: item.empty
        ? '(空白)'
        : formatPrintValue(item.raw, format) || String(item.raw),
    }))
    .toSorted((a, b) => {
      if (a.empty !== b.empty) return a.empty ? 1 : -1;
      return a.label.localeCompare(b.label, 'zh-CN', { numeric: true });
    });
}

import type { AgreePrintData } from './types';

import { TABLE_COLUMN_PRESETS } from './fields';
import { listLeafTableCells } from './print-element-meta';
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

/** 适合比较大小 / 合计的列（户名等文本列不要出现在 SUM 下拉） */
const NUMERIC_FIELDS = new Set([
  'amount',
  'buildArea',
  'evalValue',
  'expropriatedArea',
  'index',
  'quantity',
  'unitPrice',
]);

/** 各表常用筛选快捷项 */
export const PRINT_TABLE_FILTER_PRESETS: Record<
  string,
  { conds: PrintFilterCond[]; join: 'and' | 'or'; label: string }[]
> = {
  houses: [
    {
      label: '只打住宅',
      join: 'and',
      conds: [{ field: 'houseType', op: 'eq', value: '住宅' }],
    },
    {
      label: '评估价>0',
      join: 'and',
      conds: [{ field: 'evalValue', op: 'gt', value: '0' }],
    },
    {
      label: '建面≥50',
      join: 'and',
      conds: [{ field: 'buildArea', op: 'gte', value: '50' }],
    },
    {
      label: '住宅且评估价>0',
      join: 'and',
      conds: [
        { field: 'houseType', op: 'eq', value: '住宅' },
        { field: 'evalValue', op: 'gt', value: '0' },
      ],
    },
  ],
  compensationItems: [
    {
      label: '金额>1万',
      join: 'and',
      conds: [{ field: 'amount', op: 'gt', value: '10000' }],
    },
    {
      label: '金额不为空',
      join: 'and',
      conds: [{ field: 'amount', op: 'notEmpty', value: '' }],
    },
  ],
  rewardItems: [
    {
      label: '金额>0',
      join: 'and',
      conds: [{ field: 'amount', op: 'gt', value: '0' }],
    },
  ],
};

/**
 * 比较符是否需要填写值
 * @param op 比较符
 */
export function filterOpNeedsValue(op: PrintFilterOp) {
  return op !== 'empty' && op !== 'notEmpty';
}

/**
 * 是否数值列（合计下拉只给这些）
 * @param field 列 field
 */
export function isNumericPrintField(field: string) {
  return NUMERIC_FIELDS.has(String(field || ''));
}

/**
 * 是否按数值写表达式（不加引号）
 * @param field 列 field
 * @param value 输入值
 */
function useNumericLiteral(field: string, value: string) {
  if (!NUMERIC_FIELDS.has(field)) return false;
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
    return list ? `IN(${field}, ${list})` : '';
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
export function collectLeafColumns(
  columns: unknown,
): { field: string; title: string }[] {
  return listLeafTableCells(columns)
    .filter((col) => col.field)
    .map((col) => ({ field: col.field, title: col.title || col.field }));
}

/**
 * 当前表可筛选的列
 * @param tableField 数据源
 * @param columns 画布列（可空）
 */
export function listFilterColumns(
  tableField: string,
  columns?: { field: string; title: string }[],
) {
  if (columns?.some((c) => c.field)) {
    return columns.filter((c) => c.field);
  }
  return (TABLE_COLUMN_PRESETS[tableField] || []).map((c) => ({
    field: c.field,
    title: c.title,
  }));
}

/**
 * 合计/平均值只给数值列
 * @param tableField 数据源
 * @param columns 画布列
 */
export function listNumericColumns(
  tableField: string,
  columns?: { field: string; tableSummary?: boolean; title: string }[],
) {
  const cols = columns?.length
    ? columns
    : (TABLE_COLUMN_PRESETS[tableField] || []).map((c) => ({
        field: c.field,
        title: c.title,
        tableSummary: !!c.tableSummary,
      }));
  const numeric = cols.filter(
    (c) => isNumericPrintField(c.field) || c.tableSummary,
  );
  if (numeric.length > 0) return numeric;
  return (TABLE_COLUMN_PRESETS[tableField] || [])
    .filter((c) => isNumericPrintField(c.field) || c.tableSummary)
    .map((c) => ({
      field: c.field,
      title: c.title,
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
 * 把筛选条件说成中文摘要
 * @param expr agreeRowFilter
 * @param columns 列中文名
 */
export function describeFilterExpr(
  expr: string,
  columns: { field: string; title: string }[],
) {
  const raw = String(expr || '').trim();
  if (!raw) return '未筛选（打印全部行）';
  const parsed = parseFilterExpr(raw);
  if (parsed.advanced) return raw;
  const joinWord = parsed.join === 'or' ? ' 或 ' : ' 且 ';
  return parsed.conds
    .filter((c) => c.field)
    .map((c) => {
      const title =
        columns.find((col) => col.field === c.field)?.title || c.field;
      const op =
        PRINT_FILTER_OP_OPTIONS.find((o) => o.value === c.op)?.label || c.op;
      if (!filterOpNeedsValue(c.op)) return `${title} ${op}`;
      return `${title} ${op} ${c.value}`;
    })
    .join(joinWord);
}

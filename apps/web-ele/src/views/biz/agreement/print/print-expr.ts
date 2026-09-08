/**
 * 打印模板表达式引擎（条件显隐 / 行过滤 / 字段计算）
 * 设计器可在元素 options 中配置：
 * - agreeVisibleWhen: 如 hasRewards、amount > 500000、statusValue == '已签约'
 * - agreeRowFilter: 表格行过滤，如 evalValue > 0、buildArea >= 50
 * - agreeValueExpr: 文本字段计算，如 ROUND(amount, 2)、IF(hasRewards, rewardTotal, 0)
 */

import { formatPrintValue } from './format-print-value';

/** 表达式内置函数库 */
export interface PrintExprScope extends Record<string, unknown> {
  SUM: (rows: unknown, field?: string) => number;
  COUNT: (rows: unknown) => number;
  ROUND: (n: unknown, digits?: number) => number;
  IF: (cond: unknown, thenVal: unknown, elseVal: unknown) => unknown;
  MAX: (...nums: number[]) => number;
  MIN: (...nums: number[]) => number;
  /** 表列最大值 */
  MAX_COL: (rows: unknown, field?: string) => number;
  /** 表列最小值 */
  MIN_COL: (rows: unknown, field?: string) => number;
  ABS: (n: unknown) => number;
  EMPTY: (v: unknown) => boolean;
  COALESCE: (...vals: unknown[]) => unknown;
  LEN: (v: unknown) => number;
  CONCAT: (...parts: unknown[]) => string;
  UPPER: (v: unknown) => string;
  LOWER: (v: unknown) => string;
  FORMAT_MONEY: (v: unknown, decimals?: number) => string;
  FORMAT_DATE: (v: unknown, style?: string) => string;
  IN: (v: unknown, ...candidates: unknown[]) => boolean;
  NOT_IN: (v: unknown, ...candidates: unknown[]) => boolean;
  AVG: (rows: unknown, field?: string) => number;
  CONTAINS: (text: unknown, sub: unknown) => boolean;
  /** 全部条件成立 */
  AND: (...values: unknown[]) => boolean;
  /** 任一条件成立 */
  OR: (...values: unknown[]) => boolean;
  NOT: (value: unknown) => boolean;
  CEIL: (n: unknown) => number;
  FLOOR: (n: unknown) => number;
  POW: (base: unknown, exponent: unknown) => number;
  SQRT: (n: unknown) => number;
  MOD: (n: unknown, divisor: unknown) => number;
  NUMBER: (value: unknown, fallback?: number) => number;
  CLAMP: (n: unknown, min: unknown, max: unknown) => number;
  /** 依次传入 条件,结果，最后可带默认值 */
  IFS: (...values: unknown[]) => unknown;
}

/**
 * 从数组累加某字段
 * @param rows 行数组
 * @param field 字段名
 */
function sumRows(rows: unknown, field?: string): number {
  if (!Array.isArray(rows)) return 0;
  if (!field) return rows.length;
  return rows.reduce(
    (acc, row) =>
      acc + (Number((row as Record<string, unknown>)?.[field]) || 0),
    0,
  );
}

function avgRows(rows: unknown, field?: string): number {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  if (!field) return 0;
  return sumRows(rows, field) / rows.length;
}

/**
 * 构建表达式作用域（业务字段 + 内置函数）
 * @param ctx 扁平打印数据或行上下文
 */
export function createPrintExprScope(
  ctx: Record<string, unknown>,
): PrintExprScope {
  return {
    ...ctx,
    SUM: sumRows,
    COUNT: (rows) => (Array.isArray(rows) ? rows.length : 0),
    ROUND: (n, digits = 0) => {
      const num = Number(n);
      if (!Number.isFinite(num)) return 0;
      const p = 10 ** digits;
      return Math.round(num * p) / p;
    },
    IF: (cond, thenVal, elseVal) => (cond ? thenVal : elseVal),
    MAX: (...nums) => Math.max(...nums.map((n) => Number(n) || 0)),
    MIN: (...nums) => Math.min(...nums.map((n) => Number(n) || 0)),
    ABS: (n) => Math.abs(Number(n) || 0),
    EMPTY: (v) => v === null || v === undefined || v === '',
    COALESCE: (...vals) =>
      vals.find((v) => v !== null && v !== undefined && v !== '') ?? '',
    LEN: (v) => (Array.isArray(v) ? v.length : String(v ?? '').length),
    CONCAT: (...parts) => parts.map((p) => String(p ?? '')).join(''),
    UPPER: (v) => String(v ?? '').toUpperCase(),
    LOWER: (v) => String(v ?? '').toLowerCase(),
    FORMAT_MONEY: (v, digits = 2) => {
      const normalized = Math.max(0, Math.min(4, Math.round(digits)));
      const styles = ['money0', 'money1', 'money', 'money3', 'money4'];
      return formatPrintValue(v, styles[normalized] || 'money');
    },
    FORMAT_DATE: (v, style = 'date') =>
      formatPrintValue(v, String(style || 'date')),
    IN: (v, ...candidates) => candidates.some((c) => String(c) === String(v)),
    NOT_IN: (v, ...candidates) =>
      !candidates.some((c) => String(c) === String(v)),
    AVG: avgRows,
    MAX_COL: (rows, field) => extremaRows(rows, field, 'max'),
    MIN_COL: (rows, field) => extremaRows(rows, field, 'min'),
    CONTAINS: (text, sub) => String(text ?? '').includes(String(sub ?? '')),
    AND: (...values) => values.every(Boolean),
    OR: (...values) => values.some(Boolean),
    NOT: (value) => !value,
    CEIL: (n) => Math.ceil(Number(n) || 0),
    FLOOR: (n) => Math.floor(Number(n) || 0),
    POW: (base, exponent) => (Number(base) || 0) ** (Number(exponent) || 0),
    SQRT: (n) => Math.sqrt(Math.max(0, Number(n) || 0)),
    MOD: (n, divisor) => {
      const d = Number(divisor);
      return d ? (Number(n) || 0) % d : 0;
    },
    NUMBER: (value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : Number(fallback) || 0;
    },
    CLAMP: (n, min, max) =>
      Math.min(Number(max) || 0, Math.max(Number(min) || 0, Number(n) || 0)),
    IFS: (...values) => {
      const pairEnd = values.length - (values.length % 2);
      for (let i = 0; i < pairEnd; i += 2) {
        if (values[i]) return values[i + 1];
      }
      return values.length % 2 ? values.at(-1) : '';
    },
  };
}

/**
 * 数组某列最大/最小值
 * @param rows 行数组
 * @param field 列 field
 * @param mode max | min
 */
function extremaRows(
  rows: unknown,
  field?: string,
  mode: 'max' | 'min' = 'max',
) {
  if (!Array.isArray(rows) || !field || rows.length === 0) return 0;
  const nums = rows.map(
    (row) => Number((row as Record<string, unknown>)?.[field]) || 0,
  );
  return mode === 'max' ? Math.max(...nums) : Math.min(...nums);
}

/** 表达式内置标识，预览缺变量时跳过求值 */
const PRINT_EXPR_RESERVED = new Set([
  'ABS',
  'AND',
  'AVG',
  'CEIL',
  'CLAMP',
  'COALESCE',
  'CONCAT',
  'CONTAINS',
  'COUNT',
  'EMPTY',
  'false',
  'FLOOR',
  'FORMAT_DATE',
  'FORMAT_MONEY',
  'i',
  'IF',
  'IFS',
  'IN',
  'index',
  'Infinity',
  'LEN',
  'LOWER',
  'MAX',
  'MAX_COL',
  'MIN',
  'MIN_COL',
  'MOD',
  'NaN',
  'NOT',
  'NOT_IN',
  'null',
  'NUMBER',
  'OR',
  'POW',
  'ROUND',
  'row',
  'SQRT',
  'SUM',
  'true',
  'undefined',
  'UPPER',
]);

/** 可调用的 DSL 函数；业务字段只能作为值，不能当函数执行 */
const PRINT_EXPR_FUNCTIONS = new Set([
  'ABS',
  'AND',
  'AVG',
  'CEIL',
  'CLAMP',
  'COALESCE',
  'CONCAT',
  'CONTAINS',
  'COUNT',
  'EMPTY',
  'FLOOR',
  'FORMAT_DATE',
  'FORMAT_MONEY',
  'IF',
  'IFS',
  'IN',
  'LEN',
  'LOWER',
  'MAX',
  'MAX_COL',
  'MIN',
  'MIN_COL',
  'MOD',
  'NOT',
  'NOT_IN',
  'NUMBER',
  'OR',
  'POW',
  'ROUND',
  'SQRT',
  'SUM',
  'UPPER',
]);

/** 去掉字符串与数字字面量，避免字符串字段名、科学计数法被当成变量扫描 */
function stripPrintExprLiterals(code: string) {
  return code
    .replaceAll(/(['"])(?:\\.|(?!\1).)*\1/g, '')
    .replaceAll(/\b(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\b/gi, '');
}

/**
 * 限制表达式为计算 DSL：允许算术、比较、三元和内置函数，不允许脚本语句、属性链或动态下标。
 */
function assertSafePrintExpr(code: string, ctx: Record<string, unknown>) {
  const bare = stripPrintExprLiterals(code);
  if (
    /(?:=>|\.\s*[A-Za-z_$]|\b(?:new|this|window|document|globalThis|process|Function|eval|import)\b|[;`{}[\]])/.test(
      bare,
    ) ||
    /(?<![=!<>])=(?!=)/.test(bare)
  ) {
    throw new Error('仅支持计算表达式，不支持脚本语句、赋值、属性链或动态下标');
  }
  const called = [...bare.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].map(
    (m) => m[1] || '',
  );
  const invalidCall = called.find((name) => !PRINT_EXPR_FUNCTIONS.has(name));
  if (invalidCall) throw new Error(`不支持函数 ${invalidCall}()`);

  const idents = bare.match(/[A-Za-z_]\w*/g) || [];
  const missing = idents.find(
    (id) =>
      !PRINT_EXPR_RESERVED.has(id) &&
      !Object.prototype.hasOwnProperty.call(ctx, id),
  );
  if (missing) throw new Error(`未找到字段或变量 ${missing}`);
}

/**
 * 表达式里用到的变量是否都在上下文中（避免 quantity 未定义刷控制台）
 * @param expr 表达式
 * @param ctx 合并后的上下文
 */
export function printExprVarsReady(
  expr: string | undefined,
  ctx: Record<string, unknown>,
): boolean {
  const code = String(expr || '').trim();
  if (!code) return false;
  const idents = stripPrintExprLiterals(code).match(/[A-Za-z_]\w*/g) || [];
  return idents.every(
    (id) =>
      PRINT_EXPR_RESERVED.has(id) ||
      Object.prototype.hasOwnProperty.call(ctx, id),
  );
}

/** 严格求值：供校验器使用，错误直接抛出 */
function runPrintExpr(code: string, ctx: Record<string, unknown>) {
  if (isLegacyFlagExpr(code)) return evalLegacyFlag(code, ctx);
  assertSafePrintExpr(code, ctx);
  const scope = createPrintExprScope(ctx);
  const keys = Object.keys(scope);
  const vals = keys.map((k) => scope[k]);
  // 表达式已通过 DSL 白名单检查，只执行一个 return 表达式。
  // oxlint-disable-next-line eslint/no-new-func
  const fn = new Function(...keys, `"use strict"; return (${code});`);
  return fn(...vals);
}

function isLegacyFlagExpr(expr: string) {
  return /^!?[a-zA-Z_]\w*$/.test(expr.trim());
}

/**
 * 解析 legacy 布尔标识
 * @param expr 表达式
 * @param ctx 上下文
 */
function evalLegacyFlag(expr: string, ctx: Record<string, unknown>): boolean {
  const raw = expr.trim();
  const neg = raw.startsWith('!');
  const key = neg ? raw.slice(1) : raw;
  const flag = !!ctx[key];
  return neg ? !flag : flag;
}

/**
 * 执行表达式并返回任意类型结果
 * @param expr 表达式字符串
 * @param ctx 上下文（协议 printData 或行级 { ...printData, ...row, row, index }）
 */
export function evalPrintExpr(
  expr: string | undefined,
  ctx: Record<string, unknown>,
  options?: { silent?: boolean },
): unknown {
  const code = String(expr || '').trim();
  if (!code) return true;

  try {
    return runPrintExpr(code, ctx);
  } catch (error) {
    if (!options?.silent) {
      console.warn('[print-expr] 表达式执行失败:', code, error);
    }
    return false;
  }
}

/**
 * 执行布尔条件（显隐 / 行过滤）
 * @param expr 条件表达式
 * @param ctx 上下文
 */
export function evalPrintBool(
  expr: string | undefined,
  ctx: Record<string, unknown>,
  options?: { silent?: boolean },
): boolean {
  return !!evalPrintExpr(expr, ctx, options);
}

/**
 * 执行并格式化为展示字符串
 * @param expr 表达式
 * @param ctx 上下文
 */
export function evalPrintText(
  expr: string | undefined,
  ctx: Record<string, unknown>,
  options?: { silent?: boolean },
): string {
  const val = evalPrintExpr(expr, ctx, options);
  if (val === null || val === undefined) return '';
  return String(val);
}

/**
 * 按表达式过滤表格行
 * @param rows 原始行
 * @param filterExpr agreeRowFilter
 * @param printData 全局打印数据
 */
export function filterPrintRows<T extends Record<string, unknown>>(
  rows: T[] | undefined,
  filterExpr: string | undefined,
  printData: Record<string, unknown>,
  options?: { silent?: boolean },
): T[] {
  if (!rows?.length) return [];
  const expr = String(filterExpr || '').trim();
  if (!expr) return rows;
  return rows.filter((row, index) =>
    evalPrintBool(
      expr,
      {
        ...printData,
        ...row,
        row,
        index,
        i: index,
      },
      options,
    ),
  );
}

/**
 * 校验表达式语法（设计器用）
 * @param expr 表达式
 * @param sampleCtx 样例上下文
 */
export function validatePrintExpr(
  expr: string | undefined,
  sampleCtx: Record<string, unknown>,
): { message: string; ok: boolean; preview?: string } {
  const code = String(expr || '').trim();
  if (!code) {
    return { ok: true, message: '未配置（始终通过）' };
  }
  try {
    const result = runPrintExpr(code, sampleCtx);
    const preview =
      typeof result === 'object' ? JSON.stringify(result) : String(result);
    return { ok: true, message: '语法正确', preview };
  } catch (error: any) {
    return { ok: false, message: error?.message || '表达式无效' };
  }
}

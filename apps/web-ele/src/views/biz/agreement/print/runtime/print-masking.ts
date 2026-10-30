import { requireDefined } from '../../../../../../../shared/require-defined';

/** 模板只保存输出规则；原始数据继续用于计算、筛选与合并。 */
export type PrintMaskMode = 'all' | 'custom' | 'idCard' | 'name' | 'phone';
export interface PrintMaskRule {
  field: string;
  mode: PrintMaskMode;
  keepStart?: number;
  keepEnd?: number;
}

export const PRINT_MASK_MODES = [
  { value: 'all', label: '全部隐藏' },
  { value: 'phone', label: '手机号（前 3 后 4）' },
  { value: 'idCard', label: '身份证（前 3 后 4）' },
  { value: 'name', label: '姓名（保留姓氏）' },
  { value: 'custom', label: '自定义保留位数' },
] as const;

const CONTEXT_KEY = '__agreePrintMaskContext';
const validPath = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const count = (value: unknown) =>
  Math.min(100, Math.max(0, Math.floor(Number(value) || 0)));

export function normalizePrintMaskRules(raw: unknown): PrintMaskRule[] {
  const rules = new Map<string, PrintMaskRule>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const field = String(item?.field || '').trim();
    if (
      !validPath.test(field) ||
      field
        .split('.')
        .some((key) =>
          ['__proto__', 'constructor', 'prototype'].includes(key),
        ) ||
      !PRINT_MASK_MODES.some((mode) => mode.value === item?.mode)
    )
      continue;
    rules.set(field, {
      field,
      mode: item.mode,
      ...(item.mode === 'custom'
        ? { keepStart: count(item.keepStart), keepEnd: count(item.keepEnd) }
        : {}),
    });
  }
  return [...rules.values()];
}

export function maskPrintValue(value: unknown, rule: PrintMaskRule): string {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value);
  // 上游已经限制的值不会因为模板选择局部脱敏而重新展示。
  if (/^\*+$/.test(text)) return text;
  if (rule.mode === 'all') return '***';
  const chars = [...text];
  let start;
  if (rule.mode === 'name') {
    start = 1;
  } else {
    start = rule.mode === 'custom' ? count(rule.keepStart) : 3;
  }
  let end;
  if (rule.mode === 'name') {
    end = 0;
  } else {
    end = rule.mode === 'custom' ? count(rule.keepEnd) : 4;
  }
  // 短值也必须隐藏，不能因保留位数超过长度而输出原文。
  if (chars.length <= start + end) return '***';
  return `${chars.slice(0, start).join('')}${'*'.repeat(Math.max(1, chars.length - start - end))}${end ? chars.slice(-end).join('') : ''}`;
}

interface MaskContext {
  rules: PrintMaskRule[];
  derived: Record<string, string[]>;
  aliases: Record<string, string>;
}

function context(data: Record<string, unknown>): MaskContext | undefined {
  return data[CONTEXT_KEY] as MaskContext | undefined;
}

export function printMaskRulesForData(data: Record<string, unknown>) {
  return context(data)?.rules || [];
}

function canonical(field: string, source: string, ctx: MaskContext) {
  const key = field
    .replace(/^root\./, '')
    .replace(/^row\./, source ? `${source}.` : '');
  const [first, ...rest] = key.split('.');
  return [ctx.aliases[requireDefined(first)] || first, ...rest].join('.');
}

function expressionFields(
  expr: string,
  data: Record<string, unknown>,
  source: string,
  ctx: MaskContext,
) {
  const fields = new Set<string>();
  const aggregateSources = new Set<number>();
  // 字符串常量不是字段，聚合函数的第二个参数则是列名。
  for (const match of expr.matchAll(
    /\b(?:SUM|AVG|MAX_COL|MIN_COL)\s*\(\s*([\w$]+)\s*,\s*["']([\w$]+)["']/gi,
  )) {
    fields.add(canonical(`${match[1]}.${match[2]}`, '', ctx));
    aggregateSources.add(
      requireDefined(match.index) +
        match[0].indexOf(requireDefined(match[1]), match[0].indexOf('(')),
    );
  }
  const withoutStrings = expr.replaceAll(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    (literal) => ' '.repeat(literal.length),
  );
  for (const match of withoutStrings.matchAll(
    /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g,
  )) {
    const token = match[0];
    if (aggregateSources.has(requireDefined(match.index))) continue;
    if (
      /^\s*\(/.test(
        withoutStrings.slice(requireDefined(match.index) + token.length),
      )
    )
      continue;
    const row = data.row as Record<string, unknown> | undefined;
    const field =
      source && !token.includes('.') && row && Object.hasOwn(row, token)
        ? `${source}.${token}`
        : token;
    fields.add(canonical(field, source, ctx));
  }
  return [...fields];
}

function protectedField(
  field: string,
  ctx: MaskContext,
  seen = new Set<string>(),
): boolean {
  if (
    ctx.rules.some(
      (rule) => rule.field === field || rule.field.startsWith(`${field}.`),
    )
  )
    return true;
  if (seen.has(field)) return false;
  seen.add(field);
  return (ctx.derived[field] || []).some((key) =>
    protectedField(key, ctx, seen),
  );
}

/** 直接字段按指定方式脱敏；引用敏感字段的计算结果统一显示 ***。 */
export function maskPrintDisplay(
  value: unknown,
  formatted: string,
  data: Record<string, unknown>,
  field = '',
  expr = '',
  source = '',
): string {
  const ctx = context(data);
  if (
    !ctx?.rules.length ||
    value === null ||
    value === undefined ||
    value === ''
  )
    return formatted;
  const expression = expr.trim();
  if (expression && !validPath.test(expression)) {
    return expressionFields(expression, data, source, ctx).some((key) =>
      protectedField(key, ctx),
    )
      ? '***'
      : formatted;
  }
  const row = data.row as Record<string, unknown> | undefined;
  const direct =
    expression &&
    source &&
    !expression.includes('.') &&
    row &&
    Object.hasOwn(row, expression)
      ? `${source}.${expression}`
      : expression || field;
  const key = canonical(direct, source, ctx);
  const rule = ctx.rules.find((item) => item.field === key);
  if (rule) return maskPrintValue(value, rule);
  return protectedField(key, ctx) ? '***' : formatted;
}

/** 只挂在运行时数据副本上；保存模板时不包含任何业务原值。 */
export function preparePrintMasking(
  template: Record<string, any>,
  data: Record<string, unknown>,
) {
  const rules = normalizePrintMaskRules(template.agreePrintMaskRules);
  // 业务入口已经隐藏的字段也传播到计算结果，避免 *** 被转成 0 后输出。
  const restricted = new Set<string>();
  const visit = (value: unknown, path = '') => {
    if (Array.isArray(value)) {
      for (const row of value) visit(row, path);
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value))
        if (!key.startsWith('__')) visit(item, path ? `${path}.${key}` : key);
    } else if (typeof value === 'string' && /^\*+$/.test(value))
      restricted.add(path);
  };
  visit(data);
  for (const field of restricted) {
    const existing = rules.find((rule) => rule.field === field);
    if (existing) existing.mode = 'all';
    else rules.push({ field, mode: 'all' });
  }
  if (rules.length === 0) {
    Reflect.deleteProperty(data, CONTEXT_KEY);
    return;
  }
  const ctx: MaskContext = {
    rules,
    aliases: {},
    derived: {
      amountCn: ['amount'],
      totalEvalValue: ['houses.evalValue'],
      totalBuildArea: ['houses.buildArea'],
      compensationTotal: ['compensationItems.amount'],
      rewardTotal: ['rewardItems.amount'],
      printMeta: ['agreementName', 'agreementNo'],
      qrcodeContent: ['agreementNo'],
      barcodeContent: ['agreementNo'],
      'houses.householdName': ['compensatee'],
    },
  };
  const add = (field: string, expr: string, source = '') => {
    if (!expr || !field) return;
    const rows = data[source];
    const row = Array.isArray(rows) ? Object.assign({}, ...rows) : undefined;
    const key = canonical(field, '', ctx);
    ctx.derived[key] = [
      ...new Set([
        ...(ctx.derived[key] || []),
        ...expressionFields(expr, { ...data, row }, source, ctx),
      ]),
    ];
  };
  for (const panel of template.panels || []) {
    for (const el of panel.printElements || []) {
      const opts = el.options || {};
      const source = String(opts.field || '');
      if (opts.__agreeMaskSource) ctx.aliases[source] = opts.__agreeMaskSource;
      if (el.printElementType?.type !== 'table') {
        add(source, String(opts.agreeValueExpr || ''));
        continue;
      }
      const walk = (columns: any[]) => {
        for (const col of columns || []) {
          if (Array.isArray(col)) walk(col);
          else if (col?.columns) walk(col.columns);
          else if (col?.field)
            add(
              `${source}.${col.field}`,
              String(col.agreeColExpr || ''),
              source,
            );
        }
      };
      walk(opts.columns);
      for (const rule of opts.agreeBodyCellExprs || [])
        add(`${source}.${rule.field}`, String(rule.expr || ''), source);
    }
  }
  data[CONTEXT_KEY] = ctx;
}

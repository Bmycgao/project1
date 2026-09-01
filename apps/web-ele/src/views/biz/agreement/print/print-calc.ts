import type { AgreePrintData } from './types';

import { evalPrintText } from './print-expr';

/** 选表计算的聚合方式 */
export type PrintTableAgg = 'avg' | 'count' | 'max' | 'min' | 'sum';

export const PRINT_TABLE_AGG_OPTIONS: {
  label: string;
  value: PrintTableAgg;
}[] = [
  { label: '求和', value: 'sum' },
  { label: '计数', value: 'count' },
  { label: '平均', value: 'avg' },
  { label: '最大', value: 'max' },
  { label: '最小', value: 'min' },
];

/**
 * 根据选中表 + 聚合方式生成 agreeValueExpr
 * @param tableField 表格数据源，如 houses
 * @param agg 聚合
 * @param columnField 列 field（count 可不填）
 * @param format 展示格式 money / money0 / 空
 */
export function buildTableAggExpr(
  tableField: string,
  agg: PrintTableAgg,
  columnField: string,
  format?: string,
) {
  const table = String(tableField || '').trim();
  const col = String(columnField || '').trim();
  let inner: string;
  if (agg === 'count') {
    inner = `COUNT(${table})`;
  } else if (agg === 'sum') {
    inner = `SUM(${table}, "${col}")`;
  } else if (agg === 'avg') {
    inner = `AVG(${table}, "${col}")`;
  } else if (agg === 'max') {
    inner = `MAX_COL(${table}, "${col}")`;
  } else {
    inner = `MIN_COL(${table}, "${col}")`;
  }
  if (format === 'money') return `FORMAT_MONEY(${inner})`;
  if (format === 'money0') return `FORMAT_MONEY(${inner}, 0)`;
  return inner;
}

/**
 * 生成计算结果元素的唯一 field，避免覆盖业务字段
 * @param tableField 表
 * @param agg 聚合
 * @param columnField 列
 */
export function buildCalcResultField(
  tableField: string,
  agg: PrintTableAgg,
  col: string = 'n',
) {
  return `calc_${agg}_${tableField}_${col}`.replaceAll(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * 用样例数据预览聚合结果
 * @param expr 表达式
 * @param sample 样例 printData
 */
export function previewCalcExpr(expr: string, sample: AgreePrintData) {
  return evalPrintText(expr, sample as unknown as Record<string, unknown>, {
    silent: true,
  });
}

/**
 * 默认结果标题
 * @param tableLabel 表中文名
 * @param aggLabel 聚合中文
 * @param colTitle 列标题
 */
export function buildCalcResultTitle(
  tableLabel: string,
  aggLabel: string,
  colTitle: string,
) {
  if (!colTitle) return `${tableLabel}${aggLabel}`;
  return `${tableLabel} · ${colTitle}${aggLabel}`;
}

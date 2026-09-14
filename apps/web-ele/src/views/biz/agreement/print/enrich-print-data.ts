import type { AgreePrintData } from './types';

import { listLeafTableCells } from './print-element-meta';
import { evalPrintExpr, filterPrintRows } from './print-expr';
import { applyTableColorMeta } from './print-table-color';
import {
  applyAgreeBodyCellExprsToRows,
  applyAgreeColumnMergeMetaToRows,
  renumberAgreePrintRowIndexes,
} from './print-table-runtime';
import { cloneTemplate } from './template-store';

/**
 * 根据模板 JSON 对打印数据做运行时 enrich：
 * - 表格计算列 agreeColExpr
 * - 表格 agreeRowFilter 行过滤
 * - 可见行 index 重排为 1..n
 * - 文本 agreeValueExpr 可生成新计算字段，已有业务字段保持原始数值
 * 文本显示格式由 preparePrintTextValues 按元素独立处理。
 * @param template hiprint 模板
 * @param printData 原始业务数据
 */
export function enrichPrintDataForTemplate(
  template: Record<string, any>,
  printData: AgreePrintData,
): AgreePrintData {
  const data = cloneTemplate(printData) as AgreePrintData;
  const bag = data as unknown as Record<string, unknown>;
  const ctx = bag;

  for (const panel of template.panels || []) {
    for (const el of panel.printElements || []) {
      const opts = el?.options;
      if (!opts) continue;

      const field = opts.field as string | undefined;
      const type = el?.printElementType?.type;

      /** 表格：计算列 → 行过滤 → 序号重排 */
      if (type === 'table' && field) {
        const rows = bag[field];
        if (Array.isArray(rows)) {
          const leaves = listLeafTableCells(opts.columns);
          const computedCols = leaves.filter((c) => c.agreeColExpr && c.field);
          let nextRows = rows as Record<string, unknown>[];
          if (computedCols.length > 0) {
            nextRows = nextRows.map((row, index) => {
              const patched = { ...row };
              for (const col of computedCols) {
                patched[col.field] = evalPrintExpr(col.agreeColExpr, {
                  ...ctx,
                  ...patched,
                  row: patched,
                  index,
                  i: index,
                });
              }
              return patched;
            });
          }
          nextRows = applyAgreeBodyCellExprsToRows(
            nextRows,
            opts.agreeBodyCellExprs,
            leaves.map((col) => col.field),
            ctx,
          );
          if (opts.agreeRowFilter) {
            nextRows = filterPrintRows(
              nextRows,
              String(opts.agreeRowFilter),
              ctx,
            );
          }
          /** 筛行后重排序号，避免出现 1、3、5 断层 */
          nextRows = renumberAgreePrintRowIndexes(nextRows);
          /** 合并基于最终可见行计算，避免被筛掉的行打断连续分组。 */
          nextRows = applyAgreeColumnMergeMetaToRows(
            nextRows,
            opts.columns,
            ctx,
          );
          nextRows = applyTableColorMeta(nextRows, opts.columns, ctx);
          bag[field] = nextRows;
        }
      }

      /** 新的 calc_* 字段可供后续公式引用；文本公式不能覆盖原始业务字段。 */
      if (
        (type === 'text' || type === 'longText') &&
        field &&
        !Object.prototype.hasOwnProperty.call(printData, field) &&
        opts.agreeValueExpr
      ) {
        bag[field] = evalPrintExpr(String(opts.agreeValueExpr), ctx);
      }
    }
  }

  return data;
}

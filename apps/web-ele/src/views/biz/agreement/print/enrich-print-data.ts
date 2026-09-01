import type { AgreePrintData } from './types';

import { formatPrintValue } from './format-print-value';
import { listLeafTableCells } from './print-element-meta';
import { evalPrintExpr, evalPrintText, filterPrintRows } from './print-expr';
import { cloneTemplate } from './template-store';

/**
 * 根据模板 JSON 对打印数据做运行时 enrich：
 * - 表格计算列 agreeColExpr
 * - 表格 agreeRowFilter 行过滤
 * - 文本 agreeValueExpr 字段计算
 * - 文本 agreeFormat 展示格式化
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

      /** 表格：计算列 → 行过滤 */
      if (type === 'table' && field) {
        const rows = bag[field];
        if (Array.isArray(rows)) {
          const computedCols = listLeafTableCells(opts.columns).filter(
            (c) => c.agreeColExpr && c.field,
          );
          let nextRows = rows as Record<string, unknown>[];
          if (computedCols.length > 0) {
            nextRows = nextRows.map((row, index) => {
              const patched = { ...row };
              for (const col of computedCols) {
                patched[col.field] = evalPrintExpr(col.agreeColExpr, {
                  ...ctx,
                  ...row,
                  row,
                  index,
                });
              }
              return patched;
            });
          }
          if (opts.agreeRowFilter) {
            nextRows = filterPrintRows(
              nextRows,
              String(opts.agreeRowFilter),
              ctx,
            );
          }
          bag[field] = nextRows;
        }
      }

      /** 文本/长文本：agreeValueExpr 写入 field（可生成 calc_* 新 key） */
      if (
        (type === 'text' || type === 'longText') &&
        field &&
        opts.agreeValueExpr
      ) {
        bag[field] = evalPrintText(String(opts.agreeValueExpr), ctx);
      }

      /** 文本 agreeFormat 格式化（在 expr 之后） */
      if (
        (type === 'text' || type === 'longText') &&
        field &&
        opts.agreeFormat &&
        !opts.agreeValueExpr
      ) {
        const raw = bag[field];
        bag[field] = formatPrintValue(raw, String(opts.agreeFormat), ctx);
      }
    }
  }

  return data;
}

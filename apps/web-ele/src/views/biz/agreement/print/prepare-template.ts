import type { AgreePrintData } from './types';

import { enrichPrintDataForTemplate } from './enrich-print-data';
import { evalPrintBool } from './print-expr';
import { cloneTemplate } from './template-store';

/**
 * 按打印数据做条件裁剪、行过滤、字段计算，并挂上运行时表格合并函数
 * 注意：hiprint 内部会对 rowsColumnsMerge 做 eval(函数.toString())，不能依赖闭包变量
 * @param template 模板 JSON
 * @param printData 业务数据
 */
export function preparePrintTemplate(
  template: Record<string, any>,
  printData: AgreePrintData,
): { printData: AgreePrintData; template: Record<string, any> } {
  const enriched = enrichPrintDataForTemplate(template, printData);
  const ctx = enriched as unknown as Record<string, unknown>;
  const next = cloneTemplate(template);

  for (const panel of next.panels || []) {
    const elements = panel.printElements || [];
    panel.printElements = elements.filter((el: any) =>
      evalPrintBool(el?.options?.agreeVisibleWhen, ctx),
    );
    for (const el of panel.printElements) {
      if (el?.printElementType?.type !== 'table') continue;
      const field = el.options?.field;
      if (field === 'houses') {
        el.options.rowsColumnsMerge = createHouseholdMergeFn();
      }
    }
  }

  return { template: next, printData: enriched };
}

/**
 * 生成户名列合并函数（供 hiprint eval 后调用）
 * 回调签名： (data, row, colIndex, rowIndex, tableData, printData)
 */
function createHouseholdMergeFn() {
  return function rowsColumnsMerge(
    _data: unknown,
    row: Record<string, unknown>,
    colIndex: number,
    rowIndex: number,
    tableData: AgreePrintData['houses'],
    printData: AgreePrintData,
  ) {
    if (colIndex !== 0) return [1, 1];
    let list: AgreePrintData['houses'] = [];
    if (tableData && tableData.length > 0) {
      list = tableData;
    } else if (printData?.houses) {
      list = printData.houses;
    }
    const key = String((row && row.householdName) || '');
    let start = rowIndex;
    while (start > 0) {
      const prev = list[start - 1];
      if (String((prev && prev.householdName) || '') !== key) break;
      start -= 1;
    }
    if (start !== rowIndex) return [0, 0];
    let span = 1;
    while (rowIndex + span < list.length) {
      const nextRow = list[rowIndex + span];
      if (String((nextRow && nextRow.householdName) || '') !== key) break;
      span += 1;
    }
    return [span, 1];
  };
}

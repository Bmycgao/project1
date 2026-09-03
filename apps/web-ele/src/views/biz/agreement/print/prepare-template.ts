import type { AgreePrintData } from './types';

import { enrichPrintDataForTemplate } from './enrich-print-data';
import { evalPrintBool } from './print-expr';
import {
  compactPanelFlow,
  ensureDefaultFlowGroups,
  snapshotFlowGroups,
} from './print-flow';
import { applyTablePrintRuntime } from './print-table-runtime';
import { normalizeTemplateWatermark } from './print-watermark';
import { cloneTemplate } from './template-store';

/**
 * 按打印数据做条件裁剪、行过滤、字段计算，并挂上运行时表格合并 / 列格式化
 * 注意：hiprint 内部会对 rowsColumnsMerge、formatter2 做 eval(函数.toString())，不能依赖闭包变量
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
  normalizeTemplateWatermark(next);

  for (const panel of next.panels || []) {
    const elements = panel.printElements || [];
    ensureDefaultFlowGroups(elements);
    const flowSnaps = snapshotFlowGroups(elements);
    panel.printElements = elements.filter((el: any) =>
      evalPrintBool(el?.options?.agreeVisibleWhen, ctx),
    );
    compactPanelFlow(panel, flowSnaps);
    for (const el of panel.printElements) {
      if (el?.printElementType?.type !== 'table') continue;
      applyTablePrintRuntime(el);
    }
  }

  return { template: next, printData: enriched };
}

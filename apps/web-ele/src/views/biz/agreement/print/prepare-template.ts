import type { AgreePrintData } from './types';

import { enrichPrintDataForTemplate } from './enrich-print-data';
import { evalPrintBool } from './print-expr';
import {
  compactPanelFlow,
  ensureDefaultFlowGroups,
  getFlowGroupName,
  snapshotFlowGroups,
} from './print-flow';
import { prepareLongTextSections } from './print-long-text';
import {
  applyAgreeBodyHMergesToPrintData,
  applyTablePrintRuntime,
} from './print-table-runtime';
import { normalizeTemplateWatermark } from './print-watermark';
import { cloneTemplate } from './template-store';

/**
 * 同一个数组可被多个表格复用，但每个表格允许拥有自己的计算列、筛选和合并规则。
 * 正式打印前为重复绑定建立仅运行时使用的数据别名，避免后处理的表格改写前一张表的数据。
 */
function isolateRepeatedTableSources(
  template: Record<string, any>,
  printData: AgreePrintData,
) {
  const counts = new Map<string, number>();
  for (const panel of template.panels || []) {
    for (const el of panel.printElements || []) {
      if (el?.printElementType?.type !== 'table') continue;
      const field = String(el.options?.field || '').trim();
      if (field) counts.set(field, (counts.get(field) || 0) + 1);
    }
  }

  const data = cloneTemplate(printData) as AgreePrintData;
  const bag = data as unknown as Record<string, unknown>;
  for (const [panelIndex, panel] of (template.panels || []).entries()) {
    for (const [elementIndex, el] of (panel.printElements || []).entries()) {
      if (el?.printElementType?.type !== 'table') continue;
      const field = String(el.options?.field || '').trim();
      if (
        !field ||
        (counts.get(field) || 0) < 2 ||
        !Array.isArray(bag[field])
      ) {
        continue;
      }
      const safeField = field.replaceAll(/[^\w]/g, '_');
      const alias = `__agree_table_${panelIndex}_${elementIndex}_${safeField}`;
      bag[alias] = bag[field];
      el.options.field = alias;
    }
  }
  return data;
}

/** 表格续页与重复页眉之间留出的最小空隙（pt）。 */
const TABLE_PAGE_HEADER_GAP_PT = 6;
/** hiprint 默认表头/表体行高；边框会再占不足 1pt，额外留 2pt 余量。 */
const TABLE_MIN_ROW_HEIGHT_PT = 18;
const TABLE_START_SAFETY_PT = 2;

/**
 * 当前页只够塞下表头、却放不下一条完整数据时，hiprint 会输出红色诊断块。
 * 运行时把该业务块及其后续内容整体延到下一页，避免孤立标题和诊断文字。
 */
function deferCrowdedTableStarts(
  panel: Record<string, any>,
  data: Record<string, unknown>,
) {
  const footer = Number(panel.paperFooter) || 0;
  if (footer <= 0) return;
  const elements: Record<string, any>[] = panel.printElements || [];
  const tables = elements
    .filter((el) => el?.printElementType?.type === 'table')
    .toSorted(
      (a, b) => (Number(a.options?.top) || 0) - (Number(b.options?.top) || 0),
    );

  for (const table of tables) {
    const options = table.options || {};
    const top = Number(options.top) || 0;
    if (top >= footer) continue;
    const rows = data[String(options.field || '')];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const columns = Array.isArray(options.columns) ? options.columns : [];
    const headerRows = Math.max(
      1,
      Array.isArray(columns[0]) ? columns.length : 1,
    );
    // 至少容纳表头和两条数据（数据不足两条时取实际行数），避免首尾孤行。
    const minimumBodyRows = Math.min(2, rows.length);
    const minimumStartSpace =
      (headerRows + minimumBodyRows) * TABLE_MIN_ROW_HEIGHT_PT +
      TABLE_START_SAFETY_PT;
    if (footer - top > minimumStartSpace) continue;

    const flowGroup = getFlowGroupName(table);
    const groupMembers = flowGroup
      ? elements.filter((el) => getFlowGroupName(el) === flowGroup)
      : [table];
    const anchorTop = Math.min(
      ...groupMembers.map((el) => Number(el.options?.top) || 0),
    );
    const shift = footer + TABLE_START_SAFETY_PT - anchorTop;
    for (const el of elements) {
      if (!el.options) continue;
      const elTop = Number(el.options.top) || 0;
      if (elTop >= anchorTop - 0.1) el.options.top = elTop + shift;
    }
  }
}

/**
 * 打开某个 panel 的运行时表格分页，并避免续表覆盖坐标位于页眉线之上的元素。
 * hiprint 会把 top < paperHeader 的元素复制到每张续页，因此 paperHeader 至少要
 * 位于这些元素的底部；提升页眉线时，被新纳入页眉区的普通正文只在首页显示。
 */
function enablePanelTablePagination(panel: Record<string, any>) {
  const elements: Record<string, any>[] = panel.printElements || [];
  if (!elements.some((el) => el?.printElementType?.type === 'table')) {
    return;
  }

  const currentHeader = Math.max(0, Number(panel.paperHeader) || 0);
  if (currentHeader > 0) {
    const repeatedHeaderBottom = (() => {
      let bottom = currentHeader;
      for (const el of elements) {
        const options = el?.options || {};
        const top = Number(options.top) || 0;
        const showInPage = String(options.showInPage || '');
        if (
          el?.printElementType?.type === 'table' ||
          top >= currentHeader ||
          showInPage === 'first' ||
          showInPage === 'none'
        ) {
          continue;
        }
        bottom = Math.max(
          bottom,
          top + Math.max(0, Number(options.height) || 0),
        );
      }
      return bottom;
    })();
    const wantedHeader = Math.ceil(
      repeatedHeaderBottom + TABLE_PAGE_HEADER_GAP_PT,
    );
    const footer = Number(panel.paperFooter) || 0;
    const nextHeader =
      footer > 0
        ? Math.min(wantedHeader, Math.max(currentHeader, footer - 18))
        : wantedHeader;

    if (nextHeader > currentHeader) {
      for (const el of elements) {
        const options = el?.options || {};
        const top = Number(options.top) || 0;
        if (
          top >= currentHeader &&
          top < nextHeader &&
          !options.fixed &&
          !options.showInPage &&
          !options.unShowInPage
        ) {
          options.showInPage = 'first';
        }
      }
      panel.paperHeader = nextHeader;
    }
  }

  delete panel.panelPageRule;
}

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
  const next = cloneTemplate(template);
  const isolatedData = isolateRepeatedTableSources(next, printData);
  prepareLongTextSections(
    next,
    isolatedData as unknown as Record<string, unknown>,
  );
  const enriched = enrichPrintDataForTemplate(next, isolatedData);
  const ctx = enriched as unknown as Record<string, unknown>;
  normalizeTemplateWatermark(next);
  /** 模板横合套到真实行，保存后附件一预览才能看到「合并此格」 */
  applyAgreeBodyHMergesToPrintData(next, ctx);

  for (const panel of next.panels || []) {
    const elements = panel.printElements || [];
    ensureDefaultFlowGroups(elements);
    const flowSnaps = snapshotFlowGroups(elements);
    panel.printElements = elements.filter((el: any) =>
      evalPrintBool(el?.options?.agreeVisibleWhen, ctx),
    );
    compactPanelFlow(panel, flowSnaps);
    deferCrowdedTableStarts(panel, ctx);
    /**
     * `panelPageRule = 'none'` 只用于旧 hiprint design() 的稳定性保护；当前设计态
     * 已是自绘画布。正式预览/打印遇到表格时必须恢复引擎默认分页，否则长表会
     * 把单张纸直接撑高，无法按 paperFooter 拆行、重复表头和把表尾放到末页。
     * 无表格的纯手工页仍保留原规则，避免扩大既有模板的自动重排范围。
     */
    enablePanelTablePagination(panel);
    for (const el of panel.printElements) {
      if (el?.printElementType?.type !== 'table') continue;
      applyTablePrintRuntime(el);
    }
  }

  return { template: next, printData: enriched };
}

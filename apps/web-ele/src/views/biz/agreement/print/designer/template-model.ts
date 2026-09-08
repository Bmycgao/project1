/**
 * 打印设计器数据适配层：hiprint 模板 JSON ↔ 自绘编辑态
 *
 * 坐标约定：
 * - panel.width / panel.height 单位为毫米(mm)
 * - 元素 options.left/top/width/height 单位为 hiprint 点(pt)，1pt = 1/72 英寸
 * - 屏幕像素按 96dpi 计算，故 px = pt * 96 / 72
 */
import type { AgreePrintFieldItem } from '../fields';
import type { AgreePrintData } from '../types';

import { formatPrintValue, tableSummaryDecimals } from '../format-print-value';
import { listLeafTableCells } from '../print-element-meta';
import { evalPrintExpr, filterPrintRows } from '../print-expr';
import { mmToPt } from '../print-paper';
import { normalizeAgreeFooters } from '../print-table-footer';
import {
  applyAgreeBodyCellExprsToRows,
  applyAgreeBodyCellMergesToRows,
  applyAgreeBodyHMergesToRows,
  computeRowHColSpans,
} from '../print-table-runtime';
import { cloneTemplate } from '../template-store';

/** hiprint 点(pt) 转屏幕像素(px)，96dpi 下 1pt = 4/3 px */
export const PT_TO_PX = 96 / 72;

/** 纸面内容四周留白（pt），用于越界判断与新建元素落位 */
export const PAGE_MARGIN_PT = 20;

/** 编辑态单个元素引用（面板下标 + 元素下标 + 类型 + options） */
export interface DesignElement {
  panelIndex: number;
  elementIndex: number;
  /** 唯一键：面板-元素 */
  key: string;
  /** text | table | qrcode | barcode | hline | vline | rect | image … */
  type: string;
  /** 是否二维码/条形码（textType） */
  textType?: string;
  options: Record<string, any>;
}

/** 编辑态单页 */
export interface DesignPage {
  panelIndex: number;
  /** 纸宽(mm) */
  widthMm: number;
  /** 纸高(mm) */
  heightMm: number;
  /** 纸宽(px) */
  widthPx: number;
  /** 纸高(px) */
  heightPx: number;
  elements: DesignElement[];
}

/** 字段从数据源拖入纸面后的落点（坐标单位为 pt） */
export interface CanvasFieldDropPayload {
  item: AgreePrintFieldItem;
  left: number;
  panelIndex: number;
  top: number;
}

/** 积木从左侧拖入纸面后的落点（坐标单位为 pt） */
export interface CanvasToolboxDropPayload {
  left: number;
  panelIndex: number;
  tid: string;
  top: number;
}

/** 生成元素唯一键 */
export function elementKey(panelIndex: number, elementIndex: number) {
  return `${panelIndex}:${elementIndex}`;
}

/** 读取面板毫米尺寸（缺省按 A4 竖向） */
function readPanelMm(panel: Record<string, any>) {
  const widthMm = Number(panel?.width) || 210;
  const heightMm = Number(panel?.height) || 297;
  return { widthMm, heightMm };
}

/**
 * 把模板 JSON 解析为「多页 + 元素」的编辑态视图
 * @param template hiprint 模板 JSON
 */
export function readDesignPages(
  template: null | Record<string, any> | undefined,
): DesignPage[] {
  const panels: Record<string, any>[] = template?.panels || [];
  return panels.map((panel, panelIndex) => {
    const { heightMm, widthMm } = readPanelMm(panel);
    const els: DesignElement[] = (panel.printElements || []).map(
      (el: Record<string, any>, elementIndex: number) => ({
        panelIndex,
        elementIndex,
        key: elementKey(panelIndex, elementIndex),
        type: String(el?.printElementType?.type || 'text'),
        textType: el?.options?.textType,
        options: el?.options || {},
      }),
    );
    return {
      panelIndex,
      widthMm,
      heightMm,
      widthPx: mmToPt(widthMm) * PT_TO_PX,
      heightPx: mmToPt(heightMm) * PT_TO_PX,
      elements: els,
    };
  });
}

/** 面板可用高度(pt)：整页高减去上下留白 */
export function usableHeightPt(heightMm: number) {
  return mmToPt(heightMm) - PAGE_MARGIN_PT;
}

/**
 * 越界自动翻页：把 top 落到当前页底部留白以下的元素移到后续页
 * - 逐页从上到下处理，缺页时克隆当前页生成空白页
 * - 移动后按整页内容高度向上平移 top，保证落到下一页对应位置
 * @param template 模板 JSON
 * @returns 处理后的新模板（深拷贝）
 */
export function autoPaginate(
  template: null | Record<string, any> | undefined,
): Record<string, any> {
  const next = cloneTemplate(template || {});
  const panels: Record<string, any>[] = next.panels || [];
  let i = 0;
  while (i < panels.length) {
    const panel = panels[i];
    if (!panel) {
      i += 1;
      continue;
    }
    const heightMm = Number(panel.height) || 297;
    const pageBottom = mmToPt(heightMm) - PAGE_MARGIN_PT;
    const contentH = pageBottom - PAGE_MARGIN_PT;
    const els: Record<string, any>[] = panel.printElements || [];
    // 内容高度过小时不处理，避免死循环
    if (contentH <= 20) {
      i += 1;
      continue;
    }
    const stay: Record<string, any>[] = [];
    const overflow: Record<string, any>[] = [];
    els.forEach((el) => {
      const top = Number(el?.options?.top) || 0;
      if (top >= pageBottom) overflow.push(el);
      else stay.push(el);
    });
    if (overflow.length > 0) {
      panel.printElements = stay;
      // 确保存在下一页（克隆当前页作为空白页，保留纸型/页眉页脚设置）
      if (!panels[i + 1]) {
        const blank = cloneTemplate(panel);
        blank.printElements = [];
        blank.index = i + 1;
        panels.splice(i + 1, 0, blank);
      }
      const target = panels[i + 1];
      if (target) {
        overflow.forEach((el) => {
          const o = (el.options ||= {});
          o.top = Math.max(PAGE_MARGIN_PT, (Number(o.top) || 0) - contentH);
          target.printElements = target.printElements || [];
          target.printElements.push(el);
        });
      }
    }
    i += 1;
  }
  // 重排 index
  panels.forEach((p, idx) => {
    if (p) p.index = idx;
  });
  next.panels = panels;
  return next;
}

/** 面板可用宽度(pt) */
export function usableWidthPt(widthMm: number) {
  return mmToPt(widthMm) - PAGE_MARGIN_PT;
}

/**
 * 等比缩放表格各列宽，使表格适配目标宽度
 * @param options 表格 options（含 columns）
 * @param targetWidthPt 目标表宽(pt)
 */
export function fitTableColumnsWidth(
  options: Record<string, any>,
  targetWidthPt: number,
) {
  const cols: Record<string, any>[][] = Array.isArray(options?.columns)
    ? options.columns
    : [];
  if (cols.length === 0) {
    options.width = Math.round(targetWidthPt);
    return;
  }
  // 以叶子列宽之和为基准算缩放系数
  const leaves = listLeafTableCells(cols);
  const sum =
    leaves.reduce((acc, c) => acc + (Number(c.width) || 0), 0) ||
    Number(options.width) ||
    targetWidthPt;
  const factor = targetWidthPt / sum;
  cols.forEach((row) =>
    (row || []).forEach((cell) => {
      const w = Number(cell?.width) || 0;
      if (cell && w > 0) cell.width = Math.max(12, Math.round(w * factor));
    }),
  );
  options.width = Math.round(targetWidthPt);
}

/**
 * 把单个元素收进纸张可用宽度内（横向）
 * - 先夹 left 到可用区，再把超出右缘的宽度收回；表格按列等比缩放
 * @param el 元素节点（含 printElementType / options）
 * @param widthMm 纸宽mm
 */
export function fitElementIntoPaper(el: Record<string, any>, widthMm: number) {
  const o = (el.options ||= {});
  const type = String(el?.printElementType?.type || '');
  const usableRight = mmToPt(widthMm) - PAGE_MARGIN_PT;
  let left = Number(o.left) || 0;
  const width = Number(o.width) || 0;
  // 夹 left：不小于 0，且给右侧至少留 20pt 可用
  if (left < 0) left = 0;
  if (left > usableRight - 20) left = Math.max(0, usableRight - 20);
  // 右缘越界 → 收回宽度
  if (left + width > usableRight) {
    const newW = Math.max(20, Math.round(usableRight - left));
    if (type === 'table') fitTableColumnsWidth(o, newW);
    else o.width = newW;
  }
  o.left = Math.round(left);
}

/**
 * 一键把所有越界元素收进纸张：横向收宽 + 纵向自动翻页
 * @param template 模板 JSON
 * @returns 处理后的新模板（深拷贝）
 */
export function fitTemplateIntoPaper(
  template: null | Record<string, any> | undefined,
): Record<string, any> {
  const next = cloneTemplate(template || {});
  (next.panels || []).forEach((panel: Record<string, any>) => {
    const widthMm = Number(panel.width) || 210;
    (panel.printElements || []).forEach((el: Record<string, any>) =>
      fitElementIntoPaper(el, widthMm),
    );
  });
  return autoPaginate(next);
}

/**
 * 判断元素是否越出纸面底部/右侧（用于红框提示）
 * @param options 元素 options
 * @param widthMm 纸宽mm
 * @param heightMm 纸高mm
 */
export function isElementOverflow(
  options: Record<string, any>,
  widthMm: number,
  heightMm: number,
) {
  const left = Number(options?.left) || 0;
  const top = Number(options?.top) || 0;
  const width = Number(options?.width) || 0;
  const height = Number(options?.height) || 0;
  const overRight = left + width > mmToPt(widthMm) + 1;
  const overBottom = top + height > mmToPt(heightMm) + 1;
  return overRight || overBottom;
}

/**
 * 解析文本类元素在设计器里显示的值
 * @param options 元素 options
 * @param sample 样例数据
 */
export function resolveTextPreview(
  options: Record<string, any>,
  sample: AgreePrintData | null | undefined,
): string {
  const field = String(options?.field || '');
  const ctx = (sample || {}) as Record<string, unknown>;
  let value: unknown;
  if (String(options?.agreeValueExpr || '').trim()) {
    value = evalPrintExpr(String(options.agreeValueExpr), ctx, {
      silent: true,
    });
  } else if (field && Object.prototype.hasOwnProperty.call(ctx, field)) {
    value = ctx[field];
  } else {
    value = options?.testData;
  }
  if (value !== null && typeof value === 'object') return '';
  return formatPrintValue(value, String(options?.agreeFormat || ''), ctx);
}

/** 设计态表体单元格，语义与正式 hiprint 运行时一致 */
export interface TablePreviewCell {
  align: string;
  colIndex: number;
  colspan: number;
  field: string;
  hidden: boolean;
  rawRow: Record<string, unknown>;
  rowIndex: number;
  rowspan: number;
  text: string;
}

/** 设计态表尾单元格 */
export interface TablePreviewFooterCell {
  align: string;
  cellIndex: number;
  colspan: number;
  field: string;
  rowIndex: number;
  text: string;
}

/** 表格设计态渲染模型 */
export interface TablePreviewModel {
  /** 过滤后的总行数（渲染可被 maxRows 截断） */
  filteredRowCount: number;
  /** 表尾结构 */
  footerRows: TablePreviewFooterCell[][];
  /** 原始表头行（支持多级表头 colspan/rowspan） */
  headerRows: Record<string, any>[][];
  /** 叶子列（决定表体列） */
  leafCols: { align: string; field: string; title: string; width: number }[];
  /** 表体样例行（最多若干行，含 rowspan / colspan） */
  bodyRows: TablePreviewCell[][];
  /** 筛选前总行数 */
  sourceRowCount: number;
}

/** 根据表格设计高度估算画布可展示的表体行数，避免固定 3 行与正式预览脱节。 */
export function tablePreviewRowLimit(options: Record<string, any>) {
  const headerRows = Array.isArray(options?.columns)
    ? Math.max(1, options.columns.filter(Array.isArray).length)
    : 1;
  /** 画布表格每行约 15pt（12px 字号 + 上下 padding + 边框） */
  const height = Math.max(30, Number(options?.height) || 72);
  return Math.max(1, Math.floor(height / 15) - headerRows);
}

function computePreviewRowSpans(
  rows: Record<string, unknown>[],
  fields: string[],
  mergeSame: boolean[],
  horizontalSpans: number[][],
) {
  const spans = rows.map(() => fields.map(() => 1));
  for (let ci = 0; ci < fields.length; ci += 1) {
    if (!mergeSame[ci]) continue;
    let ri = 0;
    while (ri < rows.length) {
      if ((horizontalSpans[ri]?.[ci] ?? 1) !== 1) {
        ri += 1;
        continue;
      }
      const key = String(rows[ri]?.[fields[ci] || ''] ?? '').trim();
      if (!key) {
        ri += 1;
        continue;
      }
      let end = ri + 1;
      while (
        end < rows.length &&
        (horizontalSpans[end]?.[ci] ?? 1) === 1 &&
        String(rows[end]?.[fields[ci] || ''] ?? '').trim() === key
      ) {
        end += 1;
      }
      const startSpans = spans[ri];
      if (startSpans) startSpans[ci] = end - ri;
      for (let i = ri + 1; i < end; i += 1) {
        const hideSpans = spans[i];
        if (hideSpans) hideSpans[ci] = 0;
      }
      ri = end;
    }
  }
  return spans;
}

/**
 * 解析表格元素为设计态渲染模型
 * @param options 表格 options（含 columns / field）
 * @param sample 样例数据
 * @param maxRows 表体最多展示行数
 * @param runtime rowsPrepared=true 表示数据已经过 preparePrintTemplate 计算和筛选
 */
export function resolveTablePreview(
  options: Record<string, any>,
  sample: AgreePrintData | null | undefined,
  maxRows = 3,
  runtime?: { rowsPrepared?: boolean },
): TablePreviewModel {
  const columns: Record<string, any>[][] = Array.isArray(options?.columns)
    ? options.columns
    : [];
  // 表头：逐行渲染原始单元格，隐藏 checked===false 的叶子列
  const headerRows = columns.map((row) =>
    (row || []).filter((c) => c && c.checked !== false),
  );
  const leaves = listLeafTableCells(columns);
  const leafCols = leaves.map((c) => ({
    field: c.field,
    title: c.title,
    width: Number(c.width) || 80,
    align: c.align || 'left',
  }));
  const src = (sample as Record<string, any>)?.[String(options?.field || '')];
  const sourceRows: Record<string, unknown>[] = Array.isArray(src)
    ? src.map((row) => ({ ...row }))
    : [];
  const rootCtx = (sample || {}) as Record<string, unknown>;
  let computedRows = sourceRows;
  if (!runtime?.rowsPrepared) {
    computedRows = sourceRows.map((row, rowIndex) => {
      const patched = { ...row };
      leaves.forEach((col) => {
        if (!col.field || !col.agreeColExpr) return;
        patched[col.field] = evalPrintExpr(
          col.agreeColExpr,
          {
            ...rootCtx,
            ...patched,
            i: rowIndex,
            index: rowIndex,
            row: patched,
          },
          { silent: true },
        );
      });
      return patched;
    });
    computedRows = applyAgreeBodyCellExprsToRows(
      computedRows,
      options?.agreeBodyCellExprs,
      leaves.map((col) => col.field),
      rootCtx,
    );
    computedRows = filterPrintRows(
      computedRows,
      String(options?.agreeRowFilter || ''),
      rootCtx,
      { silent: true },
    );
  }
  computedRows = applyAgreeBodyHMergesToRows(
    computedRows,
    options?.agreeBodyHMerges,
    leaves.length,
  );
  computedRows = applyAgreeBodyCellMergesToRows(
    computedRows,
    options?.agreeBodyCellMerges,
    leaves.length,
  );
  const filteredRowCount = computedRows.length;
  const rows = computedRows.slice(0, maxRows);
  const fields = leaves.map((col) => col.field);
  const horizontalSpans = rows.map((row) =>
    computeRowHColSpans(
      row,
      fields,
      leaves.map((col) => col.agreeHMergeEmpty),
      leaves.map((col) => col.agreeHideZero),
    ),
  );
  const explicitMerges = rows.map((row) =>
    Array.isArray(row.agreeCellMerges)
      ? (row.agreeCellMerges as ([number, number] | null)[])
      : [],
  );
  const verticalGuardSpans = horizontalSpans.map((spans, rowIndex) =>
    spans.map((span, colIndex) =>
      explicitMerges[rowIndex]?.[colIndex] ? 0 : span,
    ),
  );
  const verticalSpans = computePreviewRowSpans(
    rows,
    fields,
    leaves.map((col) => col.agreeMergeSame),
    verticalGuardSpans,
  );
  const bodyRows = rows.map((row, rowIndex) =>
    leaves.map((col, colIndex): TablePreviewCell => {
      const explicit = explicitMerges[rowIndex]?.[colIndex];
      const colspan =
        explicit?.[1] ?? horizontalSpans[rowIndex]?.[colIndex] ?? 1;
      const rowspan = explicit?.[0] ?? verticalSpans[rowIndex]?.[colIndex] ?? 1;
      const value = row[col.field];
      const hideZero =
        col.agreeHideZero &&
        String(value ?? '').trim() !== '' &&
        Number(value) === 0;
      return {
        align: col.align,
        colIndex,
        colspan,
        field: col.field,
        hidden: colspan === 0 || rowspan === 0,
        rawRow: row,
        rowIndex,
        rowspan,
        text: hideZero
          ? ''
          : formatPrintValue(value, col.agreeColFormat, rootCtx),
      };
    }),
  );
  // 无数据时给一行占位，避免设计态表格塌陷看不出结构
  if (bodyRows.length === 0 && leafCols.length > 0) {
    bodyRows.push(
      leafCols.map((col, colIndex) => ({
        align: col.align,
        colIndex,
        colspan: 1,
        field: col.field,
        hidden: false,
        rawRow: {},
        rowIndex: -1,
        rowspan: 1,
        text: '',
      })),
    );
  }
  const summaryRow: TablePreviewFooterCell[] = leaves.some(
    (col) => col.tableSummary,
  )
    ? leaves.map((col, cellIndex) => {
        if (!col.tableSummary) {
          return {
            align: col.align || 'left',
            cellIndex,
            colspan: 1,
            field: '',
            rowIndex: 0,
            text: '',
          };
        }
        let total = 0;
        for (const row of computedRows) {
          const value = Number(row[col.field]);
          if (Number.isFinite(value)) total += value;
        }
        // hiprint 内部以 `numFormat || 2` 处理汇总小数位，因此 integer / money0
        // 的 0 也会回退为 2。画布遵循其实际输出，避免设计态与打印态不一致。
        const decimals = tableSummaryDecimals(col.agreeColFormat) || 2;
        return {
          align: col.align || 'right',
          cellIndex,
          colspan: 1,
          field: '',
          rowIndex: 0,
          text: `合计:${total.toFixed(decimals)}`,
        };
      })
    : [];
  const customFooterRows = normalizeAgreeFooters(
    options?.agreeFooters,
    leaves.length,
  ).map((row, rowIndex) =>
    row.cells.map((cell, cellIndex) => ({
      align: cell.align || 'left',
      cellIndex,
      colspan: cell.colspan,
      field: String(cell.field || ''),
      rowIndex,
      text:
        cell.field && rootCtx[cell.field] !== undefined
          ? String(rootCtx[cell.field] ?? '')
          : String(cell.text || ''),
    })),
  );
  const footerRows = [
    ...(summaryRow.length > 0 ? [summaryRow] : []),
    ...customFooterRows.map((row) =>
      row.map((cell) => ({
        ...cell,
        rowIndex: cell.rowIndex + (summaryRow.length > 0 ? 1 : 0),
      })),
    ),
  ];
  return {
    bodyRows,
    filteredRowCount,
    footerRows,
    headerRows,
    leafCols,
    sourceRowCount: sourceRows.length,
  };
}

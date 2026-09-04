import type { AgreeFooterRow } from './print-table-footer';
/**
 * 设计器画布：在表格元素高度内滚动显示样例表体 + 表尾（不写进 getJson）
 * - 点表体列：选中列（相同值合并）
 * - 双击表体列：切换 agreeMergeSame
 * - 点表尾格：选中表尾格子（结构 colspan）
 */
import type { AgreePrintData } from './types';

import { formatPrintValue } from './format-print-value';
import { listLeafTableCells } from './print-element-meta';
import { filterPrintRows } from './print-expr';
import { normalizeAgreeFooters } from './print-table-footer';

/** 画布滚动区内最多渲染的样例行，避免 DOM 过大 */
export const DESIGN_TABLE_BODY_MAX_ROWS = 20;
/** 数据行下方的虚线空行，提示表格高度还有余量 */
const PLACEHOLDER_ROW_COUNT = 2;

const OVERLAY_CLASS = 'agree-print-design-body-overlay';

/** 画布列高亮：必须带表身份，避免多表同列下标一起亮 */
export type CanvasHighlightCol = {
  colIndex: number;
  elementIndex: number;
  panelIndex: number;
};

/** 当前选中的表格（外圈高亮） */
export type CanvasActiveTable = {
  elementIndex: number;
  panelIndex: number;
};

type PrintEl = {
  options?: Record<string, any>;
  printElementType?: { type?: string };
};

/** 画布表体交互回调 */
export type CanvasTableBodyHandlers = {
  /** 当前选中表，用于外圈提示 */
  activeTable?: CanvasActiveTable | null;
  /** 当前高亮列（含表身份） */
  highlightCol?: CanvasHighlightCol | null;
  /** 当前高亮表尾：panel/el/row/cell */
  highlightFooter?: null | {
    cellIndex: number;
    elementIndex: number;
    panelIndex: number;
    rowIndex: number;
  };
  /** 表尾多选终点（与 highlightFooter 组成区间） */
  highlightFooterEnd?: null | {
    cellIndex: number;
    elementIndex: number;
    panelIndex: number;
    rowIndex: number;
  };
  /** 单击表体列 */
  onBodyColumnClick?: (payload: {
    colIndex: number;
    elementIndex: number;
    field: string;
    panelIndex: number;
  }) => void;
  /** 双击表体列：切换相同值合并 */
  onBodyColumnDblClick?: (payload: {
    colIndex: number;
    elementIndex: number;
    field: string;
    panelIndex: number;
  }) => void;
  /** 单击表尾格 */
  onFooterCellClick?: (payload: {
    cellIndex: number;
    elementIndex: number;
    panelIndex: number;
    rowIndex: number;
    shiftKey: boolean;
  }) => void;
};

type TableMatch = {
  el: PrintEl;
  elementIndex: number;
  panelIndex: number;
};

/**
 * 转义单元格文本，避免样例里的 < 破坏 DOM
 * @param raw 展示字符串
 */
function escapeHtml(raw: string) {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * 读 hiprint 元素的 left/top（pt 或 px）
 * @param el 纸面 DOM
 * @param prop left / top
 */
function styleLen(el: HTMLElement, prop: 'left' | 'top') {
  const n = Number.parseFloat(el.style[prop] || '');
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * 列出模板里的表格元素及 panel/element 下标
 * @param template 当前内存模板
 */
function listTemplateTables(template: Record<string, any>): TableMatch[] {
  const out: TableMatch[] = [];
  (template.panels || []).forEach((panel: any, panelIndex: number) => {
    (panel.printElements || []).forEach((el: PrintEl, elementIndex: number) => {
      if (el?.printElementType?.type === 'table') {
        out.push({ el, panelIndex, elementIndex });
      }
    });
  });
  return out;
}

/**
 * 按坐标把画布表格对上 JSON；对不上则按下标配对
 * @param node 画布上的表格纸面元素
 * @param tables 模板表格
 * @param index 文档顺序
 */
function matchTableEl(node: HTMLElement, tables: TableMatch[], index: number) {
  const left = styleLen(node, 'left');
  const top = styleLen(node, 'top');
  if (Number.isFinite(left) && Number.isFinite(top)) {
    const hit = tables.find((t) => {
      const ol = Number(t.el.options?.left) || 0;
      const ot = Number(t.el.options?.top) || 0;
      return Math.abs(ol - left) < 2 && Math.abs(ot - top) < 2;
    });
    if (hit) return hit;
  }
  return tables[index];
}

/**
 * 一格展示文本：隐零 + 列格式
 * @param row 样例行
 * @param field 列 field
 * @param format agreeColFormat
 * @param hideZero 零不印
 */
function cellDisplay(
  row: Record<string, unknown>,
  field: string,
  format: string,
  hideZero: boolean,
) {
  if (!field) return '';
  const value = row[field];
  if (hideZero) {
    if (typeof value === 'number' && value === 0) return '';
    if (String(value ?? '').trim() !== '' && Number(value) === 0) return '';
  }
  if (value === null || value === undefined) return '';
  return formatPrintValue(value, format);
}

/**
 * 从样例里取出该表要画的行
 * @param el 表格 JSON
 * @param sample 设计器样例 printData
 */
function sampleRowsForTable(
  el: PrintEl,
  sample: AgreePrintData,
): Record<string, unknown>[] {
  const field = String(el.options?.field || '').trim();
  if (!field) return [];
  const raw = (sample as unknown as Record<string, unknown>)[field];
  const list = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  const filtered = filterPrintRows(
    list,
    String(el.options?.agreeRowFilter || ''),
    sample as unknown as Record<string, unknown>,
    { silent: true },
  );
  return filtered.slice(0, DESIGN_TABLE_BODY_MAX_ROWS);
}

/**
 * 计算某列相同值合并的 rowspan（与打印运行时规则一致）
 * @param rows 样例行
 * @param field 列 field
 * @param merge 是否开相同值合并
 */
function computeRowSpans(
  rows: Record<string, unknown>[],
  field: string,
  merge: boolean,
): number[] {
  const spans = rows.map(() => 1);
  if (!merge || !field) return spans;
  let i = 0;
  while (i < rows.length) {
    const key = String(rows[i]?.[field] ?? '').trim();
    if (!key) {
      spans[i] = 1;
      i += 1;
      continue;
    }
    let span = 1;
    while (i + span < rows.length) {
      const next = String(rows[i + span]?.[field] ?? '').trim();
      if (next !== key) break;
      span += 1;
    }
    spans[i] = span;
    for (let k = 1; k < span; k += 1) spans[i + k] = 0;
    i += span;
  }
  return spans;
}

/**
 * 判断高亮是否属于当前这张表
 * @param loc 列或表身份
 * @param match 当前铺的表
 */
function isSameCanvasTable(
  loc: null | undefined | { elementIndex: number; panelIndex: number },
  match: TableMatch,
) {
  return Boolean(
    loc &&
    loc.panelIndex === match.panelIndex &&
    loc.elementIndex === match.elementIndex,
  );
}

/**
 * 按纸面表头占位还原叶子列宽（兼容 rowspan/colspan 多行表头）
 * @param node 表格纸面元素
 * @param leafCount 叶子列数
 */
function measureTableLeafWidths(node: HTMLElement, leafCount: number) {
  if (leafCount <= 0) return [];
  const target = node.querySelector(
    '.hiprint-printElement-tableTarget',
  ) as HTMLElement | null;
  if (!target) return [];
  const fromHead = widthsFromThead(target, leafCount);
  if (fromHead.length === leafCount && fromHead.every((w) => w > 0)) {
    return fromHead;
  }
  const cols = [...target.querySelectorAll<HTMLElement>('col')];
  if (cols.length === leafCount) {
    return cols.map((c) => {
      const w = Number.parseFloat(c.style.width || '');
      return Number.isFinite(w) && w > 0 ? w : Math.max(12, c.offsetWidth || 0);
    });
  }
  return [];
}

/**
 * 遍历 thead 占位网格，取每列最底层单元格宽度
 * @param target hiprint 表
 * @param leafCount 叶子列数
 */
function widthsFromThead(target: HTMLElement, leafCount: number) {
  const rows = [...target.querySelectorAll('thead tr')];
  if (rows.length === 0) return [];
  const taken = rows.map(() => Array.from({ length: leafCount }, () => false));
  const leafCell: (HTMLElement | null)[] = Array.from(
    { length: leafCount },
    () => null,
  );
  const leafSpan = Array.from({ length: leafCount }, () => 1);

  rows.forEach((tr, ri) => {
    const cells = [...tr.querySelectorAll<HTMLTableCellElement>('td, th')];
    let ci = 0;
    cells.forEach((cell) => {
      while (ci < leafCount && taken[ri]?.[ci]) ci += 1;
      const cs = Math.max(1, cell.colSpan || 1);
      const rs = Math.max(1, cell.rowSpan || 1);
      for (let r = 0; r < rs && ri + r < rows.length; r += 1) {
        const rowTaken = taken[ri + r];
        if (!rowTaken) continue;
        for (let c = 0; c < cs && ci + c < leafCount; c += 1) {
          rowTaken[ci + c] = true;
        }
      }
      for (let c = 0; c < cs && ci + c < leafCount; c += 1) {
        leafCell[ci + c] = cell;
        leafSpan[ci + c] = cs;
      }
      ci += cs;
    });
  });

  return Array.from({ length: leafCount }, (_v, i) => {
    const cell = leafCell[i];
    if (!cell) return 0;
    const span = Math.max(1, leafSpan[i] || 1);
    return Math.max(12, Math.round((cell.offsetWidth || 0) / span));
  });
}

/**
 * 数据行下方的虚线空行 HTML
 * @param colCount 叶子列数
 * @param startRow 网格起始行（1-based）
 */
function placeholderBodyHtml(colCount: number, startRow: number) {
  let html = '';
  for (let r = 0; r < PLACEHOLDER_ROW_COUNT; r += 1) {
    for (let ci = 0; ci < colCount; ci += 1) {
      html += `<div class="agree-print-design-cell is-placeholder" style="grid-column:${ci + 1};grid-row:${startRow + r}">&nbsp;</div>`;
    }
  }
  return html;
}

/**
 * 生成示意表体 + 表尾 HTML（不用 table/tbody/tfoot，防止污染 hiprint 表格引擎）
 * @param match 表格匹配
 * @param rows 样例行
 * @param sample 完整样例（表尾 field）
 * @param handlers 高亮状态
 * @param colWidths 表头实测列宽，空则用 JSON width
 */
function overlayHtml(
  match: TableMatch,
  rows: Record<string, unknown>[],
  sample: AgreePrintData,
  handlers: CanvasTableBodyHandlers | undefined,
  colWidths: number[],
) {
  const el = match.el;
  const leaves = listLeafTableCells(el.options?.columns);
  if (leaves.length === 0) return '';
  const colTemplate =
    colWidths.length === leaves.length
      ? colWidths.map((w) => `${Math.max(12, Math.round(w))}px`).join(' ')
      : leaves.map((c) => `${Math.max(24, Number(c.width) || 80)}fr`).join(' ');
  const field = String(el.options?.field || '').trim();
  const hl = handlers?.highlightCol;
  const hlCol =
    isSameCanvasTable(hl, match) && hl && hl.colIndex >= 0 ? hl.colIndex : -1;

  const colSpans = leaves.map((c) =>
    computeRowSpans(rows, c.field, Boolean(c.agreeMergeSame)),
  );

  let body: string;
  let nextRow: number;
  if (!field) {
    body = leaves
      .map(
        (c, ci) =>
          `<div data-agree-col="${ci}" class="agree-print-design-cell ${hlCol === ci ? 'is-col-selected' : ''}" style="grid-column:${ci + 1};grid-row:1;text-align:${c.align || 'left'}">未绑定</div>`,
      )
      .join('');
    nextRow = 2;
  } else if (rows.length === 0) {
    body = `<div class="agree-print-design-cell is-empty" style="grid-column:1 / -1;grid-row:1">无样例行</div>`;
    nextRow = 2;
  } else {
    body = rows
      .map((row, ri) =>
        leaves
          .map((c, ci) => {
            const span = colSpans[ci]?.[ri] ?? 1;
            if (span === 0) return '';
            const text =
              c.field === 'index' &&
              (row.index === undefined || row.index === '')
                ? String(ri + 1)
                : cellDisplay(
                    row,
                    c.field,
                    String(c.agreeColFormat || ''),
                    Boolean(c.agreeHideZero),
                  );
            const cls = [
              'agree-print-design-cell',
              hlCol === ci ? 'is-col-selected' : '',
              span > 1 ? 'is-merge-col' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return `<div data-agree-col="${ci}" data-agree-field="${escapeHtml(c.field)}" class="${cls}" style="grid-column:${ci + 1};grid-row:${ri + 1} / span ${span};text-align:${c.align || 'left'}">${escapeHtml(text)}</div>`;
          })
          .join(''),
      )
      .join('');
    nextRow = rows.length + 1;
  }
  body += placeholderBodyHtml(leaves.length, nextRow);

  const footers = normalizeAgreeFooters(
    el.options?.agreeFooters as AgreeFooterRow[] | undefined,
    leaves.length,
  );
  let foot = '';
  if (footers.length > 0) {
    const hf = handlers?.highlightFooter;
    const he = handlers?.highlightFooterEnd;
    const sameTable =
      hf &&
      hf.panelIndex === match.panelIndex &&
      hf.elementIndex === match.elementIndex;
    foot = footers
      .map((row, ri) => {
        let colCursor = 1;
        const cells = row.cells
          .map((c, ci) => {
            let selected = false;
            if (sameTable && hf && hf.rowIndex === ri) {
              const endCi =
                he &&
                he.panelIndex === match.panelIndex &&
                he.elementIndex === match.elementIndex &&
                he.rowIndex === ri
                  ? he.cellIndex
                  : hf.cellIndex;
              const a = Math.min(hf.cellIndex, endCi);
              const b = Math.max(hf.cellIndex, endCi);
              selected = ci >= a && ci <= b;
            }
            let text = String(c.text ?? '');
            const f = String(c.field ?? '').trim();
            if (f) {
              const v = (sample as unknown as Record<string, unknown>)[f];
              if (v !== undefined && v !== null) text = String(v);
            }
            const cls = [
              'agree-print-design-cell',
              'is-footer',
              selected ? 'is-footer-selected' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const span = Math.max(1, Number(c.colspan) || 1);
            const start = colCursor;
            colCursor += span;
            return `<div data-agree-footer-row="${ri}" data-agree-footer-cell="${ci}" class="${cls}" style="grid-column:${start} / span ${span};text-align:${c.align || 'left'}">${escapeHtml(text) || '&nbsp;'}</div>`;
          })
          .join('');
        return `<div class="agree-print-design-foot-row" style="grid-template-columns:${colTemplate}">${cells}</div>`;
      })
      .join('');
  }

  return `<div class="agree-print-design-grid" data-agree-panel="${match.panelIndex}" data-agree-el="${match.elementIndex}"><div class="agree-print-design-body" style="grid-template-columns:${colTemplate}">${body}</div>${foot}</div>`;
}

/**
 * 拆掉画布表体覆盖层，避免 hiprint getJson / 重挂时扫到我们的 DOM
 * @param host #agree-print-design-canvas
 */
export function clearCanvasTableBodies(host: HTMLElement | null) {
  host?.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((n) => n.remove());
}

/**
 * 在画布每张表的表头下铺样例表体（覆盖层，不改 hiprint tbody）
 * @param host #agree-print-design-canvas
 * @param template 内存模板
 * @param sample 样例 printData
 * @param handlers 交互与高亮
 */
export function fillCanvasTableBodies(
  host: HTMLElement | null,
  template: null | Record<string, any>,
  sample: AgreePrintData,
  handlers?: CanvasTableBodyHandlers,
) {
  if (!host || !template?.panels) return;
  clearCanvasTableBodies(host);

  const tables = listTemplateTables(template);
  const nodes = [
    ...host.querySelectorAll<HTMLElement>('.hiprint-printElement-table'),
  ];
  nodes.forEach((node, index) => {
    const match = matchTableEl(node, tables, index);
    if (!match) return;
    const thead =
      node.querySelector('.hiprint-printElement-tableTarget thead') ||
      node.querySelector('thead');
    const headH = thead instanceof HTMLElement ? thead.offsetHeight : 18;
    const boxH = node.clientHeight || 0;
    const bodyH = Math.max(20, boxH - headH);
    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    if (isSameCanvasTable(handlers?.activeTable, match)) {
      overlay.classList.add('is-table-active');
    }
    overlay.style.top = `${headH}px`;
    overlay.style.height = `${bodyH}px`;
    overlay.innerHTML = overlayHtml(
      match,
      sampleRowsForTable(match.el, sample),
      sample,
      handlers,
      measureTableLeafWidths(
        node,
        listLeafTableCells(match.el.options?.columns).length,
      ),
    );
    overlay.title =
      '单击列选中；双击切换「相同值合并」。表尾格可点选后右侧合并/拆分。空白处可拖动表格';
    overlay.addEventListener(
      'wheel',
      (ev) => {
        ev.stopPropagation();
      },
      { passive: true },
    );
    overlay.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      const footerTd = target.closest(
        '[data-agree-footer-cell]',
      ) as HTMLElement | null;
      const bodyTd = target.closest('[data-agree-col]') as HTMLElement | null;
      if (!footerTd && !bodyTd) return;
      ev.stopPropagation();
      if (footerTd) {
        const grid = footerTd.closest('[data-agree-panel]');
        const panelIndex = Number(
          (grid as HTMLElement | null)?.dataset.agreePanel,
        );
        const elementIndex = Number(
          (grid as HTMLElement | null)?.dataset.agreeEl,
        );
        const rowIndex = Number(footerTd.dataset.agreeFooterRow);
        const cellIndex = Number(footerTd.dataset.agreeFooterCell);
        if (
          Number.isFinite(panelIndex) &&
          Number.isFinite(elementIndex) &&
          Number.isFinite(rowIndex) &&
          Number.isFinite(cellIndex)
        ) {
          handlers?.onFooterCellClick?.({
            panelIndex,
            elementIndex,
            rowIndex,
            cellIndex,
            shiftKey: ev.shiftKey,
          });
        }
        return;
      }
      if (!bodyTd) return;
      const grid = bodyTd.closest('[data-agree-panel]');
      const panelIndex = Number(
        (grid as HTMLElement | null)?.dataset.agreePanel,
      );
      const elementIndex = Number(
        (grid as HTMLElement | null)?.dataset.agreeEl,
      );
      const colIndex = Number(bodyTd.dataset.agreeCol);
      const field = String(bodyTd.dataset.agreeField || '');
      if (
        !Number.isFinite(panelIndex) ||
        !Number.isFinite(elementIndex) ||
        !Number.isFinite(colIndex)
      ) {
        return;
      }
      handlers?.onBodyColumnClick?.({
        panelIndex,
        elementIndex,
        colIndex,
        field,
      });
    });
    overlay.addEventListener('dblclick', (ev) => {
      const target = ev.target as HTMLElement | null;
      const bodyTd = target?.closest('[data-agree-col]') as HTMLElement | null;
      if (!bodyTd) return;
      ev.preventDefault();
      ev.stopPropagation();
      const grid = bodyTd.closest('[data-agree-panel]');
      const panelIndex = Number(
        (grid as HTMLElement | null)?.dataset.agreePanel,
      );
      const elementIndex = Number(
        (grid as HTMLElement | null)?.dataset.agreeEl,
      );
      const colIndex = Number(bodyTd.dataset.agreeCol);
      const field = String(bodyTd.dataset.agreeField || '');
      if (
        !Number.isFinite(panelIndex) ||
        !Number.isFinite(elementIndex) ||
        !Number.isFinite(colIndex)
      ) {
        return;
      }
      handlers?.onBodyColumnDblClick?.({
        panelIndex,
        elementIndex,
        colIndex,
        field,
      });
    });
    node.append(overlay);
  });
}

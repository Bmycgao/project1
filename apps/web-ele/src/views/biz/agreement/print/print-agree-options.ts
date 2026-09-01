/**
 * hiprint getJson 只会序列化内置 options，agree* 业务字段需要从上一份 JSON 合并回去
 */
import { cloneTemplate } from './template-store';

/** 打印前处理用的扩展字段（引擎不认识） */
export const AGREE_PRINT_CUSTOM_KEYS = [
  'agreeRowFilter',
  'agreeVisibleWhen',
  'agreeValueExpr',
  'agreeFormat',
] as const;

type PrintEl = {
  options?: Record<string, any>;
  printElementType?: { type?: string };
};

/**
 * 两份模板按「类型 + 字段 + 位置」对齐后，把自定义字段写回画布 JSON
 * @param canvas getJson 结果
 * @param memory 合并前内存中的完整模板
 */
export function mergeAgreeCustomOptions(
  canvas: Record<string, any>,
  memory?: null | Record<string, any>,
): Record<string, any> {
  if (!canvas?.panels?.length || !memory?.panels?.length) return canvas;
  const panels = canvas.panels as Record<string, any>[];
  panels.forEach((panel, pi) => {
    const canvasEls = (panel.printElements || []) as PrintEl[];
    const memEls = (memory.panels[pi]?.printElements || []) as PrintEl[];
    if (canvasEls.length === 0 || memEls.length === 0) return;
    const used = new Set<number>();
    canvasEls.forEach((el) => {
      const idx = bestMemoryMatch(el, memEls, used);
      if (idx < 0) return;
      used.add(idx);
      const memEl = memEls[idx];
      if (memEl) copyCustomOptions(el, memEl);
    });
  });
  return canvas;
}

/**
 * 找最像的内存元素下标；对不上则返回 -1
 * @param canvasEl 画布元素
 * @param memEls 同页内存元素
 * @param used 已占用下标
 */
function bestMemoryMatch(
  canvasEl: PrintEl,
  memEls: PrintEl[],
  used: Set<number>,
): number {
  const type = String(canvasEl.printElementType?.type || '');
  const o = canvasEl.options || {};
  let best = -1;
  let bestScore = -Infinity;
  memEls.forEach((mem, i) => {
    if (used.has(i)) return;
    if (String(mem.printElementType?.type || '') !== type) return;
    const mo = mem.options || {};
    let score = 0;
    if (o.field && mo.field && o.field === mo.field) score += 100;
    else if (o.field || mo.field) score -= 25;
    if (String(o.title || '') === String(mo.title || '')) score += 30;
    const dx = Math.abs(Number(o.left || 0) - Number(mo.left || 0));
    const dy = Math.abs(Number(o.top || 0) - Number(mo.top || 0));
    score -= (dx + dy) / 10;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return bestScore >= 20 ? best : -1;
}

/**
 * 复制 agree* 以及列上的 agreeColExpr
 * @param target 画布元素
 * @param source 内存元素
 */
function copyCustomOptions(target: PrintEl, source: PrintEl) {
  const to = target.options || (target.options = {});
  const from = source.options || {};
  for (const key of AGREE_PRINT_CUSTOM_KEYS) {
    if (from[key] !== undefined && from[key] !== '') {
      to[key] = from[key];
    }
  }
  if (from.columns && to.columns) {
    mergeColumnAgreeExpr(to.columns, from.columns);
  }
}

/**
 * 按 field 把列上的 agreeColExpr 写回（getJson 会丢掉）
 * @param targetCols hiprint 二维 columns
 * @param sourceCols 内存 columns
 */
function mergeColumnAgreeExpr(targetCols: unknown, sourceCols: unknown) {
  const exprByField = new Map<string, string>();
  walkColumns(sourceCols, (col) => {
    const field = String(col.field || '');
    const expr = String(col.agreeColExpr || '').trim();
    if (field && expr) exprByField.set(field, expr);
  });
  if (exprByField.size === 0) return;
  walkColumns(targetCols, (col) => {
    const field = String(col.field || '');
    const expr = exprByField.get(field);
    if (expr) col.agreeColExpr = expr;
  });
}

/**
 * 遍历 hiprint 一维/二维列
 * @param cols columns
 * @param visit 访问每个列对象
 */
function walkColumns(cols: unknown, visit: (col: Record<string, any>) => void) {
  if (!Array.isArray(cols)) return;
  for (const row of cols) {
    if (Array.isArray(row)) {
      walkColumns(row, visit);
    } else if (row && typeof row === 'object') {
      visit(row as Record<string, any>);
    }
  }
}

/**
 * A4 等面板宽度（mm）转设计器坐标
 * @param panel 面板
 */
export function panelWidthPt(panel: Record<string, any> | undefined) {
  const mm = Number(panel?.width) || 210;
  return (mm * 72) / 25.4;
}

/**
 * A4 等面板高度（mm）转设计器坐标
 * @param panel 面板
 */
export function panelHeightPt(panel: Record<string, any> | undefined) {
  const mm = Number(panel?.height) || 297;
  return (mm * 72) / 25.4;
}

export type PrintAlignMode = 'bottom' | 'center' | 'left' | 'right' | 'top';

/**
 * 对齐当前元素（页边距约 20）
 * @param template 模板
 * @param ref 元素定位
 * @param mode 对齐方式
 */
export function alignPrintElement(
  template: Record<string, any>,
  ref: { elementIndex: number; panelIndex: number },
  mode: PrintAlignMode,
): Record<string, any> {
  const next = cloneTemplate(template);
  const panel = next.panels?.[ref.panelIndex];
  const el = panel?.printElements?.[ref.elementIndex];
  if (!el?.options) {
    throw new Error('未找到要对齐的元素');
  }
  const width = Number(el.options.width) || 0;
  const height = Number(el.options.height) || 0;
  const margin = 20;
  if (mode === 'left') {
    el.options.left = margin;
  } else if (mode === 'right') {
    el.options.left = Math.max(margin, panelWidthPt(panel) - width - margin);
  } else if (mode === 'center') {
    el.options.left = Math.max(0, (panelWidthPt(panel) - width) / 2);
  } else if (mode === 'top') {
    el.options.top = Number(panel?.paperHeader) || margin;
  } else {
    el.options.top = Math.max(margin, panelHeightPt(panel) - height - margin);
  }
  return next;
}

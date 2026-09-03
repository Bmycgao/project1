/**
 * hiprint getJson 只会序列化内置 options，agree* 业务字段需要从上一份 JSON 合并回去
 * 筛行/显隐常在内存里改、不重挂画布，必须以 memory 为准，不能只靠模糊匹配
 */
import { mergePanelWatermark } from './print-watermark';
import { cloneTemplate } from './template-store';

/** 打印前处理用的扩展字段（引擎不认识） */
export const AGREE_PRINT_CUSTOM_KEYS = [
  'agreeRowFilter',
  'agreeVisibleWhen',
  'agreeValueExpr',
  'agreeFormat',
  'agreeFlowGroup',
] as const;

type PrintEl = {
  options?: Record<string, any>;
  printElementType?: { type?: string };
};

/**
 * 以画布 getJson 为版式（坐标），把 memory 里的 agree* 写回去
 * @param canvas getJson 结果
 * @param memory 合并前内存中的完整模板（筛行/显隐的准绳）
 */
export function mergeAgreeCustomOptions(
  canvas: Record<string, any>,
  memory?: null | Record<string, any>,
): Record<string, any> {
  if (!canvas?.panels?.length) return canvas;
  if (!memory?.panels?.length) return canvas;
  const next = cloneTemplate(canvas);
  mergePanelWatermark(next, memory);
  const panels = next.panels as Record<string, any>[];
  panels.forEach((panel, pi) => {
    const canvasEls = (panel.printElements || []) as PrintEl[];
    const memEls = (memory.panels[pi]?.printElements || []) as PrintEl[];
    if (canvasEls.length === 0 || memEls.length === 0) return;
    const used = new Set<number>();
    canvasEls.forEach((el, ei) => {
      const idx = matchMemoryIndex(el, ei, memEls, used);
      if (idx < 0) return;
      used.add(idx);
      const memEl = memEls[idx];
      if (memEl) copyCustomOptions(el, memEl);
    });
  });
  return next;
}

/**
 * 对齐内存元素：同下标同类型 → 同 field → 再模糊打分
 * @param canvasEl 画布元素
 * @param canvasIndex 画布下标
 * @param memEls 同页内存元素
 * @param used 已占用下标
 */
function matchMemoryIndex(
  canvasEl: PrintEl,
  canvasIndex: number,
  memEls: PrintEl[],
  used: Set<number>,
): number {
  const type = String(canvasEl.printElementType?.type || '');
  const field = String(canvasEl.options?.field || '');
  const same = memEls[canvasIndex];
  if (
    same &&
    !used.has(canvasIndex) &&
    String(same.printElementType?.type || '') === type
  ) {
    const memField = String(same.options?.field || '');
    if (!field || !memField || field === memField) return canvasIndex;
  }
  if (field) {
    const byField = memEls.findIndex(
      (mem, i) =>
        !used.has(i) &&
        String(mem.printElementType?.type || '') === type &&
        String(mem.options?.field || '') === field,
    );
    if (byField !== -1) return byField;
  }
  return bestMemoryMatch(canvasEl, memEls, used);
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
 * 复制 agree* 以及列上的 agreeColExpr / agreeMergeSame / agreeHideZero / agreeColFormat
 * 内存为空则从画布删掉，避免 getJson 里的旧筛行在「清除筛选」后复活
 * @param target 画布元素
 * @param source 内存元素
 */
function copyCustomOptions(target: PrintEl, source: PrintEl) {
  const to = target.options || {};
  const from = source.options || {};
  const customKeys = new Set<string>(AGREE_PRINT_CUSTOM_KEYS);
  const next: Record<string, any> = {};
  for (const [key, value] of Object.entries(to)) {
    if (!customKeys.has(key)) next[key] = value;
  }
  for (const key of AGREE_PRINT_CUSTOM_KEYS) {
    const val = from[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      next[key] = val;
    }
  }
  target.options = next;
  if (from.columns && next.columns) {
    mergeColumnAgreeMeta(next.columns, from.columns);
  }
}

/**
 * 按 field 把列上的 agreeColExpr / agreeMergeSame / agreeHideZero / agreeColFormat 写回（getJson 会丢掉）
 * @param targetCols hiprint 二维 columns
 * @param sourceCols 内存 columns
 */
function mergeColumnAgreeMeta(targetCols: unknown, sourceCols: unknown) {
  const metaByField = new Map<
    string,
    { expr: string; format: string; hideZero: boolean; merge: boolean }
  >();
  walkColumns(sourceCols, (col) => {
    const field = String(col.field || '');
    if (!field) return;
    metaByField.set(field, {
      expr: String(col.agreeColExpr || '').trim(),
      merge: Boolean(col.agreeMergeSame),
      hideZero: Boolean(col.agreeHideZero),
      format: String(col.agreeColFormat || '').trim(),
    });
  });
  if (metaByField.size === 0) return;
  walkColumns(targetCols, (col) => {
    const field = String(col.field || '');
    const meta = metaByField.get(field);
    if (!meta) return;
    if (meta.expr) col.agreeColExpr = meta.expr;
    else delete col.agreeColExpr;
    if (meta.merge) col.agreeMergeSame = true;
    else delete col.agreeMergeSame;
    if (meta.hideZero) col.agreeHideZero = true;
    else delete col.agreeHideZero;
    if (meta.format) col.agreeColFormat = meta.format;
    else delete col.agreeColFormat;
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

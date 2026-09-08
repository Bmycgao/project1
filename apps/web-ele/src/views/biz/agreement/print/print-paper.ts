/**
 * 打印纸张规格、横竖、多页 panel、按 Y 隔断
 * panel.width/height 为毫米；元素 left/top/width/height 与 hiprint 一致，按 pt
 */

import { cloneTemplate } from './template-store';

/** 预设纸型（竖向毫米） */
export type PrintPaperSizeId = 'A3' | 'A4' | 'A5' | 'custom';

/** 排版方向 */
export type PrintPaperOrientation = 'landscape' | 'portrait';

export interface PrintPaperPreset {
  heightMm: number;
  id: Exclude<PrintPaperSizeId, 'custom'>;
  label: string;
  widthMm: number;
}

export interface PrintPaperSpec {
  /** 自定义竖向宽（仅 sizeId=custom） */
  customHeightMm?: number;
  customWidthMm?: number;
  heightMm: number;
  orientation: PrintPaperOrientation;
  sizeId: PrintPaperSizeId;
  widthMm: number;
}

export const PRINT_PAPER_PRESETS: PrintPaperPreset[] = [
  { id: 'A5', label: 'A5', widthMm: 148, heightMm: 210 },
  { id: 'A4', label: 'A4', widthMm: 210, heightMm: 297 },
  { id: 'A3', label: 'A3', widthMm: 297, heightMm: 420 },
];

/** 与默认模板 A4 竖对齐：footer 800、页码 565/819 */
const FOOTER_INSET_PT = 42;
const NUMBER_RIGHT_INSET_PT = 30;
const NUMBER_BOTTOM_INSET_PT = 23;
const DEFAULT_PAPER_HEADER = 28;

const PAPER_PANEL_KEYS = [
  'agreePaperSize',
  'agreePaperOrientation',
  'agreePaperCustomWidth',
  'agreePaperCustomHeight',
] as const;

/**
 * 毫米转 hiprint 设计坐标（pt）
 * @param mm 毫米
 */
export function mmToPt(mm: number) {
  return (Number(mm) * 72) / 25.4;
}

/**
 * 毫米转屏幕 CSS 像素（96dpi）
 * @param mm 毫米
 */
export function mmToCssPx(mm: number) {
  return (Number(mm) * 96) / 25.4;
}

/**
 * 视口像素落到纸面上的 hiprint pt（rect 已含缩放，不要再除 zoom）
 * @param clientCoord 视口坐标
 * @param paperStart 纸面 getBoundingClientRect 起点
 * @param paperSizePx 纸面可视宽或高
 * @param paperSizePt 对应 panel 的 pt
 */
export function clientOffsetToPaperPt(
  clientCoord: number,
  paperStart: number,
  paperSizePx: number,
  paperSizePt: number,
) {
  if (!(paperSizePx > 1) || !(paperSizePt > 0)) return 0;
  const ratio = (clientCoord - paperStart) / paperSizePx;
  return Math.max(0, Math.round(ratio * paperSizePt));
}

/**
 * 预览弹窗宽度：纸面 CSS 宽 + 边距，不超过窗口
 * @param widthMm 纸宽
 */
export function previewDialogWidthCss(widthMm: number) {
  const paperPx = Math.round(mmToCssPx(Math.max(50, widthMm)));
  const want = paperPx + 120;
  const maxW =
    typeof window === 'undefined'
      ? 1400
      : Math.max(720, Math.floor(window.innerWidth * 0.96));
  return `${Math.min(Math.max(want, 720), maxW)}px`;
}

/**
 * 纸张中文说明，如 A3 竖向 297×420mm
 * @param spec 规格
 */
export function describePrintPaper(spec: PrintPaperSpec) {
  const dir = spec.orientation === 'landscape' ? '横向' : '竖向';
  const size = spec.sizeId === 'custom' ? '自定义' : spec.sizeId;
  return `${size} ${dir} ${spec.widthMm}×${spec.heightMm}mm`;
}

/**
 * 按纸宽比例缩放元素 left/width（换 A3 时通栏表跟着变宽）
 * @param template 模板
 * @param ratio 新宽/旧宽
 */
export function scalePrintElementsHorizontally(
  template: Record<string, any>,
  ratio: number,
) {
  if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 0.01) return template;
  for (const panel of template.panels || []) {
    for (const el of panel.printElements || []) {
      const opt = el?.options;
      if (!opt) continue;
      if (opt.left !== undefined && opt.left !== null)
        opt.left = Math.round(Number(opt.left || 0) * ratio);
      if (opt.width !== undefined && opt.width !== null) {
        opt.width = Math.max(8, Math.round(Number(opt.width || 0) * ratio));
      }
    }
  }
  return template;
}

/**
 * 从预设 + 方向得到实际纸面毫米
 * @param spec 纸张选择
 */
export function resolvePaperMm(spec: {
  customHeightMm?: number;
  customWidthMm?: number;
  orientation: PrintPaperOrientation;
  sizeId: PrintPaperSizeId;
}): { heightMm: number; widthMm: number } {
  let portraitW: number;
  let portraitH: number;
  if (spec.sizeId === 'custom') {
    portraitW = Math.max(50, Number(spec.customWidthMm) || 210);
    portraitH = Math.max(50, Number(spec.customHeightMm) || 297);
  } else {
    const preset = PRINT_PAPER_PRESETS.find((p) => p.id === spec.sizeId);
    portraitW = preset?.widthMm ?? 210;
    portraitH = preset?.heightMm ?? 297;
  }
  if (spec.orientation === 'landscape') {
    return { widthMm: portraitH, heightMm: portraitW };
  }
  return { widthMm: portraitW, heightMm: portraitH };
}

/**
 * 按纸面毫米写 panel 宽高、页脚线、页码坐标
 * @param panel hiprint panel
 * @param widthMm 宽
 * @param heightMm 高
 */
export function applyPaperMetrics(
  panel: Record<string, any>,
  widthMm: number,
  heightMm: number,
) {
  const widthPt = mmToPt(widthMm);
  const heightPt = mmToPt(heightMm);
  panel.width = widthMm;
  panel.height = heightMm;
  /** 关掉引擎自动跨页续排，见 sanitizePrintTemplate 里的说明 */
  panel.panelPageRule = 'none';
  if (
    panel.paperHeader === undefined ||
    panel.paperHeader === null ||
    panel.paperHeader === ''
  ) {
    panel.paperHeader = DEFAULT_PAPER_HEADER;
  }
  panel.paperFooter = Math.round(heightPt - FOOTER_INSET_PT);
  panel.paperNumberLeft = Math.round(widthPt - NUMBER_RIGHT_INSET_PT);
  panel.paperNumberTop = Math.round(heightPt - NUMBER_BOTTOM_INSET_PT);
}

/**
 * 把纸型标记写到 panel（getJson 可能丢掉，需 merge 回来）
 * @param panel 面板
 * @param spec 规格
 */
function stampPaperSpec(panel: Record<string, any>, spec: PrintPaperSpec) {
  panel.agreePaperSize = spec.sizeId;
  panel.agreePaperOrientation = spec.orientation;
  if (spec.sizeId === 'custom') {
    panel.agreePaperCustomWidth = spec.customWidthMm ?? spec.widthMm;
    panel.agreePaperCustomHeight = spec.customHeightMm ?? spec.heightMm;
  } else {
    delete panel.agreePaperCustomWidth;
    delete panel.agreePaperCustomHeight;
  }
}

/**
 * 从宽高匹配预设；对不上则为自定义
 * @param widthMm 当前宽
 * @param heightMm 当前高
 */
export function inferPaperSpecFromMm(
  widthMm: number,
  heightMm: number,
): PrintPaperSpec {
  const w = Number(widthMm) || 210;
  const h = Number(heightMm) || 297;
  for (const preset of PRINT_PAPER_PRESETS) {
    if (w === preset.widthMm && h === preset.heightMm) {
      return {
        sizeId: preset.id,
        orientation: 'portrait',
        widthMm: w,
        heightMm: h,
      };
    }
    if (w === preset.heightMm && h === preset.widthMm) {
      return {
        sizeId: preset.id,
        orientation: 'landscape',
        widthMm: w,
        heightMm: h,
      };
    }
  }
  return {
    sizeId: 'custom',
    orientation: 'portrait',
    widthMm: w,
    heightMm: h,
    customWidthMm: w,
    customHeightMm: h,
  };
}

/**
 * 读模板第一页推断纸张（旧模板无 agreePaper* 时用宽高）
 * @param template 模板
 */
export function readTemplatePaperSpec(
  template: null | Record<string, any> | undefined,
): PrintPaperSpec {
  const panel = template?.panels?.[0];
  const widthMm = Number(panel?.width) || 210;
  const heightMm = Number(panel?.height) || 297;
  const sizeId = panel?.agreePaperSize as PrintPaperSizeId | undefined;
  const orientation = panel?.agreePaperOrientation as
    | PrintPaperOrientation
    | undefined;
  if (sizeId === 'custom') {
    return {
      sizeId: 'custom',
      orientation: orientation === 'landscape' ? 'landscape' : 'portrait',
      widthMm,
      heightMm,
      customWidthMm: Number(panel?.agreePaperCustomWidth) || widthMm,
      customHeightMm: Number(panel?.agreePaperCustomHeight) || heightMm,
    };
  }
  if (sizeId === 'A3' || sizeId === 'A4' || sizeId === 'A5') {
    const mm = resolvePaperMm({
      sizeId,
      orientation: orientation === 'landscape' ? 'landscape' : 'portrait',
    });
    return {
      sizeId,
      orientation: orientation === 'landscape' ? 'landscape' : 'portrait',
      widthMm: mm.widthMm,
      heightMm: mm.heightMm,
    };
  }
  return inferPaperSpecFromMm(widthMm, heightMm);
}

/**
 * 统计超出当前纸面的元素个数（坐标不缩放，只提示）
 * @param template 模板
 */
export function countOverflowPrintElements(
  template: Record<string, any> | undefined,
) {
  let n = 0;
  for (const panel of template?.panels || []) {
    const maxW = mmToPt(Number(panel?.width) || 210);
    const maxH = mmToPt(Number(panel?.height) || 297);
    for (const el of panel.printElements || []) {
      const left = Number(el?.options?.left) || 0;
      const top = Number(el?.options?.top) || 0;
      const width = Number(el?.options?.width) || 0;
      const height = Number(el?.options?.height) || 0;
      if (left + width > maxW + 1 || top + height > maxH + 1 || top > maxH) {
        n += 1;
      }
    }
  }
  return n;
}

/**
 * 是否只是横竖对调（宽高互换），此时不要拉元素
 * @param oldW 原宽 mm
 * @param oldH 原高 mm
 * @param newW 新宽 mm
 * @param newH 新高 mm
 */
function isPaperOrientationSwap(
  oldW: number,
  oldH: number,
  newW: number,
  newH: number,
) {
  return (
    Math.abs(oldW - newH) < 0.6 &&
    Math.abs(oldH - newW) < 0.6 &&
    Math.abs(oldW - oldH) > 1
  );
}

/**
 * 全部 panel 改成同一纸张
 * @param template 模板
 * @param spec 用户选择（custom 时带竖向毫米）
 */
export function applyPaperToTemplate(
  template: Record<string, any>,
  spec: {
    customHeightMm?: number;
    customWidthMm?: number;
    orientation: PrintPaperOrientation;
    sizeId: PrintPaperSizeId;
  },
) {
  const next = cloneTemplate(template);
  const oldWidthMm = Number(next.panels?.[0]?.width) || 210;
  const oldHeightMm = Number(next.panels?.[0]?.height) || 297;
  const mm = resolvePaperMm(spec);
  /** A4→A3 等改幅面才按纸宽拉通栏；横竖对调只换纸 */
  if (
    !isPaperOrientationSwap(oldWidthMm, oldHeightMm, mm.widthMm, mm.heightMm)
  ) {
    scalePrintElementsHorizontally(next, mm.widthMm / oldWidthMm);
  }
  const full: PrintPaperSpec = {
    sizeId: spec.sizeId,
    orientation: spec.orientation,
    widthMm: mm.widthMm,
    heightMm: mm.heightMm,
    customWidthMm: spec.customWidthMm,
    customHeightMm: spec.customHeightMm,
  };
  for (const panel of next.panels || []) {
    applyPaperMetrics(panel, mm.widthMm, mm.heightMm);
    stampPaperSpec(panel, full);
  }
  return {
    template: next,
    overflowCount: countOverflowPrintElements(next),
  };
}

/**
 * getJson 后把 paper 自定义字段从内存合回去
 * @param canvas 画布 JSON
 * @param memory 内存模板
 */
export function mergePanelPaperSpec(
  canvas: Record<string, any>,
  memory?: null | Record<string, any>,
) {
  if (!canvas?.panels?.length || !memory?.panels?.length) return canvas;
  canvas.panels.forEach((panel: Record<string, any>, pi: number) => {
    const mem = memory.panels[pi];
    if (!mem) return;
    for (const key of PAPER_PANEL_KEYS) {
      if (mem[key] === undefined || mem[key] === null) {
        Reflect.deleteProperty(panel, key);
      } else {
        panel[key] = mem[key];
      }
    }
  });
  return canvas;
}

/**
 * hiprint getJson 有时只带回第一页；内存页更多且第一页元素数对得上时补回后面的页
 * @param canvas getJson 结果
 * @param memory 合并前内存模板
 */
export function restoreDroppedPrintPanels(
  canvas: Record<string, any>,
  memory?: null | Record<string, any>,
) {
  const memPanels = memory?.panels as Record<string, any>[] | undefined;
  if (
    !canvas?.panels?.length ||
    !memPanels ||
    memPanels.length <= canvas.panels.length
  ) {
    return canvas;
  }
  const canvasCount = canvas.panels[0]?.printElements?.length || 0;
  const memFirstCount = memPanels[0]?.printElements?.length || 0;
  /** 引擎把多页摊进一页时再补会重复 */
  if (canvasCount > memFirstCount + 1) return canvas;
  for (let i = canvas.panels.length; i < memPanels.length; i += 1) {
    const memPanel = memPanels[i];
    if (memPanel) canvas.panels.push(cloneTemplate(memPanel));
  }
  reindexPrintPanels(canvas);
  return canvas;
}

/**
 * 按源页复制纸张/页眉页脚，不含元素
 * @param src 源 panel
 * @param index 新下标
 */
export function createEmptyPrintPanel(
  src: Record<string, any>,
  index: number,
): Record<string, any> {
  return {
    index,
    name: index + 1,
    height: src.height,
    width: src.width,
    paperHeader: src.paperHeader ?? DEFAULT_PAPER_HEADER,
    paperFooter: src.paperFooter,
    paperNumberLeft: src.paperNumberLeft,
    paperNumberTop: src.paperNumberTop,
    paperNumberDisabled: src.paperNumberDisabled ?? false,
    paperNumberContinue: src.paperNumberContinue ?? true,
    watermarkOptions: cloneTemplate(src.watermarkOptions || { content: '' }),
    panelLayoutOptions: src.panelLayoutOptions || {},
    printElements: [],
    agreePaperSize: src.agreePaperSize,
    agreePaperOrientation: src.agreePaperOrientation,
    agreePaperCustomWidth: src.agreePaperCustomWidth,
    agreePaperCustomHeight: src.agreePaperCustomHeight,
  };
}

/**
 * 重写 panel.index / name
 * @param template 模板
 */
export function reindexPrintPanels(template: Record<string, any>) {
  (template.panels || []).forEach((panel: Record<string, any>, i: number) => {
    panel.index = i;
    panel.name = i + 1;
  });
}

/**
 * 在指定页后插入空白页
 * @param template 模板
 * @param panelIndex 当前页
 */
export function insertBlankPanelAfter(
  template: Record<string, any>,
  panelIndex: number,
) {
  const next = cloneTemplate(template);
  const panels = next.panels as Record<string, any>[];
  const src = panels[panelIndex] || panels[0];
  if (!src) throw new Error('没有可复制的纸张页');
  const insertAt = Math.min(panels.length, Math.max(0, panelIndex) + 1);
  const blank = createEmptyPrintPanel(src, insertAt);
  applyPaperMetrics(blank, Number(src.width) || 210, Number(src.height) || 297);
  panels.splice(insertAt, 0, blank);
  reindexPrintPanels(next);
  return { template: next, newPanelIndex: insertAt };
}

/**
 * 删除一页（至少留一页）
 * @param template 模板
 * @param panelIndex 要删的页
 */
export function removePrintPanel(
  template: Record<string, any>,
  panelIndex: number,
) {
  const next = cloneTemplate(template);
  const panels = next.panels as Record<string, any>[];
  if (panels.length <= 1) {
    throw new Error('至少保留一页');
  }
  if (panelIndex < 0 || panelIndex >= panels.length) {
    throw new Error('页码无效');
  }
  panels.splice(panelIndex, 1);
  reindexPrintPanels(next);
  const nextIndex = Math.min(panelIndex, panels.length - 1);
  return { template: next, activePanelIndex: nextIndex };
}

/**
 * 从切断线 Y（pt）起把下方内容挪到新页
 * 底边不超过切断线的留本页；压线或整块在下方的整块搬走（表不按行拆）
 * @param template 模板
 * @param panelIndex 当前页
 * @param yPt 切断线
 */
export function splitPanelAtY(
  template: Record<string, any>,
  panelIndex: number,
  yPt: number,
) {
  const next = cloneTemplate(template);
  const panels = next.panels as Record<string, any>[];
  const panel = panels[panelIndex];
  if (!panel) throw new Error('当前页不存在');
  const y = Math.max(0, Number(yPt) || 0);
  const header = Number(panel.paperHeader) || DEFAULT_PAPER_HEADER;
  const list = Array.isArray(panel.printElements) ? panel.printElements : [];
  const stay: Record<string, any>[] = [];
  const move: Record<string, any>[] = [];
  for (const el of list) {
    const top = Number(el?.options?.top) || 0;
    const height = Number(el?.options?.height) || 0;
    /** 完全在切断线以上才留 */
    if (top + height <= y + 0.5) {
      stay.push(el);
      continue;
    }
    const copy = cloneTemplate(el);
    copy.options = copy.options || {};
    copy.options.top = Math.max(header + 4, top - y);
    move.push(copy);
  }
  panel.printElements = stay;
  const insertAt = panelIndex + 1;
  const newPanel = createEmptyPrintPanel(panel, insertAt);
  applyPaperMetrics(
    newPanel,
    Number(panel.width) || 210,
    Number(panel.height) || 297,
  );
  newPanel.printElements = move;
  panels.splice(insertAt, 0, newPanel);
  reindexPrintPanels(next);
  return {
    template: next,
    newPanelIndex: insertAt,
    movedCount: move.length,
  };
}

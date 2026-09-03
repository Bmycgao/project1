/**
 * 打印面板水印：对接 hiprint panel.watermarkOptions
 * 无文案时写 content:''，避免引擎回落到默认「vue-plugin-hiprint」
 */
import { cloneTemplate } from './template-store';

/** 设计器表单 / 模板 JSON 共用的水印字段 */
export interface AgreePrintWatermark {
  /** 水印文字，空则关闭 */
  content: string;
  /** 逆时针旋转角度 */
  rotate: number;
  /** 字号，如 16px */
  fontSize: string;
  /** 颜色含透明度，canvas fillStyle */
  fillStyle: string;
  /** 单枚水印占位宽 */
  width: number;
  /** 单枚水印占位高 */
  height: number;
  /** 是否叠打印时间 */
  timestamp: boolean;
  /** 时间格式，hiprint timeFormat 语法 */
  format: string;
}

/** 对话框默认值（开启时预填，不是默认模板自带水印） */
export const DEFAULT_AGREE_WATERMARK: AgreePrintWatermark = {
  content: '内部资料',
  rotate: 25,
  fontSize: '16px',
  fillStyle: 'rgba(184, 184, 184, 0.35)',
  width: 200,
  height: 160,
  timestamp: false,
  format: 'YYYY-MM-DD HH:mm',
};

/** 时间戳格式下拉 */
export const WATERMARK_TIME_FORMATS = [
  { label: '年-月-日 时:分', value: 'YYYY-MM-DD HH:mm' },
  { label: '年-月-日', value: 'YYYY-MM-DD' },
  { label: '时:分:秒', value: 'HH:mm:ss' },
] as const;

/**
 * 是否视为已开启水印
 * @param opts panel.watermarkOptions
 */
export function isWatermarkEnabled(opts: unknown): boolean {
  if (!opts || typeof opts !== 'object') return false;
  return (
    String((opts as { content?: unknown }).content || '').trim().length > 0
  );
}

/**
 * 字号转成 hiprint 需要的 px 字符串
 * @param raw 数字或 16px
 */
function ensurePx(raw: unknown): string {
  const s = String(raw ?? '').trim();
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_AGREE_WATERMARK.fontSize;
  return `${Math.min(48, Math.max(10, n))}px`;
}

/**
 * 把任意 JSON 收成完整水印对象（缺项用默认）
 * @param raw panel.watermarkOptions
 */
export function normalizeWatermarkOptions(raw: unknown): AgreePrintWatermark {
  const src =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const content = String(src.content ?? '').trim();
  return {
    content,
    rotate: Number.isFinite(Number(src.rotate))
      ? Number(src.rotate)
      : DEFAULT_AGREE_WATERMARK.rotate,
    fontSize: ensurePx(src.fontSize),
    fillStyle: String(src.fillStyle || DEFAULT_AGREE_WATERMARK.fillStyle),
    width:
      Number(src.width) > 0 ? Number(src.width) : DEFAULT_AGREE_WATERMARK.width,
    height:
      Number(src.height) > 0
        ? Number(src.height)
        : DEFAULT_AGREE_WATERMARK.height,
    timestamp: Boolean(src.timestamp),
    format: String(src.format || DEFAULT_AGREE_WATERMARK.format),
  };
}

/**
 * 读模板第一页水印；无文案时表单仍带默认文案方便勾选开启
 * @param template hiprint 模板
 */
export function readTemplateWatermark(template: null | Record<string, any>): {
  draft: AgreePrintWatermark;
  enabled: boolean;
} {
  const raw = template?.panels?.[0]?.watermarkOptions;
  const enabled = isWatermarkEnabled(raw);
  const draft = normalizeWatermarkOptions(raw);
  if (!enabled && !draft.content) {
    draft.content = DEFAULT_AGREE_WATERMARK.content;
  }
  return { draft, enabled };
}

/**
 * 生成写入 panel 的对象；关闭时只留空 content
 * @param draft 表单
 * @param enabled 是否开启
 */
export function toHiprintWatermarkOptions(
  draft: AgreePrintWatermark,
  enabled: boolean,
): Record<string, unknown> {
  const next = normalizeWatermarkOptions(draft);
  if (!enabled || !next.content) {
    return { content: '' };
  }
  return {
    content: next.content,
    rotate: next.rotate,
    fontSize: next.fontSize,
    fillStyle: next.fillStyle,
    width: next.width,
    height: next.height,
    timestamp: next.timestamp,
    format: next.format,
    fontFamily: 'Microsoft Yahei',
    textAlign: 'center',
    textBaseline: 'middle',
    zIndex: 0,
  };
}

/**
 * 把水印写到每一页（当前协议模板通常一页）
 * @param template 模板
 * @param enabled 是否开启
 * @param draft 表单
 */
export function applyWatermarkToTemplate(
  template: Record<string, any>,
  enabled: boolean,
  draft: AgreePrintWatermark,
): Record<string, any> {
  const next = cloneTemplate(template);
  const payload = toHiprintWatermarkOptions(draft, enabled);
  for (const panel of next.panels || []) {
    panel.watermarkOptions = { ...payload };
  }
  return next;
}

/**
 * 打印前规范化：空对象改成 content:''，防止引擎套默认文案
 * @param template 已 clone 的模板
 */
export function normalizeTemplateWatermark(template: Record<string, any>) {
  for (const panel of template.panels || []) {
    panel.watermarkOptions = isWatermarkEnabled(panel.watermarkOptions)
      ? toHiprintWatermarkOptions(
          normalizeWatermarkOptions(panel.watermarkOptions),
          true,
        )
      : { content: '' };
  }
}

/**
 * getJson 丢掉水印时，从内存模板补回
 * @param canvas getJson 结果
 * @param memory 合并前完整模板
 */
export function mergePanelWatermark(
  canvas: Record<string, any>,
  memory?: null | Record<string, any>,
) {
  const canvasPanels = canvas?.panels as Record<string, any>[] | undefined;
  const memPanels = memory?.panels as Record<string, any>[] | undefined;
  if (!canvasPanels?.length || !memPanels?.length) return;
  canvasPanels.forEach((panel, i) => {
    const memWm = memPanels[i]?.watermarkOptions;
    if (
      !isWatermarkEnabled(panel.watermarkOptions) &&
      isWatermarkEnabled(memWm)
    ) {
      panel.watermarkOptions = cloneTemplate(memWm);
    }
  });
}

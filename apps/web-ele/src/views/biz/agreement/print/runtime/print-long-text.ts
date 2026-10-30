import { evalPrintBool, evalPrintExpr, validatePrintExpr } from './print-expr';
import { maskPrintDisplay } from './print-masking';

export interface PrintTextSection {
  content: string;
  when: string;
}

/** 不设置时沿用旧模板的空一行；0 表示分段但不增加留白。 */
export function normalizePrintTextSectionGap(
  value: unknown,
): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  const gap = Number(value);
  return Number.isFinite(gap) && gap >= 0 ? gap : undefined;
}

export function resolvePrintTextBlocks(
  sections: PrintTextSection[],
  data: Record<string, unknown>,
) {
  return sections
    .filter((section) => evalPrintBool(section.when, data))
    .map((section) => resolvePrintTextTemplate(section.content, data))
    .filter((content) => content.trim().length > 0);
}

/** 校验正文里的复合参数；简单字段允许缺值并按空文字显示。 */
export function validatePrintTextTemplate(
  content: string,
  data: Record<string, unknown>,
): { message: string; ok: boolean } {
  for (const match of String(content || '').matchAll(
    /\{\{\s*([\s\S]*?)\s*\}\}/g,
  )) {
    const expression = String(match[1] || '').trim();
    if (!expression || /^[A-Za-z_$][\w$]*$/.test(expression)) continue;
    const check = validatePrintExpr(expression, data);
    if (!check.ok) {
      return { message: `参数 {{${expression}}}：${check.message}`, ok: false };
    }
  }
  return { message: '正文参数有效', ok: true };
}

/**
 * 替换正文模板中的字段或安全表达式。
 * - {{compensatee}}：直接字段
 * - {{IF(rewardTotal > 0, rewardTotal, 0)}}：受白名单限制的表达式
 */
export function resolvePrintTextTemplate(
  content: string,
  data: Record<string, unknown>,
) {
  return String(content || '').replaceAll(
    /\{\{\s*([\s\S]*?)\s*\}\}/g,
    (_match, rawExpression) => {
      const expression = String(rawExpression || '').trim();
      if (!expression) return '';
      if (/^[A-Za-z_$][\w$]*$/.test(expression)) {
        const value = data[expression];
        return value === null ||
          value === undefined ||
          typeof value === 'object'
          ? ''
          : maskPrintDisplay(value, String(value), data, expression);
      }
      if (!validatePrintExpr(expression, data).ok) return '';
      const value = evalPrintExpr(expression, data, { silent: true });
      return value === null || value === undefined || typeof value === 'object'
        ? ''
        : maskPrintDisplay(value, String(value), data, '', expression);
    },
  );
}

/** 内容块按顺序独立判断；模板参数只生成纯文字，不执行 HTML。 */
export function resolvePrintTextSections(
  sections: PrintTextSection[],
  data: Record<string, unknown>,
) {
  return resolvePrintTextBlocks(sections, data).join('\n\n');
}

/** 使用每个元素独立的运行时字段，避免多个长文本互相覆盖。 */
export function prepareLongTextSections(
  template: Record<string, any>,
  data: Record<string, unknown>,
) {
  const source = { ...data };
  for (const [pi, panel] of (template.panels || []).entries()) {
    for (const [ei, el] of (panel.printElements || []).entries()) {
      const options = el.options;
      if (
        el.printElementType?.type !== 'longText' ||
        !options?.agreeTextSections?.length
      )
        continue;
      const field = `__agree_text_${pi}_${ei}`;
      const blocks = resolvePrintTextBlocks(options.agreeTextSections, source);
      const gap = normalizePrintTextSectionGap(options.agreeTextSectionGap);
      data[field] = blocks.join(gap === undefined ? '\n\n' : '\n');
      // 只在打印副本记录已求值内容，保持业务原始数值和保存的正文不变。
      if (gap === undefined) delete options.__agreeTextBlocks;
      else options.__agreeTextBlocks = blocks;
      options.field = field;
      options.hideTitle = true;
      options.title = '';
      options.testData = '';
      delete options.agreeValueExpr;
      delete options.agreeFormat;
    }
  }
}

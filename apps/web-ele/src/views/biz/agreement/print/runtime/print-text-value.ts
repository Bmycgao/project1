import { formatPrintValue } from '../data/format-print-value';
import { evalPrintExpr } from './print-expr';

/** 文本的字段/公式与显示格式共用同一套求值顺序。 */
export function resolvePrintTextValue(
  options: Record<string, any>,
  data: Record<string, unknown>,
): string {
  const field = String(options.field || '');
  const expr = String(options.agreeValueExpr || '').trim();
  let value: unknown;
  if (expr) {
    value = evalPrintExpr(expr, data, { silent: true });
  } else if (field && Object.prototype.hasOwnProperty.call(data, field)) {
    value = data[field];
  } else {
    value = options.testData;
  }
  if (value !== null && typeof value === 'object') return '';
  return formatPrintValue(value, String(options.agreeFormat || ''), data);
}

/**
 * 每个文本独立生成运行时显示字段，保留业务原值供其他文本、公式和条件使用。
 * 只修改打印副本，并清除已应用的格式与公式，画布与 hiprint 都直接读取结果。
 */
export function preparePrintTextValues(
  template: Record<string, any>,
  data: Record<string, unknown>,
) {
  const source = { ...data };
  for (const [pi, panel] of (template.panels || []).entries()) {
    for (const [ei, el] of (panel.printElements || []).entries()) {
      const options = el.options;
      if (
        !['longText', 'text'].includes(el.printElementType?.type) ||
        !options ||
        (!options.agreeFormat && !options.agreeValueExpr)
      )
        continue;
      let field = `__agree_value_${pi}_${ei}`;
      while (Object.prototype.hasOwnProperty.call(data, field)) field += '_';
      data[field] = resolvePrintTextValue(options, source);
      options.field = field;
      delete options.agreeFormat;
      delete options.agreeValueExpr;
    }
  }
}

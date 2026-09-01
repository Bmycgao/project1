/**
 * 打印字段展示格式化（options.agreeFormat）
 */

/** 支持的格式类型 */
export type AgreePrintFormat =
  | 'date'
  | 'dateCn'
  | 'integer'
  | 'money'
  | 'moneyCn'
  | 'percent'
  | string;

/**
 * 金额千分位
 * @param value 数值
 * @param decimals 小数位
 */
function formatMoney(value: unknown, decimals = 2): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? '');
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * 按 agreeFormat 格式化展示值
 * @param value 原始值
 * @param format 格式标识
 * @param ctx 上下文（moneyCn 需 amountCn）
 */
export function formatPrintValue(
  value: unknown,
  format: AgreePrintFormat | undefined,
  ctx?: Record<string, unknown>,
): string {
  const f = String(format || '').trim();
  if (!f || f === 'text')
    return value === null || value === undefined ? '' : String(value);

  switch (f) {
    case 'date': {
      return String(value ?? '').slice(0, 10);
    }
    case 'dateCn': {
      const s = String(value ?? '').slice(0, 10);
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      return m ? `${m[1]}年${m[2]}月${m[3]}日` : s;
    }
    case 'integer': {
      return String(Math.round(Number(value) || 0));
    }
    case 'money': {
      return formatMoney(value, 2);
    }
    case 'money0': {
      return formatMoney(value, 0);
    }
    case 'moneyCn': {
      return String(ctx?.amountCn ?? value ?? '');
    }
    case 'percent': {
      const num = Number(value);
      if (!Number.isFinite(num)) return '';
      return `${(num * 100).toFixed(2)}%`;
    }
    default: {
      return String(value ?? '');
    }
  }
}

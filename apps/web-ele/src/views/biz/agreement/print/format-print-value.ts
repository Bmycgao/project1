/**
 * 打印展示格式：文本用 agreeFormat，表格列用 agreeColFormat（经 hiprint formatter2 eval）
 * 表格只改显示，不改行上的 number，避免 tableSummary 合计失效
 */

/** 支持的格式类型 */
export type AgreePrintFormat =
  | 'date'
  | 'dateCn'
  | 'datetime'
  | 'datetimeCn'
  | 'integer'
  | 'money0'
  | 'money'
  | 'moneyCn'
  | 'percent'
  | 'time'
  | string;

/** 设计器下拉（文本 agreeFormat / 列 agreeColFormat 共用） */
export const AGREE_PRINT_FORMAT_PRESETS = [
  { label: '金额(2位)', value: 'money' },
  { label: '金额(整数)', value: 'money0' },
  { label: '金额大写', value: 'moneyCn' },
  { label: '日期 YYYY-MM-DD', value: 'date' },
  { label: '中文日期', value: 'dateCn' },
  { label: '日期时间', value: 'datetime' },
  { label: '中文日期时间', value: 'datetimeCn' },
  { label: '时间 HH:mm', value: 'time' },
  { label: '百分数', value: 'percent' },
  { label: '整数', value: 'integer' },
] as const;

/** 解析后的年月日时分（失败为 null） */
interface DateParts {
  d: string;
  h: string;
  mi: string;
  mo: string;
  y: string;
}

/**
 * 补两位
 * @param n 数字或数字串
 */
function pad2(n: number | string) {
  const s = String(n);
  return s.length < 2 ? `0${s}` : s;
}

/**
 * 从日期 / ISO / 时间戳抽出年月日时分
 * @param value 原始值
 */
function parseDateParts(value: unknown): DateParts | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      y: String(value.getFullYear()),
      mo: pad2(value.getMonth() + 1),
      d: pad2(value.getDate()),
      h: pad2(value.getHours()),
      mi: pad2(value.getMinutes()),
    };
  }
  const s = String(value).trim();
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (iso) {
    return {
      y: iso[1] || '',
      mo: iso[2] || '',
      d: iso[3] || '',
      h: iso[4] || '00',
      mi: iso[5] || '00',
    };
  }
  const timeOnly = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (timeOnly) {
    return {
      y: '',
      mo: '',
      d: '',
      h: pad2(timeOnly[1] || '0'),
      mi: pad2(timeOnly[2] || '0'),
    };
  }
  const num = Number(s);
  if (Number.isFinite(num) && s.length >= 10) {
    const dt = new Date(num);
    if (!Number.isNaN(dt.getTime())) return parseDateParts(dt);
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parseDateParts(parsed);
  return null;
}

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
 * 按 agreeFormat / agreeColFormat 格式化展示值
 * @param value 原始值
 * @param format 格式标识
 * @param ctx 上下文（moneyCn 需 amountCn，仅文本字段）
 */
export function formatPrintValue(
  value: unknown,
  format: AgreePrintFormat | undefined,
  ctx?: Record<string, unknown>,
): string {
  const f = String(format || '').trim();
  if (!f || f === 'text') {
    return value === null || value === undefined ? '' : String(value);
  }

  const parts = parseDateParts(value);

  switch (f) {
    case 'date': {
      if (parts?.y) return `${parts.y}-${parts.mo}-${parts.d}`;
      return String(value ?? '').slice(0, 10);
    }
    case 'dateCn': {
      if (parts?.y) return `${parts.y}年${parts.mo}月${parts.d}日`;
      const s = String(value ?? '').slice(0, 10);
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      return m ? `${m[1]}年${m[2]}月${m[3]}日` : s;
    }
    case 'datetime': {
      if (parts?.y) {
        return `${parts.y}-${parts.mo}-${parts.d} ${parts.h}:${parts.mi}`;
      }
      return String(value ?? '');
    }
    case 'datetimeCn': {
      if (parts?.y) {
        return `${parts.y}年${parts.mo}月${parts.d}日 ${parts.h}:${parts.mi}`;
      }
      return String(value ?? '');
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
    case 'time': {
      if (parts) return `${parts.h}:${parts.mi}`;
      return String(value ?? '');
    }
    default: {
      return String(value ?? '');
    }
  }
}

/**
 * 生成 hiprint 列 formatter2 源码（具名 function，引擎 eval("formatter="+src)）
 * @param format agreeColFormat，空串表示只做隐零或不处理
 * @param hideZero 值为 0 时显示空
 */
export function createColumnFormatterSrc(format: string, hideZero: boolean) {
  const fmt = JSON.stringify(String(format || '').trim());
  const hide = hideZero ? 'true' : 'false';
  return `function formatter(value, row, index, options) {
    var hideZero = ${hide};
    var fmt = ${fmt};
    if (value === null || value === undefined || value === '') return '';
    if (hideZero) {
      if (typeof value === 'number' && value === 0) return '';
      if (typeof value === 'string' && value.trim() !== '' && Number(value) === 0) return '';
    }
    if (!fmt || fmt === 'text') return value;
    function pad2(n) {
      n = String(n);
      return n.length < 2 ? '0' + n : n;
    }
    function partsOf(v) {
      if (v === null || v === undefined || v === '') return null;
      if (v instanceof Date && !isNaN(v.getTime())) {
        return { y: String(v.getFullYear()), mo: pad2(v.getMonth() + 1), d: pad2(v.getDate()), h: pad2(v.getHours()), mi: pad2(v.getMinutes()) };
      }
      var s = String(v).trim();
      var iso = /^(\\d{4})-(\\d{2})-(\\d{2})(?:[T\\s](\\d{2}):(\\d{2})(?::(\\d{2}))?)?/.exec(s);
      if (iso) return { y: iso[1], mo: iso[2], d: iso[3], h: iso[4] || '00', mi: iso[5] || '00' };
      var timeOnly = /^(\\d{1,2}):(\\d{2})(?::\\d{2})?$/.exec(s);
      if (timeOnly) return { y: '', mo: '', d: '', h: pad2(timeOnly[1] || '0'), mi: pad2(timeOnly[2] || '0') };
      var n = Number(s);
      if (isFinite(n) && s.length >= 10) {
        var dt = new Date(n);
        if (!isNaN(dt.getTime())) return partsOf(dt);
      }
      var parsed = new Date(s);
      if (!isNaN(parsed.getTime())) return partsOf(parsed);
      return null;
    }
    function money(v, decimals) {
      var num = Number(v);
      if (!isFinite(num)) return String(v == null ? '' : v);
      return num.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
    var p = partsOf(value);
    if (fmt === 'date') return p && p.y ? p.y + '-' + p.mo + '-' + p.d : String(value).slice(0, 10);
    if (fmt === 'dateCn') return p && p.y ? p.y + '年' + p.mo + '月' + p.d + '日' : String(value);
    if (fmt === 'datetime') return p && p.y ? p.y + '-' + p.mo + '-' + p.d + ' ' + p.h + ':' + p.mi : String(value);
    if (fmt === 'datetimeCn') return p && p.y ? p.y + '年' + p.mo + '月' + p.d + '日 ' + p.h + ':' + p.mi : String(value);
    if (fmt === 'time') return p ? p.h + ':' + p.mi : String(value);
    if (fmt === 'integer') return String(Math.round(Number(value) || 0));
    if (fmt === 'money') return money(value, 2);
    if (fmt === 'money0') return money(value, 0);
    if (fmt === 'percent') {
      var pn = Number(value);
      return isFinite(pn) ? (pn * 100).toFixed(2) + '%' : '';
    }
    return value;
  }`;
}

/**
 * 表尾合计小数位：与列展示格式对齐，合计仍按原始 number 加总
 * @param format agreeColFormat
 */
export function tableSummaryDecimals(format: string): number | undefined {
  const f = String(format || '').trim();
  if (f === 'money0' || f === 'integer') return 0;
  if (f === 'money' || f === 'percent') return 2;
  return undefined;
}

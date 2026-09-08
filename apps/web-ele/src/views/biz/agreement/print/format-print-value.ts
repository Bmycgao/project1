/**
 * 打印展示格式：文本用 agreeFormat，表格列用 agreeColFormat（经 hiprint formatter2 eval）
 * 表格只改显示，不改行上的 number，避免 tableSummary 合计失效
 */

/** 支持的格式类型 */
export type AgreePrintFormat =
  | 'date'
  | 'dateCn'
  | 'dateCnShort'
  | 'dateCompact'
  | 'dateDot'
  | 'dateSlash'
  | 'datetime'
  | 'datetimeCn'
  | 'datetimeCnSecond'
  | 'datetimeSecond'
  | 'datetimeSlash'
  | 'integer'
  | 'money0'
  | 'money1'
  | 'money3'
  | 'money4'
  | 'money'
  | 'moneyCn'
  | 'moneySymbol0'
  | 'moneySymbol'
  | 'number0'
  | 'number1'
  | 'number2'
  | 'number3'
  | 'number4'
  | 'percent0'
  | 'percent1'
  | 'percent'
  | 'percentRaw2'
  | 'percentRaw'
  | 'time'
  | 'timeSecond'
  | string;

/** 设计器格式分组；value 保持兼容已有模板。 */
export const AGREE_PRINT_FORMAT_GROUPS: ReadonlyArray<{
  label: string;
  options: ReadonlyArray<{ label: string; value: string }>;
}> = [
  {
    label: '数字',
    options: [
      { label: '四舍五入取整（12346）', value: 'integer' },
      { label: '千分位整数（12,346）', value: 'number0' },
      { label: '小数 1 位（12,345.7）', value: 'number1' },
      { label: '小数 2 位（12,345.67）', value: 'number2' },
      { label: '小数 3 位（12,345.670）', value: 'number3' },
      { label: '小数 4 位（12,345.6700）', value: 'number4' },
      { label: '百分比 0 位（12%）', value: 'percent0' },
      { label: '百分比 1 位（12.3%）', value: 'percent1' },
      { label: '百分比 2 位（12.34%）', value: 'percent' },
      { label: '原数值加 %（12%）', value: 'percentRaw' },
      { label: '原数值加 % 2 位（12.00%）', value: 'percentRaw2' },
    ],
  },
  {
    label: '金额',
    options: [
      { label: '千分位整数（12,346）', value: 'money0' },
      { label: '千分位 1 位（12,345.7）', value: 'money1' },
      { label: '千分位 2 位（12,345.67）', value: 'money' },
      { label: '千分位 3 位（12,345.670）', value: 'money3' },
      { label: '千分位 4 位（12,345.6700）', value: 'money4' },
      { label: '人民币符号整数（¥12,346）', value: 'moneySymbol0' },
      { label: '人民币符号 2 位（¥12,345.67）', value: 'moneySymbol' },
      { label: '人民币大写（壹万贰仟…）', value: 'moneyCn' },
    ],
  },
  {
    label: '日期',
    options: [
      { label: 'YYYY-MM-DD', value: 'date' },
      { label: 'YYYY/MM/DD', value: 'dateSlash' },
      { label: 'YYYY.MM.DD', value: 'dateDot' },
      { label: 'YYYYMMDD', value: 'dateCompact' },
      { label: 'YYYY年MM月DD日', value: 'dateCn' },
      { label: 'YYYY年M月D日', value: 'dateCnShort' },
    ],
  },
  {
    label: '日期时间',
    options: [
      { label: 'YYYY-MM-DD HH:mm', value: 'datetime' },
      { label: 'YYYY-MM-DD HH:mm:ss', value: 'datetimeSecond' },
      { label: 'YYYY/MM/DD HH:mm', value: 'datetimeSlash' },
      { label: '中文日期时间（到分）', value: 'datetimeCn' },
      { label: '中文日期时间（到秒）', value: 'datetimeCnSecond' },
    ],
  },
  {
    label: '时间',
    options: [
      { label: 'HH:mm', value: 'time' },
      { label: 'HH:mm:ss', value: 'timeSecond' },
    ],
  },
];

/** 扁平列表保留给帮助面板和旧调用方。 */
export const AGREE_PRINT_FORMAT_PRESETS = AGREE_PRINT_FORMAT_GROUPS.flatMap(
  (group) => group.options,
);

/** 解析后的年月日时分（失败为 null） */
interface DateParts {
  d: string;
  h: string;
  mi: string;
  mo: string;
  s: string;
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
      s: pad2(value.getSeconds()),
    };
  }
  const s = String(value).trim();
  const iso =
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(
      s,
    );
  if (iso) {
    return {
      y: iso[1] || '',
      mo: pad2(iso[2] || ''),
      d: pad2(iso[3] || ''),
      h: pad2(iso[4] || '00'),
      mi: iso[5] || '00',
      s: iso[6] || '00',
    };
  }
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (compact) {
    return {
      y: compact[1] || '',
      mo: compact[2] || '',
      d: compact[3] || '',
      h: '00',
      mi: '00',
      s: '00',
    };
  }
  const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (timeOnly) {
    return {
      y: '',
      mo: '',
      d: '',
      h: pad2(timeOnly[1] || '0'),
      mi: pad2(timeOnly[2] || '0'),
      s: pad2(timeOnly[3] || '0'),
    };
  }
  const num = Number(s);
  if (Number.isFinite(num) && s.length >= 10) {
    const dt = new Date(s.length === 10 ? num * 1000 : num);
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

/** 数字金额转人民币大写，非数值由调用方原样保留。 */
function formatChineseMoney(value: unknown): null | string {
  const num = Number(value);
  if (!Number.isFinite(num) || Math.abs(num) >= 1e16) return null;
  const digits = '零壹贰叁肆伍陆柒捌玖';
  const smallUnits = ['', '拾', '佰', '仟'];
  const sectionUnits = ['', '万', '亿', '万亿'];
  const sectionToCn = (input: number) => {
    let section = input;
    let unitIndex = 0;
    let zeroPending = false;
    let result = '';
    while (section > 0) {
      const digit = section % 10;
      if (digit === 0) {
        if (!zeroPending && result) result = `${digits[0]}${result}`;
        zeroPending = true;
      } else {
        result = `${digits[digit]}${smallUnits[unitIndex]}${result}`;
        zeroPending = false;
      }
      unitIndex += 1;
      section = Math.floor(section / 10);
    }
    return result.replaceAll(/零+$/g, '');
  };
  const negative = num < 0 ? '负' : '';
  const cents = Math.round(Math.abs(num) * 100);
  let integer = Math.floor(cents / 100);
  let integerText = '';
  let sectionIndex = 0;
  let insertZero = false;
  if (integer === 0) integerText = digits[0] || '';
  while (integer > 0) {
    const section = integer % 10_000;
    if (section > 0) {
      const prefix = insertZero && integerText ? digits[0] : '';
      integerText = `${sectionToCn(section)}${sectionUnits[sectionIndex]}${prefix}${integerText}`;
    }
    insertZero = section > 0 && section < 1000;
    integer = Math.floor(integer / 10_000);
    sectionIndex += 1;
  }
  integerText = integerText.replaceAll(/零+/g, '零').replaceAll(/零$/g, '');
  const jiao = Math.floor((cents % 100) / 10);
  const fen = cents % 10;
  const fraction = `${jiao ? `${digits[jiao]}角` : fen ? '零' : ''}${
    fen ? `${digits[fen]}分` : jiao ? '' : '整'
  }`;
  return `${negative}${integerText}元${fraction}`;
}

/**
 * 按 agreeFormat / agreeColFormat 格式化展示值
 * @param value 原始值
 * @param format 格式标识
 * @param ctx 上下文（非数值 moneyCn 可回退到 amountCn）
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
    case 'dateCnShort': {
      if (parts?.y) {
        return `${parts.y}年${Number(parts.mo)}月${Number(parts.d)}日`;
      }
      return String(value ?? '');
    }
    case 'dateCompact': {
      if (parts?.y) return `${parts.y}${parts.mo}${parts.d}`;
      return String(value ?? '');
    }
    case 'dateDot': {
      if (parts?.y) return `${parts.y}.${parts.mo}.${parts.d}`;
      return String(value ?? '');
    }
    case 'dateSlash': {
      if (parts?.y) return `${parts.y}/${parts.mo}/${parts.d}`;
      return String(value ?? '');
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
    case 'datetimeCnSecond': {
      if (parts?.y) {
        return `${parts.y}年${parts.mo}月${parts.d}日 ${parts.h}:${parts.mi}:${parts.s}`;
      }
      return String(value ?? '');
    }
    case 'datetimeSecond': {
      if (parts?.y) {
        return `${parts.y}-${parts.mo}-${parts.d} ${parts.h}:${parts.mi}:${parts.s}`;
      }
      return String(value ?? '');
    }
    case 'datetimeSlash': {
      if (parts?.y) {
        return `${parts.y}/${parts.mo}/${parts.d} ${parts.h}:${parts.mi}`;
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
    case 'money1': {
      return formatMoney(value, 1);
    }
    case 'money3': {
      return formatMoney(value, 3);
    }
    case 'money4': {
      return formatMoney(value, 4);
    }
    case 'moneyCn': {
      return formatChineseMoney(value) ?? String(ctx?.amountCn ?? value ?? '');
    }
    case 'moneySymbol': {
      return `¥${formatMoney(value, 2)}`;
    }
    case 'moneySymbol0': {
      return `¥${formatMoney(value, 0)}`;
    }
    case 'number0': {
      return formatMoney(value, 0);
    }
    case 'number1': {
      return formatMoney(value, 1);
    }
    case 'number2': {
      return formatMoney(value, 2);
    }
    case 'number3': {
      return formatMoney(value, 3);
    }
    case 'number4': {
      return formatMoney(value, 4);
    }
    case 'percent': {
      const num = Number(value);
      if (!Number.isFinite(num)) return '';
      return `${(num * 100).toFixed(2)}%`;
    }
    case 'percent0':
    case 'percent1': {
      const num = Number(value);
      if (!Number.isFinite(num)) return '';
      return `${(num * 100).toFixed(f === 'percent0' ? 0 : 1)}%`;
    }
    case 'percentRaw':
    case 'percentRaw2': {
      const num = Number(value);
      if (!Number.isFinite(num)) return '';
      return `${num.toFixed(f === 'percentRaw' ? 0 : 2)}%`;
    }
    case 'time': {
      if (parts) return `${parts.h}:${parts.mi}`;
      return String(value ?? '');
    }
    case 'timeSecond': {
      if (parts) return `${parts.h}:${parts.mi}:${parts.s}`;
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
        return { y: String(v.getFullYear()), mo: pad2(v.getMonth() + 1), d: pad2(v.getDate()), h: pad2(v.getHours()), mi: pad2(v.getMinutes()), s: pad2(v.getSeconds()) };
      }
      var s = String(v).trim();
      var iso = /^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})(?:[T\\s](\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?/.exec(s);
      if (iso) return { y: iso[1], mo: pad2(iso[2]), d: pad2(iso[3]), h: pad2(iso[4] || '00'), mi: iso[5] || '00', s: iso[6] || '00' };
      var compact = /^(\\d{4})(\\d{2})(\\d{2})$/.exec(s);
      if (compact) return { y: compact[1], mo: compact[2], d: compact[3], h: '00', mi: '00', s: '00' };
      var timeOnly = /^(\\d{1,2}):(\\d{2})(?::(\\d{2}))?$/.exec(s);
      if (timeOnly) return { y: '', mo: '', d: '', h: pad2(timeOnly[1] || '0'), mi: pad2(timeOnly[2] || '0'), s: pad2(timeOnly[3] || '0') };
      var n = Number(s);
      if (isFinite(n) && s.length >= 10) {
        var dt = new Date(s.length === 10 ? n * 1000 : n);
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
    function chineseMoney(v) {
      var num = Number(v);
      if (!isFinite(num) || Math.abs(num) >= 1e16) return null;
      var digits = '零壹贰叁肆伍陆柒捌玖';
      var smallUnits = ['', '拾', '佰', '仟'];
      var sectionUnits = ['', '万', '亿', '万亿'];
      function sectionToCn(input) {
        var section = input;
        var unitIndex = 0;
        var zeroPending = false;
        var result = '';
        while (section > 0) {
          var digit = section % 10;
          if (digit === 0) {
            if (!zeroPending && result) result = digits[0] + result;
            zeroPending = true;
          } else {
            result = digits[digit] + smallUnits[unitIndex] + result;
            zeroPending = false;
          }
          unitIndex += 1;
          section = Math.floor(section / 10);
        }
        return result.replace(/零+$/g, '');
      }
      var negative = num < 0 ? '负' : '';
      var cents = Math.round(Math.abs(num) * 100);
      var integer = Math.floor(cents / 100);
      var integerText = integer === 0 ? digits[0] : '';
      var sectionIndex = 0;
      var insertZero = false;
      while (integer > 0) {
        var section = integer % 10000;
        if (section > 0) {
          var prefix = insertZero && integerText ? digits[0] : '';
          integerText = sectionToCn(section) + sectionUnits[sectionIndex] + prefix + integerText;
        }
        insertZero = section > 0 && section < 1000;
        integer = Math.floor(integer / 10000);
        sectionIndex += 1;
      }
      integerText = integerText.replace(/零+/g, '零').replace(/零$/g, '');
      var jiao = Math.floor((cents % 100) / 10);
      var fen = cents % 10;
      var fraction = (jiao ? digits[jiao] + '角' : fen ? '零' : '') + (fen ? digits[fen] + '分' : jiao ? '' : '整');
      return negative + integerText + '元' + fraction;
    }
    var p = partsOf(value);
    if (fmt === 'date') return p && p.y ? p.y + '-' + p.mo + '-' + p.d : String(value).slice(0, 10);
    if (fmt === 'dateSlash') return p && p.y ? p.y + '/' + p.mo + '/' + p.d : String(value);
    if (fmt === 'dateDot') return p && p.y ? p.y + '.' + p.mo + '.' + p.d : String(value);
    if (fmt === 'dateCompact') return p && p.y ? p.y + p.mo + p.d : String(value);
    if (fmt === 'dateCn') return p && p.y ? p.y + '年' + p.mo + '月' + p.d + '日' : String(value);
    if (fmt === 'dateCnShort') return p && p.y ? p.y + '年' + Number(p.mo) + '月' + Number(p.d) + '日' : String(value);
    if (fmt === 'datetime') return p && p.y ? p.y + '-' + p.mo + '-' + p.d + ' ' + p.h + ':' + p.mi : String(value);
    if (fmt === 'datetimeSecond') return p && p.y ? p.y + '-' + p.mo + '-' + p.d + ' ' + p.h + ':' + p.mi + ':' + p.s : String(value);
    if (fmt === 'datetimeSlash') return p && p.y ? p.y + '/' + p.mo + '/' + p.d + ' ' + p.h + ':' + p.mi : String(value);
    if (fmt === 'datetimeCn') return p && p.y ? p.y + '年' + p.mo + '月' + p.d + '日 ' + p.h + ':' + p.mi : String(value);
    if (fmt === 'datetimeCnSecond') return p && p.y ? p.y + '年' + p.mo + '月' + p.d + '日 ' + p.h + ':' + p.mi + ':' + p.s : String(value);
    if (fmt === 'time') return p ? p.h + ':' + p.mi : String(value);
    if (fmt === 'timeSecond') return p ? p.h + ':' + p.mi + ':' + p.s : String(value);
    if (fmt === 'integer') return String(Math.round(Number(value) || 0));
    if (fmt === 'number0') return money(value, 0);
    if (fmt === 'number1') return money(value, 1);
    if (fmt === 'number2') return money(value, 2);
    if (fmt === 'number3') return money(value, 3);
    if (fmt === 'number4') return money(value, 4);
    if (fmt === 'money') return money(value, 2);
    if (fmt === 'money0') return money(value, 0);
    if (fmt === 'money1') return money(value, 1);
    if (fmt === 'money3') return money(value, 3);
    if (fmt === 'money4') return money(value, 4);
    if (fmt === 'moneySymbol') return '¥' + money(value, 2);
    if (fmt === 'moneySymbol0') return '¥' + money(value, 0);
    if (fmt === 'moneyCn') return chineseMoney(value) || value;
    if (fmt === 'percent' || fmt === 'percent0' || fmt === 'percent1') {
      var pn = Number(value);
      var pd = fmt === 'percent0' ? 0 : fmt === 'percent1' ? 1 : 2;
      return isFinite(pn) ? (pn * 100).toFixed(pd) + '%' : '';
    }
    if (fmt === 'percentRaw' || fmt === 'percentRaw2') {
      var prn = Number(value);
      return isFinite(prn) ? prn.toFixed(fmt === 'percentRaw' ? 0 : 2) + '%' : '';
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
  if (
    f === 'integer' ||
    f === 'money0' ||
    f === 'moneySymbol0' ||
    f === 'number0' ||
    f === 'percent0' ||
    f === 'percentRaw'
  )
    return 0;
  if (f === 'money1' || f === 'number1' || f === 'percent1') return 1;
  if (
    f === 'money' ||
    f === 'moneySymbol' ||
    f === 'number2' ||
    f === 'percent' ||
    f === 'percentRaw2'
  )
    return 2;
  if (f === 'money3' || f === 'number3') return 3;
  if (f === 'money4' || f === 'number4') return 4;
  return undefined;
}

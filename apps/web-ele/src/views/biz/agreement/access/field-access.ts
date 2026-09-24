/**
 * 协议字段权限与展示格式：
 * - fieldRules + accessCodes 控制显隐/可编辑
 * - displayFormat 控制金额/日期等展示（文档 2.5）
 * 权限码：Agree:Field:{key}，超管 Agree:* / Agree:Field:* 全开
 */

/** 字段展示格式（配置在 fieldRules 上） */
export interface AgreeFieldDisplayFormat {
  /** 展示类型 */
  type?: 'date' | 'money' | 'text';
  /**
   * 日期格式
   * - YYYY-MM-DD
   * - YYYY年MM月DD日
   */
  datePattern?: 'YYYY-MM-DD' | 'YYYY年MM月DD日';
  /** 金额是否千分位，默认 true */
  thousandSeparator?: boolean;
  /** 小数位数，金额默认 2 */
  decimals?: number;
  /** 前缀，如 ¥ */
  prefix?: string;
}

/** 单字段规则（列表 field 或详情逻辑名） */
export interface AgreeFieldRule {
  /** 字段标识，如 batchGroup / phone / amount */
  field: string;
  /** 强制对所有人隐藏 */
  hidden?: boolean;
  /**
   * 可见所需权限码（任一命中即可）；不配则默认可见
   * 例：['Agree:Field:phone']
   */
  visibleCodes?: string[];
  /**
   * 可编辑所需权限码（任一命中）；不配则可见即可编辑
   * 有配置但未命中 → 只读
   */
  editableCodes?: string[];
  /** 展示格式（金额/日期等） */
  displayFormat?: AgreeFieldDisplayFormat;
  /** 备注（配置页提示） */
  remark?: string;
}

/** 字段访问结果 */
export interface AgreeFieldAccess {
  visible: boolean;
  editable: boolean;
}

/**
 * 是否命中任一权限码（含通配）
 * @param accessCodes 用户权限码
 * @param need 需要的码
 */
export function matchAccessCodes(
  accessCodes: string[] | undefined,
  need: string[] | undefined,
): boolean {
  if (!need?.length) return true;
  const set = new Set(accessCodes || []);
  if (set.has('Agree:*') || set.has('Agree:Field:*')) return true;
  return need.some((c) => set.has(c));
}

/**
 * 解析单个字段的可见/可编辑
 * @param field 字段名
 * @param rules 规则列表
 * @param accessCodes 用户权限码
 */
export function resolveFieldAccess(
  field: string,
  rules: AgreeFieldRule[] | undefined,
  accessCodes: string[] | undefined,
): AgreeFieldAccess {
  const rule = (rules || []).find((r) => r.field === field);
  if (!rule) {
    return { visible: true, editable: true };
  }
  if (rule.hidden) {
    return { visible: false, editable: false };
  }
  const visible = matchAccessCodes(accessCodes, rule.visibleCodes);
  if (!visible) {
    return { visible: false, editable: false };
  }
  const editable = rule.editableCodes?.length
    ? matchAccessCodes(accessCodes, rule.editableCodes)
    : true;
  return { visible, editable };
}

/**
 * 取字段展示格式配置
 * @param field 字段名
 * @param rules 规则列表
 */
export function getFieldDisplayFormat(
  field: string,
  rules: AgreeFieldRule[] | undefined,
): AgreeFieldDisplayFormat | undefined {
  return (rules || []).find((r) => r.field === field)?.displayFormat;
}

/**
 * 按 displayFormat 格式化展示值（列表只读单元格 / 详情只读态）
 * @param value 原始值
 * @param format 展示格式；无则原样转字符串
 */
export function formatAgreeFieldValue(
  value: unknown,
  format?: AgreeFieldDisplayFormat | null,
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (!format?.type || format.type === 'text') {
    return String(value);
  }

  if (format.type === 'money') {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    const decimals = format.decimals ?? 2;
    const useSep = format.thousandSeparator !== false;
    const fixed = n.toFixed(decimals);
    const [intPart, decPart] = fixed.split('.');
    const intText = useSep
      ? (intPart || '0').replaceAll(/\B(?=(\d{3})+(?!\d))/g, ',')
      : intPart || '0';
    const body =
      decimals > 0 && decPart !== undefined ? `${intText}.${decPart}` : intText;
    return `${format.prefix ?? ''}${body}`;
  }

  if (format.type === 'date') {
    const raw = String(value).trim();
    const m = raw.match(/^(\d{4})[-/]?(\d{1,2})[-/]?(\d{1,2})/);
    if (!m) return raw;
    const y = m[1];
    const moRaw = m[2];
    const dRaw = m[3];
    if (!y || !moRaw || !dRaw) return raw;
    const mo = moRaw.padStart(2, '0');
    const d = dRaw.padStart(2, '0');
    if (format.datePattern === 'YYYY年MM月DD日') {
      return `${y}年${mo}月${d}日`;
    }
    return `${y}-${mo}-${d}`;
  }

  return String(value);
}

/**
 * 过滤列表列（无权限则不展示）
 * @param columns 列
 * @param rules 字段规则
 * @param accessCodes 用户权限码
 */
export function filterColumnsByFieldRules<
  T extends { field: string; visible?: boolean },
>(
  columns: T[],
  rules: AgreeFieldRule[] | undefined,
  accessCodes: string[] | undefined,
): T[] {
  return (columns || []).filter((col) => {
    if (col.visible === false) return false;
    return resolveFieldAccess(col.field, rules, accessCodes).visible;
  });
}

/** 内置演示规则（与 PS_AGREE_COLS.fieldRules 对齐） */
export const DEFAULT_AGREE_FIELD_RULES: AgreeFieldRule[] = [
  {
    field: 'batchGroup',
    visibleCodes: ['Agree:Field:batchGroup'],
    remark: '列表-批次分组（敏感业务分组）',
  },
  {
    field: 'phone',
    visibleCodes: ['Agree:Field:phone'],
    editableCodes: ['Agree:Field:phone'],
    remark: '电话（权利人/通讯）',
  },
  {
    field: 'idNo',
    visibleCodes: ['Agree:Field:idNo'],
    editableCodes: ['Agree:Field:idNo'],
    remark: '身份证号',
  },
  {
    field: 'amount',
    visibleCodes: ['Agree:Field:amount'],
    editableCodes: ['Agree:Field:amount'],
    remark: '补偿金额',
    displayFormat: {
      type: 'money',
      thousandSeparator: true,
      decimals: 2,
      prefix: '¥',
    },
  },
  {
    field: 'debtAmount',
    visibleCodes: ['Agree:Field:debtAmount'],
    editableCodes: ['Agree:Field:debtAmount'],
    remark: '担保主债权金额',
    displayFormat: {
      type: 'money',
      thousandSeparator: true,
      decimals: 2,
      prefix: '¥',
    },
  },
  {
    field: 'signDate',
    remark: '签约日期展示格式',
    displayFormat: {
      type: 'date',
      datePattern: 'YYYY年MM月DD日',
    },
  },
];

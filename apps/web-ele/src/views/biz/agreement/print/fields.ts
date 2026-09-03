/**
 * 协议打印可绑定字段源（数据源面板可拖到纸面）
 */
import { AGREE_PRINT_FORMAT_PRESETS } from './format-print-value';

export interface AgreePrintFieldItem {
  /** 数据 JSON 的 key */
  field: string;
  /** 展示名 */
  text: string;
  /** 设计态测试值 */
  testData?: string;
  /** hiprint 文本类型：普通 / 二维码 / 条形码 */
  textType?: 'barcode' | 'qrcode' | 'text';
  /** 字典分组 */
  group?: 'derived' | 'table' | 'text';
}

/** 表格列预设（绑定数据源后可一键套用） */
export interface AgreePrintColumnPreset {
  title: string;
  field: string;
  width: number;
  align?: 'center' | 'left' | 'right';
  /** 是否默认开列合计 */
  tableSummary?: 'sum';
  /** 同一列上下相同值合并 */
  agreeMergeSame?: boolean;
  /** 值为 0 时格子显示空 */
  agreeHideZero?: boolean;
  /** 单元格展示格式，如 money0 / dateCn */
  agreeColFormat?: string;
}

/** 主表文本字段（协议详情扁平值） */
export const AGREE_PRINT_TEXT_FIELDS: AgreePrintFieldItem[] = [
  {
    field: 'agreementNo',
    text: '协议编号',
    testData: 'XY-2026-001',
    group: 'text',
  },
  {
    field: 'agreementName',
    text: '协议名称',
    testData: '某某项目征收补偿协议',
    group: 'text',
  },
  { field: 'compensatee', text: '被征收人', testData: '张三', group: 'text' },
  { field: 'acquirer', text: '征收人', testData: '某区征收办', group: 'text' },
  {
    field: 'department',
    text: '所属部门',
    testData: '征收事务中心',
    group: 'text',
  },
  {
    field: 'signDate',
    text: '签约日期',
    testData: '2026-03-01',
    group: 'text',
  },
  { field: 'statusValue', text: '状态', testData: '已签约', group: 'text' },
  { field: 'amount', text: '协议金额', testData: '760000', group: 'text' },
  {
    field: 'amountCn',
    text: '金额大写',
    testData: '柒拾陆万元整',
    group: 'text',
  },
  { field: 'remark', text: '备注', testData: '', group: 'text' },
  {
    field: 'qrcodeContent',
    text: '二维码内容',
    testData: 'AGREE:XY-2026-001',
    textType: 'qrcode',
    group: 'text',
  },
  {
    field: 'barcodeContent',
    text: '条形码内容',
    testData: 'XY-2026-001',
    textType: 'barcode',
    group: 'text',
  },
  {
    field: 'printMeta',
    text: '打印元信息',
    testData: '协议|XY-2026-001|张三',
    group: 'text',
  },
];

/** 表格数据源（整表绑定的数组 key） */
export const AGREE_PRINT_TABLE_FIELDS: AgreePrintFieldItem[] = [
  { field: 'houses', text: '房屋明细', group: 'table' },
  { field: 'compensationItems', text: '补偿安置', group: 'table' },
  { field: 'rewardItems', text: '奖励补贴', group: 'table' },
];

/** 由业务数据派生、供条件/公式使用 */
export const AGREE_PRINT_DERIVED_FIELDS: AgreePrintFieldItem[] = [
  {
    field: 'compensationTotal',
    text: '补偿合计',
    testData: '500000',
    group: 'derived',
  },
  {
    field: 'rewardTotal',
    text: '奖励合计',
    testData: '260000',
    group: 'derived',
  },
  {
    field: 'hasRewards',
    text: '是否有奖励',
    testData: 'true',
    group: 'derived',
  },
  {
    field: 'isHighAmount',
    text: '是否高额协议',
    testData: 'true',
    group: 'derived',
  },
  { field: 'houseCount', text: '房屋套数', testData: '2', group: 'derived' },
  {
    field: 'totalBuildArea',
    text: '建筑面积合计',
    testData: '131',
    group: 'derived',
  },
  {
    field: 'totalEvalValue',
    text: '评估价值合计',
    testData: '760000',
    group: 'derived',
  },
];

/** 各表推荐列（套用后写入表格 columns） */
export const TABLE_COLUMN_PRESETS: Record<string, AgreePrintColumnPreset[]> = {
  houses: [
    {
      title: '户名',
      field: 'householdName',
      width: 70,
      align: 'center',
      agreeMergeSame: true,
    },
    { title: '序号', field: 'index', width: 36, align: 'center' },
    { title: '房屋地址', field: 'address', width: 120, align: 'left' },
    { title: '产权证号', field: 'certNo', width: 80, align: 'center' },
    {
      title: '房屋类型',
      field: 'houseType',
      width: 64,
      align: 'center',
      agreeMergeSame: true,
    },
    {
      title: '建筑面积',
      field: 'buildArea',
      width: 60,
      align: 'right',
      tableSummary: 'sum',
    },
    {
      title: '征收面积',
      field: 'expropriatedArea',
      width: 60,
      align: 'right',
      tableSummary: 'sum',
    },
    {
      title: '评估价值',
      field: 'evalValue',
      width: 60,
      align: 'right',
      tableSummary: 'sum',
      agreeColFormat: 'money0',
    },
  ],
  compensationItems: [
    { title: '序号', field: 'index', width: 42, align: 'center' },
    { title: '补偿项目', field: 'name', width: 160, align: 'left' },
    { title: '计算方式', field: 'calcType', width: 80, align: 'center' },
    { title: '数量', field: 'quantity', width: 56, align: 'right' },
    {
      title: '单价',
      field: 'unitPrice',
      width: 64,
      align: 'right',
      agreeColFormat: 'money',
    },
    {
      title: '金额',
      field: 'amount',
      width: 72,
      align: 'right',
      tableSummary: 'sum',
      agreeColFormat: 'money',
    },
    { title: '说明', field: 'remark', width: 76, align: 'left' },
  ],
  rewardItems: [
    { title: '序号', field: 'index', width: 42, align: 'center' },
    { title: '奖励项目', field: 'name', width: 180, align: 'left' },
    {
      title: '金额',
      field: 'amount',
      width: 120,
      align: 'right',
      tableSummary: 'sum',
      agreeColFormat: 'money',
    },
    { title: '说明', field: 'remark', width: 208, align: 'left' },
  ],
};

/** hiprint 原生字段下拉 + 检视器全集（去重 field） */
export const AGREE_PRINT_ALL_FIELDS: AgreePrintFieldItem[] = [
  ...AGREE_PRINT_TEXT_FIELDS,
  ...AGREE_PRINT_DERIVED_FIELDS,
  ...AGREE_PRINT_TABLE_FIELDS,
];

/** @deprecated 码图已改为通用组件，保留导出以免旧引用报错 */
export const AGREE_PRINT_CODE_FIELDS: AgreePrintFieldItem[] = [
  {
    field: 'qrcodeContent',
    text: '二维码内容',
    testData: 'AGREE:XY-2026-001',
    textType: 'qrcode',
  },
  {
    field: 'barcodeContent',
    text: '条形码内容',
    testData: 'XY-2026-001',
    textType: 'barcode',
  },
];

/**
 * 字段下拉展示：中文名 + 英文 key
 * @param item 字段项
 */
export function formatPrintFieldLabel(
  item: Pick<AgreePrintFieldItem, 'field' | 'text'>,
) {
  return `${item.text} (${item.field})`;
}

/**
 * 把列预设转成 hiprint columns 一行
 * @param tableField 表格数据源 key
 */
export function buildPresetTableColumns(tableField: string) {
  const presets = TABLE_COLUMN_PRESETS[tableField] || [];
  return presets.map((col) => ({
    title: col.title,
    field: col.field,
    width: col.width,
    align: col.align || 'left',
    colspan: 1,
    rowspan: 1,
    checked: true,
    ...(col.tableSummary ? { tableSummary: col.tableSummary } : {}),
    ...(col.agreeMergeSame ? { agreeMergeSame: true } : {}),
    ...(col.agreeHideZero ? { agreeHideZero: true } : {}),
    ...(col.agreeColFormat ? { agreeColFormat: col.agreeColFormat } : {}),
  }));
}

/** 表达式快捷预设（设计器一键填入） */
export const PRINT_EXPR_PRESETS = {
  visibleWhen: [
    { label: '有奖励', value: 'hasRewards' },
    { label: '无奖励', value: '!hasRewards' },
    { label: '高额协议', value: 'isHighAmount' },
    { label: '金额>50万', value: 'amount > 500000' },
    { label: '多套房', value: 'houseCount >= 2' },
    { label: '组长已复核', value: 'statusValue == "组长已复核"' },
    { label: '已签约', value: 'IN(statusValue, "已签约", "签约已确认")' },
    { label: '有被征收人', value: 'compensatee' },
    { label: '始终隐藏', value: 'false' },
  ],
  rowFilter: [
    { label: '数值列>0', value: 'amount > 0' },
    { label: '列不为空', value: '!EMPTY(name)' },
  ],
  valueExpr: [
    { label: '金额千分位', value: 'FORMAT_MONEY(amount)' },
    { label: '补偿+奖励', value: 'compensationTotal + rewardTotal' },
    { label: '无奖励显示0', value: 'IF(hasRewards, rewardTotal, 0)' },
    { label: '房屋建面合计', value: 'SUM(houses, "buildArea")' },
    { label: '拼接元信息', value: 'CONCAT(agreementNo, " | ", compensatee)' },
  ],
  format: [...AGREE_PRINT_FORMAT_PRESETS],
} as const;

/**
 * 打印表达式说明（设计器帮助面板）
 */
export const PRINT_EXPR_HELP = [
  {
    title: '怎么用',
    lines: [
      '「规则」里配整块显隐；表格还可筛行',
      '快捷按钮只填公式，不切换样例。正式打印走真实协议',
      '画布仍显示全部元素，用「快速预览」看显隐 / 过滤 / 回流',
    ],
  },
  {
    title: '条件显隐',
    lines: [
      '简单：hasRewards、!hasRewards、isHighAmount',
      '比较：amount > 500000、houseCount >= 2',
      '相等：statusValue == "组长已复核"',
      '组合：hasRewards && amount > 300000',
      '页眉字段填回流组 header：同一行少一个则通栏，整行都藏才上移',
    ],
  },
  {
    title: '回流组',
    lines: [
      '页眉键值填 header：同一行少一个则剩下的拉通栏，整行都藏才上移',
      '协议名称是通栏，不会去占征收人那个半格',
      '房屋 houses / 补偿 compensation / 奖励 rewards：小标题和表必须同组，整段藏掉下方才顶上来',
      '二维码、大标题不要进组',
    ],
  },
  {
    title: '表格筛行',
    lines: [
      '点中表格 → 「规则」→ 「筛选打印行」：选列、比较符、值',
      '快捷项按当前表列生成（某列>0 / 不为空）',
      '和「整块隐藏」不是一回事。画布仍显示全部样例行，请用「快速预览」核对',
      '列上「合并」只合同一列上下相邻；「隐零」只把 0 显示成空',
      '列上「格式」只改打印显示，不改原始数字，表尾合计仍可用',
    ],
  },
  {
    title: '文本格式',
    lines: [
      '对绑定 field 的原值做格式化（金额、日期时间等）',
      '表格列请在「数据」里选「格式」，合计仍按数字加总',
      '可选：money / money0 / moneyCn / date / dateCn / datetime / datetimeCn / time / percent / integer',
    ],
  },
  {
    title: '敏感数据',
    lines: [
      '模板只存字段名，不存真实姓名/证号；设计器「张三」是假样例',
      '二维码/条码只编码协议编号，不拼被征收人',
      '正式打印按 Agree:Field:* 对无权限字段打码 ***，不要靠删列当权限',
      '某列永远不印：不绑该列或用条件显隐；与权限打码是两件事',
      '粘贴数据源 JSON 时不要贴生产库真实隐私',
    ],
  },
];

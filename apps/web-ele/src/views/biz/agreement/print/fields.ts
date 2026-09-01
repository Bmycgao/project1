/**
 * 协议打印可绑定字段源（数据源面板可拖到纸面）
 */
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
    { title: '户名', field: 'householdName', width: 70, align: 'center' },
    { title: '序号', field: 'index', width: 36, align: 'center' },
    { title: '房屋地址', field: 'address', width: 120, align: 'left' },
    { title: '产权证号', field: 'certNo', width: 80, align: 'center' },
    { title: '房屋类型', field: 'houseType', width: 64, align: 'center' },
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
    },
  ],
  compensationItems: [
    { title: '序号', field: 'index', width: 42, align: 'center' },
    { title: '补偿项目', field: 'name', width: 160, align: 'left' },
    { title: '计算方式', field: 'calcType', width: 80, align: 'center' },
    { title: '数量', field: 'quantity', width: 56, align: 'right' },
    { title: '单价', field: 'unitPrice', width: 64, align: 'right' },
    {
      title: '金额',
      field: 'amount',
      width: 72,
      align: 'right',
      tableSummary: 'sum',
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
  ],
  rowFilter: [
    { label: '评估价>0', value: 'evalValue > 0' },
    { label: '建面≥50', value: 'buildArea >= 50' },
    { label: '住宅', value: 'houseType == "住宅"' },
    { label: '金额>1万', value: 'amount > 10000' },
  ],
  valueExpr: [
    { label: '金额千分位', value: 'FORMAT_MONEY(amount)' },
    { label: '补偿+奖励', value: 'compensationTotal + rewardTotal' },
    { label: '无奖励显示0', value: 'IF(hasRewards, rewardTotal, 0)' },
    { label: '房屋建面合计', value: 'SUM(houses, "buildArea")' },
    { label: '拼接元信息', value: 'CONCAT(agreementNo, " | ", compensatee)' },
  ],
  format: [
    { label: '金额(2位)', value: 'money' },
    { label: '金额(整数)', value: 'money0' },
    { label: '金额大写', value: 'moneyCn' },
    { label: '日期', value: 'date' },
    { label: '中文日期', value: 'dateCn' },
  ],
} as const;

/**
 * 打印表达式说明（设计器帮助面板）
 */
export const PRINT_EXPR_HELP = [
  {
    title: '怎么用',
    lines: [
      '显隐、格式写在本抽屉；表格筛行请用右侧「筛选打印行」弹窗',
      '按钮只填公式，不切换样例。正式打印走真实协议',
      '画布设计态仍显示全部元素，用「快速预览」看显隐/过滤结果',
    ],
  },
  {
    title: '条件显隐 agreeVisibleWhen',
    lines: [
      '简单：hasRewards、!hasRewards、isHighAmount',
      '比较：amount > 500000、houseCount >= 2',
      '相等：statusValue == "组长已复核"',
      '组合：hasRewards && amount > 300000',
    ],
  },
  {
    title: '表格行过滤',
    lines: [
      '点中表格 → 「筛选」Tab → 「筛选打印行」：选列、比较符、值',
      '不在本抽屉配置。画布仍显示全部样例行，请用「快速预览」核对',
    ],
  },
  {
    title: '展示格式 agreeFormat',
    lines: [
      '对绑定 field 的原值做格式化（金额、日期等）',
      '可选：money / money0 / moneyCn / date / dateCn / percent / integer',
    ],
  },
];

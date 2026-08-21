/**
 * 各详情块默认 FormCreate rule（字段 key 与业务数据对齐）
 * 表格使用 tableForm + props.columns，便于设计器 loadRule / 运行时渲染
 */
import type { FcRule } from './types';

const STATUS_OPTIONS = [
  { label: '告知单', value: '告知单' },
  { label: '待复核', value: '待复核' },
  { label: '待生效', value: '待生效' },
  { label: '已签约', value: '已签约' },
  { label: '组长已复核', value: '组长已复核' },
];

/**
 * 生成输入类字段
 * @param opts 字段配置
 */
function field(opts: {
  field: string;
  options?: { label: string; value: string }[];
  placeholder?: string;
  props?: Record<string, unknown>;
  required?: boolean;
  span?: number;
  title: string;
  type?: string;
}): FcRule {
  const type = opts.type || 'input';
  const node: FcRule = {
    type,
    field: opts.field,
    title: opts.title,
    col: { span: opts.span ?? 8 },
    props: {
      placeholder: opts.placeholder || `请输入${opts.title}`,
      ...opts.props,
    },
  };
  if (opts.required) {
    node.$required = true;
  }
  if (opts.options) {
    node.options = opts.options;
  }
  return node;
}

/**
 * 表格一列：表头 + 单元格控件
 * @param opts 列配置
 */
function tableCol(opts: {
  field: string;
  label: string;
  options?: { label: string; value: string }[];
  required?: boolean;
  type?: string;
  width?: string;
}): FcRule {
  const type = opts.type || 'input';
  const cell: FcRule = {
    type,
    field: opts.field,
    title: opts.label,
    props: {
      placeholder: `请输入${opts.label}`,
    },
  };
  if (opts.options) cell.options = opts.options;
  if (opts.required) cell.$required = true;
  return {
    label: opts.label,
    required: !!opts.required,
    align: 'left',
    style: { width: opts.width || '140px', color: '' },
    rule: [cell],
  };
}

/**
 * 表格表单外壳
 * @param field 绑定的数组字段名
 * @param title 标题
 * @param columns 列
 */
function tableForm(field: string, title: string, columns: FcRule[]): FcRule[] {
  return [
    {
      type: 'tableForm',
      field,
      title,
      info: '',
      props: {
        addable: true,
        deletable: true,
        showIndex: true,
        columns,
      },
      children: [],
    },
  ];
}

/** 基础信息默认表单 */
export function buildDefaultBasicFcRule(): FcRule[] {
  return [
    field({ field: 'agreementNo', title: '协议编号', required: true }),
    field({ field: 'agreementName', title: '协议名称', required: true }),
    field({ field: 'department', title: '所属部门' }),
    field({ field: 'acquirer', title: '征收人' }),
    field({ field: 'compensatee', title: '被征收人' }),
    field({ field: 'amount', title: '协议金额' }),
    field({
      type: 'datePicker',
      field: 'signDate',
      title: '签约日期',
      props: {
        type: 'date',
        format: 'YYYY-MM-DD',
        valueFormat: 'YYYY-MM-DD',
        placeholder: '请选择日期',
      },
    }),
    field({
      type: 'radio',
      field: 'statusValue',
      title: '状态',
      span: 16,
      options: STATUS_OPTIONS,
    }),
    field({
      type: 'textarea',
      field: 'remark',
      title: '备注',
      span: 24,
      placeholder: '请输入备注',
      props: { rows: 3 },
    }),
  ];
}

/** 协议人口默认表单 */
export function buildDefaultPopulationFcRule(): FcRule[] {
  return [
    field({ field: 'headName', title: '户主姓名', required: true }),
    field({ field: 'idNo', title: '身份证号' }),
    field({ field: 'familySize', title: '家庭人口' }),
    field({ field: 'phone', title: '联系电话' }),
    field({ field: 'hukouAddress', title: '户籍地址', span: 16 }),
    field({
      type: 'textarea',
      field: 'remark',
      title: '备注',
      span: 24,
      placeholder: '请输入备注',
      props: { rows: 3 },
    }),
  ];
}

/** 房屋信息默认表格 */
export function buildDefaultHousesFcRule(): FcRule[] {
  return tableForm('houses', '房屋信息', [
    tableCol({
      label: '房屋地址',
      field: 'address',
      width: '180px',
      required: true,
    }),
    tableCol({ label: '权证号', field: 'certNo' }),
    tableCol({ label: '产权性质', field: 'propertyType' }),
    tableCol({ label: '建筑面积', field: 'buildArea', width: '110px' }),
    tableCol({ label: '征收面积', field: 'expropriatedArea', width: '110px' }),
    tableCol({ label: '房屋类型', field: 'houseType' }),
    tableCol({ label: '结构', field: 'structure', width: '100px' }),
    tableCol({ label: '评估价值', field: 'evalValue', width: '120px' }),
  ]);
}

/** 补偿安置默认表格 */
export function buildDefaultCompensationFcRule(): FcRule[] {
  return tableForm('compensationItems', '补偿安置', [
    tableCol({ label: '补偿项目', field: 'name', required: true }),
    tableCol({ label: '计算方式', field: 'calcType' }),
    tableCol({ label: '数量', field: 'quantity', width: '90px' }),
    tableCol({ label: '单价', field: 'unitPrice', width: '110px' }),
    tableCol({ label: '金额', field: 'amount', width: '120px' }),
    tableCol({ label: '备注', field: 'remark', width: '160px' }),
  ]);
}

/** 奖励补贴默认表格 */
export function buildDefaultRewardsFcRule(): FcRule[] {
  return tableForm('rewardItems', '奖励补贴', [
    tableCol({ label: '奖励项目', field: 'name', required: true }),
    tableCol({ label: '条件', field: 'condition' }),
    tableCol({ label: '金额', field: 'amount', width: '120px' }),
    tableCol({ label: '备注', field: 'remark', width: '160px' }),
  ]);
}

/**
 * 自定义空白表单
 * @param label 组件名
 */
export function buildDefaultCustomFormFcRule(label: string): FcRule[] {
  return [
    field({
      field: 'name',
      title: `${label}名称`,
      span: 12,
    }),
    field({
      type: 'textarea',
      field: 'remark',
      title: '备注',
      span: 24,
      props: { rows: 3 },
    }),
  ];
}

/**
 * 自定义空白表格
 * @param label 组件名
 * @param field 绑定字段（自定义块用 rows）
 */
export function buildDefaultCustomTableFcRule(
  label: string,
  field = 'rows',
): FcRule[] {
  return tableForm(field, label, [
    tableCol({ label: '名称', field: 'name', required: true }),
    tableCol({ label: '备注', field: 'remark' }),
  ]);
}

/**
 * 按模块 key / 形态取默认 rule
 * @param key 模块
 * @param widgetKind 表单或表格
 * @param label 显示名
 */
export function buildDefaultFcRuleForModule(
  key: string,
  widgetKind: 'form' | 'table' = 'form',
  label?: string,
): FcRule[] {
  if (key === 'basic') return buildDefaultBasicFcRule();
  if (key === 'population') return buildDefaultPopulationFcRule();
  if (key === 'houses') return buildDefaultHousesFcRule();
  if (key === 'compensation') return buildDefaultCompensationFcRule();
  if (key === 'rewards') return buildDefaultRewardsFcRule();
  if (widgetKind === 'table') {
    return buildDefaultCustomTableFcRule(label || '自定义表格');
  }
  return buildDefaultCustomFormFcRule(label || '自定义表单');
}

/**
 * 内置 5 块默认 rule 合集
 */
export function buildDefaultFcRuleMap(): Record<string, FcRule[]> {
  return {
    basic: buildDefaultBasicFcRule(),
    houses: buildDefaultHousesFcRule(),
    compensation: buildDefaultCompensationFcRule(),
    rewards: buildDefaultRewardsFcRule(),
    population: buildDefaultPopulationFcRule(),
  };
}

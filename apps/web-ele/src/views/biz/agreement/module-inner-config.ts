/**
 * 详情模块「内部」配置：子块 + 字段显隐/顺序
 * 5 块：basic/population 表单可增删字段；houses/compensation/rewards 表格
 */
import { cloneJson } from './clone';

/** 表单控件类型（基础信息 / 签约 / 补偿） */
export type ModuleInnerControlType =
  | 'date'
  | 'input'
  | 'radio'
  | 'select'
  | 'textarea'
  | 'yesno';

/** 表格单元格类型 */
export type ModuleInnerCellType = 'select' | 'text' | 'yesno';

/** 表格行操作（增删行） */
export interface ModuleInnerTableOptions {
  /** 详情页是否显示新增 */
  allowAdd?: boolean;
  /** 详情页是否显示删除 */
  allowRemove?: boolean;
  /** 至少保留行数 */
  minRows?: number;
}

/** 模块内单个字段/列 */
export interface ModuleInnerFieldItem {
  /** 字段标识（对应数据 key；表格 _selection 表示勾选列） */
  key: string;
  /** 列/表单项标题 */
  label: string;
  /** 是否在本场景显示 */
  enabled: boolean;
  /** 显示顺序，越小越靠前 */
  order: number;
  /** 表格列最小宽度 */
  minWidth?: number;
  /**
   * 关联 Agree:Field:* 逻辑名（如 phone / idNo）
   * 有则再与角色字段权限求交
   */
  accessField?: string;
  /** 表单控件类型；缺省按 input */
  controlType?: ModuleInnerControlType;
  /** 表格单元格类型；缺省按 text，也可沿用 controlType */
  cellType?: ModuleInnerCellType;
  /** 栅格占比：24 整行 / 16 约 2/3 / 12 半宽 / 8 约 1/3 */
  span?: number;
  /** select 选项 */
  options?: { label: string; value: string }[];
  /** 保存前必填（模块 validate 用） */
  required?: boolean;
  /** 配置台新增的扩展字段 */
  custom?: boolean;
  /** 输入占位 */
  placeholder?: string;
}

/** 模块内子块（如权利人表 / 签约要素） */
export interface ModuleInnerSection {
  key: string;
  label: string;
  subtitle?: string;
  enabled: boolean;
  order: number;
  fields: ModuleInnerFieldItem[];
  /**
   * 配置台「新增子块」创建的自定义表格（数据落在 detail.basicTables[key]）
   * 内置 rightHolders / houses 不为 true
   */
  custom?: boolean;
  /** 表格块的行操作（仅 table 型子块有意义） */
  tableOptions?: ModuleInnerTableOptions;
  /** 本场景已删除的内置字段 key（normalize 不再补回） */
  removedFieldKeys?: string[];
}

/**
 * 是否基础信息「配置台新增」的自定义表格子块
 * 仅认 custom 标记，避免材料/签约等内置 key 被误判成可删块、可加列
 * @param section 子块配置
 */
export function isCustomBasicSection(
  section: Pick<ModuleInnerSection, 'custom' | 'key'>,
) {
  return section.custom === true;
}

/**
 * 创建一份可配置的自定义表格子块（空数据，由详情页点「新增」加行）
 * @param order 排序值
 */
export function createCustomBasicSection(order: number): ModuleInnerSection {
  const key = `custom_${Date.now()}`;
  return {
    key,
    label: '新建子块',
    subtitle: '自定义表格；详情页可新增行，此处可增删列、改显示名',
    enabled: true,
    custom: true,
    order,
    fields: [
      {
        key: 'name',
        label: '名称',
        enabled: true,
        order: 10,
        minWidth: 120,
      },
      {
        key: 'remark',
        label: '备注',
        enabled: true,
        order: 20,
        minWidth: 160,
      },
    ],
  };
}

/** 模块内部配置（basic / signing 结构相同） */
export interface ModuleInnerConfig {
  sections: ModuleInnerSection[];
}

/** @deprecated 兼容旧名，等同 ModuleInnerConfig */
export type BasicModuleInnerConfig = ModuleInnerConfig;

/**
 * 合并用户配置与默认目录（补齐新增字段，保留 enabled/order/label）
 * @param defaults 默认全量目录
 * @param raw 场景已存配置
 * @param options.keepCustomSections 是否保留配置台新增的自定义子块（仅 basic 建议开启）
 * @param options.keepExtraFields 是否保留目录外新增列（表格插列）
 */
export function normalizeModuleInner(
  defaults: ModuleInnerConfig,
  raw?: ModuleInnerConfig | null,
  options?: { keepCustomSections?: boolean; keepExtraFields?: boolean },
): ModuleInnerConfig {
  if (!raw?.sections?.length) {
    return cloneJson(defaults);
  }

  const rawByKey = new Map(raw.sections.map((s) => [s.key, s]));
  const defaultKeys = new Set(defaults.sections.map((s) => s.key));
  const sections = defaults.sections.map((defSec, secIndex) => {
    const userSec = rawByKey.get(defSec.key);
    const removed = new Set(userSec?.removedFieldKeys || []);
    const fieldByKey = new Map((userSec?.fields || []).map((f) => [f.key, f]));
    const fields = defSec.fields
      .filter((defField) => !removed.has(defField.key))
      .map((defField, fi) => {
        const userField = fieldByKey.get(defField.key);
        return {
          ...defField,
          enabled: userField ? userField.enabled !== false : defField.enabled,
          order:
            typeof userField?.order === 'number'
              ? userField.order
              : (defField.order ?? (fi + 1) * 10),
          label: userField?.label || defField.label,
          minWidth: userField?.minWidth ?? defField.minWidth,
          accessField: defField.accessField,
          controlType: userField?.controlType ?? defField.controlType,
          cellType: userField?.cellType ?? defField.cellType,
          span: userField?.span ?? defField.span,
          options: userField?.options ?? defField.options,
          required:
            typeof userField?.required === 'boolean'
              ? userField.required
              : defField.required,
          placeholder: userField?.placeholder ?? defField.placeholder,
          custom: false,
        };
      });
    /** 表格插列 / 表单新增字段：目录里没有的一并保留 */
    const extraFields: ModuleInnerFieldItem[] = [];
    if (options?.keepExtraFields && userSec?.fields?.length) {
      const defKeys = new Set(defSec.fields.map((f) => f.key));
      userSec.fields.forEach((f, fi) => {
        if (defKeys.has(f.key) || f.key === '_selection') return;
        if (removed.has(f.key)) return;
        extraFields.push({
          key: f.key,
          label: f.label || f.key,
          enabled: f.enabled !== false,
          order: typeof f.order === 'number' ? f.order : 1000 + fi * 10,
          minWidth: f.minWidth ?? 120,
          controlType: f.controlType,
          cellType: f.cellType,
          span: f.span,
          options: f.options,
          required: f.required,
          placeholder: f.placeholder,
          custom: true,
        });
      });
    }
    return {
      ...defSec,
      custom: false,
      enabled: userSec ? userSec.enabled !== false : defSec.enabled,
      order:
        typeof userSec?.order === 'number'
          ? userSec.order
          : (defSec.order ?? (secIndex + 1) * 10),
      label: userSec?.label || defSec.label,
      subtitle: userSec?.subtitle ?? defSec.subtitle,
      removedFieldKeys: [...removed],
      tableOptions: {
        allowAdd:
          userSec?.tableOptions?.allowAdd ??
          defSec.tableOptions?.allowAdd ??
          true,
        allowRemove:
          userSec?.tableOptions?.allowRemove ??
          defSec.tableOptions?.allowRemove ??
          true,
        minRows:
          userSec?.tableOptions?.minRows ?? defSec.tableOptions?.minRows ?? 1,
      },
      fields: [...fields, ...extraFields].toSorted((a, b) => a.order - b.order),
    };
  });

  /** 配置台新增的自定义子块：不在默认目录中，且标记 custom / custom_ 前缀 */
  const customSections: ModuleInnerSection[] = [];
  if (options?.keepCustomSections) {
    for (const userSec of raw.sections) {
      if (defaultKeys.has(userSec.key)) continue;
      const markedCustom =
        userSec.custom === true || String(userSec.key).startsWith('custom_');
      if (!markedCustom) continue;
      const fields = (userSec.fields || [])
        .map((f, fi) => ({
          key: f.key,
          label: f.label || f.key,
          enabled: f.enabled !== false,
          order: typeof f.order === 'number' ? f.order : (fi + 1) * 10,
          minWidth: f.minWidth ?? 120,
          accessField: f.accessField,
          controlType: f.controlType,
          span: f.span,
          options: f.options,
          required: f.required,
          placeholder: f.placeholder,
        }))
        .toSorted((a, b) => a.order - b.order);
      customSections.push({
        key: userSec.key,
        label: userSec.label || '新建子块',
        subtitle: userSec.subtitle,
        enabled: userSec.enabled !== false,
        order:
          typeof userSec.order === 'number'
            ? userSec.order
            : 1000 + customSections.length * 10,
        custom: true,
        fields,
      });
    }
  }

  return {
    sections: [...sections, ...customSections].toSorted(
      (a, b) => a.order - b.order,
    ),
  };
}

/** 表单占宽档位 */
export const FORM_SPAN_OPTIONS = [
  { label: '整行 (24)', value: 24 },
  { label: '约 2/3 (16)', value: 16 },
  { label: '半行 (12)', value: 12 },
  { label: '约 1/3 (8)', value: 8 },
] as const;

/**
 * 规范化字段栅格占宽
 * @param span 原始值
 */
export function normalizeFieldSpan(span?: number) {
  const n = Number(span);
  if ([8, 12, 16, 24].includes(n)) return n;
  return 12;
}

/**
 * 拖宽时吸附到最近档位
 * @param cols 估算列数
 */
export function snapFieldSpan(cols: number) {
  if (cols >= 20) return 24;
  if (cols >= 14) return 16;
  if (cols >= 10) return 12;
  return 8;
}

/** 旧版基础信息里的表格子块 key（已拆到独立模块） */
const LEGACY_BASIC_TABLE_KEYS = new Set(['houses', 'rightHolders']);

/**
 * 从旧 basic 配置里抽出某个表格子块，供权利人/房屋模块回填
 * @param raw 旧 moduleInner.basic
 * @param key 子块 key
 */
export function takeLegacyBasicSection(
  raw: ModuleInnerConfig | null | undefined,
  key: string,
): ModuleInnerConfig | null {
  const sec = raw?.sections?.find((s) => s.key === key);
  return sec ? { sections: [cloneJson(sec)] } : null;
}

/**
 * 去掉已拆走的权利人/房屋子块，避免和协议头表单混在一起
 * @param raw 场景已存 basic
 */
function stripLegacyBasicTables(
  raw?: ModuleInnerConfig | null,
): ModuleInnerConfig | null | undefined {
  if (!raw?.sections?.length) return raw;
  return {
    sections: raw.sections.filter((s) => !LEGACY_BASIC_TABLE_KEYS.has(s.key)),
  };
}

/**
 * 基础信息默认目录：协议头 KV 表单（可拖顺序/占宽）
 */
export function buildDefaultBasicModuleInner(): ModuleInnerConfig {
  const statusOptions = [
    { label: '告知单', value: '告知单' },
    { label: '待复核', value: '待复核' },
    { label: '待生效', value: '待生效' },
    { label: '已签约', value: '已签约' },
    { label: '组长已复核', value: '组长已复核' },
  ];
  return {
    sections: [
      {
        key: 'header',
        label: '协议信息',
        subtitle: '编号 / 名称 / 部门等头字段，可拖顺序与占宽',
        enabled: true,
        order: 10,
        fields: [
          {
            key: 'agreementNo',
            label: '协议编号',
            enabled: true,
            order: 10,
            controlType: 'input',
            span: 8,
            required: true,
          },
          {
            key: 'agreementName',
            label: '协议名称',
            enabled: true,
            order: 20,
            controlType: 'input',
            span: 8,
            required: true,
          },
          {
            key: 'department',
            label: '所属部门',
            enabled: true,
            order: 30,
            controlType: 'input',
            span: 8,
          },
          {
            key: 'acquirer',
            label: '征收人',
            enabled: true,
            order: 40,
            controlType: 'input',
            span: 8,
          },
          {
            key: 'compensatee',
            label: '被征收人',
            enabled: true,
            order: 50,
            controlType: 'input',
            span: 8,
          },
          {
            key: 'amount',
            label: '协议金额',
            enabled: true,
            order: 60,
            controlType: 'input',
            span: 8,
            accessField: 'amount',
          },
          {
            key: 'signDate',
            label: '签约日期',
            enabled: true,
            order: 70,
            controlType: 'date',
            span: 8,
            accessField: 'signDate',
            placeholder: '选择日期',
          },
          {
            key: 'statusValue',
            label: '状态',
            enabled: true,
            order: 80,
            controlType: 'radio',
            span: 8,
            options: statusOptions,
          },
          {
            key: 'remark',
            label: '备注',
            enabled: true,
            order: 90,
            controlType: 'textarea',
            span: 24,
          },
        ],
      },
    ],
  };
}

/**
 * 权利人表格默认列
 */
export function buildDefaultRightHoldersModuleInner(): ModuleInnerConfig {
  return {
    sections: [
      {
        key: 'rightHolders',
        label: '权利人信息',
        subtitle: '可新增多位权利人',
        enabled: true,
        order: 10,
        tableOptions: { allowAdd: true, allowRemove: true, minRows: 1 },
        fields: [
          {
            key: 'agreementNo',
            label: '协议编号',
            enabled: true,
            order: 10,
            minWidth: 120,
          },
          {
            key: 'name',
            label: '姓名',
            enabled: true,
            order: 20,
            minWidth: 100,
            required: true,
          },
          {
            key: 'idNo',
            label: '身份证号/营业执照号',
            enabled: true,
            order: 30,
            minWidth: 180,
            accessField: 'idNo',
          },
          {
            key: 'phone',
            label: '联系电话',
            enabled: true,
            order: 40,
            minWidth: 120,
            accessField: 'phone',
          },
        ],
      },
    ],
  };
}

/**
 * 房屋表格默认列（对标详情房屋 Tab）
 */
export function buildDefaultHousesModuleInner(): ModuleInnerConfig {
  return {
    sections: [
      {
        key: 'houses',
        label: '房屋信息',
        subtitle: '勾选或维护涉签约房屋',
        enabled: true,
        order: 10,
        tableOptions: { allowAdd: true, allowRemove: true, minRows: 1 },
        fields: [
          {
            key: '_selection',
            label: '勾选',
            enabled: true,
            order: 5,
            minWidth: 48,
          },
          {
            key: 'address',
            label: '房屋地址',
            enabled: true,
            order: 10,
            minWidth: 180,
            required: true,
          },
          {
            key: 'buildArea',
            label: '建筑面积',
            enabled: true,
            order: 20,
            minWidth: 100,
          },
          {
            key: 'expropriatedArea',
            label: '征收面积',
            enabled: true,
            order: 30,
            minWidth: 100,
          },
          {
            key: 'houseType',
            label: '房屋类型',
            enabled: true,
            order: 40,
            minWidth: 100,
          },
          {
            key: 'structure',
            label: '结构',
            enabled: true,
            order: 50,
            minWidth: 90,
          },
          {
            key: 'yearBuilt',
            label: '建成年份',
            enabled: true,
            order: 60,
            minWidth: 90,
          },
          {
            key: 'floor',
            label: '楼层',
            enabled: true,
            order: 70,
            minWidth: 80,
          },
          {
            key: 'certNo',
            label: '产权证号',
            enabled: true,
            order: 80,
            minWidth: 160,
          },
          {
            key: 'evalValue',
            label: '评估价值',
            enabled: true,
            order: 90,
            minWidth: 120,
          },
          {
            key: 'propertyType',
            label: '产权类型',
            enabled: true,
            order: 100,
            minWidth: 140,
          },
        ],
      },
    ],
  };
}

/**
 * 签约信息默认全量字段目录（签约要素 + 通讯）
 */
export function buildDefaultSigningModuleInner(): ModuleInnerConfig {
  const yesNo = [
    { label: '是', value: '是' },
    { label: '否', value: '否' },
  ];
  return {
    sections: [
      {
        key: 'signing',
        label: '签约信息',
        subtitle: '按房屋维度维护签约要素',
        enabled: true,
        order: 10,
        fields: [
          {
            key: 'houseAddress',
            label: '房屋地址',
            enabled: true,
            order: 10,
            controlType: 'input',
            span: 24,
            required: true,
          },
          {
            key: 'compensateMethod',
            label: '补偿方式',
            enabled: true,
            order: 20,
            controlType: 'select',
            span: 12,
            required: true,
            options: [
              { label: '产权调换', value: '产权调换' },
              { label: '货币补偿', value: '货币补偿' },
              { label: '货币+调换', value: '货币+调换' },
            ],
          },
          {
            key: 'decorateEval',
            label: '装修装饰评估',
            enabled: true,
            order: 30,
            controlType: 'yesno',
            span: 12,
            options: yesNo,
          },
          {
            key: 'hasMortgage',
            label: '是否存在抵押',
            enabled: true,
            order: 40,
            controlType: 'yesno',
            span: 12,
            options: yesNo,
          },
          {
            key: 'mortgagee',
            label: '抵押权人',
            enabled: true,
            order: 50,
            controlType: 'input',
            span: 12,
          },
          {
            key: 'debtAmount',
            label: '担保主债权金额',
            enabled: true,
            order: 60,
            controlType: 'input',
            span: 12,
            accessField: 'debtAmount',
          },
          {
            key: 'signDate',
            label: '签约日期',
            enabled: true,
            order: 70,
            controlType: 'date',
            span: 12,
            accessField: 'signDate',
            placeholder: '选择日期',
          },
          {
            key: 'hasSeal',
            label: '是否存在查封',
            enabled: true,
            order: 80,
            controlType: 'yesno',
            span: 12,
            options: yesNo,
          },
          {
            key: 'sealCourt',
            label: '查封法院',
            enabled: true,
            order: 90,
            controlType: 'input',
            span: 24,
          },
        ],
      },
      {
        key: 'contact',
        label: '通讯信息',
        subtitle: '用于送达与紧急联系',
        enabled: true,
        order: 20,
        fields: [
          {
            key: 'address',
            label: '通讯地址',
            enabled: true,
            order: 10,
            controlType: 'input',
            span: 24,
          },
          {
            key: 'contact',
            label: '联系人',
            enabled: true,
            order: 20,
            controlType: 'input',
            span: 12,
          },
          {
            key: 'phone',
            label: '联系电话',
            enabled: true,
            order: 30,
            controlType: 'input',
            span: 12,
            accessField: 'phone',
          },
          {
            key: 'emergency',
            label: '紧急联系人',
            enabled: true,
            order: 40,
            controlType: 'input',
            span: 12,
          },
        ],
      },
    ],
  };
}

/**
 * 规范化基础信息内部配置（剥离旧权利人/房屋表）
 * @param raw 场景已存配置
 */
export function normalizeBasicModuleInner(
  raw?: ModuleInnerConfig | null,
): ModuleInnerConfig {
  return normalizeModuleInner(
    buildDefaultBasicModuleInner(),
    stripLegacyBasicTables(raw),
    {
      keepCustomSections: true,
      keepExtraFields: true,
    },
  );
}

/**
 * 规范化权利人表格配置；缺省时回退旧 basic 子块
 * @param raw 场景已存 rightHolders
 * @param legacyBasic 旧版 moduleInner.basic
 */
export function normalizeRightHoldersModuleInner(
  raw?: ModuleInnerConfig | null,
  legacyBasic?: ModuleInnerConfig | null,
): ModuleInnerConfig {
  const source = raw?.sections?.length
    ? raw
    : takeLegacyBasicSection(legacyBasic, 'rightHolders');
  return normalizeModuleInner(buildDefaultRightHoldersModuleInner(), source, {
    keepExtraFields: true,
  });
}

/**
 * 规范化房屋表格配置；缺省时回退旧 basic 子块
 * @param raw 场景已存 houses
 * @param legacyBasic 旧版 moduleInner.basic
 */
export function normalizeHousesModuleInner(
  raw?: ModuleInnerConfig | null,
  legacyBasic?: ModuleInnerConfig | null,
): ModuleInnerConfig {
  const source = raw?.sections?.length
    ? raw
    : takeLegacyBasicSection(legacyBasic, 'houses');
  return normalizeModuleInner(buildDefaultHousesModuleInner(), source, {
    keepExtraFields: true,
  });
}

/**
 * 规范化签约信息内部配置
 * @param raw 场景已存配置
 */
export function normalizeSigningModuleInner(
  raw?: ModuleInnerConfig | null,
): ModuleInnerConfig {
  return normalizeModuleInner(buildDefaultSigningModuleInner(), raw);
}

/**
 * 补偿安置：表格（项目 / 金额）
 */
export function buildDefaultCompensationModuleInner(): ModuleInnerConfig {
  return {
    sections: [
      {
        key: 'compensation',
        label: '补偿安置',
        subtitle: '补偿项目明细',
        enabled: true,
        order: 10,
        tableOptions: { allowAdd: true, allowRemove: true, minRows: 1 },
        fields: [
          {
            key: 'name',
            label: '补偿项目',
            enabled: true,
            order: 10,
            minWidth: 140,
            required: true,
          },
          {
            key: 'calcType',
            label: '计算方式',
            enabled: true,
            order: 20,
            minWidth: 120,
          },
          {
            key: 'quantity',
            label: '数量',
            enabled: true,
            order: 30,
            minWidth: 80,
          },
          {
            key: 'unitPrice',
            label: '单价',
            enabled: true,
            order: 40,
            minWidth: 100,
          },
          {
            key: 'amount',
            label: '金额',
            enabled: true,
            order: 50,
            minWidth: 120,
            accessField: 'amount',
          },
          {
            key: 'remark',
            label: '备注',
            enabled: true,
            order: 60,
            minWidth: 140,
          },
        ],
      },
    ],
  };
}

/**
 * 奖励补贴：表格
 */
export function buildDefaultRewardsModuleInner(): ModuleInnerConfig {
  return {
    sections: [
      {
        key: 'rewards',
        label: '奖励补贴',
        subtitle: '奖励与补贴项目',
        enabled: true,
        order: 10,
        tableOptions: { allowAdd: true, allowRemove: true, minRows: 0 },
        fields: [
          {
            key: 'name',
            label: '奖励项目',
            enabled: true,
            order: 10,
            minWidth: 140,
            required: true,
          },
          {
            key: 'condition',
            label: '发放条件',
            enabled: true,
            order: 20,
            minWidth: 160,
          },
          {
            key: 'amount',
            label: '金额',
            enabled: true,
            order: 30,
            minWidth: 120,
            accessField: 'amount',
          },
          {
            key: 'remark',
            label: '备注',
            enabled: true,
            order: 40,
            minWidth: 140,
          },
        ],
      },
    ],
  };
}

/**
 * 协议人口信息：户维度表单
 */
export function buildDefaultPopulationModuleInner(): ModuleInnerConfig {
  return {
    sections: [
      {
        key: 'population',
        label: '协议人口信息',
        subtitle: '户主与家庭人口',
        enabled: true,
        order: 10,
        fields: [
          {
            key: 'headName',
            label: '户主姓名',
            enabled: true,
            order: 10,
            controlType: 'input',
            span: 8,
            required: true,
          },
          {
            key: 'idNo',
            label: '身份证号',
            enabled: true,
            order: 20,
            controlType: 'input',
            span: 8,
            accessField: 'idNo',
          },
          {
            key: 'familySize',
            label: '家庭人口',
            enabled: true,
            order: 30,
            controlType: 'input',
            span: 8,
            required: true,
          },
          {
            key: 'phone',
            label: '联系电话',
            enabled: true,
            order: 40,
            controlType: 'input',
            span: 8,
            accessField: 'phone',
          },
          {
            key: 'hukouAddress',
            label: '户籍地址',
            enabled: true,
            order: 50,
            controlType: 'input',
            span: 16,
          },
          {
            key: 'remark',
            label: '备注',
            enabled: true,
            order: 60,
            controlType: 'textarea',
            span: 24,
          },
        ],
      },
    ],
  };
}

/**
 * 材料清单默认列（签约 / 认定两张表共用列目录）
 */
function buildMaterialColumns(): ModuleInnerFieldItem[] {
  return [
    {
      key: 'category',
      label: '材料类别',
      enabled: true,
      order: 10,
      minWidth: 140,
      required: true,
    },
    {
      key: 'required',
      label: '是否必备',
      enabled: true,
      order: 20,
      minWidth: 100,
      controlType: 'yesno',
      options: [
        { label: '是', value: '是' },
        { label: '否', value: '否' },
      ],
    },
    {
      key: 'fileName',
      label: '附件',
      enabled: true,
      order: 30,
      minWidth: 140,
      placeholder: '演示：填写文件名',
    },
    {
      key: 'remark',
      label: '备注',
      enabled: true,
      order: 40,
      minWidth: 140,
    },
  ];
}

/**
 * 材料清单：签约材料 + 认定材料两张表（一个业务组件）
 */
export function buildDefaultMaterialModuleInner(): ModuleInnerConfig {
  return {
    sections: [
      {
        key: 'signMaterials',
        label: '签约材料',
        subtitle: '签约所需材料清单',
        enabled: true,
        order: 10,
        tableOptions: { allowAdd: true, allowRemove: true, minRows: 1 },
        fields: buildMaterialColumns(),
      },
      {
        key: 'certifyMaterials',
        label: '认定材料',
        subtitle: '资格认定相关材料',
        enabled: true,
        order: 20,
        tableOptions: { allowAdd: true, allowRemove: true, minRows: 1 },
        fields: buildMaterialColumns(),
      },
    ],
  };
}

/**
 * 把旧的「一份材料表」或拆开的两份配置收成两个子块
 * @param raw 已存 material
 * @param legacySign 旧 signMaterial
 * @param legacyCertify 旧 certifyMaterial
 */
function coerceMaterialRaw(
  raw?: ModuleInnerConfig | null,
  legacySign?: ModuleInnerConfig | null,
  legacyCertify?: ModuleInnerConfig | null,
): ModuleInnerConfig | null {
  const hasNew = raw?.sections?.some(
    (s) => s.key === 'signMaterials' || s.key === 'certifyMaterials',
  );
  if (hasNew) return raw || null;
  const shared = raw?.sections?.find((s) => s.key === 'materials');
  const sign = legacySign?.sections?.[0] || shared || raw?.sections?.[0];
  const certify = legacyCertify?.sections?.[0] || shared || raw?.sections?.[0];
  const sections: ModuleInnerSection[] = [];
  if (sign) {
    sections.push({
      ...sign,
      key: 'signMaterials',
      label: sign.label === '材料清单' ? '签约材料' : sign.label,
      order: 10,
    });
  }
  if (certify) {
    sections.push({
      ...certify,
      key: 'certifyMaterials',
      label: certify.label === '材料清单' ? '认定材料' : certify.label,
      order: 20,
    });
  }
  return sections.length > 0 ? { sections } : raw || null;
}

/**
 * 规范化补偿安置内部配置
 * @param raw 场景已存配置
 */
export function normalizeCompensationModuleInner(
  raw?: ModuleInnerConfig | null,
): ModuleInnerConfig {
  const sec = raw?.sections?.[0];
  const keys = new Set((sec?.fields || []).map((f) => f.key));
  /** 旧版是表单字段（安置方式），丢掉以免变成奇怪的表列 */
  const legacyForm = keys.has('settleType') && !keys.has('name');
  return normalizeModuleInner(
    buildDefaultCompensationModuleInner(),
    legacyForm ? null : raw,
    { keepExtraFields: true },
  );
}

/**
 * 规范化奖励补贴表格配置
 * @param raw 场景已存配置
 */
export function normalizeRewardsModuleInner(
  raw?: ModuleInnerConfig | null,
): ModuleInnerConfig {
  return normalizeModuleInner(buildDefaultRewardsModuleInner(), raw, {
    keepExtraFields: true,
  });
}

/**
 * 规范化协议人口表单配置
 * @param raw 场景已存配置
 */
export function normalizePopulationModuleInner(
  raw?: ModuleInnerConfig | null,
): ModuleInnerConfig {
  return normalizeModuleInner(buildDefaultPopulationModuleInner(), raw, {
    keepExtraFields: true,
  });
}

/**
 * 规范化材料清单内部配置（兼容旧的拆开两份 / 单表 materials）
 * @param raw 场景已存 material
 * @param legacySign 旧 signMaterial
 * @param legacyCertify 旧 certifyMaterial
 */
export function normalizeMaterialModuleInner(
  raw?: ModuleInnerConfig | null,
  legacySign?: ModuleInnerConfig | null,
  legacyCertify?: ModuleInnerConfig | null,
): ModuleInnerConfig {
  return normalizeModuleInner(
    buildDefaultMaterialModuleInner(),
    coerceMaterialRaw(raw, legacySign, legacyCertify),
    { keepExtraFields: true },
  );
}

/**
 * 已启用子块（按 order）
 * @param config 内部配置
 */
export function resolveEnabledSections(config: ModuleInnerConfig) {
  return config.sections
    .filter((s) => s.enabled)
    .toSorted((a, b) => a.order - b.order);
}

/**
 * 某子块已启用字段（按 order）
 * @param section 子块
 */
export function resolveEnabledFields(section: ModuleInnerSection) {
  return section.fields
    .filter((f) => f.enabled)
    .toSorted((a, b) => a.order - b.order);
}

/** 表单控件下拉 */
export const FORM_CONTROL_OPTIONS: {
  label: string;
  value: ModuleInnerControlType;
}[] = [
  { label: '单行输入', value: 'input' },
  { label: '下拉选择', value: 'select' },
  { label: '是 / 否', value: 'yesno' },
  { label: '日期', value: 'date' },
  { label: '单选', value: 'radio' },
  { label: '多行文本', value: 'textarea' },
];

/** 表格单元格下拉 */
export const TABLE_CELL_OPTIONS: {
  label: string;
  value: ModuleInnerCellType;
}[] = [
  { label: '文本', value: 'text' },
  { label: '下拉', value: 'select' },
  { label: '是 / 否', value: 'yesno' },
];

/**
 * 默认自定义表单内部配置
 * @param label 组件名
 */
export function buildDefaultCustomFormInner(label: string): ModuleInnerConfig {
  return {
    sections: [
      {
        key: 'main',
        label,
        subtitle: '自定义表单，可新增字段',
        enabled: true,
        order: 10,
        fields: [
          {
            key: 'title',
            label: '标题',
            enabled: true,
            order: 10,
            custom: true,
            controlType: 'input',
            span: 8,
          },
          {
            key: 'remark',
            label: '备注',
            enabled: true,
            order: 20,
            custom: true,
            controlType: 'textarea',
            span: 24,
          },
        ],
      },
    ],
  };
}

/**
 * 默认自定义表格内部配置
 * @param label 组件名
 */
export function buildDefaultCustomTableInner(label: string): ModuleInnerConfig {
  return {
    sections: [
      {
        key: 'main',
        label,
        subtitle: '自定义表格，可新增列与行',
        enabled: true,
        custom: true,
        order: 10,
        tableOptions: { allowAdd: true, allowRemove: true, minRows: 0 },
        fields: [
          {
            key: 'name',
            label: '名称',
            enabled: true,
            order: 10,
            minWidth: 140,
            custom: true,
            cellType: 'text',
          },
          {
            key: 'remark',
            label: '备注',
            enabled: true,
            order: 20,
            minWidth: 160,
            custom: true,
            cellType: 'text',
          },
        ],
      },
    ],
  };
}

/**
 * 规范化自定义表单
 * @param raw 已存配置
 * @param label 组件名
 */
export function normalizeCustomFormInner(
  raw?: ModuleInnerConfig | null,
  label = '自定义表单',
) {
  if (!raw?.sections?.length) {
    return buildDefaultCustomFormInner(label);
  }
  return {
    sections: raw.sections.map((s, i) => ({
      ...s,
      enabled: s.enabled !== false,
      order: typeof s.order === 'number' ? s.order : (i + 1) * 10,
      fields: (s.fields || []).map((f, fi) => ({
        ...f,
        enabled: f.enabled !== false,
        order: typeof f.order === 'number' ? f.order : (fi + 1) * 10,
        custom: true,
      })),
    })),
  };
}

/**
 * 规范化自定义表格
 * @param raw 已存配置
 * @param label 组件名
 */
export function normalizeCustomTableInner(
  raw?: ModuleInnerConfig | null,
  label = '自定义表格',
) {
  if (!raw?.sections?.length) {
    return buildDefaultCustomTableInner(label);
  }
  return {
    sections: raw.sections.map((s, i) => ({
      ...s,
      enabled: s.enabled !== false,
      custom: true,
      order: typeof s.order === 'number' ? s.order : (i + 1) * 10,
      tableOptions: {
        allowAdd: s.tableOptions?.allowAdd !== false,
        allowRemove: s.tableOptions?.allowRemove !== false,
        minRows: s.tableOptions?.minRows ?? 0,
      },
      fields: (s.fields || []).map((f, fi) => ({
        ...f,
        enabled: f.enabled !== false,
        order: typeof f.order === 'number' ? f.order : (fi + 1) * 10,
        custom: true,
      })),
    })),
  };
}

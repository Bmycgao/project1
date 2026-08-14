/**
 * 详情模块「内部」配置：子块 + 字段显隐/顺序（文档 2.3 / 2.5）
 * 先打样基础信息；全量字段可很多，场景只挂需要的子集（100 也可只配 80）
 */
import type { AgreementModuleKey } from './types';

/** 模块内单个字段/列 */
export interface ModuleInnerFieldItem {
  /** 字段标识（对应行数据 key；_selection 表示勾选列） */
  key: string;
  /** 列标题 */
  label: string;
  /** 是否在本场景显示 */
  enabled: boolean;
  /** 显示顺序，越小越靠前 */
  order: number;
  /** 列最小宽度 */
  minWidth?: number;
  /**
   * 关联 Agree:Field:* 逻辑名（如 phone / idNo）
   * 有则再与角色字段权限求交
   */
  accessField?: string;
}

/** 模块内子块（如权利人表 / 房屋表） */
export interface ModuleInnerSection {
  key: string;
  label: string;
  subtitle?: string;
  enabled: boolean;
  order: number;
  fields: ModuleInnerFieldItem[];
}

/** 基础信息模块内部配置 */
export interface BasicModuleInnerConfig {
  sections: ModuleInnerSection[];
}

/** 场景上按模块存内部配置 */
export type ModuleInnerConfigMap = Partial<
  Record<AgreementModuleKey, BasicModuleInnerConfig>
>;

/**
 * 基础信息默认全量字段目录（演示「全量」；场景可关掉部分）
 */
export function buildDefaultBasicModuleInner(): BasicModuleInnerConfig {
  return {
    sections: [
      {
        key: 'rightHolders',
        label: '权利人信息',
        subtitle: '可新增多位权利人',
        enabled: true,
        order: 10,
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
      {
        key: 'houses',
        label: '房屋列表',
        subtitle: '勾选或维护涉签约房屋',
        enabled: true,
        order: 20,
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
          },
          {
            key: 'certNo',
            label: '产权证号',
            enabled: true,
            order: 20,
            minWidth: 160,
          },
          {
            key: 'propertyType',
            label: '产权类型',
            enabled: true,
            order: 30,
            minWidth: 140,
          },
        ],
      },
    ],
  };
}

/**
 * 合并用户配置与默认目录（补齐新增字段，保留 enabled/order）
 * @param raw 场景已存配置
 */
export function normalizeBasicModuleInner(
  raw?: BasicModuleInnerConfig | null,
): BasicModuleInnerConfig {
  const defaults = buildDefaultBasicModuleInner();
  if (!raw?.sections?.length) {
    return defaults;
  }

  const rawByKey = new Map(raw.sections.map((s) => [s.key, s]));
  const sections = defaults.sections.map((defSec, secIndex) => {
    const userSec = rawByKey.get(defSec.key);
    const fieldByKey = new Map(
      (userSec?.fields || []).map((f) => [f.key, f]),
    );
    const fields = defSec.fields.map((defField, fi) => {
      const userField = fieldByKey.get(defField.key);
      return {
        ...defField,
        enabled: userField ? userField.enabled !== false : defField.enabled,
        order:
          typeof userField?.order === 'number'
            ? userField.order
            : defField.order ?? (fi + 1) * 10,
        label: userField?.label || defField.label,
        minWidth: userField?.minWidth ?? defField.minWidth,
        accessField: defField.accessField,
      };
    });
    return {
      ...defSec,
      enabled: userSec ? userSec.enabled !== false : defSec.enabled,
      order:
        typeof userSec?.order === 'number'
          ? userSec.order
          : defSec.order ?? (secIndex + 1) * 10,
      label: userSec?.label || defSec.label,
      subtitle: userSec?.subtitle ?? defSec.subtitle,
      fields: fields.sort((a, b) => a.order - b.order),
    };
  });

  return {
    sections: sections.sort((a, b) => a.order - b.order),
  };
}

/**
 * 已启用子块（按 order）
 * @param config 内部配置
 */
export function resolveEnabledSections(config: BasicModuleInnerConfig) {
  return config.sections
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);
}

/**
 * 某子块已启用字段（按 order）
 * @param section 子块
 */
export function resolveEnabledFields(section: ModuleInnerSection) {
  return section.fields
    .filter((f) => f.enabled)
    .sort((a, b) => a.order - b.order);
}

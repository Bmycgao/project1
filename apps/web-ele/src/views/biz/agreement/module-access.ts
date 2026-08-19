/**
 * 协议详情区域（模块）权限与布局：Agree:Module:{key}
 * - 场景 page-schema.modules：挂载 + 顺序 order + 占比 span（文档 2.2③ / 2.3）
 * - 角色 Agree:Module:*：可见权限；运行时求交
 */
import type { AgreementModuleKey } from './types';

import { matchAccessCodes } from './field-access';

/** 详情模块在画布上的组件形态 */
export type AgreeModuleWidgetKind = 'form' | 'table';

/** 详情模块元数据 */
export interface AgreeModuleMeta {
  key: AgreementModuleKey;
  label: string;
  desc: string;
  /** 可见所需权限码 */
  authCode: string;
  /** 设计器左侧组件类型：表单 / 表格 */
  widgetKind: AgreeModuleWidgetKind;
}

/** 页面配置中的模块挂载项（含布局） */
export interface AgreeModuleMount {
  key: AgreementModuleKey;
  /** false 表示本场景不挂载该区域 */
  enabled: boolean;
  /** 显示顺序，越小越靠前 */
  order?: number;
  /**
   * 栅格占比（24 栅格）：24 整行 / 16 约 2/3 / 12 半宽 / 8 约 1/3
   */
  span?: number;
  /** 自定义组件显示名 */
  label?: string;
  /** 自定义组件说明 */
  desc?: string;
  /** 表单 / 表格；自定义组件必填 */
  widgetKind?: AgreeModuleWidgetKind;
  /** 配置台新建的业务组件 */
  custom?: boolean;
  /** 可见权限码 */
  authCode?: string;
}

/** 详情实际渲染项 = 元数据 + 布局 */
export interface AgreeModuleLayoutItem extends AgreeModuleMeta {
  order: number;
  span: number;
}

/** 占比下拉选项（配置台 / 说明共用） */
export const MODULE_SPAN_OPTIONS = [
  { label: '整行 (24)', value: 24 },
  { label: '约 2/3 (16)', value: 16 },
  { label: '半宽 (12)', value: 12 },
  { label: '约 1/3 (8)', value: 8 },
] as const;

/** 详情全部区域（参考页 5 块：基础表单置顶 + 4 个 Tab） */
export const AGREE_DETAIL_MODULES: AgreeModuleMeta[] = [
  {
    key: 'basic',
    label: '基础信息',
    desc: '协议头表单（可增删字段、拖位置/占宽）',
    authCode: 'Agree:Module:basic',
    widgetKind: 'form',
  },
  {
    key: 'houses',
    label: '房屋信息',
    desc: '涉签约房屋表格',
    authCode: 'Agree:Module:houses',
    widgetKind: 'table',
  },
  {
    key: 'compensation',
    label: '补偿安置',
    desc: '补偿项目表格',
    authCode: 'Agree:Module:compensation',
    widgetKind: 'table',
  },
  {
    key: 'rewards',
    label: '奖励补贴',
    desc: '奖励项目表格',
    authCode: 'Agree:Module:rewards',
    widgetKind: 'table',
  },
  {
    key: 'population',
    label: '协议人口信息',
    desc: '户主 / 家庭人口表单',
    authCode: 'Agree:Module:population',
    widgetKind: 'form',
  },
];

/** 内置模块 key */
export const BUILTIN_AGREE_MODULE_KEYS = AGREE_DETAIL_MODULES.map((m) => m.key);

/**
 * 是否内置详情模块
 * @param key 模块 key
 */
export function isBuiltinAgreeModule(key: string) {
  return AGREE_DETAIL_MODULES.some((m) => m.key === key);
}

/**
 * 是否配置台新建的业务组件
 * @param key 模块 key
 */
export function isCustomAgreeModule(key: string) {
  return String(key).startsWith('custom_');
}

/**
 * 从 key 推断自定义组件形态
 * @param key 模块 key
 */
export function inferCustomWidgetKind(key: string): AgreeModuleWidgetKind {
  return String(key).includes('_table_') ? 'table' : 'form';
}

/**
 * 创建一条自定义业务组件挂载
 * @param opts.label 显示名
 * @param opts.widgetKind 表单或表格
 * @param opts.order 排序
 */
export function createCustomAgreeModule(opts: {
  label: string;
  widgetKind: AgreeModuleWidgetKind;
  order: number;
}): AgreeModuleMount {
  const widgetKind = opts.widgetKind;
  const key = `custom_${widgetKind}_${Date.now()}`;
  const label =
    opts.label.trim() || (widgetKind === 'table' ? '新建表格' : '新建表单');
  return {
    key,
    enabled: true,
    order: opts.order,
    span: 24,
    label,
    desc:
      widgetKind === 'table'
        ? '自定义表格，可增删列与行'
        : '自定义表单，可增删字段',
    widgetKind,
    custom: true,
    authCode: 'Agree:Module:custom',
  };
}

/**
 * 挂载项 → 展示用元数据（内置查目录，自定义用挂载上的 label）
 * @param mount 挂载
 */
export function metaFromMount(mount: AgreeModuleMount): AgreeModuleMeta {
  const builtin = AGREE_DETAIL_MODULES.find((m) => m.key === mount.key);
  if (builtin) return builtin;
  const widgetKind =
    mount.widgetKind || inferCustomWidgetKind(String(mount.key));
  return {
    key: mount.key,
    label: mount.label || '自定义组件',
    desc:
      mount.desc ||
      (widgetKind === 'table' ? '自定义表格' : '自定义表单'),
    authCode: mount.authCode || 'Agree:Module:custom',
    widgetKind,
  };
}

/**
 * 规范化 span 到允许档位
 * @param span 原始值
 */
export function normalizeModuleSpan(span?: number) {
  const n = Number(span);
  if ([8, 12, 16, 24].includes(n)) return n;
  return 24;
}

/**
 * 生成默认全挂载配置（含默认顺序与整行占比）
 * @param keys 启用的模块；不传则全部启用
 */
export function buildAgreeModuleMounts(
  keys?: AgreementModuleKey[],
): AgreeModuleMount[] {
  const enabled = new Set(
    keys?.length ? keys : AGREE_DETAIL_MODULES.map((m) => m.key),
  );
  return AGREE_DETAIL_MODULES.map((m, index) => ({
    key: m.key,
    enabled: enabled.has(m.key),
    order: (index + 1) * 10,
    span: 24,
  }));
}

/**
 * 把页面配置 modules 规范成完整挂载列表（补齐缺项的 order/span）
 * @param modules 原始配置
 */
export function normalizeAgreeModuleMounts(
  modules: AgreeModuleMount[] | undefined | null,
): AgreeModuleMount[] {
  if (!modules?.length) {
    return buildAgreeModuleMounts();
  }
  const byKey = new Map(
    modules.map((item) => [String(item.key), item] as const),
  );
  const basicRaw = byKey.get('basic');
  const inheritFromBasic = !!basicRaw && basicRaw.enabled !== false;
  const compRaw = byKey.get('compensation');
  const builtins = AGREE_DETAIL_MODULES.map((meta, index) => {
    let raw = byKey.get(meta.key);
    /** 旧「权利人」挂载项 → 协议人口 */
    if (!raw && meta.key === 'population') {
      raw = byKey.get('rightHolders');
    }
    const inherited =
      !raw &&
      ((meta.key === 'houses' && inheritFromBasic) ||
        (meta.key === 'population' && inheritFromBasic) ||
        (meta.key === 'rewards' && !!compRaw && compRaw.enabled !== false));
    const basicOrder =
      typeof basicRaw?.order === 'number' ? basicRaw.order : 10;
    return {
      key: meta.key,
      enabled: raw ? raw.enabled !== false : inherited,
      order:
        typeof raw?.order === 'number' && Number.isFinite(raw.order)
          ? raw.order
          : inherited
            ? basicOrder +
              (meta.key === 'houses'
                ? 1
                : meta.key === 'compensation'
                  ? 2
                  : meta.key === 'rewards'
                    ? 3
                    : 4)
            : (index + 1) * 10,
      span: normalizeModuleSpan(raw?.span),
      widgetKind: meta.widgetKind,
      label: meta.label,
      desc: meta.desc,
      authCode: meta.authCode,
      custom: false,
    };
  });
  const customMounts = modules
    .filter(
      (item) =>
        !isBuiltinAgreeModule(String(item.key)) &&
        String(item.key) !== 'rightHolders',
    )
    .map((item, index) => {
      const widgetKind =
        item.widgetKind || inferCustomWidgetKind(String(item.key));
      return {
        key: item.key,
        enabled: item.enabled !== false,
        order:
          typeof item.order === 'number' && Number.isFinite(item.order)
            ? item.order
            : 500 + (index + 1) * 10,
        span: normalizeModuleSpan(item.span),
        label: item.label || '自定义组件',
        desc:
          item.desc ||
          (widgetKind === 'table' ? '自定义表格' : '自定义表单'),
        widgetKind,
        custom: true,
        authCode: item.authCode || 'Agree:Module:custom',
      };
    });
  return [...builtins, ...customMounts];
}

/**
 * 从场景配置解析已挂载模块 key（按 order 排序；未配则全部）
 * @param modules 页面配置 modules
 */
export function resolveMountedModuleKeys(
  modules: AgreeModuleMount[] | undefined | null,
): AgreementModuleKey[] {
  const normalized = normalizeAgreeModuleMounts(modules);
  const keys = normalized
    .filter((m) => m.enabled)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((m) => m.key);
  // 全关时兜底基础信息，避免详情空白
  return keys.length ? keys : (['basic'] as AgreementModuleKey[]);
}

/**
 * 模块是否对当前权限码可见
 * @param key 模块
 * @param accessCodes 用户权限码
 */
export function isAgreeModuleVisible(
  key: AgreementModuleKey,
  accessCodes: string[] | undefined,
) {
  const set = new Set(accessCodes || []);
  if (set.has('Agree:*') || set.has('Agree:Module:*')) return true;
  if (isCustomAgreeModule(String(key))) {
    if (set.has('Agree:Module:custom')) return true;
    return [...set].some((c) => String(c).startsWith('Agree:Module:'));
  }
  const meta = AGREE_DETAIL_MODULES.find((m) => m.key === key);
  if (!meta) return false;
  const need = [meta.authCode];
  if (key === 'population') {
    need.push('Agree:Module:rightHolders');
  }
  return matchAccessCodes(accessCodes, need);
}

/**
 * 过滤可见模块列表（仅按权限，忽略场景挂载）
 * @param accessCodes 用户权限码
 */
export function filterAgreeModulesByAccess(
  accessCodes: string[] | undefined,
): AgreeModuleMeta[] {
  return AGREE_DETAIL_MODULES.filter((m) =>
    isAgreeModuleVisible(m.key, accessCodes),
  );
}

/**
 * 场景挂载 ∩ 角色权限 → 详情实际显示的模块（已按 order 排序，带 span）
 * @param modules 页面配置 modules（可空=全挂载）
 * @param accessCodes 用户权限码
 */
export function resolveAgreeModulesForPage(
  modules: AgreeModuleMount[] | undefined | null,
  accessCodes: string[] | undefined,
): AgreeModuleLayoutItem[] {
  const normalized = normalizeAgreeModuleMounts(modules);
  const enabledKeys = new Set(
    normalized.filter((m) => m.enabled).map((m) => m.key),
  );
  // 全关兜底
  if (!enabledKeys.size) {
    enabledKeys.add('basic');
  }

  const result: AgreeModuleLayoutItem[] = [];
  for (const mount of normalized) {
    if (!enabledKeys.has(mount.key)) continue;
    if (!isAgreeModuleVisible(mount.key, accessCodes)) continue;
    const meta = metaFromMount(mount);
    result.push({
      ...meta,
      order: mount.order ?? 0,
      span: normalizeModuleSpan(mount.span),
    });
  }
  return result.sort((a, b) => a.order - b.order);
}

/**
 * 取模块权限码
 * @param key 模块
 */
export function getAgreeModuleAuthCode(key: AgreementModuleKey) {
  return (
    AGREE_DETAIL_MODULES.find((m) => m.key === key)?.authCode ||
    `Agree:Module:${isCustomAgreeModule(String(key)) ? 'custom' : key}`
  );
}

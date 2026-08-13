/**
 * 协议详情区域（模块）权限与布局：Agree:Module:{key}
 * - 场景 page-schema.modules：挂载 + 顺序 order + 占比 span（文档 2.2③ / 2.3）
 * - 角色 Agree:Module:*：可见权限；运行时求交
 */
import type { AgreementModuleKey } from './types';

import { matchAccessCodes } from './field-access';

/** 详情模块元数据 */
export interface AgreeModuleMeta {
  key: AgreementModuleKey;
  label: string;
  desc: string;
  /** 可见所需权限码 */
  authCode: string;
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

/** 详情全部区域（默认顺序） */
export const AGREE_DETAIL_MODULES: AgreeModuleMeta[] = [
  {
    key: 'basic',
    label: '基础信息',
    desc: '权利人 / 房屋',
    authCode: 'Agree:Module:basic',
  },
  {
    key: 'signing',
    label: '签约信息',
    desc: '签约要素 / 通讯',
    authCode: 'Agree:Module:signing',
  },
  {
    key: 'signMaterial',
    label: '签约材料',
    desc: '材料清单',
    authCode: 'Agree:Module:signMaterial',
  },
  {
    key: 'certifyMaterial',
    label: '认定材料',
    desc: '资格认定',
    authCode: 'Agree:Module:certifyMaterial',
  },
  {
    key: 'compensation',
    label: '补偿安置',
    desc: '安置与金额',
    authCode: 'Agree:Module:compensation',
  },
];

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
  return AGREE_DETAIL_MODULES.map((meta, index) => {
    const raw = byKey.get(meta.key);
    return {
      key: meta.key,
      enabled: raw ? raw.enabled !== false : false,
      order:
        typeof raw?.order === 'number' && Number.isFinite(raw.order)
          ? raw.order
          : (index + 1) * 10,
      span: normalizeModuleSpan(raw?.span),
    };
  });
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
  const meta = AGREE_DETAIL_MODULES.find((m) => m.key === key);
  if (!meta) return false;
  const set = new Set(accessCodes || []);
  if (set.has('Agree:*') || set.has('Agree:Module:*')) return true;
  return matchAccessCodes(accessCodes, [meta.authCode]);
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
    const meta = AGREE_DETAIL_MODULES.find((m) => m.key === mount.key);
    if (!meta) continue;
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
    `Agree:Module:${key}`
  );
}

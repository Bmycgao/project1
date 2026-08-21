import type { AgreeModuleMount } from '../module-access';
import type { FcRuleMap } from './types';

/**
 * 按 page-schema.fcBindings 解析 FormCreate rule（兼容历史 fcRules 内嵌）
 */
import type { FcBindingsMap } from '#/api';

import { DEFAULT_FC_BINDINGS, getFcSchema } from '#/api';

import {
  buildDefaultFcRuleForModule,
  buildDefaultFcRuleMap,
} from './default-rules';
import { cloneFcRule, isFcRule } from './types';

/**
 * 合并历史内嵌 fcRules
 * @param raw 场景已存
 * @param modules 挂载模块
 */
export function mergeFcRules(
  raw: FcRuleMap | undefined,
  modules: AgreeModuleMount[],
): FcRuleMap {
  const map = buildDefaultFcRuleMap();
  if (raw && typeof raw === 'object') {
    for (const [key, rule] of Object.entries(raw)) {
      if (isFcRule(rule)) map[key] = cloneFcRule(rule);
    }
  }
  for (const m of modules) {
    if (map[m.key]) continue;
    map[m.key] = buildDefaultFcRuleForModule(
      m.key,
      m.widgetKind === 'table' ? 'table' : 'form',
      m.label,
    );
  }
  return map;
}

/**
 * 按 fcBindings 拉取模板 rule；无 bindings 时用默认引用
 * @param bindings 场景模板引用
 * @param modules 已挂载模块
 * @param legacyFcRules 历史内嵌 rule
 */
export async function resolveFcRulesFromBindings(
  bindings: FcBindingsMap | undefined,
  modules: AgreeModuleMount[],
  legacyFcRules?: FcRuleMap,
): Promise<FcRuleMap> {
  const mergedBindings: FcBindingsMap = {
    ...DEFAULT_FC_BINDINGS,
    ...bindings,
  };
  const idSet = new Set<string>();
  for (const m of modules) {
    const id = mergedBindings[m.key];
    if (id) idSet.add(id);
  }

  const schemaMap = new Map<string, Awaited<ReturnType<typeof getFcSchema>>>();
  await Promise.all(
    [...idSet].map(async (id) => {
      try {
        const schema = await getFcSchema(id);
        schemaMap.set(id, schema);
      } catch {
        /* 模板缺失时走模块默认或历史内嵌 */
      }
    }),
  );

  const map: FcRuleMap = {};
  for (const m of modules) {
    const id = mergedBindings[m.key];
    const schema = id ? schemaMap.get(id) : undefined;
    // 场景里选了模板，优先用模板 rule（自定义「77」绑定「新建表格」）
    if (schema && isFcRule(schema.rule)) {
      map[m.key] = cloneFcRule(schema.rule);
      continue;
    }
    const legacy = legacyFcRules?.[m.key];
    if (isFcRule(legacy)) {
      map[m.key] = cloneFcRule(legacy);
      continue;
    }
    map[m.key] = buildDefaultFcRuleForModule(
      m.key,
      m.widgetKind === 'table' ? 'table' : 'form',
      m.label,
    );
  }
  return map;
}

/**
 * 从详情配置生成默认 fcBindings
 * @param moduleKeys 已挂模块 key
 */
export function buildDefaultFcBindings(moduleKeys: string[]): FcBindingsMap {
  const map: FcBindingsMap = {};
  for (const key of moduleKeys) {
    if (DEFAULT_FC_BINDINGS[key]) {
      map[key] = DEFAULT_FC_BINDINGS[key];
    }
  }
  return map;
}

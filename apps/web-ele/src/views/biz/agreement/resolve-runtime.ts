/**
 * 协议列表运行时：优先读菜单挂的页面配置（场景），再回退到本地 scenes.ts
 * 操作员改「页面配置」里的按钮后，列表应立即生效
 */
import type { PageSchemaApi } from '#/api';

import { getPageSchema } from '#/api';

import {
  resolveToolbarButtons,
  type AgreeToolbarButton,
} from './actions';
import {
  DEFAULT_AGREE_FIELD_RULES,
  type AgreeFieldRule,
} from './field-access';
import {
  buildAgreeModuleMounts,
  inferCustomWidgetKind,
  isCustomAgreeModule,
  type AgreeModuleMount,
} from './module-access';
import {
  buildDefaultBasicModuleInner,
  buildDefaultCompensationModuleInner,
  buildDefaultCustomFormInner,
  buildDefaultCustomTableInner,
  buildDefaultHousesModuleInner,
  buildDefaultPopulationModuleInner,
  buildDefaultRewardsModuleInner,
  normalizeBasicModuleInner,
  normalizeCompensationModuleInner,
  normalizeCustomFormInner,
  normalizeCustomTableInner,
  normalizeHousesModuleInner,
  normalizePopulationModuleInner,
  normalizeRewardsModuleInner,
  type BasicModuleInnerConfig,
  type ModuleInnerConfig,
} from './module-inner-config';
import {
  AGREE_COLUMN_TEMPLATE,
  getAgreeScene,
  getAgreeSceneBySchemaId,
  type AgreeSceneConfig,
} from './scenes';

/** 列表列（与页面配置 Column 对齐） */
export interface AgreeListColumn {
  field: string;
  title: string;
  visible: boolean;
  width?: number;
  minWidth?: number;
  cellType?: string;
  /** 显示顺序，越小越靠前 */
  order?: number;
}

/** 列表页实际使用的运行时配置 */
export interface AgreeListRuntime {
  /** 来源：page-schema | local-scene | fallback */
  source: 'fallback' | 'local-scene' | 'page-schema';
  schemaId?: string;
  scene: string;
  title: string;
  remark?: string;
  detailMode: 'audit' | 'edit' | 'view';
  buttons: AgreeToolbarButton[];
  columns: AgreeListColumn[];
  /** 本地兜底过滤（接口失败时）；正常以后端 scene 为准 */
  statusIn?: string[];
  /** 字段显隐规则（列模板继承） */
  fieldRules?: AgreeFieldRule[];
  /** 详情模块挂载（场景配置；未配=全部） */
  modules?: AgreeModuleMount[];
}

/**
 * 根据动作码粗略推断详情模式
 * @param codes 动作码
 */
function inferDetailMode(codes: string[]): 'audit' | 'edit' | 'view' {
  if (codes.some((c) => ['approve', 'reject'].includes(c))) return 'audit';
  if (codes.some((c) => ['add', 'edit', 'delete', 'submitReview'].includes(c)))
    return 'edit';
  return 'view';
}

/**
 * 按 order 排序列（无 order 时保持原下标）
 * @param cols 列配置
 */
function sortListColumns<T extends { order?: number }>(cols: T[]): T[] {
  return [...cols].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

/**
 * 本地场景 → 运行时
 * @param local 本地场景
 */
function fromLocalScene(local: AgreeSceneConfig): AgreeListRuntime {
  return {
    source: 'local-scene',
    schemaId: local.schemaId,
    scene: local.scene,
    title: local.title,
    remark: local.remark,
    detailMode: local.detailMode,
    buttons: resolveToolbarButtons(local.buttonCodes),
    columns: sortListColumns(
      AGREE_COLUMN_TEMPLATE.filter((c) => c.visible).map((c) => ({
        ...c,
      })),
    ),
    statusIn: local.statusIn,
    fieldRules: [...DEFAULT_AGREE_FIELD_RULES],
    modules: buildAgreeModuleMounts(),
  };
}

/**
 * 页面配置 → 运行时（只认已注册动作）
 * @param schema 详情（scene 类型已合并列模板）
 * @param local 同 scene 的本地兜底（detailMode / statusIn）
 */
function fromPageSchema(
  schema: PageSchemaApi.PageSchema,
  local: AgreeSceneConfig | null,
): AgreeListRuntime {
  // 传入完整按钮对象，保留页面级 bind
  const buttons = resolveToolbarButtons(
    (schema.buttons || []) as AgreeToolbarButton[],
  );
  const scene = String(schema.scene || local?.scene || '').trim();
  const columns = sortListColumns(
    (schema.columns?.length ? schema.columns : AGREE_COLUMN_TEMPLATE)
      .filter((c) => c.visible !== false)
      .map((c) => ({
        field: c.field,
        title: c.title,
        visible: true,
        width: c.width,
        minWidth: c.minWidth,
        cellType: c.cellType,
        order: c.order,
      })),
  );

  const fieldRules = (schema.fieldRules?.length
    ? schema.fieldRules
    : DEFAULT_AGREE_FIELD_RULES) as AgreeFieldRule[];

  const modules = (schema.modules?.length
    ? schema.modules
    : buildAgreeModuleMounts()) as AgreeModuleMount[];

  return {
    source: 'page-schema',
    schemaId: schema.id,
    scene: scene || 'entry',
    title: schema.title || local?.title || '协议列表',
    remark: schema.remark || local?.remark,
    detailMode:
      local?.detailMode || inferDetailMode(buttons.map((b) => b.code)),
    buttons,
    columns,
    statusIn: schema.statusIn?.length
      ? schema.statusIn
      : local?.statusIn,
    fieldRules,
    modules,
  };
}

/**
 * 加载协议列表运行时配置
 * @param meta 路由 meta（需含 schemaId / sceneId）
 */
export async function loadAgreeListRuntime(
  meta: Record<string, any> | undefined,
): Promise<AgreeListRuntime> {
  const schemaId = String(meta?.schemaId || '').trim();
  const sceneId = String(meta?.sceneId || '').trim();

  // 1）优先：菜单挂的页面配置
  if (schemaId) {
    try {
      const schema = await getPageSchema(schemaId);
      if (schema) {
        const local =
          getAgreeSceneBySchemaId(schemaId) ||
          getAgreeScene(schema.scene || sceneId) ||
          null;
        return fromPageSchema(schema, local);
      }
    } catch {
      // 继续走本地场景兜底
    }
  }

  // 2）回退：本地 scenes.ts（按 sceneId）
  const local = getAgreeScene(sceneId || 'entry');
  if (local) {
    return fromLocalScene(local);
  }

  // 3）最后兜底：录入场景空壳
  return {
    source: 'fallback',
    scene: sceneId || 'entry',
    title: '协议列表',
    remark: '未找到页面配置或本地场景，请检查菜单 meta.schemaId',
    detailMode: 'view',
    buttons: [],
    columns: sortListColumns(
      AGREE_COLUMN_TEMPLATE.filter((c) => c.visible).map((c) => ({
        ...c,
      })),
    ),
    fieldRules: [...DEFAULT_AGREE_FIELD_RULES],
    modules: buildAgreeModuleMounts(),
  };
}

/**
 * 按 schemaId / scene 加载详情页配置：模块挂载 + 内部字段
 * @param opts schemaId 优先；否则按 scene 反查
 */
export async function loadAgreeDetailPageConfig(opts: {
  schemaId?: string;
  scene?: string;
}): Promise<{
  modules: AgreeModuleMount[];
  basicInner: BasicModuleInnerConfig;
  housesInner: ModuleInnerConfig;
  compensationInner: ModuleInnerConfig;
  rewardsInner: ModuleInnerConfig;
  populationInner: ModuleInnerConfig;
  customInners: Record<string, ModuleInnerConfig>;
}> {
  const empty = {
    modules: buildAgreeModuleMounts(),
    basicInner: buildDefaultBasicModuleInner(),
    housesInner: buildDefaultHousesModuleInner(),
    compensationInner: buildDefaultCompensationModuleInner(),
    rewardsInner: buildDefaultRewardsModuleInner(),
    populationInner: buildDefaultPopulationModuleInner(),
    customInners: {} as Record<string, ModuleInnerConfig>,
  };
  const schemaId =
    String(opts.schemaId || '').trim() ||
    getAgreeScene(String(opts.scene || '').trim())?.schemaId ||
    '';
  if (!schemaId) {
    return empty;
  }
  try {
    const schema = await getPageSchema(schemaId);
    const inner = schema?.moduleInner as
      | Record<string, ModuleInnerConfig>
      | undefined;
    const modules = (schema?.modules?.length
      ? schema.modules
      : buildAgreeModuleMounts()) as AgreeModuleMount[];
    const customInners: Record<string, ModuleInnerConfig> = {};
    const skip = new Set([
      'basic',
      'houses',
      'compensation',
      'rewards',
      'population',
      'rightHolders',
      'signing',
      'material',
      'signMaterial',
      'certifyMaterial',
    ]);
    for (const [key, block] of Object.entries(inner || {})) {
      if (skip.has(key) || !block) continue;
      const mount = modules.find((m) => m.key === key);
      const kind =
        mount?.widgetKind || inferCustomWidgetKind(key);
      const label = mount?.label || '自定义组件';
      customInners[key] =
        kind === 'table'
          ? normalizeCustomTableInner(block, label)
          : normalizeCustomFormInner(block, label);
    }
    for (const mount of modules) {
      if (!isCustomAgreeModule(String(mount.key))) continue;
      if (customInners[mount.key]) continue;
      customInners[mount.key] =
        mount.widgetKind === 'table'
          ? buildDefaultCustomTableInner(mount.label || '自定义表格')
          : buildDefaultCustomFormInner(mount.label || '自定义表单');
    }
    return {
      modules,
      basicInner: normalizeBasicModuleInner(inner?.basic),
      housesInner: normalizeHousesModuleInner(
        inner?.houses,
        inner?.basic,
      ),
      compensationInner: normalizeCompensationModuleInner(
        inner?.compensation,
      ),
      rewardsInner: normalizeRewardsModuleInner(inner?.rewards),
      populationInner: normalizePopulationModuleInner(
        inner?.population,
      ),
      customInners,
    };
  } catch {
    return empty;
  }
}

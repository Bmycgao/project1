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
    columns: AGREE_COLUMN_TEMPLATE.filter((c) => c.visible).map((c) => ({
      ...c,
    })),
    statusIn: local.statusIn,
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
  const codes = (schema.buttons || []).map((b) => b.code);
  const buttons = resolveToolbarButtons(codes);
  const scene = String(schema.scene || local?.scene || '').trim();
  const columns = (schema.columns?.length
    ? schema.columns
    : AGREE_COLUMN_TEMPLATE
  )
    .filter((c) => c.visible !== false)
    .map((c) => ({
      field: c.field,
      title: c.title,
      visible: true,
      width: c.width,
      minWidth: c.minWidth,
      cellType: c.cellType,
    }));

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
    columns: AGREE_COLUMN_TEMPLATE.filter((c) => c.visible).map((c) => ({
      ...c,
    })),
  };
}

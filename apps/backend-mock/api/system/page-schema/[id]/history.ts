import { eventHandler, getRouterParam } from 'h3';
import { listPageSchemaHistory } from '~/utils/mock-page-schema';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { useResponseSuccess } from '~/utils/response';

/**
 * GET /api/system/page-schema/:id/history
 * 配置历史版本列表（可视化配置台回滚）
 */
export default eventHandler((event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.pageSchemaList);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  const list = listPageSchemaHistory(id).map((h) => ({
    versionId: h.versionId,
    schemaId: h.schemaId,
    savedAt: h.savedAt,
    title: h.snapshot?.title,
    schemaKind: h.snapshot?.schemaKind,
    buttonCount: (h.snapshot?.buttons || []).length,
    columnCount: (h.snapshot?.columns || []).filter((c) => c.visible !== false)
      .length,
  }));
  return useResponseSuccess(list);
});

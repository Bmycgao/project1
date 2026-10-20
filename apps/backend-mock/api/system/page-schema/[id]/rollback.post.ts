import { eventHandler, getRouterParam, readBody } from 'h3';
import { listCustomAgreementModuleResources } from '~/utils/agreement-module-resources';
import {
  invalidateDynamicData,
  rollbackPageSchema,
} from '~/utils/mock-page-schema';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

/**
 * POST /api/system/page-schema/:id/rollback
 * body: { versionId }
 * 回滚到历史版本（无独立 Edit 码，用 List）
 */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.pageSchemaList);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  const body = await readBody(event);
  const versionId = String(body?.versionId || '');
  if (!versionId) {
    return useResponseError('缺少 versionId');
  }
  listCustomAgreementModuleResources();
  const node = rollbackPageSchema(id, versionId);
  if (!node) {
    return useResponseError('历史版本不存在或配置已删除');
  }
  invalidateDynamicData(id);
  listCustomAgreementModuleResources();
  return useResponseSuccess(node);
});

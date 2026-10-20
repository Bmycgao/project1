import { eventHandler, getRouterParam, readBody, setResponseStatus } from 'h3';
import { listCustomAgreementModuleResources } from '~/utils/agreement-module-resources';
import {
  invalidateDynamicData,
  updatePageSchema,
} from '~/utils/mock-page-schema';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

/** 更新页面字段配置（无独立 Edit 码，用 List） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.pageSchemaList);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  const body = await readBody(event);
  listCustomAgreementModuleResources();
  try {
    const node = updatePageSchema(id, body || {});
    if (!node) {
      return useResponseError('页面配置不存在');
    }
    invalidateDynamicData(id);
    listCustomAgreementModuleResources();
    return useResponseSuccess(node);
  } catch (error) {
    setResponseStatus(event, 400);
    return useResponseError(
      error instanceof Error ? error.message : '更新页面配置失败',
    );
  }
});

import { eventHandler, getRouterParam, readBody } from 'h3';
import {
  invalidateDynamicData,
  updatePageSchema,
} from '~/utils/mock-page-schema';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** 更新页面字段配置（无独立 Edit 码，用 List） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.pageSchemaList);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  const body = await readBody(event);
  const node = updatePageSchema(id, body || {});
  if (!node) {
    return useResponseError('页面配置不存在');
  }
  invalidateDynamicData(id);
  return useResponseSuccess(node);
});

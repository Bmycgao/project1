import { eventHandler, getRouterParam } from 'h3';
import { findPageSchema } from '~/utils/mock-page-schema';
import { assertPageSchemaReadAccess } from '~/utils/system-api-auth';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/**
 * GET /api/system/page-schema/:id
 * 业务读：协议岗可拉场景配置；管理端有 PageSchema:List 也可
 */
export default eventHandler(async (event) => {
  const auth = assertPageSchemaReadAccess(event);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  const node = findPageSchema(id);
  if (!node) {
    return useResponseError('页面配置不存在');
  }
  return useResponseSuccess(structuredClone(node));
});

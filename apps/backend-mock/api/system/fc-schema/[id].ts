import { eventHandler, getRouterParam, setResponseStatus } from 'h3';
import { findFcSchema } from '~/utils/mock-fc-schema';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertFcSchemaReadAccess } from '~/utils/system-api-auth';

/**
 * GET /api/system/fc-schema/:id
 * 业务读：协议岗可拉模板；管理端有 System:FcSchema:List 也可
 */
export default eventHandler(async (event) => {
  const auth = assertFcSchemaReadAccess(event);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  const node = findFcSchema(id);
  if (!node) {
    setResponseStatus(event, 404);
    return useResponseError('模板不存在');
  }
  return useResponseSuccess(node);
});

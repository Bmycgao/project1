import { eventHandler, getQuery } from 'h3';
import { listFcSchemas } from '~/utils/mock-fc-schema';
import { useResponseSuccess } from '~/utils/response';
import { assertFcSchemaReadAccess } from '~/utils/system-api-auth';

/**
 * GET /api/system/fc-schema/list
 * 业务读：协议岗可选模板；管理端有 System:FcSchema:List 也可
 */
export default eventHandler(async (event) => {
  const auth = assertFcSchemaReadAccess(event);
  if (!auth.ok) return auth.response;

  const { keyword, kind, status } = getQuery(event);
  const list = listFcSchemas({
    keyword: keyword ? String(keyword) : undefined,
    kind: kind ? String(kind) : undefined,
    status: status ? String(status) : undefined,
  });
  return useResponseSuccess(list);
});

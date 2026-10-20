import { eventHandler, getRouterParam, readBody, setResponseStatus } from 'h3';
import { updateFcSchema } from '~/utils/mock-fc-schema';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

/** 更新 FormCreate 模板 */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.fcSchemaList);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  const body = await readBody(event);
  const node = updateFcSchema(id, body || {});
  if (!node) {
    setResponseStatus(event, 404);
    return useResponseError('模板不存在');
  }
  return useResponseSuccess(node);
});

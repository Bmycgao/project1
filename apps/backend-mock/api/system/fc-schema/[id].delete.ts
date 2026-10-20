import { eventHandler, getRouterParam, setResponseStatus } from 'h3';
import { removeFcSchema } from '~/utils/mock-fc-schema';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

/** 删除 FormCreate 模板 */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.fcSchemaList);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  const ok = removeFcSchema(id);
  if (!ok) {
    setResponseStatus(event, 400);
    return useResponseError('模板不存在或为内置模板不可删');
  }
  return useResponseSuccess(true);
});

import { eventHandler, getRouterParam } from 'h3';
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
    return useResponseError(event, '模板不存在或为内置模板不可删', {
      statusCode: 400,
    });
  }
  return useResponseSuccess(true);
});

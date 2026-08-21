import { eventHandler, readBody } from 'h3';
import { createFcSchema } from '~/utils/mock-fc-schema';
import { useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

/** 新建 FormCreate 模板 */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.fcSchemaList);
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  const node = createFcSchema(body || {});
  return useResponseSuccess(node);
});

import { eventHandler, readBody } from 'h3';
import { createPageSchema } from '~/utils/mock-page-schema';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { useResponseSuccess } from '~/utils/response';

/** 创建页面字段配置（无独立 Create 码，用 List） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.pageSchemaList);
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  const node = createPageSchema(body || {});
  return useResponseSuccess(node);
});

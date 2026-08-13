import { eventHandler, getRouterParam } from 'h3';
import {
  invalidateDynamicData,
  removePageSchema,
} from '~/utils/mock-page-schema';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** 删除页面配置（无独立 Delete 码，用 List） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.pageSchemaList);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  const ok = removePageSchema(id);
  if (!ok) {
    return useResponseError('页面配置不存在');
  }
  invalidateDynamicData(id);
  return useResponseSuccess(true);
});

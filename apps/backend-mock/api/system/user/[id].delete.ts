import { eventHandler, getRouterParam } from 'h3';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { removeUserRecord } from '~/utils/rbac-store';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** DELETE /api/system/user/:id */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.userDelete);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id');
  if (!id) {
    return useResponseError('缺少用户 ID');
  }
  const ok = removeUserRecord(id);
  if (!ok) {
    return useResponseError('用户不存在');
  }
  return useResponseSuccess(null);
});

import { eventHandler, getRouterParam } from 'h3';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { removeRoleRecord } from '~/utils/rbac-store';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** DELETE /api/system/role/:id（无独立 Delete 码，与前端一致用 Edit） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.roleEdit);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id');
  if (!id) {
    return useResponseError('缺少角色 ID');
  }
  const ok = removeRoleRecord(id);
  if (!ok) {
    return useResponseError('角色不存在');
  }
  return useResponseSuccess(null);
});

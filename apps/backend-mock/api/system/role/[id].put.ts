import { eventHandler, getRouterParam, readBody } from 'h3';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { updateRoleRecord } from '~/utils/rbac-store';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** PUT /api/system/role/:id 更新角色及菜单授权 */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.roleEdit);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id');
  if (!id) {
    return useResponseError('缺少角色 ID');
  }
  try {
    const body = await readBody(event);
    const row = updateRoleRecord(id, body || {});
    return useResponseSuccess(row);
  } catch (error: any) {
    return useResponseError(error?.message || '更新失败');
  }
});

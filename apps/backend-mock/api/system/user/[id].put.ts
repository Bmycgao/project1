import { eventHandler, getRouterParam, readBody } from 'h3';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { updateUserRecord } from '~/utils/rbac-store';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** PUT /api/system/user/:id 更新用户（含角色绑定） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.userEdit);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id');
  if (!id) {
    return useResponseError('缺少用户 ID');
  }
  try {
    const body = await readBody(event);
    const row = updateUserRecord(id, body || {});
    return useResponseSuccess(row);
  } catch (error: any) {
    return useResponseError(error?.message || '更新失败');
  }
});

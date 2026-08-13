import { eventHandler, readBody } from 'h3';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { createRoleRecord } from '~/utils/rbac-store';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** POST /api/system/role 创建角色（含菜单授权） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.roleCreate);
  if (!auth.ok) return auth.response;

  try {
    const body = await readBody(event);
    const row = createRoleRecord(body || {});
    return useResponseSuccess(row);
  } catch (error: any) {
    return useResponseError(error?.message || '创建失败');
  }
});

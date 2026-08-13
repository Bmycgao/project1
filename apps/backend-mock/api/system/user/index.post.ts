import { eventHandler, readBody } from 'h3';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { createUserRecord } from '~/utils/rbac-store';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** POST /api/system/user 创建用户（可绑角色） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.userCreate);
  if (!auth.ok) return auth.response;

  try {
    const body = await readBody(event);
    const row = createUserRecord(body || {});
    return useResponseSuccess(row);
  } catch (error: any) {
    return useResponseError(error?.message || '创建失败');
  }
});

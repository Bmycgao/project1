import { defineEventHandler, getRouterParam, readBody } from 'h3';

import { MINIAPP_USER_AUTH } from '../../../../shared/miniapp-roles';
import { miniappResponse, miniappStore } from '../../../utils/miniapp-auth';
import { MiniappAuthError } from '../../../utils/miniapp-wechat';
import { assertSystemAccess } from '../../../utils/system-api-auth';

export default defineEventHandler((event) => {
  const auth = assertSystemAccess(event, MINIAPP_USER_AUTH.edit);
  if (!auth.ok) return auth.response;
  return miniappResponse(event, async () => {
    let body: null | { roleCode?: unknown; roleRevision?: unknown };
    try {
      body = await readBody(event);
    } catch {
      throw new MiniappAuthError(400, '请求格式不正确');
    }
    return miniappStore().setRole(
      getRouterParam(event, 'id') || '',
      body?.roleCode,
      body?.roleRevision,
    );
  });
});

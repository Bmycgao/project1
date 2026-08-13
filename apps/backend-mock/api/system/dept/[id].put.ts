import { eventHandler } from 'h3';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { sleep, useResponseSuccess } from '~/utils/response';

/** PUT /api/system/dept/:id 更新部门（演示桩） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.deptEdit);
  if (!auth.ok) return auth.response;

  await sleep(2000);
  return useResponseSuccess(null);
});

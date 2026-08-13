import { eventHandler } from 'h3';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { sleep, useResponseSuccess } from '~/utils/response';

/** DELETE /api/system/dept/:id 删除部门（演示桩） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.deptDelete);
  if (!auth.ok) return auth.response;

  await sleep(1000);
  return useResponseSuccess(null);
});

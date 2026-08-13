import { eventHandler } from 'h3';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { sleep, useResponseSuccess } from '~/utils/response';

/** POST /api/system/dept 创建部门（演示桩） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.deptCreate);
  if (!auth.ok) return auth.response;

  await sleep(600);
  return useResponseSuccess(null);
});

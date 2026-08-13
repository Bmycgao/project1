import { eventHandler } from 'h3';
import { MOCK_DEPT_TREE } from '~/utils/mock-dept';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { useResponseSuccess } from '~/utils/response';

/** 返回演示部门树 */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.deptList);
  if (!auth.ok) return auth.response;

  return useResponseSuccess(structuredClone(MOCK_DEPT_TREE));
});

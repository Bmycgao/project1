import { eventHandler } from 'h3';
import { MOCK_DEPT_TREE } from '~/utils/mock-dept';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

/** 返回演示部门树 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  return useResponseSuccess(structuredClone(MOCK_DEPT_TREE));
});

import { eventHandler, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  addInstance,
  createInstance,
} from '~/utils/approval-store';
import {
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

/** 发起审批实例 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const body = await readBody<{ bizTitle: string; bizType: string }>(event);
  const instance = createInstance({
    bizTitle: body?.bizTitle || '未命名审批',
    bizType: body?.bizType || 'outbound',
    initiatorName: userinfo.realName,
  });
  addInstance(instance);
  return useResponseSuccess(instance);
});

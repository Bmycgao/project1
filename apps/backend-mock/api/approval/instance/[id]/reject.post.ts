import { eventHandler, getRouterParam, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { rejectById } from '~/utils/approval-store';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/** 审批驳回 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const id = getRouterParam(event, 'id') || '';
  const body = await readBody<{ remark?: string }>(event);
  try {
    const instance = rejectById(id, userinfo.realName, body?.remark);
    return useResponseSuccess(instance);
  } catch (error: any) {
    return useResponseError(error?.message || '驳回失败');
  }
});

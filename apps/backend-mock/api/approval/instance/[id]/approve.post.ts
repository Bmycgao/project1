import { eventHandler, getRouterParam, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { approveById } from '~/utils/approval-store';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/** 审批通过 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const id = getRouterParam(event, 'id') || '';
  const body = await readBody<{ remark?: string }>(event);
  try {
    const instance = approveById(id, userinfo.realName, body?.remark);
    return useResponseSuccess(instance);
  } catch (error: any) {
    return useResponseError(error?.message || '审批失败');
  }
});

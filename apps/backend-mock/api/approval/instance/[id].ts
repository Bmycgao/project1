import { eventHandler, getRouterParam } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { findInstance } from '~/utils/approval-store';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/** 审批实例详情 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const id = getRouterParam(event, 'id') || '';
  const instance = findInstance(id);
  if (!instance) {
    return useResponseError('审批单不存在');
  }
  return useResponseSuccess(instance);
});

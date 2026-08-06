import { eventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { listAllInstances } from '~/utils/approval-store';
import {
  unAuthorizedResponse,
  usePageResponseSuccess,
} from '~/utils/response';

/** 待我审批：返回审批中的实例 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const { page = 1, pageSize = 20 } = getQuery(event);
  const list = listAllInstances().filter((item) => item.status === 'pending');
  return usePageResponseSuccess(page as string, pageSize as string, list);
});

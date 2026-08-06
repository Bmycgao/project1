import { eventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { listAllInstances } from '~/utils/approval-store';
import {
  unAuthorizedResponse,
  usePageResponseSuccess,
} from '~/utils/response';

/** 我发起的审批列表 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const { page = 1, pageSize = 20 } = getQuery(event);
  const list = listAllInstances().filter(
    (item) => item.initiatorName === userinfo.realName,
  );
  // 演示账号也展示全部，避免种子数据不可见
  const data =
    list.length > 0 ? list : listAllInstances().filter(() => true);
  return usePageResponseSuccess(page as string, pageSize as string, data);
});

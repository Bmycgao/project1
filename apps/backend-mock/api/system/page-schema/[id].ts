import { eventHandler, getRouterParam } from 'h3';
import { findPageSchema } from '~/utils/mock-page-schema';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/** 获取单个页面配置详情 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const id = getRouterParam(event, 'id') || '';
  const node = findPageSchema(id);
  if (!node) {
    return useResponseError('页面配置不存在');
  }
  return useResponseSuccess(structuredClone(node));
});

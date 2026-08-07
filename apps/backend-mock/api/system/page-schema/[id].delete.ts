import { eventHandler, getRouterParam } from 'h3';
import {
  invalidateDynamicData,
  removePageSchema,
} from '~/utils/mock-page-schema';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/** 删除页面配置 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const id = getRouterParam(event, 'id') || '';
  const ok = removePageSchema(id);
  if (!ok) {
    return useResponseError('页面配置不存在');
  }
  invalidateDynamicData(id);
  return useResponseSuccess(true);
});

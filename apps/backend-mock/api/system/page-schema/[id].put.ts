import { eventHandler, getRouterParam, readBody } from 'h3';
import {
  invalidateDynamicData,
  updatePageSchema,
} from '~/utils/mock-page-schema';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/** 更新页面字段配置 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const id = getRouterParam(event, 'id') || '';
  const body = await readBody(event);
  const node = updatePageSchema(id, body || {});
  if (!node) {
    return useResponseError('页面配置不存在');
  }
  invalidateDynamicData(id);
  return useResponseSuccess(node);
});

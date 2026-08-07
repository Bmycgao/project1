import { eventHandler, readBody } from 'h3';
import { createPageSchema } from '~/utils/mock-page-schema';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

/** 创建页面字段配置 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const body = await readBody(event);
  const node = createPageSchema(body || {});
  return useResponseSuccess(node);
});

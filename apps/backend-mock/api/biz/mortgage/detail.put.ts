import { eventHandler, readBody } from 'h3';
import { saveMortgageDetailAll } from '~/utils/mock-mortgage-detail';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/** PUT /api/biz/mortgage/detail 全部保存 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const body = await readBody(event);
  try {
    const saved = saveMortgageDetailAll(body || {});
    return useResponseSuccess(saved);
  } catch (error: any) {
    return useResponseError(error?.message || '保存失败');
  }
});

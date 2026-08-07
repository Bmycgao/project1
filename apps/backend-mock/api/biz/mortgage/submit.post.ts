import { eventHandler, readBody } from 'h3';
import { submitMortgageDetail } from '~/utils/mock-mortgage-detail';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/** POST /api/biz/mortgage/submit 提交详情 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const body = await readBody(event);
  try {
    const saved = submitMortgageDetail(body || {});
    return useResponseSuccess(saved);
  } catch (error: any) {
    return useResponseError(error?.message || '提交失败');
  }
});

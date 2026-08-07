import { eventHandler, readBody } from 'h3';
import { submitAgreementDetail } from '~/utils/mock-agreement-detail';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/** POST /api/biz/agreement/submit 提交复核 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const body = await readBody(event);
  try {
    const saved = submitAgreementDetail(body || {});
    return useResponseSuccess(saved);
  } catch (error: any) {
    return useResponseError(error?.message || '提交失败');
  }
});

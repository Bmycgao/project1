import { eventHandler, readBody } from 'h3';
import { assertAgreeAction } from '~/utils/agree-api-auth';
import { submitAgreementDetail } from '~/utils/mock-agreement-detail';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** POST /api/biz/agreement/submit 提交复核 */
export default eventHandler(async (event) => {
  const auth = assertAgreeAction(event, 'submitReview');
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  try {
    const saved = submitAgreementDetail(body || {});
    return useResponseSuccess(saved);
  } catch (error: any) {
    return useResponseError(error?.message || '提交失败');
  }
});

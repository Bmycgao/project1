import { eventHandler, readBody } from 'h3';
import { assertAgreeAction } from '~/utils/agree-api-auth';
import { assertAgreementLegacyReview } from '~/utils/agreement-entry-access';
import { approveAgreementByNos } from '~/utils/mock-agreement-detail';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** POST /api/biz/agreement/approve 列表审核通过 */
export default eventHandler(async (event) => {
  const auth = assertAgreeAction(event, 'approve');
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  const references = body?.agreementIds ?? body?.agreementNos;
  const nos = Array.isArray(references)
    ? references.map(String).filter(Boolean)
    : [];
  if (nos.length === 0) {
    return useResponseError('请传入 agreementNos');
  }

  try {
    nos.forEach((value) => assertAgreementLegacyReview(value));
    const items = approveAgreementByNos(nos);
    return useResponseSuccess({ items, total: items.length });
  } catch (error: any) {
    return useResponseError(error?.message || '审核失败');
  }
});

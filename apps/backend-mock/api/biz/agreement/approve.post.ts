import { eventHandler, readBody } from 'h3';
import { assertAgreeAction } from '~/utils/agree-api-auth';
import { approveAgreementByNos } from '~/utils/mock-agreement-detail';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** POST /api/biz/agreement/approve 列表审核通过 */
export default eventHandler(async (event) => {
  const auth = assertAgreeAction(event, 'approve');
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  const nos = Array.isArray(body?.agreementNos)
    ? body.agreementNos.map(String).filter(Boolean)
    : [];
  if (!nos.length) {
    return useResponseError('请传入 agreementNos');
  }

  try {
    const items = approveAgreementByNos(nos);
    return useResponseSuccess({ items, total: items.length });
  } catch (error: any) {
    return useResponseError(error?.message || '审核失败');
  }
});

import { eventHandler, readBody } from 'h3';
import { assertAgreeAction } from '~/utils/agree-api-auth';
import { rejectAgreementByNos } from '~/utils/mock-agreement-detail';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** POST /api/biz/agreement/reject 列表驳回 */
export default eventHandler(async (event) => {
  const auth = assertAgreeAction(event, 'reject');
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  const nos = Array.isArray(body?.agreementNos)
    ? body.agreementNos.map(String).filter(Boolean)
    : [];
  if (!nos.length) {
    return useResponseError('请传入 agreementNos');
  }

  try {
    const items = rejectAgreementByNos(nos, body?.remark);
    return useResponseSuccess({ items, total: items.length });
  } catch (error: any) {
    return useResponseError(error?.message || '驳回失败');
  }
});

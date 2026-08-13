import { eventHandler, readBody } from 'h3';
import { assertAgreeAction } from '~/utils/agree-api-auth';
import { deleteAgreementByNos } from '~/utils/mock-agreement-detail';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** POST /api/biz/agreement/delete 批量删除协议 */
export default eventHandler(async (event) => {
  const auth = assertAgreeAction(event, 'delete');
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  const nos = Array.isArray(body?.agreementNos)
    ? body.agreementNos.map(String).filter(Boolean)
    : [];
  if (!nos.length) {
    return useResponseError('请传入 agreementNos');
  }

  const removed = deleteAgreementByNos(nos);
  return useResponseSuccess({ removed });
});

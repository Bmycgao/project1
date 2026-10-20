import { eventHandler, readBody } from 'h3';
import { assertAgreeAction } from '~/utils/agree-api-auth';
import { assertAgreementEntryDelete } from '~/utils/agreement-entry-access';
import { deleteAgreementByNos } from '~/utils/mock-agreement-detail';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** POST /api/biz/agreement/delete 批量删除协议 */
export default eventHandler(async (event) => {
  const auth = assertAgreeAction(event, 'delete');
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
    nos.forEach((value) => assertAgreementEntryDelete(value));
    const removed = deleteAgreementByNos(nos);
    return useResponseSuccess({ removed });
  } catch (error: any) {
    return useResponseError(error?.message || '删除失败');
  }
});

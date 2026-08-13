import { eventHandler, readBody } from 'h3';
import { assertAgreeAction } from '~/utils/agree-api-auth';
import { saveAgreementDetailAll } from '~/utils/mock-agreement-detail';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** PUT /api/biz/agreement/detail 全部保存 */
export default eventHandler(async (event) => {
  const auth = assertAgreeAction(event, 'edit');
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  try {
    const saved = saveAgreementDetailAll(body || {});
    return useResponseSuccess(saved);
  } catch (error: any) {
    return useResponseError(error?.message || '保存失败');
  }
});

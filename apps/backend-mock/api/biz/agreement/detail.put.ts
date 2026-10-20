import { eventHandler, readBody } from 'h3';
import { assertAgreeAction } from '~/utils/agree-api-auth';
import {
  projectAgreementDetailForCodes,
  restrictAgreementDetailWrite,
} from '~/utils/agreement-detail-permissions';
import { assertAgreementEntryWrite } from '~/utils/agreement-entry-access';
import {
  getOrCreateAgreementDetail,
  saveAgreementDetailAll,
} from '~/utils/mock-agreement-detail';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** PUT /api/biz/agreement/detail 全部保存 */
export default eventHandler(async (event) => {
  const auth = assertAgreeAction(event, 'edit');
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  const agreementNo = String(body?.id || body?.agreementNo || '').trim();
  if (!agreementNo) return useResponseError('缺少协议编号');
  try {
    assertAgreementEntryWrite(agreementNo);
    const current = getOrCreateAgreementDetail(agreementNo);
    const saved = saveAgreementDetailAll(
      restrictAgreementDetailWrite(body || {}, current, auth.codes),
    );
    return useResponseSuccess(
      projectAgreementDetailForCodes(saved, auth.codes),
    );
  } catch (error: any) {
    return useResponseError(error?.message || '保存失败');
  }
});

import { eventHandler, getQuery } from 'h3';
import { assertAnyAgreeAccess } from '~/utils/agree-api-auth';
import { getOrCreateAgreementDetail } from '~/utils/mock-agreement-detail';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** GET /api/biz/agreement/detail?agreementNo=xxx */
export default eventHandler(async (event) => {
  const auth = assertAnyAgreeAccess(event);
  if (!auth.ok) return auth.response;

  const query = getQuery(event);
  const agreementNo = String(query.agreementNo || '').trim();
  if (!agreementNo) {
    return useResponseError('缺少协议编号');
  }

  const detail = getOrCreateAgreementDetail(agreementNo, {
    compensatee: query.compensatee,
    houseAddress: query.houseAddress,
    id: query.id,
  });
  return useResponseSuccess(detail);
});

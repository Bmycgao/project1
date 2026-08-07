import { eventHandler, getQuery } from 'h3';
import { getOrCreateAgreementDetail } from '~/utils/mock-agreement-detail';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/** GET /api/biz/agreement/detail?agreementNo=xxx */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

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

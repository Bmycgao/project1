import { eventHandler, readBody } from 'h3';
import { assertAgreeAction } from '~/utils/agree-api-auth';
import { submitAgreementByNos } from '~/utils/mock-agreement-detail';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** POST /api/biz/agreement/batch-submit 列表批量提交复核 */
export default eventHandler(async (event) => {
  const auth = assertAgreeAction(event, 'submitReview');
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  const nos = normalizeNos(body?.agreementNos ?? body?.agreementNo);
  if (!nos.length) {
    return useResponseError('请传入 agreementNos');
  }

  try {
    const saved = submitAgreementByNos(nos);
    return useResponseSuccess({ items: saved, total: saved.length });
  } catch (error: any) {
    return useResponseError(error?.message || '批量提交失败');
  }
});

/**
 * 归一化协议编号数组
 * @param input 单个或数组
 */
function normalizeNos(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map(String).filter(Boolean);
  }
  if (input !== undefined && input !== null && String(input).trim()) {
    return [String(input).trim()];
  }
  return [];
}

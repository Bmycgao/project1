import { eventHandler, getRouterParam, readBody } from 'h3';
import {
  AGREE_MODULE_AUTH,
  assertAgreeAccess,
} from '~/utils/agree-api-auth';
import { saveAgreementDetailModule } from '~/utils/mock-agreement-detail';
import type { AgreementModuleKey } from '~/utils/agreement-detail-types';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** PUT /api/biz/agreement/module/:module 按模块保存 */
export default eventHandler(async (event) => {
  const module = String(getRouterParam(event, 'module') || '');
  const need = AGREE_MODULE_AUTH[module];
  if (!need) {
    return useResponseError('未知模块');
  }

  const auth = assertAgreeAccess(event, need);
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  const agreementNo = String(body?.agreementNo || '');
  if (!agreementNo) {
    return useResponseError('缺少协议编号');
  }

  try {
    const saved = saveAgreementDetailModule(
      agreementNo,
      module as AgreementModuleKey,
      body?.data || {},
    );
    return useResponseSuccess(saved);
  } catch (error: any) {
    return useResponseError(error?.message || '模块保存失败');
  }
});

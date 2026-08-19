import { eventHandler, getRouterParam, readBody } from 'h3';
import {
  AGREE_MODULE_AUTH,
  assertAgreeAccess,
  assertAnyAgreeAccess,
} from '~/utils/agree-api-auth';
import { saveAgreementDetailModule } from '~/utils/mock-agreement-detail';
import type { AgreementModuleKey } from '~/utils/agreement-detail-types';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/** PUT /api/biz/agreement/module/:module 按模块保存 */
export default eventHandler(async (event) => {
  const module = String(getRouterParam(event, 'module') || '');
  // 自定义块没有独立权限码：有任一协议模块权限即可保存，避免录入岗 403
  const auth = module.startsWith('custom_')
    ? assertAnyAgreeAccess(event)
    : AGREE_MODULE_AUTH[module]
      ? assertAgreeAccess(event, AGREE_MODULE_AUTH[module])
      : null;
  if (!auth) {
    return useResponseError('未知模块');
  }
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

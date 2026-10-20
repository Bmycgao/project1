import type { AgreementModuleKey } from '~/utils/agreement-detail-types';

import { eventHandler, getRouterParam, readBody } from 'h3';
import {
  AGREE_MODULE_AUTH,
  assertAgreeAccess,
  assertAgreeAction,
} from '~/utils/agree-api-auth';
import { projectAgreementDetailForCodes } from '~/utils/agreement-detail-permissions';
import { assertAgreementEntryWrite } from '~/utils/agreement-entry-access';
import { listCustomAgreementModuleResources } from '~/utils/agreement-module-resources';
import { saveAgreementDetailModule } from '~/utils/mock-agreement-detail';
import { useResponseError, useResponseSuccess } from '~/utils/response';

import {
  agreementModuleAuthCode,
  isCustomAgreementModule,
} from '../../../../../shared/agreement-module-access';

/** PUT /api/biz/agreement/module/:module 按模块保存 */
export default eventHandler(async (event) => {
  const editAuth = assertAgreeAction(event, 'edit');
  if (!editAuth.ok) return editAuth.response;
  const module = String(getRouterParam(event, 'module') || '');
  if (
    isCustomAgreementModule(module) &&
    !listCustomAgreementModuleResources().some((item) => item.key === module)
  ) {
    return useResponseError('未知模块');
  }
  const requiredCode = isCustomAgreementModule(module)
    ? agreementModuleAuthCode(module)
    : AGREE_MODULE_AUTH[module];
  const auth = requiredCode ? assertAgreeAccess(event, requiredCode) : null;
  if (!auth) {
    return useResponseError('未知模块');
  }
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  const agreementNo = String(body?.id || body?.agreementNo || '');
  if (!agreementNo) {
    return useResponseError('缺少协议编号');
  }

  try {
    assertAgreementEntryWrite(agreementNo);
    const data = body?.data || {};
    const moduleData = isCustomAgreementModule(module)
      ? {
          extraForms: Object.hasOwn(data.extraForms || {}, module)
            ? { [module]: data.extraForms[module] }
            : undefined,
          extraTables: Object.hasOwn(data.extraTables || {}, module)
            ? { [module]: data.extraTables[module] }
            : undefined,
        }
      : data;
    const saved = saveAgreementDetailModule(
      agreementNo,
      module as AgreementModuleKey,
      moduleData,
    );
    return useResponseSuccess(
      projectAgreementDetailForCodes(saved, auth.codes),
    );
  } catch (error: any) {
    return useResponseError(error?.message || '模块保存失败');
  }
});

import { eventHandler, getRouterParam, readBody } from 'h3';
import { saveMortgageDetailModule } from '~/utils/mock-mortgage-detail';
import type { MortgageModuleKey } from '~/utils/mortgage-detail-types';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

const MODULES = new Set(['basic', 'mortgage', 'material']);

/** PUT /api/biz/mortgage/module/:module 按模块保存 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const module = String(getRouterParam(event, 'module') || '');
  if (!MODULES.has(module)) {
    return useResponseError('未知模块');
  }

  const body = await readBody(event);
  const agreementNo = String(body?.agreementNo || '');
  if (!agreementNo) {
    return useResponseError('缺少协议编号');
  }

  try {
    const saved = saveMortgageDetailModule(
      agreementNo,
      module as MortgageModuleKey,
      body?.data,
    );
    return useResponseSuccess(saved);
  } catch (error: any) {
    return useResponseError(error?.message || '模块保存失败');
  }
});

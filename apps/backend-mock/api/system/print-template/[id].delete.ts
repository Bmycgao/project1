import { eventHandler, getRouterParam, setResponseStatus } from 'h3';
import { removePrintTemplate } from '~/utils/mock-print-template';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

/** DELETE /api/system/print-template/:id */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.printTemplateList);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  const ok = removePrintTemplate(id);
  if (!ok) {
    setResponseStatus(event, 400);
    return useResponseError('模板不存在或为内置模板不可删');
  }
  return useResponseSuccess(true);
});

import { eventHandler, getRouterParam, readBody } from 'h3';
import { updatePrintTemplate } from '~/utils/mock-print-template';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

/** PUT /api/system/print-template/:id 更新 */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.printTemplateList);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  try {
    const body = await readBody(event);
    const node = updatePrintTemplate(id, body || {});
    if (!node) {
      return useResponseError(event, '打印模板不存在', { statusCode: 404 });
    }
    return useResponseSuccess(node);
  } catch (error: any) {
    return useResponseError(event, error?.message || '更新失败', {
      statusCode: 400,
    });
  }
});

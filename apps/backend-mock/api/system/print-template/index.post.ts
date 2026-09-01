import { eventHandler, readBody } from 'h3';
import { createPrintTemplate } from '~/utils/mock-print-template';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

/** POST /api/system/print-template 新建 */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.printTemplateList);
  if (!auth.ok) return auth.response;

  try {
    const body = await readBody(event);
    const node = createPrintTemplate(body || {});
    return useResponseSuccess(node);
  } catch (error: any) {
    return useResponseError(event, error?.message || '创建失败', {
      statusCode: 400,
    });
  }
});

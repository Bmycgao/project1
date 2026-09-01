import { eventHandler, getRouterParam, setResponseStatus } from 'h3';
import { findPrintTemplate } from '~/utils/mock-print-template';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertPrintTemplateReadAccess } from '~/utils/system-api-auth';

/**
 * GET /api/system/print-template/:id
 */
export default eventHandler(async (event) => {
  const auth = assertPrintTemplateReadAccess(event);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  const node = findPrintTemplate(id);
  if (!node) {
    setResponseStatus(event, 404);
    return useResponseError('打印模板不存在');
  }
  return useResponseSuccess(node);
});

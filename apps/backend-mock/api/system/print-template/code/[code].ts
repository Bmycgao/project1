import { eventHandler, getRouterParam, setResponseStatus } from 'h3';
import { findPrintTemplateByCode } from '~/utils/mock-print-template';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertPrintTemplateReadAccess } from '~/utils/system-api-auth';

/**
 * GET /api/system/print-template/code/:code
 * 业务预览按 templateCode 拉模板 JSON
 */
export default eventHandler(async (event) => {
  const auth = assertPrintTemplateReadAccess(event);
  if (!auth.ok) return auth.response;

  const code = getRouterParam(event, 'code') || '';
  const node = findPrintTemplateByCode(code);
  if (!node) {
    setResponseStatus(event, 404);
    return useResponseError(`打印模板不存在：${code}`);
  }
  if (node.status === 0) {
    setResponseStatus(event, 403);
    return useResponseError('打印模板已停用');
  }
  return useResponseSuccess(node);
});

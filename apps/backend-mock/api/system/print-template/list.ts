import { eventHandler, getQuery } from 'h3';
import { listPrintTemplates } from '~/utils/mock-print-template';
import { useResponseSuccess } from '~/utils/response';
import { assertPrintTemplateReadAccess } from '~/utils/system-api-auth';

/**
 * GET /api/system/print-template/list
 * 管理端列表；协议岗可读（预览拉模板）
 */
export default eventHandler(async (event) => {
  const auth = assertPrintTemplateReadAccess(event);
  if (!auth.ok) return auth.response;

  const { keyword, bizType, status } = getQuery(event);
  const list = listPrintTemplates({
    keyword: keyword ? String(keyword) : undefined,
    bizType: bizType ? String(bizType) : undefined,
    status: status ? String(status) : undefined,
  });
  return useResponseSuccess(list);
});

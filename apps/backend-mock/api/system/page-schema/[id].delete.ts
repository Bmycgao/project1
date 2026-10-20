import { eventHandler, getRouterParam, setResponseStatus } from 'h3';
import { listCustomAgreementModuleResources } from '~/utils/agreement-module-resources';
import {
  invalidateDynamicData,
  removePageSchema,
} from '~/utils/mock-page-schema';
import { getPageSchemaUsage } from '~/utils/page-schema-references';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

/** 删除页面配置（无独立 Delete 码，用 List） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.pageSchemaList);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  try {
    const usage = getPageSchemaUsage(id);
    if (usage.liveCount > 0) {
      setResponseStatus(event, 409);
      return useResponseError(
        '此配置仍被菜单、公共列方案或流程草稿引用，请先在使用位置中解除引用',
      );
    }
  } catch {
    setResponseStatus(event, 500);
    return useResponseError('无法检查使用位置，暂不能删除，请稍后重试');
  }
  listCustomAgreementModuleResources();
  const ok = removePageSchema(id);
  if (!ok) {
    return useResponseError('页面配置不存在');
  }
  invalidateDynamicData(id);
  return useResponseSuccess(true);
});

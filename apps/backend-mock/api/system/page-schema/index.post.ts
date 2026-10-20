import { eventHandler, readBody, setResponseStatus } from 'h3';
import { listCustomAgreementModuleResources } from '~/utils/agreement-module-resources';
import { createPageSchema } from '~/utils/mock-page-schema';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

/** 创建页面字段配置（无独立 Create 码，用 List） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.pageSchemaList);
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  try {
    const node = createPageSchema(body || {});
    listCustomAgreementModuleResources();
    return useResponseSuccess(node);
  } catch (error) {
    setResponseStatus(event, 400);
    return useResponseError(
      error instanceof Error ? error.message : '创建页面配置失败',
    );
  }
});

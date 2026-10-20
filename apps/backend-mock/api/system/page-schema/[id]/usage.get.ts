import { eventHandler, getRouterParam, setResponseStatus } from 'h3';
import { findPageSchema } from '~/utils/mock-page-schema';
import { getPageSchemaUsage } from '~/utils/page-schema-references';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

export default eventHandler((event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.pageSchemaList);
  if (!auth.ok) return auth.response;
  const id = getRouterParam(event, 'id') || '';
  if (!findPageSchema(id)) return useResponseError('页面配置不存在');
  try {
    return useResponseSuccess(getPageSchemaUsage(id));
  } catch {
    setResponseStatus(event, 500);
    return useResponseError('使用位置加载失败，请检查配置存储后重试');
  }
});

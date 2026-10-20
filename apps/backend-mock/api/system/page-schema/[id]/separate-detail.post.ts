import { eventHandler, getRouterParam, setResponseStatus } from 'h3';
import {
  invalidateDynamicData,
  separatePageSchemaDetail,
} from '~/utils/mock-page-schema';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

export default eventHandler((event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.pageSchemaList);
  if (!auth.ok) return auth.response;
  const id = getRouterParam(event, 'id') || '';
  try {
    const result = separatePageSchemaDetail(id);
    invalidateDynamicData(id);
    return useResponseSuccess(result);
  } catch (error) {
    setResponseStatus(event, 400);
    return useResponseError(
      error instanceof Error ? error.message : '拆分详情失败',
    );
  }
});

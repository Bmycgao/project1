import { eventHandler, getQuery } from 'h3';
import { queryRoles } from '~/utils/rbac-store';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { usePageResponseSuccess } from '~/utils/response';

/** GET /api/system/role/list：角色列表（内存 RBAC） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.roleList);
  if (!auth.ok) return auth.response;

  const query = getQuery(event);
  const listData = queryRoles(query);
  const page = query.page || 1;
  const pageSize = query.pageSize || 20;
  return usePageResponseSuccess(
    page as string,
    pageSize as string,
    listData,
  );
});

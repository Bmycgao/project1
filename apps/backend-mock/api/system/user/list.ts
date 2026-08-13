import { eventHandler, getQuery } from 'h3';
import {
  collectDeptAndDescendantIds,
  MOCK_DEPT_TREE,
} from '~/utils/mock-dept';
import { queryUsers } from '~/utils/rbac-store';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { usePageResponseSuccess } from '~/utils/response';

/** GET /api/system/user/list：用户列表（内存 RBAC，含 roleIds） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.userList);
  if (!auth.ok) return auth.response;

  const query = getQuery(event);
  let listData = queryUsers(query);

  // 选中父部门时，同时返回该部门及全部下级部门的用户
  if (query.deptId) {
    const deptIds = collectDeptAndDescendantIds(
      MOCK_DEPT_TREE,
      String(query.deptId),
    );
    listData = listData.filter((item) =>
      deptIds.includes(String(item.deptId)),
    );
  }

  const page = query.page || 1;
  const pageSize = query.pageSize || 20;
  return usePageResponseSuccess(
    page as string,
    pageSize as string,
    listData,
  );
});

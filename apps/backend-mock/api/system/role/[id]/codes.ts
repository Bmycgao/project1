import { eventHandler, getRouterParam } from 'h3';
import {
  findRbacRoleById,
  resolveAccessCodesByRoleId,
} from '~/utils/rbac-store';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/**
 * GET /api/system/role/:id/codes
 * 返回该角色汇总后的权限码（供页面配置「可视化预览」）
 */
export default eventHandler((event) => {
  // 角色管理预览 / 页面配置预览均可
  const auth = assertSystemAccess(event, [
    SYSTEM_AUTH.roleList,
    SYSTEM_AUTH.pageSchemaList,
  ]);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  const role = findRbacRoleById(id);
  if (!role) {
    return useResponseError('角色不存在');
  }

  const codes = resolveAccessCodesByRoleId(id);
  return useResponseSuccess({
    roleId: role.id,
    roleName: role.name,
    roleCode: role.code,
    codes,
  });
});

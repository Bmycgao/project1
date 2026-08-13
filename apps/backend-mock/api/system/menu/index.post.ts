import { eventHandler, readBody } from 'h3';
import { createMenuNode } from '~/utils/menu-store';
import {
  findRbacUserByUsername,
  grantNewMenuToDefaultRoles,
} from '~/utils/rbac-store';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { sleep, useResponseError, useResponseSuccess } from '~/utils/response';

/** 创建菜单并写入统一菜单源；自动授权超管/管理员（及操作者角色） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.menuCreate);
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  await sleep(300);
  try {
    const node = createMenuNode(body || {});
    // 侧栏按角色 permissions 过滤：新建后必须写入，否则管理页有、侧栏无
    const operator = findRbacUserByUsername(auth.userinfo.username);
    grantNewMenuToDefaultRoles(node.id, operator?.roleIds);
    return useResponseSuccess(node);
  } catch (error: any) {
    return useResponseError(error?.message || '创建菜单失败');
  }
});

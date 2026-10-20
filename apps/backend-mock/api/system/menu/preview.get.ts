import type { RbacUser } from '~/utils/rbac-store';

import { eventHandler, getQuery } from 'h3';
import {
  findRbacUserByUsername,
  queryUsers,
  resolveAccessMenus,
  roleStore,
} from '~/utils/rbac-store';
import { useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

export default eventHandler((event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.menuList);
  if (!auth.ok) return auth.response;
  const { roleId, userId } = getQuery(event);
  const roles = roleStore
    .filter((role) => role.status === 1)
    .map(({ id, name }) => ({ id, name }));
  const users = queryUsers({ status: '1' }).map(({ id, name, username }) => ({
    id,
    name,
    username,
  }));
  let viewer: RbacUser | undefined;
  if (userId) {
    const selected = users.find((user) => String(user.id) === String(userId));
    viewer = selected ? findRbacUserByUsername(selected.username) : undefined;
  } else if (roleId && roles.some((role) => role.id === String(roleId))) {
    viewer = { roleIds: [String(roleId)] } as RbacUser;
  }
  return useResponseSuccess({
    roles,
    users,
    menus: viewer ? resolveAccessMenus(viewer) : [],
  });
});

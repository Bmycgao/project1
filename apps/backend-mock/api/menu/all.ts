import { eventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  findRbacUserByUsername,
  resolveAccessMenus,
} from '~/utils/rbac-store';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

/** 登录后侧栏菜单：按用户角色权限 ID 过滤后下发 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const user = findRbacUserByUsername(userinfo.username);
  const menus = user ? resolveAccessMenus(user) : [];
  return useResponseSuccess(menus);
});

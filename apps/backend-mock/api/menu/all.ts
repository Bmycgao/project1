import { eventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { buildAccessMenusForUser } from '~/utils/mock-data';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

/** 登录后侧栏菜单：与菜单管理同源，按用户过滤后下发 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const menus = buildAccessMenusForUser(userinfo.username);
  return useResponseSuccess(menus);
});

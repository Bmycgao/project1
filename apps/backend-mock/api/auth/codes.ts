import { eventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  findRbacUserByUsername,
  resolveAccessCodes,
} from '~/utils/rbac-store';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

/** GET /api/auth/codes：按用户角色汇总权限码 */
export default eventHandler((event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const user = findRbacUserByUsername(userinfo.username);
  const codes = user ? resolveAccessCodes(user) : [];
  return useResponseSuccess(codes);
});

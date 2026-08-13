import { defineEventHandler } from 'h3';
import {
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
  setRefreshTokenCookie,
} from '~/utils/cookie-utils';
import { generateAccessToken, verifyRefreshToken } from '~/utils/jwt-utils';
import {
  findRbacUserByUsername,
  toAuthUserInfo,
} from '~/utils/rbac-store';
import { forbiddenResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const refreshToken = getRefreshTokenFromCookie(event);
  if (!refreshToken) {
    return forbiddenResponse(event);
  }

  clearRefreshTokenCookie(event);

  const userinfo = verifyRefreshToken(refreshToken);
  if (!userinfo) {
    return forbiddenResponse(event);
  }

  const found = findRbacUserByUsername(userinfo.username);
  if (!found) {
    return forbiddenResponse(event);
  }
  const accessToken = generateAccessToken(toAuthUserInfo(found));

  setRefreshTokenCookie(event, refreshToken);

  return accessToken;
});

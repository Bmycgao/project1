import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import {
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from '~/utils/cookie-utils';
import { generateAccessToken, generateRefreshToken } from '~/utils/jwt-utils';
import {
  findRbacUserByUsername,
  toAuthUserInfo,
} from '~/utils/rbac-store';
import {
  forbiddenResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/** 登录：校验 rbac-store 用户（角色权限由此用户绑定） */
export default defineEventHandler(async (event) => {
  const { password, username } = await readBody(event);
  if (!password || !username) {
    setResponseStatus(event, 400);
    return useResponseError(
      'BadRequestException',
      'Username and password are required',
    );
  }

  const found = findRbacUserByUsername(String(username));
  if (!found || found.password !== String(password)) {
    clearRefreshTokenCookie(event);
    return forbiddenResponse(event, 'Username or password is incorrect.');
  }

  const authUser = toAuthUserInfo(found);
  const accessToken = generateAccessToken(authUser);
  const refreshToken = generateRefreshToken(authUser);

  setRefreshTokenCookie(event, refreshToken);

  return useResponseSuccess({
    ...authUser,
    accessToken,
  });
});

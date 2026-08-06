import { eventHandler, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { createMenuNode } from '~/utils/menu-store';
import {
  sleep,
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/** 创建菜单并写入统一菜单源 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const body = await readBody(event);
  await sleep(300);
  try {
    const node = createMenuNode(body || {});
    return useResponseSuccess(node);
  } catch (error: any) {
    return useResponseError(error?.message || '创建菜单失败');
  }
});

import { eventHandler, getRouterParam } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { removeMenuNode } from '~/utils/menu-store';
import {
  sleep,
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/** 删除菜单（同步影响侧栏数据源） */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const id = getRouterParam(event, 'id') || '';
  await sleep(300);
  const ok = removeMenuNode(id);
  if (!ok) {
    return useResponseError('菜单不存在');
  }
  return useResponseSuccess(null);
});

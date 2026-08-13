import { eventHandler, getRouterParam } from 'h3';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { removeMenuNode } from '~/utils/menu-store';
import { sleep, useResponseError, useResponseSuccess } from '~/utils/response';

/** 删除菜单（同步影响侧栏数据源） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.menuDelete);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  await sleep(300);
  const ok = removeMenuNode(id);
  if (!ok) {
    return useResponseError('菜单不存在');
  }
  return useResponseSuccess(null);
});

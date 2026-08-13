import { eventHandler, getRouterParam, readBody } from 'h3';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { updateMenuNode } from '~/utils/menu-store';
import { sleep, useResponseError, useResponseSuccess } from '~/utils/response';

/** 更新菜单（同步影响侧栏数据源） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.menuEdit);
  if (!auth.ok) return auth.response;

  const id = getRouterParam(event, 'id') || '';
  const body = await readBody(event);
  await sleep(300);
  try {
    const node = updateMenuNode(id, body || {});
    if (!node) {
      return useResponseError('菜单不存在');
    }
    return useResponseSuccess(node);
  } catch (error: any) {
    return useResponseError(error?.message || '更新菜单失败');
  }
});

import { eventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { MOCK_MENU_LIST } from '~/utils/mock-data';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

/**
 * 收集菜单 path → id 映射
 * @param menus 菜单树
 * @param map 结果表
 */
function collectPaths(menus: any[], map: Record<string, string> = { '/': '0' }) {
  menus.forEach((menu) => {
    if (menu.path) {
      map[menu.path] = String(menu.id);
    }
    if (menu.children?.length) {
      collectPaths(menu.children, map);
    }
  });
  return map;
}

/** 校验菜单 path 是否已存在（基于当前 MOCK_MENU_LIST） */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const { id, path } = getQuery(event);
  const pathMap = collectPaths(MOCK_MENU_LIST);

  return (path as string) in pathMap &&
    (!id || pathMap[path as string] !== String(id))
    ? useResponseSuccess(true)
    : useResponseSuccess(false);
});

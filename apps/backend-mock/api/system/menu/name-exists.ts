import { eventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { MOCK_MENU_LIST } from '~/utils/mock-data';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

/**
 * 收集菜单 name → id 映射
 * @param menus 菜单树
 * @param map 结果表
 */
function collectNames(menus: any[], map: Record<string, string> = {}) {
  menus.forEach((menu) => {
    map[menu.name] = String(menu.id);
    if (menu.children?.length) {
      collectNames(menu.children, map);
    }
  });
  return map;
}

/** 校验菜单 name 是否已存在（基于当前 MOCK_MENU_LIST） */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const { id, name } = getQuery(event);
  const namesMap = collectNames(MOCK_MENU_LIST);

  return (name as string) in namesMap &&
    (!id || namesMap[name as string] !== String(id))
    ? useResponseSuccess(true)
    : useResponseSuccess(false);
});

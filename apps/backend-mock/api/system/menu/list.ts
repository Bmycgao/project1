import { eventHandler } from 'h3';
import { ensureMenuStoreHydrated } from '~/utils/menu-store';
import { MOCK_MENU_LIST } from '~/utils/mock-data';
import { useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

/** 菜单管理列表：与侧栏同源，优先读 menu.json 恢复后的树 */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.menuList);
  if (!auth.ok) return auth.response;

  ensureMenuStoreHydrated();
  return useResponseSuccess(MOCK_MENU_LIST);
});

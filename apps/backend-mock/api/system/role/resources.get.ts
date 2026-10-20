import { eventHandler } from 'h3';
import { rolePermissionResourceTree } from '~/utils/agreement-module-resources';
import { ensureMenuStoreHydrated } from '~/utils/menu-store';
import { MOCK_MENU_LIST } from '~/utils/mock-data';
import { useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

/** Role-only resource tree; custom modules are virtual permission resources. */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.roleList);
  if (!auth.ok) return auth.response;
  ensureMenuStoreHydrated();
  return useResponseSuccess(rolePermissionResourceTree(MOCK_MENU_LIST));
});

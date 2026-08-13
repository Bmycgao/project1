import { eventHandler } from 'h3';
import { MOCK_MENU_LIST } from '~/utils/mock-data';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.menuList);
  if (!auth.ok) return auth.response;

  return useResponseSuccess(MOCK_MENU_LIST);
});

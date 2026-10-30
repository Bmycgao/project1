import { defineEventHandler } from 'h3';

import { MINIAPP_NAV_AUTH } from '../../../../shared/miniapp-navigation';
import { miniappResponse } from '../../../utils/miniapp-auth';
import { navigationStore } from '../../../utils/miniapp-navigation-store';
import { assertSystemAccess } from '../../../utils/system-api-auth';

export default defineEventHandler((event) => {
  const auth = assertSystemAccess(event, MINIAPP_NAV_AUTH.read);
  if (!auth.ok) return auth.response;
  return miniappResponse(event, () => navigationStore().read());
});

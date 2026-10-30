import { defineEventHandler } from 'h3';

import { MINIAPP_USER_AUTH } from '../../../../shared/miniapp-roles';
import { miniappResponse, miniappStore } from '../../../utils/miniapp-auth';
import { assertSystemAccess } from '../../../utils/system-api-auth';

export default defineEventHandler((event) => {
  const auth = assertSystemAccess(event, MINIAPP_USER_AUTH.read);
  if (!auth.ok) return auth.response;
  return miniappResponse(event, () => ({ items: miniappStore().listUsers() }));
});

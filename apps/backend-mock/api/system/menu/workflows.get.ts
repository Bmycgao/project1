import { eventHandler } from 'h3';
import { useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';
import { publishedWorkflowFamilies } from '~/utils/workflow-menu';

export default eventHandler((event) => {
  const auth = assertSystemAccess(event, [
    SYSTEM_AUTH.menuCreate,
    SYSTEM_AUTH.menuEdit,
  ]);
  if (!auth.ok) return auth.response;
  return useResponseSuccess(publishedWorkflowFamilies());
});

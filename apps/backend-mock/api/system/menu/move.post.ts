import { eventHandler, readBody } from 'h3';
import { moveMenuNode } from '~/utils/menu-store';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { assertSystemAccess, SYSTEM_AUTH } from '~/utils/system-api-auth';

export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.menuEdit);
  if (!auth.ok) return auth.response;
  const body = await readBody(event);
  if (!['after', 'before', 'inner'].includes(body?.position))
    return useResponseError('拖拽位置不正确');
  try {
    return useResponseSuccess(
      moveMenuNode(body.id, body.targetId, body.position),
    );
  } catch (error) {
    return useResponseError((error as Error).message);
  }
});

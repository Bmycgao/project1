import type { H3Event } from 'h3';

import type { RuntimeActor } from '../../shared/workflow-runtime';

import { setResponseStatus } from 'h3';

import { hasWorkflowRuntimeAccess } from '../../shared/workflow-runtime';
import { verifyAccessToken } from './jwt-utils';
import {
  findRbacUserByUsername,
  resolveAccessCodes,
  roleStore,
  userStore,
} from './rbac-store';
import {
  forbiddenResponse,
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from './response';
import { WorkflowError } from './workflow-engine';
export function workflowActors(): RuntimeActor[] {
  return userStore
    .filter((u) => u.status === 1)
    .map((u) => ({
      id: String(u.id),
      name: u.realName || u.name,
      roleIds: u.roleIds.filter((id) =>
        roleStore.some((r) => r.id === id && r.status === 1),
      ),
      deptId: u.deptId,
      codes: resolveAccessCodes(u),
    }));
}
export async function runtimeRequest(
  event: H3Event,
  action: (actor: RuntimeActor, actors: RuntimeActor[]) => unknown,
  kind: 'handle' | 'start' = 'handle',
) {
  const info = verifyAccessToken(event);
  if (!info) return unAuthorizedResponse(event);
  const user = findRbacUserByUsername(info.username);
  if (!user) return unAuthorizedResponse(event);
  const actors = workflowActors();
  const actor = actors.find((a) => a.id === String(user.id))!;
  if (!actor || !hasWorkflowRuntimeAccess(actor.codes, kind))
    return forbiddenResponse(
      event,
      kind === 'start' ? '无流程发起权限' : '无流程办理权限',
    );
  try {
    return useResponseSuccess(await action(actor, actors));
  } catch (error) {
    setResponseStatus(
      event,
      error instanceof WorkflowError ? error.status : 400,
    );
    return useResponseError(
      error instanceof Error ? error.message : '流程操作失败',
    );
  }
}

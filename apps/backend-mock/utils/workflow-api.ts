import type { H3Event } from 'h3';

import { setResponseStatus } from 'h3';

import { WORKFLOW_AUTH } from '../../shared/workflow-runtime';
import { useResponseError, useResponseSuccess } from './response';
import { assertSystemAccess } from './system-api-auth';

export async function workflowRequest(
  event: H3Event,
  action: (username: string) => unknown,
) {
  const auth = assertSystemAccess(event, WORKFLOW_AUTH.manage);
  if (!auth.ok) return auth.response;
  try {
    return useResponseSuccess(await action(auth.userinfo.username));
  } catch (error) {
    setResponseStatus(event, 400);
    return useResponseError(
      error instanceof Error ? error.message : '流程操作失败',
    );
  }
}

import { eventHandler } from 'h3';
import { listWorkflowAgreements } from '~/utils/workflow-agreement';
import { runtimeRequest } from '~/utils/workflow-runtime-api';

/** GET /api/workflow/agreements 发起流程时可选的已有协议 */
export default eventHandler((event) =>
  runtimeRequest(event, () => listWorkflowAgreements()),
);

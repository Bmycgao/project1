import { eventHandler, getRouterParam } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { getWorkflow } from '~/utils/workflow-store';
export default eventHandler((event) =>
  workflowRequest(event, () => getWorkflow(getRouterParam(event, 'id') || '')),
);

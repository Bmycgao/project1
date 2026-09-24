import { eventHandler, getRouterParam } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { deleteWorkflow } from '~/utils/workflow-store';
export default eventHandler((event) =>
  workflowRequest(event, () =>
    deleteWorkflow(getRouterParam(event, 'id') || ''),
  ),
);

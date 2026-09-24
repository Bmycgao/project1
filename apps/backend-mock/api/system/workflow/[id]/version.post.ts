import { eventHandler, getRouterParam } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { newWorkflowVersion } from '~/utils/workflow-store';
export default eventHandler((event) =>
  workflowRequest(event, (username) =>
    newWorkflowVersion(getRouterParam(event, 'id') || '', username),
  ),
);

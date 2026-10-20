import { eventHandler } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { listWorkflowButtonResources } from '~/utils/workflow-button-store';

export default eventHandler((event) =>
  workflowRequest(event, () => listWorkflowButtonResources()),
);

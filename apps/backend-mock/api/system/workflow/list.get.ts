import { eventHandler } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { listWorkflows } from '~/utils/workflow-store';
export default eventHandler((event) =>
  workflowRequest(event, () => listWorkflows()),
);

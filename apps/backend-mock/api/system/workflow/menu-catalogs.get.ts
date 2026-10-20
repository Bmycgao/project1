import { eventHandler } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { workflowMenuCatalogs } from '~/utils/workflow-menu';

export default eventHandler((event) =>
  workflowRequest(event, () => workflowMenuCatalogs()),
);

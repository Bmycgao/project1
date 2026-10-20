import { eventHandler, getRouterParam } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { deleteWorkflowButtonResource } from '~/utils/workflow-button-store';

export default eventHandler((event) =>
  workflowRequest(event, () =>
    deleteWorkflowButtonResource(getRouterParam(event, 'code') || ''),
  ),
);

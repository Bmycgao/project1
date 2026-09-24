import { eventHandler, getRouterParam, readBody } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { disableWorkflow } from '~/utils/workflow-store';
export default eventHandler((event) =>
  workflowRequest(event, async () =>
    disableWorkflow(
      getRouterParam(event, 'id') || '',
      (await readBody(event))?.revision,
    ),
  ),
);

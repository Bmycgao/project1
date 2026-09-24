import { eventHandler, getRouterParam, readBody } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { saveWorkflow } from '~/utils/workflow-store';
export default eventHandler((event) =>
  workflowRequest(event, async (username) => {
    const body = await readBody(event);
    return saveWorkflow(
      body,
      username,
      getRouterParam(event, 'id') || '',
      body?.revision,
    );
  }),
);

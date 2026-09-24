import { eventHandler, readBody } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { saveWorkflow } from '~/utils/workflow-store';
export default eventHandler((event) =>
  workflowRequest(event, async (username) =>
    saveWorkflow(await readBody(event), username),
  ),
);

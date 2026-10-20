import { eventHandler, readBody } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { saveWorkflowButtonResource } from '~/utils/workflow-button-store';

export default eventHandler((event) =>
  workflowRequest(event, async () =>
    saveWorkflowButtonResource(await readBody(event)),
  ),
);

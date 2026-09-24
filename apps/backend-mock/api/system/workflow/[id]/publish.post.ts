import { eventHandler, getRouterParam, readBody } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { publishChecked } from '~/utils/workflow-publication';
export default eventHandler((event) =>
  workflowRequest(event, async (username) =>
    publishChecked(
      getRouterParam(event, 'id') || '',
      (await readBody(event))?.revision,
      username,
    ),
  ),
);

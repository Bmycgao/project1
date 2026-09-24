import { eventHandler, getRouterParam } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { publicationCheck } from '~/utils/workflow-publication';
export default eventHandler((event) =>
  workflowRequest(event, () =>
    publicationCheck(getRouterParam(event, 'id') || ''),
  ),
);

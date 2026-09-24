import { eventHandler, getRouterParam } from 'h3';
import { workflowContext } from '~/utils/workflow-engine';
import { runtimeRequest } from '~/utils/workflow-runtime-api';
export default eventHandler((event) =>
  runtimeRequest(event, (actor, actors) =>
    workflowContext(getRouterParam(event, 'id') || '', actor, actors),
  ),
);

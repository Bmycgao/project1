import { eventHandler, getQuery } from 'h3';
import { listInstances } from '~/utils/workflow-engine';
import { runtimeRequest } from '~/utils/workflow-runtime-api';
export default eventHandler((event) =>
  runtimeRequest(event, (actor) =>
    listInstances(actor, String(getQuery(event).tab || 'todo')),
  ),
);

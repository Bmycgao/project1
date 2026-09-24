import { eventHandler, getRouterParam, readBody } from 'h3';
import { actOnInstance } from '~/utils/workflow-engine';
import { runtimeRequest } from '~/utils/workflow-runtime-api';
export default eventHandler((event) =>
  runtimeRequest(event, async (actor, actors) =>
    actOnInstance(
      getRouterParam(event, 'id') || '',
      await readBody(event),
      actor,
      actors,
    ),
  ),
);

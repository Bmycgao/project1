import { eventHandler, getRouterParam, readBody } from 'h3';
import { interveneInstance } from '~/utils/workflow-engine';
import { runtimeRequest } from '~/utils/workflow-runtime-api';

/** POST /api/workflow/instances/:id/intervene 监控干预 */
export default eventHandler((event) =>
  runtimeRequest(event, async (actor, actors) =>
    interveneInstance(
      getRouterParam(event, 'id') || '',
      await readBody(event),
      actor,
      actors,
    ),
  ),
);

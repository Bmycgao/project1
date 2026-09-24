import { eventHandler, readBody } from 'h3';
import { startInstance } from '~/utils/workflow-engine';
import { runtimeRequest } from '~/utils/workflow-runtime-api';
export default eventHandler((event) =>
  runtimeRequest(
    event,
    async (actor, actors) =>
      startInstance(await readBody(event), actor, actors),
    'start',
  ),
);

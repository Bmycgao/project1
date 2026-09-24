import { eventHandler, readBody } from 'h3';
import { markNoticesRead } from '~/utils/workflow-engine';
import { runtimeRequest } from '~/utils/workflow-runtime-api';

/** POST /api/workflow/notices/read 标记已读，body.id 缺省则全部已读 */
export default eventHandler((event) =>
  runtimeRequest(event, async (actor) => {
    const body = await readBody(event);
    return markNoticesRead(
      actor,
      typeof body?.id === 'string' ? body.id : undefined,
    );
  }),
);

import { eventHandler } from 'h3';
import { listNotices } from '~/utils/workflow-engine';
import { runtimeRequest } from '~/utils/workflow-runtime-api';

/** GET /api/workflow/notices 当前用户的流程站内通知 */
export default eventHandler((event) =>
  runtimeRequest(event, (actor) => listNotices(actor)),
);

import { eventHandler } from 'h3';
import { runtimeRequest } from '~/utils/workflow-runtime-api';
import { listWorkflows } from '~/utils/workflow-store';

import { mayStartWorkflow } from '../../../shared/workflow-access';
import { startableWorkflowDefinition } from '../../../shared/workflow-runtime';
export default eventHandler((event) =>
  runtimeRequest(
    event,
    (actor) =>
      listWorkflows()
        .filter((d) => d.status === 'published' && mayStartWorkflow(d, actor))
        .map((value) => startableWorkflowDefinition(value)),
    'start',
  ),
);

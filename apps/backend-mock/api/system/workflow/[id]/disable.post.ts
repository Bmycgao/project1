import { eventHandler, getRouterParam, readBody } from 'h3';
import { workflowRequest } from '~/utils/workflow-api';
import { disableWorkflowMenu } from '~/utils/workflow-menu';
import { disableWorkflow } from '~/utils/workflow-store';
export default eventHandler((event) =>
  workflowRequest(event, async () => {
    const awaitedResult1 = await readBody(event);
    const disabled = disableWorkflow(
      getRouterParam(event, 'id') || '',
      awaitedResult1?.revision,
    );
    disableWorkflowMenu(disabled.familyId || disabled.id);
    return disabled;
  }),
);

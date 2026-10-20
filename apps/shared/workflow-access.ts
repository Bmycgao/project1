import type { WorkflowDocument, WorkflowNode } from './workflow';
import type { RuntimeActor } from './workflow-runtime';

/** Global Workflow:Start / Workflow:Use checks remain a prerequisite at the API boundary. */
function matchesRoles(
  allowed: string[] | undefined,
  denied: string[] | undefined,
  actor: RuntimeActor,
) {
  if (denied?.some((id) => actor.roleIds.includes(id))) return false;
  return !allowed?.length || actor.roleIds.some((id) => allowed.includes(id));
}

export function mayStartWorkflow(
  definition: Pick<WorkflowDocument, 'startDeniedRoleIds' | 'startRoleIds'>,
  actor: RuntimeActor,
) {
  return matchesRoles(
    definition.startRoleIds,
    definition.startDeniedRoleIds,
    actor,
  );
}

export function mayHandleWorkflowNode(node: WorkflowNode, actor: RuntimeActor) {
  return matchesRoles(node.handleRoleIds, node.handleDeniedRoleIds, actor);
}

export function mayUseWorkflowButton(
  node: WorkflowNode,
  action: string,
  actor: RuntimeActor,
) {
  return (
    mayHandleWorkflowNode(node, actor) &&
    matchesRoles(
      node.buttonRoleIds?.[action],
      node.buttonDeniedRoleIds?.[action],
      actor,
    )
  );
}

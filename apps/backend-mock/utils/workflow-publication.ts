import type { WorkflowDocument, WorkflowNode } from '../../shared/workflow';
import type { RuntimeActor, RuntimeForm } from '../../shared/workflow-runtime';

import { validateWorkflow, workflowButtonAction } from '../../shared/workflow';
import {
  mayHandleWorkflowNode,
  mayStartWorkflow,
  mayUseWorkflowButton,
} from '../../shared/workflow-access';
import { evaluateCondition } from '../../shared/workflow-expression';
import {
  applyWorkflowDataActions,
  WORKFLOW_FIELD_CATALOG,
  WORKFLOW_PERSON_FIELDS,
} from '../../shared/workflow-runtime';
import { findDeptNode, leaderUserIdsOf, MOCK_DEPT_TREE } from './mock-dept';
import { roleStore } from './rbac-store';
import { freezeWorkflowForms } from './workflow-forms';
import { workflowActors } from './workflow-runtime-api';
import {
  findPublishedWorkflow,
  getWorkflow,
  publishWorkflow,
} from './workflow-store';

function inAssigneeRange(node: WorkflowNode, actor: RuntimeActor) {
  switch (node.assignee.type) {
    case 'departmentLeader': {
      return leaderUserIdsOf(node.assignee.ids).includes(actor.id);
    }
    case 'role': {
      return actor.roleIds.some((id) => node.assignee.ids.includes(id));
    }
    case 'user': {
      return node.assignee.ids.includes(actor.id);
    }
    default: {
      // 发起人/表单字段在发布时没有具体实例，只能在运行时求值。
      return true;
    }
  }
}

/**
 * 发布时检查办理人/抄送人仍有效，且范围内有流程办理权限
 * @param node 待检查节点
 * @param add 收集该节点问题
 * @param actors 当前可办理人员
 */
function checkPeople(
  node: WorkflowNode,
  add: (message: string) => void,
  actors: RuntimeActor[],
) {
  const person = node.type === 'cc' ? '抄送人' : '办理人';
  if (
    node.assignee.type === 'field' &&
    !WORKFLOW_PERSON_FIELDS.some((item) => item.key === node.assignee.field)
  )
    add(`${person}字段须选择经办人或协办人`);
  if (node.assignee.type === 'departmentLeader') {
    const missing = node.assignee.ids.some((id) => {
      const dept = findDeptNode(MOCK_DEPT_TREE, id);
      return !dept || dept.status === 0;
    });
    if (missing) add(`指定部门已失效`);
    else if (leaderUserIdsOf(node.assignee.ids).length === 0)
      add(`所选部门没有配置负责人`);
  }
  if (
    node.assignee.type === 'user' &&
    node.assignee.ids.some((id) => !actors.some((a) => a.id === id))
  )
    add(`指定${person === '抄送人' ? '抄送人员' : '人员'}已失效`);
  if (
    node.assignee.type === 'role' &&
    node.assignee.ids.some(
      (id) => !roleStore.some((r) => r.id === id && r.status === 1),
    )
  )
    add('指定角色已失效');
  if (
    ['departmentLeader', 'role', 'user'].includes(node.assignee.type) &&
    !actors.some((a) => {
      return (
        inAssigneeRange(node, a) &&
        a.codes.some((c) =>
          ['System:Workflow:Manage', 'Workflow:Use'].includes(c),
        )
      );
    })
  )
    add(`候选范围中没有具备流程办理权限的有效${person}`);
}

/**
 * 发布时检查数据动作字段存在、时机与节点按钮匹配
 * @param node 待检查节点
 * @param add 收集该节点问题
 * @param allowedFields 已冻结的非表格字段
 */
function checkDataActions(
  doc: WorkflowDocument,
  node: WorkflowNode,
  add: (message: string) => void,
  form: RuntimeForm | undefined,
  sourceFields: Set<string>,
) {
  const targetFields = new Set(form?.actionFields || []);
  for (const action of node.dataActions || []) {
    const field = String(action.field || '').trim();
    if (!field) add('请填写数据动作目标字段');
    else if (!targetFields.has(field))
      add(`数据动作目标字段「${field}」必须存在于当前节点表单且已接入数据存储`);
    else if (action.kind === 'set') {
      try {
        applyWorkflowDataActions({}, [action], action.when, form?.fields || []);
      } catch (error) {
        add(error instanceof Error ? error.message : '数据动作固定值不合法');
      }
    }
    if (action.kind === 'copy') {
      const from = String(action.from || '').trim();
      if (!from) add('请填写数据动作抄贝来源');
      else if (!sourceFields.has(from))
        add(`数据动作来源字段「${from}」必须是流程中真实存在的字段`);
      else if (from === field) add('数据动作来源不能与目标相同');
    }
    if (
      action.when !== 'arrive' &&
      !node.buttons.some(
        (code) => workflowButtonAction(doc, code) === action.when,
      )
    )
      add('数据动作时机对应的按钮未配置');
    if (action.when === 'submit' && node.type !== 'task')
      add('提交时数据动作仅用于填报节点');
    if (action.when === 'pass' && node.type !== 'approve')
      add('通过时数据动作仅用于审批节点');
    if (action.policy === 'firstArrival' && action.when !== 'arrive')
      add('“仅首次到达”策略只能用于到达节点时的数据动作');
  }
}

export function publicationCheck(id: string) {
  const doc = getWorkflow(id);
  const issues = validateWorkflow(doc);
  const frozen = freezeWorkflowForms(doc);
  issues.push(...frozen.issues);
  if (doc.businessTable !== 'XieYi')
    issues.push({ message: '当前办理层支持协议业务，请将业务表设为 XieYi' });
  if (!doc.nodes.some((n) => ['approve', 'task'].includes(n.type)))
    issues.push({ message: '流程至少需要一个人工办理节点' });
  const sourceFields = new Set([
    ...WORKFLOW_FIELD_CATALOG.filter((field) => field.persist !== 'flow').map(
      (field) => field.key,
    ),
    ...Object.values(frozen.forms).flatMap((form) => form.actionFields || []),
  ]);
  const buttonFields = new Set([
    ...WORKFLOW_FIELD_CATALOG.map((field) => field.key),
    ...Object.values(frozen.forms).flatMap((form) =>
      form.fields.map((field) => field.key),
    ),
    'actorId',
    'initiatorId',
    'instanceStatus',
    'nodeCode',
  ]);
  for (const button of doc.buttonCatalog || []) {
    for (const [kind, condition] of [
      ['显示', button.visibleWhen],
      ['启用', button.enabledWhen],
    ] as const) {
      if (!condition?.trim()) continue;
      try {
        evaluateCondition(condition, {}, true, buttonFields);
      } catch (error) {
        issues.push({
          message: `按钮「${button.label}」${kind}条件：${(error as Error).message}`,
        });
      }
    }
  }
  if (doc.status !== 'draft')
    issues.push({ message: '此版本已发布，不能重复发布' });
  const actors = workflowActors();
  if (
    [...(doc.startRoleIds || []), ...(doc.startDeniedRoleIds || [])].some(
      (id) => !roleStore.some((role) => role.id === id && role.status === 1),
    )
  )
    issues.push({ message: '发起权限配置中存在失效角色' });
  if (
    (doc.startRoleIds?.length || doc.startDeniedRoleIds?.length) &&
    !actors.some(
      (actor) =>
        mayStartWorkflow(doc, actor) &&
        (actor.codes.includes('Workflow:Start') ||
          actor.codes.includes('System:Workflow:Manage')),
    )
  )
    issues.push({ message: '允许发起的角色中没有具备流程发起权限的有效用户' });
  for (const node of doc.nodes.filter((n) =>
    ['approve', 'task'].includes(n.type),
  )) {
    const add = (message: string) =>
      issues.push({ nodeId: node.id, message: `${node.name}：${message}` });
    const actions = new Set(
      node.buttons.map((code) => workflowButtonAction(doc, code)),
    );
    if (node.buttons.some((code) => !workflowButtonAction(doc, code)))
      add('节点绑定了未导入或已失效的按钮资源');
    if (!actions.has(node.type === 'task' ? 'submit' : 'pass'))
      add('请配置提交或通过按钮，避免任务无法完成');
    if (actions.has(node.type === 'task' ? 'pass' : 'submit'))
      add('填报节点使用提交，审批节点使用通过，请移除不匹配的按钮');
    if (actions.has('transfer') && !node.allowTransfer)
      add('绑定转办按钮前请开启允许转办');
    if (actions.has('recall') && !node.allowRecall)
      add('绑定撤回按钮前请开启允许撤回');
    if (
      node.type === 'task' &&
      (node.approveMode === 'all' ||
        node.approveMode === 'sequential' ||
        node.approveMode === 'ratio')
    )
      add('会签、依次审批和比例会签仅用于审批节点');
    if (node.transferReturn && !node.allowTransfer)
      add('开启转办转回前请先允许转办');
    if (node.type === 'approve' && node.approveMode === 'ratio') {
      const percent = node.approveRatio;
      if (
        typeof percent !== 'number' ||
        !Number.isInteger(percent) ||
        percent < 1 ||
        percent > 100
      )
        add('比例会签须设置 1 到 100 的整数百分比');
    }
    checkPeople(node, add, actors);
    const roleIds = [
      ...(node.handleRoleIds || []),
      ...(node.handleDeniedRoleIds || []),
      ...Object.values(node.buttonRoleIds || {}).flat(),
      ...Object.values(node.buttonDeniedRoleIds || {}).flat(),
    ];
    if (
      roleIds.some(
        (id) => !roleStore.some((role) => role.id === id && role.status === 1),
      )
    )
      add('办理或按钮限制中存在失效角色');
    if (
      (node.handleRoleIds?.length || node.handleDeniedRoleIds?.length) &&
      !actors.some(
        (actor) =>
          inAssigneeRange(node, actor) &&
          mayHandleWorkflowNode(node, actor) &&
          (actor.codes.includes('Workflow:Use') ||
            actor.codes.includes('System:Workflow:Manage')),
      )
    )
      add('本节点允许办理的角色中没有具备办理权限的有效用户');
    const requiredAction = node.type === 'task' ? 'submit' : 'pass';
    const requiredCodes = node.buttons.filter(
      (code) => workflowButtonAction(doc, code) === requiredAction,
    );
    if (
      requiredCodes.some(
        (code) =>
          node.buttonRoleIds?.[code]?.length ||
          node.buttonDeniedRoleIds?.[code]?.length,
      ) &&
      !requiredCodes.some((code) =>
        actors.some(
          (actor) =>
            inAssigneeRange(node, actor) &&
            mayUseWorkflowButton(node, code, actor) &&
            (actor.codes.includes('Workflow:Use') ||
              actor.codes.includes('System:Workflow:Manage')),
        ),
      )
    )
      add('提交或通过按钮没有可操作的有效用户');
    for (const mode of Object.values(node.fieldAccess || {}))
      if (!['edit', 'hidden', 'readonly'].includes(mode))
        add('字段权限配置不合法');
    if (
      node.sla?.warnHours &&
      node.sla.durationHours &&
      node.sla.warnHours >= node.sla.durationHours
    )
      add('临期提醒应小于办理时限');
    checkDataActions(doc, node, add, frozen.forms[node.id], sourceFields);
  }
  for (const node of doc.nodes.filter((n) => n.type === 'cc')) {
    const add = (message: string) =>
      issues.push({ nodeId: node.id, message: `${node.name}：${message}` });
    if (node.buttons.length > 0) add('抄送节点不产生待办，请不要配置办理按钮');
    if (
      node.approveMode === 'all' ||
      node.approveMode === 'sequential' ||
      node.approveMode === 'ratio'
    )
      add('会签、依次审批和比例会签仅用于审批节点');
    if (node.dataActions?.length) add('抄送节点不支持数据动作');
    checkPeople(node, add, actors);
  }
  for (const node of doc.nodes.filter((n) => n.type === 'subflow')) {
    const add = (message: string) =>
      issues.push({ nodeId: node.id, message: `${node.name}：${message}` });
    const code = (node.subflowCode || '').trim();
    if (!code) continue;
    if (code === doc.code) add('不能调用当前流程自身');
    const published = findPublishedWorkflow(code, doc.base);
    if (!published) add('绑定的子流程未发布或不在同一基地');
    else if (published.businessTable !== 'XieYi')
      add('子流程必须也绑定协议业务表 XieYi');
    if (node.buttons.length > 0)
      add('子流程节点不产生待办，请不要配置办理按钮');
    if (node.dataActions?.length) add('仅填报和审批节点支持数据动作');
  }
  for (const node of doc.nodes.filter((n) => n.type === 'parallel')) {
    const add = (message: string) =>
      issues.push({ nodeId: node.id, message: `${node.name}：${message}` });
    if (node.buttons.length > 0) add('并行网关不产生待办，请不要配置办理按钮');
    if (node.dataActions?.length) add('仅填报和审批节点支持数据动作');
  }
  for (const edge of doc.edges.filter(
    (e) => e.type === 'condition' && !e.isDefault,
  )) {
    try {
      evaluateCondition(edge.condition, {}, true, sourceFields);
    } catch (error) {
      issues.push({
        edgeId: edge.id,
        message: `条件「${edge.label}」：${(error as Error).message}`,
      });
    }
  }
  return {
    issues,
    forms: frozen.forms,
    revision: doc.revision,
    name: doc.name,
    version: doc.version || 1,
    nodeCount: doc.nodes.length,
    formCount: Object.keys(frozen.forms).length,
  };
}
export function publishChecked(id: string, revision: number, username: string) {
  const check = publicationCheck(id);
  if (check.issues.length > 0)
    throw new Error(
      `发布检查未通过：${check.issues.map((i) => i.message).join('；')}`,
    );
  return publishWorkflow(id, revision, check.forms, username);
}

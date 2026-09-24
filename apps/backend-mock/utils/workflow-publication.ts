import type { WorkflowNode } from '../../shared/workflow';
import type { RuntimeActor } from '../../shared/workflow-runtime';

import { validateWorkflow } from '../../shared/workflow';
import { evaluateCondition } from '../../shared/workflow-expression';
import { WORKFLOW_PERSON_FIELDS } from '../../shared/workflow-runtime';
import { findDeptNode, leaderUserIdsOf, MOCK_DEPT_TREE } from './mock-dept';
import { roleStore } from './rbac-store';
import { freezeWorkflowForms } from './workflow-forms';
import { workflowActors } from './workflow-runtime-api';
import {
  findPublishedWorkflow,
  getWorkflow,
  publishWorkflow,
} from './workflow-store';

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
      const inRange =
        node.assignee.type === 'role'
          ? a.roleIds.some((r) => node.assignee.ids.includes(r))
          : node.assignee.type === 'departmentLeader'
            ? leaderUserIdsOf(node.assignee.ids).includes(a.id)
            : node.assignee.ids.includes(a.id);
      return (
        inRange &&
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
  node: WorkflowNode,
  add: (message: string) => void,
  allowedFields: Set<string>,
) {
  for (const action of node.dataActions || []) {
    const field = String(action.field || '').trim();
    if (!field) add('请填写数据动作目标字段');
    else if (!allowedFields.has(field))
      add(`数据动作字段「${field}」必须存在于流程表单中`);
    if (action.kind === 'copy') {
      const from = String(action.from || '').trim();
      if (!from) add('请填写数据动作抄贝来源');
      else if (!allowedFields.has(from))
        add(`数据动作来源字段「${from}」必须存在于流程表单中`);
      else if (from === field) add('数据动作来源不能与目标相同');
    }
    if (action.when !== 'arrive' && !node.buttons.includes(action.when))
      add('数据动作时机对应的按钮未配置');
    if (action.when === 'submit' && node.type !== 'task')
      add('提交时数据动作仅用于填报节点');
    if (action.when === 'pass' && node.type !== 'approve')
      add('通过时数据动作仅用于审批节点');
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
  const allowedFields = new Set(
    Object.values(frozen.forms).flatMap((form) =>
      form.fields.filter((f) => f.type !== 'table').map((f) => f.key),
    ),
  );
  if (doc.status !== 'draft')
    issues.push({ message: '此版本已发布，不能重复发布' });
  const actors = workflowActors();
  for (const node of doc.nodes.filter((n) =>
    ['approve', 'task'].includes(n.type),
  )) {
    const add = (message: string) =>
      issues.push({ nodeId: node.id, message: `${node.name}：${message}` });
    if (!node.buttons.includes(node.type === 'task' ? 'submit' : 'pass'))
      add('请配置提交或通过按钮，避免任务无法完成');
    if (node.buttons.includes(node.type === 'task' ? 'pass' : 'submit'))
      add('填报节点使用提交，审批节点使用通过，请移除不匹配的按钮');
    if (
      node.buttons.some(
        (b) => !['pass', 'recall', 'reject', 'save', 'submit'].includes(b),
      )
    )
      add(
        '当前运行层支持保存、提交、通过、驳回和撤回；请取消尚未接入的自定义操作',
      );
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
    for (const mode of Object.values(node.fieldAccess || {}))
      if (!['edit', 'hidden', 'readonly'].includes(mode))
        add('字段权限配置不合法');
    if (
      node.sla?.warnHours &&
      node.sla.durationHours &&
      node.sla.warnHours >= node.sla.durationHours
    )
      add('临期提醒应小于办理时限');
    checkDataActions(node, add, allowedFields);
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
      evaluateCondition(edge.condition, {}, true, allowedFields);
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

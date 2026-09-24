import type { WorkflowNode, WorkflowRecord } from '../../shared/workflow';
import type {
  RuntimeActor,
  RuntimeField,
  RuntimeForm,
  WorkflowActionInput,
  WorkflowContext,
  WorkflowInstance,
  WorkflowInterveneInput,
  WorkflowNotice,
} from '../../shared/workflow-runtime';

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { newId, ratioPassCount } from '../../shared/workflow';
import { evaluateCondition } from '../../shared/workflow-expression';
import {
  ACTION_LABELS,
  applyWorkflowDataActions,
  BUSINESS_FIELDS,
  computeDueAt,
  hasWorkflowMonitorAccess,
  slaBucket,
  WORKFLOW_PERSON_FIELDS,
} from '../../shared/workflow-runtime';
import { leaderUserIdsOf } from './mock-dept';
import { DATA_DIR } from './mock-persist';
import {
  applyAgreementPatch,
  applyUnlockedFlowFields,
  loadWorkflowAgreement,
  persistWorkflowAgreement,
  projectAgreementToWorkflowData,
  syncAgreementFromWorkflow,
  workflowDataFromAgreement,
} from './workflow-agreement';
import { findPublishedWorkflow, getWorkflow } from './workflow-store';

export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
/** 在途：办理中或挂起，占用同一协议不可再发起 */
function isInFlight(status: WorkflowInstance['status']) {
  return status === 'running' || status === 'suspended';
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const now = () => new Date().toISOString();
interface State {
  instances: WorkflowInstance[];
  starts: {
    actorId: string;
    fingerprint: string;
    instanceId: string;
    requestId: string;
  }[];
  notices: WorkflowNotice[];
}
function read(): State {
  const path = join(DATA_DIR, 'workflow-instances.json');
  if (!existsSync(path)) return { instances: [], starts: [], notices: [] };
  const state = JSON.parse(readFileSync(path, 'utf8')) as State;
  if (!Array.isArray(state.instances) || !Array.isArray(state.starts))
    throw new Error('实例存储格式异常');
  if (!Array.isArray(state.notices)) state.notices = [];
  return state;
}
/** 读库并刷新超时/临期通知 */
function load() {
  const state = read();
  if (refreshSla(state)) write(state);
  return state;
}
function write(state: State) {
  mkdirSync(DATA_DIR, { recursive: true });
  const path = join(DATA_DIR, 'workflow-instances.json');
  writeFileSync(`${path}.tmp`, JSON.stringify(state, null, 2), 'utf8');
  renameSync(`${path}.tmp`, path);
}
function event(
  instance: WorkflowInstance,
  node: WorkflowNode,
  action: string,
  actor: RuntimeActor,
  opinion = '',
  edgeIds: string[] = [],
  targetNodeId?: string,
) {
  instance.events.push({
    id: newId('event'),
    nodeId: node.id,
    nodeName: node.name,
    action,
    actorId: actor.id,
    actorName: actor.name,
    at: now(),
    opinion,
    edgeIds,
    targetNodeId,
  });
}
/** 给指定用户写站内通知 */
function notify(
  state: State,
  userIds: string[],
  type: WorkflowNotice['type'],
  title: string,
  message: string,
  instanceId: string,
) {
  const at = now();
  for (const userId of [...new Set(userIds.filter(Boolean))]) {
    state.notices.unshift({
      id: newId('notice'),
      userId,
      type,
      title,
      message,
      instanceId,
      at,
      read: false,
    });
  }
  if (state.notices.length > 2000) state.notices.length = 2000;
}
const SYSTEM_ACTOR: RuntimeActor = {
  id: 'system',
  name: '系统',
  roleIds: [],
  codes: [],
};
/** 扫描在途待办：临期/超时发通知，超时策略为催办时写催办记录 */
function refreshSla(state: State) {
  let dirty = false;
  const at = Date.now();
  const atIso = new Date(at).toISOString();
  for (const instance of state.instances) {
    if (instance.status !== 'running') continue;
    let definition;
    try {
      definition = getWorkflow(instance.definitionId);
    } catch {
      continue;
    }
    for (const task of instance.tasks.filter((t) => t.status === 'pending')) {
      if (!task.dueAt) continue;
      const node = definition.nodes.find((n) => n.id === task.nodeId);
      const bucket = slaBucket(task.dueAt, node?.sla?.warnHours, at);
      if (bucket === 'overdue' && !task.overdueNotifiedAt) {
        task.overdueNotifiedAt = atIso;
        dirty = true;
        notify(
          state,
          task.assigneeIds,
          'overdue',
          `超时：${instance.title}`,
          `「${node?.name || '当前节点'}」已超过办理时限。`,
          instance.id,
        );
        if (node) {
          event(instance, node, 'overdue', SYSTEM_ACTOR, '已超过办理时限');
          if (node.sla?.overtime === 'urge') {
            event(instance, node, 'urge', SYSTEM_ACTOR, '超时自动催办');
            notify(
              state,
              task.assigneeIds,
              'urge',
              `催办：${instance.title}`,
              `「${node.name}」已超时，请尽快办理。`,
              instance.id,
            );
          }
        }
      } else if (bucket === 'dueSoon' && !task.warnedAt) {
        task.warnedAt = atIso;
        dirty = true;
        notify(
          state,
          task.assigneeIds,
          'dueSoon',
          `临期：${instance.title}`,
          `「${node?.name || '当前节点'}」即将到期，请尽快办理。`,
          instance.id,
        );
      }
    }
  }
  return dirty;
}
/** 生成人工待办并通知办理人 */
function pushHumanTask(
  state: State,
  instance: WorkflowInstance,
  node: WorkflowNode,
  people: RuntimeActor[],
  arrivedAt: string,
  dueAt?: string,
  groupId?: string,
) {
  instance.tasks.push({
    id: newId('task'),
    nodeId: node.id,
    assigneeIds: people.map((a) => a.id),
    assigneeNames: people.map((a) => a.name),
    status: 'pending',
    arrivedAt,
    dueAt: dueAt ?? computeDueAt(arrivedAt, node.sla?.durationHours),
    ...(groupId ? { groupId } : {}),
  });
  notify(
    state,
    people.map((a) => a.id),
    'arrive',
    `待办：${instance.title}`,
    `「${node.name}」已到达，请尽快办理。`,
    instance.id,
  );
}
/**
 * 从协议人员字段拆出用户 ID
 * @param raw 单个 ID、ID 数组，或逗号/顿号分隔的文本
 */
function personIds(raw: unknown) {
  if (Array.isArray(raw))
    return raw.map((value) => String(value).trim()).filter(Boolean);
  const text = String(raw ?? '').trim();
  if (!text) return [];
  return text
    .split(/[,，、]/)
    .map((value) => value.trim())
    .filter(Boolean);
}
/** 人员字段的中文名，未知时退回字段标识 */
function personFieldLabel(key: string) {
  return WORKFLOW_PERSON_FIELDS.find((item) => item.key === key)?.label || key;
}
/** 按节点办理人策略从当前组织用户中解析候选人 */
function assignees(
  node: WorkflowNode,
  instance: WorkflowInstance,
  actors: RuntimeActor[],
) {
  switch (node.assignee.type) {
    // 候选范围是部门 ID，按组织树解析到负责人用户
    case 'departmentLeader': {
      const ids = leaderUserIdsOf(node.assignee.ids);
      return actors.filter((a) => ids.includes(a.id));
    }
    case 'field': {
      const ids = personIds(instance.data[node.assignee.field]);
      return actors.filter((a) => ids.includes(a.id));
    }
    case 'initiator': {
      return actors.filter((a) => a.id === instance.initiatorId);
    }
    case 'role': {
      return actors.filter((a) =>
        a.roleIds.some((id) => node.assignee.ids.includes(id)),
      );
    }
    case 'user': {
      return actors.filter((a) => node.assignee.ids.includes(a.id));
    }
    default: {
      throw new WorkflowError('不支持的办理人策略');
    }
  }
}
/**
 * 具备办理权限的候选人，按配置名单顺序排列（依次审批按此顺序出待办）
 * @param node 当前节点
 * @param instance 实例（字段取人要读 data）
 * @param actors 组织用户
 */
function orderedAssignees(
  node: WorkflowNode,
  instance: WorkflowInstance,
  actors: RuntimeActor[],
) {
  const eligible = assignees(node, instance, actors).filter(
    (a) =>
      a.codes.includes('Workflow:Use') ||
      a.codes.includes('System:Workflow:Manage'),
  );
  const byId = new Map(eligible.map((a) => [a.id, a]));
  let order: string[] | undefined;
  switch (node.assignee.type) {
    case 'departmentLeader': {
      order = leaderUserIdsOf(node.assignee.ids);
      break;
    }
    case 'field': {
      order = personIds(instance.data[node.assignee.field]);
      break;
    }
    case 'user': {
      order = node.assignee.ids.map(String);
      break;
    }
    default: {
      return eligible;
    }
  }
  const seen = new Set<string>();
  const result: RuntimeActor[] = [];
  for (const id of order) {
    const actor = byId.get(id);
    if (actor && !seen.has(actor.id)) {
      seen.add(actor.id);
      result.push(actor);
    }
  }
  for (const actor of eligible) {
    if (!seen.has(actor.id)) result.push(actor);
  }
  return result;
}
/**
 * 执行节点数据动作，失败则整次办理回滚
 * @param instance 当前实例
 * @param node 配置了动作的节点
 * @param when 触发时机
 * @param fields 冻结字段
 * @param written 本轮被写入的字段（回写协议时解锁）
 */
function runDataActions(
  instance: WorkflowInstance,
  node: WorkflowNode,
  when: 'arrive' | 'pass' | 'save' | 'submit',
  fields: RuntimeField[],
  written: Set<string>,
) {
  try {
    const result = applyWorkflowDataActions(
      instance.data,
      node.dataActions,
      when,
      fields,
    );
    instance.data = result.data;
    for (const key of result.written) written.add(key);
  } catch (error) {
    throw new WorkflowError(
      error instanceof Error ? error.message : '数据动作失败',
    );
  }
}
function enter(
  state: State,
  instance: WorkflowInstance,
  definition: WorkflowRecord,
  nodeId: string,
  actor: RuntimeActor,
  actors: RuntimeActor[],
  viaEdgeId?: string,
  written: Set<string> = new Set(),
): { spawnSubflow?: { code: string; nodeId: string } } {
  const queue: { nodeId: string; viaEdgeId?: string }[] = [
    { nodeId, viaEdgeId },
  ];
  let spawnSubflow: undefined | { code: string; nodeId: string };
  const limit = Math.max(16, definition.nodes.length * 4);
  for (let steps = 0; queue.length > 0 && steps <= limit; steps++) {
    const item = queue.shift()!;
    const node = definition.nodes.find((n) => n.id === item.nodeId);
    if (!node) throw new WorkflowError('流转目标节点不存在');
    instance.currentNodeId = node.id;
    if (node.type === 'end') {
      instance.status = 'completed';
      instance.completedAt = now();
      event(instance, node, 'end', actor);
      notify(
        state,
        [instance.initiatorId],
        'complete',
        `已结束：${instance.title}`,
        `流程「${instance.definitionName}」已办理完成。`,
        instance.id,
      );
      continue;
    }
    if (node.type === 'task' || node.type === 'approve') {
      const candidates = orderedAssignees(node, instance, actors);
      if (candidates.length === 0)
        throw new WorkflowError(
          node.assignee.type === 'field'
            ? `节点「${node.name}」按「${personFieldLabel(node.assignee.field)}」没有解析到有效办理人，本次提交未生效`
            : `节点「${node.name}」没有有效办理人，本次提交未生效，请联系管理员调整人员`,
        );
      const fields = definition.frozenForms?.[node.id]?.fields || [];
      for (const f of fields)
        if (instance.data[f.key] === undefined && f.defaultValue !== undefined)
          instance.data[f.key] = clone(f.defaultValue);
      runDataActions(instance, node, 'arrive', fields, written);
      const arrivedAt = now();
      const sequential =
        node.type === 'approve' && node.approveMode === 'sequential';
      const countersign =
        node.type === 'approve' &&
        node.approveMode === 'all' &&
        candidates.length > 1;
      const ratio =
        node.type === 'approve' &&
        node.approveMode === 'ratio' &&
        candidates.length > 1;
      const signGroup =
        sequential || countersign || ratio ? newId('sign') : undefined;
      const groups =
        countersign || ratio
          ? candidates.map((c) => [c])
          : sequential
            ? [[candidates[0]!]]
            : [candidates];
      for (const group of groups)
        pushHumanTask(
          state,
          instance,
          node,
          group,
          arrivedAt,
          undefined,
          signGroup,
        );
      continue;
    }
    // 抄送：记知会任务后沿通过连线继续，不挂起待办
    if (node.type === 'cc') {
      const recipients = assignees(node, instance, actors).filter(
        (a) =>
          a.codes.includes('Workflow:Use') ||
          a.codes.includes('System:Workflow:Manage'),
      );
      if (recipients.length === 0)
        throw new WorkflowError(
          node.assignee.type === 'field'
            ? `节点「${node.name}」按「${personFieldLabel(node.assignee.field)}」没有解析到有效抄送人，本次提交未生效`
            : `节点「${node.name}」没有有效抄送人，本次提交未生效，请联系管理员调整人员`,
        );
      const arrivedAt = now();
      instance.tasks.push({
        id: newId('task'),
        nodeId: node.id,
        assigneeIds: recipients.map((a) => a.id),
        assigneeNames: recipients.map((a) => a.name),
        status: 'copied',
        arrivedAt,
        completedAt: arrivedAt,
      });
      const selected = definition.edges.find(
        (e) => e.source === node.id && e.type === 'pass',
      );
      if (!selected)
        throw new WorkflowError(`节点「${node.name}」无可用流出路径`);
      event(
        instance,
        node,
        'cc',
        actor,
        `已抄送：${recipients.map((a) => a.name).join('、')}`,
        [selected.id],
        selected.target,
      );
      notify(
        state,
        recipients.map((a) => a.id),
        'cc',
        `抄送：${instance.title}`,
        `「${node.name}」已抄送给你，可在抄送给我中查看。`,
        instance.id,
      );
      queue.push({ nodeId: selected.target, viaEdgeId: selected.id });
      continue;
    }
    if (node.type === 'subflow') {
      const code = (node.subflowCode || '').trim();
      if (!code) throw new WorkflowError(`节点「${node.name}」未绑定子流程`);
      spawnSubflow = { code, nodeId: node.id };
      event(instance, node, 'subflow', actor, `等待子流程 ${code}`);
      continue;
    }
    if (node.type === 'parallel') {
      const incoming = definition.edges.filter(
        (e) => e.target === node.id && e.type !== 'reject',
      );
      const outgoing = definition.edges.filter(
        (e) => e.source === node.id && e.type !== 'reject',
      );
      if (outgoing.length >= 2) {
        event(
          instance,
          node,
          'split',
          actor,
          '',
          outgoing.map((e) => e.id),
        );
        for (const edge of outgoing)
          queue.push({ nodeId: edge.target, viaEdgeId: edge.id });
        continue;
      }
      if (incoming.length >= 2) {
        const arrivals = instance.joinArrivals || {};
        const got = new Set(arrivals[node.id] || []);
        if (item.viaEdgeId) got.add(item.viaEdgeId);
        arrivals[node.id] = [...got];
        instance.joinArrivals = arrivals;
        if (got.size < incoming.length) {
          event(
            instance,
            node,
            'joinWait',
            actor,
            '',
            item.viaEdgeId ? [item.viaEdgeId] : [],
          );
          continue;
        }
        delete arrivals[node.id];
        const selected = outgoing[0];
        if (!selected)
          throw new WorkflowError(`节点「${node.name}」无可用流出路径`);
        event(
          instance,
          node,
          'join',
          actor,
          '',
          [selected.id],
          selected.target,
        );
        queue.push({ nodeId: selected.target, viaEdgeId: selected.id });
        continue;
      }
      throw new WorkflowError(`节点「${node.name}」并行网关配置无效`);
    }
    const outgoing = definition.edges.filter(
      (e) => e.source === node.id && e.type !== 'reject',
    );
    let selected;
    if (node.type === 'condition') {
      const matches = outgoing.filter(
        (e) => !e.isDefault && evaluateCondition(e.condition, instance.data),
      );
      if (matches.length > 1)
        throw new WorkflowError(
          `节点「${node.name}」同时命中多个条件，无法确定路径`,
        );
      selected = matches[0] || outgoing.find((e) => e.isDefault);
    } else selected = outgoing[0];
    if (!selected)
      throw new WorkflowError(`节点「${node.name}」无可用流出路径`);
    event(
      instance,
      node,
      node.type === 'start' ? 'start' : 'route',
      actor,
      '',
      [selected.id],
      selected.target,
    );
    queue.push({ nodeId: selected.target, viaEdgeId: selected.id });
  }
  if (queue.length > 0) throw new WorkflowError('自动流转超过节点数量限制');
  const pending = instance.tasks.find((t) => t.status === 'pending');
  if (pending) instance.currentNodeId = pending.nodeId;
  return { spawnSubflow };
}

/**
 * 父实例链深度，防止子流程互相调用形成过深嵌套
 * @param state 实例存储
 * @param instance 当前实例
 */
function subflowDepth(state: State, instance: WorkflowInstance) {
  let depth = 0;
  let id = instance.parentInstanceId;
  while (id) {
    depth += 1;
    if (depth > 8) return depth;
    id = state.instances.find((item) => item.id === id)?.parentInstanceId;
  }
  return depth;
}

/**
 * 拉起子流程实例；子流程结束则恢复父流程
 * @param state 实例存储
 * @param parent 父实例
 * @param spawn 子流程编码与父节点
 * @param actor 触发人
 * @param actors 候选人全集
 */
function spawnSubflowInstance(
  state: State,
  parent: WorkflowInstance,
  spawn: { code: string; nodeId: string },
  actor: RuntimeActor,
  actors: RuntimeActor[],
) {
  if (subflowDepth(state, parent) >= 5)
    throw new WorkflowError('子流程嵌套不能超过 5 层');
  const parentDef = getWorkflow(parent.definitionId);
  const childDef = findPublishedWorkflow(spawn.code, parentDef.base);
  if (!childDef)
    throw new WorkflowError(
      `子流程「${spawn.code}」未发布或不在同一基地，本次提交未生效`,
    );
  if (
    (childDef.familyId || childDef.id) === (parentDef.familyId || parentDef.id)
  )
    throw new WorkflowError('子流程不能调用自身');
  if (
    state.instances.some(
      (i) =>
        isInFlight(i.status) &&
        i.familyId === (childDef.familyId || childDef.id) &&
        (i.bizId || i.businessNo) === (parent.bizId || parent.businessNo),
    )
  )
    throw new WorkflowError('该协议在此子流程中已有在途实例');
  const first = childDef.nodes.find((n) => n.type === 'start');
  if (!first) throw new WorkflowError('子流程缺少开始节点');
  const subNode = parentDef.nodes.find((n) => n.id === spawn.nodeId);
  const child: WorkflowInstance = {
    id: newId('instance'),
    definitionId: childDef.id,
    familyId: childDef.familyId || childDef.id,
    definitionName: childDef.name,
    version: childDef.version || 1,
    businessNo: parent.bizId || parent.businessNo,
    title: `${parent.title} · ${subNode?.name || '子流程'}`,
    base: childDef.base,
    bizTable: childDef.businessTable || parent.bizTable,
    bizId: parent.bizId,
    initiatorId: parent.initiatorId,
    initiatorName: parent.initiatorName,
    status: 'running',
    currentNodeId: first.id,
    revision: 1,
    createdAt: now(),
    data: clone(parent.data),
    tasks: [],
    events: [],
    returnStack: [],
    requests: [],
    parentInstanceId: parent.id,
    parentNodeId: spawn.nodeId,
  };
  const spawned = enter(state, child, childDef, first.id, actor, actors);
  state.instances.push(child);
  if (spawned.spawnSubflow)
    spawnSubflowInstance(state, child, spawned.spawnSubflow, actor, actors);
  if (child.status === 'completed') resumeParent(state, child, actor, actors);
}

/**
 * 子流程结束后沿父节点通过连线继续
 * @param state 实例存储
 * @param child 已结束的子实例
 * @param actor 触发人
 * @param actors 候选人全集
 */
function resumeParent(
  state: State,
  child: WorkflowInstance,
  actor: RuntimeActor,
  actors: RuntimeActor[],
) {
  if (!child.parentInstanceId || !child.parentNodeId) return;
  const parent = state.instances.find((i) => i.id === child.parentInstanceId);
  if (!parent || parent.status !== 'running') return;
  const definition = getWorkflow(parent.definitionId);
  const node = definition.nodes.find((n) => n.id === child.parentNodeId);
  const edge = definition.edges.find(
    (e) => e.source === child.parentNodeId && e.type === 'pass',
  );
  if (!node || !edge) throw new WorkflowError('父流程缺少子流程返回路径');
  parent.data = clone(child.data);
  event(
    parent,
    node,
    'subflowDone',
    actor,
    `子流程 ${child.definitionName} 已结束`,
    [edge.id],
    edge.target,
  );
  const next = enter(
    state,
    parent,
    definition,
    edge.target,
    actor,
    actors,
    edge.id,
  );
  parent.revision++;
  if (next.spawnSubflow)
    spawnSubflowInstance(state, parent, next.spawnSubflow, actor, actors);
  if (parent.status === 'completed') resumeParent(state, parent, actor, actors);
}

/**
 * 流转后续：若命中子流程则拉起子实例
 * @param state 实例存储
 * @param instance 当前实例
 * @param result enter 返回值
 * @param actor 触发人
 * @param actors 候选人全集
 */
function afterEnter(
  state: State,
  instance: WorkflowInstance,
  result: { spawnSubflow?: { code: string; nodeId: string } },
  actor: RuntimeActor,
  actors: RuntimeActor[],
) {
  if (result.spawnSubflow)
    spawnSubflowInstance(state, instance, result.spawnSubflow, actor, actors);
  if (instance.status === 'completed')
    resumeParent(state, instance, actor, actors);
}
function mayRead(instance: WorkflowInstance, actor: RuntimeActor) {
  return (
    hasWorkflowMonitorAccess(actor.codes) ||
    instance.initiatorId === actor.id ||
    instance.tasks.some(
      (t) => t.assigneeIds.includes(actor.id) || t.completedBy === actor.id,
    )
  );
}
function findInstance(state: State, id: string, actor: RuntimeActor) {
  const instance = state.instances.find((i) => i.id === id);
  if (!instance || !mayRead(instance, actor))
    throw new WorkflowError('无权访问该流程实例或实例不存在', 403);
  return instance;
}
function matches(codes: string[], required?: string[]) {
  return (
    !required?.length ||
    codes.includes('Agree:*') ||
    required.some(
      (r) =>
        codes.includes(r) ||
        (r.startsWith('Agree:Field:') && codes.includes('Agree:Field:*')),
    )
  );
}
/** 给人员字段补上当前可办理用户，供办理页下拉选择 */
function withPersonOptions(field: RuntimeField, actors: RuntimeActor[]) {
  if (!WORKFLOW_PERSON_FIELDS.some((item) => item.key === field.key))
    return field;
  return {
    ...field,
    type: 'select' as const,
    options: actors
      .filter(
        (person) =>
          person.codes.includes('Workflow:Use') ||
          person.codes.includes('System:Workflow:Manage'),
      )
      .map((person) => ({ label: person.name, value: person.id })),
  };
}
export function effectiveForm(
  definition: WorkflowRecord,
  node: WorkflowNode,
  actor: RuntimeActor,
  canAct: boolean,
  actors: RuntimeActor[] = [],
): RuntimeForm {
  const source = definition.frozenForms?.[node.id];
  if (!source) return { title: '协议资料', fields: [] };
  function fieldAccess(field: RuntimeField): RuntimeField {
    const mode = node.fieldAccess?.[field.key];
    const { defaultValue: _default, ...metadata } = clone(field);
    return {
      ...metadata,
      hidden:
        field.hidden ||
        mode === 'hidden' ||
        !matches(actor.codes, field.visibleCodes) ||
        field.visibleCodeGroups?.some(
          (group) => !matches(actor.codes, group),
        ) === true,
      readonly:
        field.readonly ||
        !canAct ||
        (node.type === 'approve' && mode !== 'edit') ||
        mode === 'readonly' ||
        !matches(actor.codes, field.editableCodes) ||
        field.editableCodeGroups?.some(
          (group) => !matches(actor.codes, group),
        ) === true,
      children: field.children?.map(fieldAccess),
    };
  }
  return {
    title: source.title,
    fields: source.fields
      .map(fieldAccess)
      .filter((f) => !f.hidden)
      .map((field) => withPersonOptions(field, actors)),
  };
}
function visibleValue(field: RuntimeField, value: unknown): unknown {
  if (field.type !== 'table' || !Array.isArray(value)) return value;
  return value.map((row) =>
    Object.fromEntries(
      (field.children || [])
        .filter((f) => !f.hidden)
        .map((f) => [f.key, visibleValue(f, row?.[f.key])]),
    ),
  );
}
function targets(
  instance: WorkflowInstance,
  definition: WorkflowRecord,
  node: WorkflowNode,
) {
  const past = instance.tasks
    .filter((t) => t.status !== 'pending')
    .map((t) => t.nodeId);
  let edges = definition.edges.filter(
    (e) =>
      e.source === node.id && e.type === 'reject' && past.includes(e.target),
  );
  if (node.rejectMode === 'previous') {
    const previous = [...past].toReversed().find((id) => id !== node.id);
    edges = edges.filter((e) => e.target === previous);
  } else if (node.rejectMode === 'initiator') {
    edges = edges.filter((e) => e.target === past[0]);
  }
  return edges.map((e) => ({
    id: e.target,
    name: definition.nodes.find((n) => n.id === e.target)!.name,
  }));
}
/** 审批会签：全部候选人各持一笔待办，须全部通过 */
function isAllSign(node: WorkflowNode) {
  return node.type === 'approve' && node.approveMode === 'all';
}
/** 依次审批：按名单顺序一人办完才轮到下一人 */
function isSequential(node: WorkflowNode) {
  return node.type === 'approve' && node.approveMode === 'sequential';
}
/** 比例会签：每人一笔待办，通过人数达到百分比即流转 */
function isRatio(node: WorkflowNode) {
  return node.type === 'approve' && node.approveMode === 'ratio';
}
/** 已通过且不是转办转回的办结，才计入会签或依次票数 */
function isVote(task: { handoff?: boolean; status: string; }) {
  return task.status === 'completed' && !task.handoff;
}
/** 比例会签席位：当前待办和已通过的票；转办作废、转回办结不占人数 */
function isRatioSeat(task: { handoff?: boolean; status: string; }) {
  return task.status === 'pending' || isVote(task);
}
/**
 * 本轮比例会签任务
 * @param instance 流程实例
 * @param nodeId 审批节点
 * @param groupId 同一轮分组；单人时按到达时间取本轮
 */
function ratioPeers(
  instance: WorkflowInstance,
  nodeId: string,
  groupId?: string,
) {
  if (groupId)
    return instance.tasks.filter(
      (t) => t.nodeId === nodeId && t.groupId === groupId,
    );
  return roundTasks(instance, nodeId);
}
/**
 * 当前节点这一轮会签任务（按到达时间取最新一轮）
 * @param instance 流程实例
 * @param nodeId 节点
 */
function roundTasks(instance: WorkflowInstance, nodeId: string) {
  const ofNode = instance.tasks.filter((t) => t.nodeId === nodeId);
  if (ofNode.length === 0) return [];
  const arrivedAt = ofNode.reduce(
    (latest, t) => (t.arrivedAt > latest ? t.arrivedAt : latest),
    ofNode[0]!.arrivedAt,
  );
  return ofNode.filter((t) => t.arrivedAt === arrivedAt);
}
/**
 * 上一环节办理人是否可撤回：该节点开启撤回，且下一节点尚未办理（含未保存）
 * @param instance 流程实例
 * @param actor 当前用户
 * @param definition 已发布定义
 */
function recallState(
  instance: WorkflowInstance,
  actor: RuntimeActor,
  definition: WorkflowRecord,
) {
  if (instance.status !== 'running') return undefined;
  const completed = [...instance.tasks]
    .toReversed()
    .find((t) => t.completedBy === actor.id && t.status === 'completed');
  if (!completed || completed.nodeId === instance.currentNodeId)
    return undefined;
  const source = definition.nodes.find((n) => n.id === completed.nodeId);
  if (!source?.allowRecall) return undefined;
  const later = instance.tasks.slice(instance.tasks.indexOf(completed) + 1);
  const pending = later.filter((t) => t.status === 'pending');
  const doneLater = later.some(
    (t) => t.status === 'completed' || t.status === 'rejected',
  );
  const eventIndex = instance.events.findLastIndex(
    (e) =>
      e.nodeId === completed.nodeId &&
      e.actorId === actor.id &&
      ['pass', 'submit'].includes(e.action),
  );
  const after = instance.events
    .slice(eventIndex + 1)
    .some((e) =>
      [
        'pass',
        'recall',
        'reject',
        'save',
        'submit',
        'transfer',
        'transferReturn',
      ].includes(e.action),
    );
  const enabled = pending.length > 0 && !doneLater && !after;
  const pass = definition.edges.find(
    (e) => e.source === source.id && e.type === 'pass',
  );
  const next = definition.nodes.find((n) => n.id === pass?.target);
  const pendingNodes = new Set(pending.map((t) => t.nodeId));
  let allowed = enabled;
  if (enabled && next?.type === 'parallel') {
    const outgoing = definition.edges.filter(
      (e) => e.source === next.id && e.type !== 'reject',
    );
    const incoming = definition.edges.filter(
      (e) => e.target === next.id && e.type !== 'reject',
    );
    if (outgoing.length >= 2) allowed = true;
    else if (incoming.length >= 2) allowed = false;
  } else if (enabled && pendingNodes.size > 1) allowed = false;
  return {
    targetNodeId: source.id,
    targetNodeName: source.name,
    enabled: allowed,
    reason: allowed ? undefined : '下一节点已办理或已保存，不能撤回',
  };
}
function buildContext(
  instance: WorkflowInstance,
  actor: RuntimeActor,
  actors: RuntimeActor[] = [],
): WorkflowContext {
  const definition = getWorkflow(instance.definitionId);
  const pendingForActor = instance.tasks.find(
    (t) => t.status === 'pending' && t.assigneeIds.includes(actor.id),
  );
  const anyPending = instance.tasks.find((t) => t.status === 'pending');
  const task = pendingForActor || anyPending;
  const viewId =
    pendingForActor?.nodeId ||
    (instance.status === 'running' ? anyPending?.nodeId : undefined) ||
    instance.currentNodeId;
  const node = definition.nodes.find((n) => n.id === viewId)!;
  const canAct = !!pendingForActor && instance.status === 'running';
  // 已结束实例回看最近一次办理/审批节点的冻结表单，跳过抄送知会
  const lastHandled = [...instance.tasks]
    .toReversed()
    .find((t) => t.status === 'completed' || t.status === 'rejected');
  const viewNode =
    node.type === 'end'
      ? definition.nodes.find((n) => n.id === lastHandled?.nodeId) || node
      : node;
  const form = effectiveForm(definition, viewNode, actor, canAct, actors);
  let agreement: Record<string, unknown> | undefined;
  if (instance.bizId) {
    try {
      agreement = loadWorkflowAgreement(instance.bizId) as unknown as Record<
        string,
        unknown
      >;
    } catch {
      agreement = undefined;
    }
  }
  const flowFields =
    agreement &&
    typeof agreement.flowFields === 'object' &&
    agreement.flowFields &&
    !Array.isArray(agreement.flowFields)
      ? (agreement.flowFields as Record<string, unknown>)
      : {};
  const basicRemark =
    agreement &&
    typeof agreement.basic === 'object' &&
    agreement.basic &&
    !Array.isArray(agreement.basic)
      ? (agreement.basic as { remark?: unknown }).remark
      : undefined;
  // 当前表单字段优先用实例 data，缺省时回填协议 flowFields / 备注
  const data = Object.fromEntries(
    form.fields.map((f) => {
      let value = instance.data[f.key];
      if (
        value === undefined &&
        f.key === 'remark' &&
        basicRemark !== undefined
      )
        value = basicRemark;
      if (value === undefined && flowFields[f.key] !== undefined)
        value = flowFields[f.key];
      return [f.key, visibleValue(f, value)];
    }),
  );
  const {
    requests: _requests,
    returnStack: _returnStack,
    ...safe
  } = clone(instance);
  const safeDefinition = clone(definition);
  delete safeDefinition.frozenForms;
  const rejectTargets = canAct ? targets(instance, definition, node) : [];
  const recall = recallState(instance, actor, definition);
  const round = roundTasks(instance, instance.currentNodeId);
  const sequentialOrdered = isSequential(viewNode)
    ? orderedAssignees(viewNode, instance, actors)
    : [];
  const sequentialGroup = instance.tasks.find(
    (t) => t.nodeId === viewNode.id && t.status === 'pending' && t.groupId,
  )?.groupId;
  const sequentialRound = sequentialGroup
    ? instance.tasks.filter(
        (t) => t.nodeId === viewNode.id && t.groupId === sequentialGroup,
      )
    : [];
  const ratioRound = isRatio(viewNode)
    ? ratioPeers(
        instance,
        viewNode.id,
        instance.tasks.find(
          (t) =>
            t.nodeId === viewNode.id && t.status === 'pending' && t.groupId,
        )?.groupId,
      )
    : [];
  const ratioSeats = ratioRound.filter((t) => isRatioSeat(t));
  const countersign =
    isAllSign(viewNode) && round.length > 1
      ? {
          passed: round.filter((t) => isVote(t)).length,
          total: round.length,
          pendingNames: round
            .filter((t) => t.status === 'pending')
            .flatMap((t) => t.assigneeNames),
          mode: 'all' as const,
        }
      : isSequential(viewNode) && sequentialOrdered.length > 1
        ? {
            passed: sequentialRound.filter((t) => isVote(t)).length,
            total: sequentialOrdered.length,
            pendingNames: sequentialRound
              .filter((t) => t.status === 'pending')
              .flatMap((t) => t.assigneeNames),
            mode: 'sequential' as const,
          }
        : isRatio(viewNode) && ratioSeats.length > 1
          ? {
              passed: ratioSeats.filter((t) => isVote(t)).length,
              total: ratioSeats.length,
              pendingNames: ratioSeats
                .filter((t) => t.status === 'pending')
                .flatMap((t) => t.assigneeNames),
              mode: 'ratio' as const,
              required: ratioPassCount(
                ratioSeats.length,
                viewNode.approveRatio ?? 50,
              ),
              percent: viewNode.approveRatio ?? 50,
            }
          : undefined;
  const actButtons = canAct
    ? node.buttons
        .filter((code) => ['pass', 'reject', 'save', 'submit'].includes(code))
        .map((code) => ({
          code,
          label: ACTION_LABELS[code]!,
          enabled: code !== 'reject' || rejectTargets.length > 0,
          reason:
            code === 'reject' && rejectTargets.length === 0
              ? '没有符合配置且已办理的驳回目标'
              : undefined,
        }))
    : [];
  const transferCandidates =
    canAct && node.allowTransfer
      ? actors.filter(
          (a) =>
            a.id !== actor.id &&
            (a.codes.includes('Workflow:Use') ||
              a.codes.includes('System:Workflow:Manage')) &&
            !instance.tasks.some(
              (t) =>
                t.status === 'pending' &&
                t.nodeId === node.id &&
                t.assigneeIds.includes(a.id),
            ),
        )
      : [];
  const transferButton =
    canAct && node.allowTransfer
      ? [
          {
            code: 'transfer',
            label: ACTION_LABELS.transfer,
            enabled: transferCandidates.length > 0,
            reason:
              transferCandidates.length > 0 ? undefined : '没有可转办的办理人',
          },
        ]
      : [];
  const recallButton = recall
    ? [
        {
          code: 'recall',
          label: `撤回至${recall.targetNodeName}`,
          enabled: recall.enabled && !!task,
          reason: recall.reason,
        },
      ]
    : [];
  return {
    instance: { ...safe, data },
    definition: safeDefinition,
    form,
    task,
    canAct,
    rejectTargets,
    agreement,
    agreementEditable: canAct && viewNode.type === 'task',
    countersign,
    transferWillReturn: !!(
      canAct &&
      node.allowTransfer &&
      node.transferReturn &&
      !task?.returnToUserId
    ),
    transferReturnName:
      canAct && task?.returnToUserId
        ? actors.find((a) => a.id === task.returnToUserId)?.name || '原办理人'
        : undefined,
    transferCandidates: transferCandidates.map((a) => ({
      id: a.id,
      name: a.name,
    })),
    buttons: [...actButtons, ...transferButton, ...recallButton],
    canIntervene:
      hasWorkflowMonitorAccess(actor.codes) &&
      (instance.status === 'running' || instance.status === 'suspended'),
    interveneCandidates: hasWorkflowMonitorAccess(actor.codes)
      ? actors
          .filter(
            (a) =>
              a.codes.includes('Workflow:Use') ||
              a.codes.includes('System:Workflow:Manage'),
          )
          .map((a) => ({ id: a.id, name: a.name }))
      : [],
    interveneTasks: instance.tasks
      .filter((t) => t.status === 'pending')
      .map((t) => ({
        id: t.id,
        nodeName:
          definition.nodes.find((n) => n.id === t.nodeId)?.name || t.nodeId,
        assigneeIds: t.assigneeIds,
        assigneeNames: t.assigneeNames,
      })),
    sla: (() => {
      const dueAt = pendingForActor?.dueAt;
      if (!dueAt || instance.status !== 'running') return undefined;
      const status = slaBucket(dueAt, viewNode.sla?.warnHours);
      if (status === 'none') return undefined;
      return {
        dueAt,
        remainMs: Date.parse(dueAt) - Date.now(),
        status,
      };
    })(),
  };
}
export function workflowContext(
  id: string,
  actor: RuntimeActor,
  actors: RuntimeActor[] = [],
) {
  return buildContext(findInstance(load(), id, actor), actor, actors);
}

/**
 * 当前用户的流程站内通知
 * @param actor 当前用户
 */
export function listNotices(actor: RuntimeActor) {
  return load()
    .notices.filter((n) => n.userId === actor.id)
    .slice(0, 50);
}

/**
 * 标记通知已读
 * @param actor 当前用户
 * @param id 指定一条；缺省则全部已读
 */
export function markNoticesRead(actor: RuntimeActor, id?: string) {
  const state = load();
  for (const notice of state.notices) {
    if (notice.userId !== actor.id) continue;
    if (id && notice.id !== id) continue;
    notice.read = true;
  }
  write(state);
  return state.notices.filter((n) => n.userId === actor.id).slice(0, 50);
}

/** 是否具备办理权限（换人目标必须能进待办） */
function canHandleWorkflow(actor: RuntimeActor) {
  return (
    actor.codes.includes('Workflow:Use') ||
    actor.codes.includes('System:Workflow:Manage')
  );
}

/**
 * 监控干预：换人、挂起、激活、终止、催办。需监控权限，全程写入审批记录。
 * @param id 实例 ID
 * @param input 干预动作与幂等标识
 * @param actor 当前管理员
 * @param actors 全量办理人，用于换人校验
 */
export function interveneInstance(
  id: string,
  input: WorkflowInterveneInput,
  actor: RuntimeActor,
  actors: RuntimeActor[],
) {
  if (!hasWorkflowMonitorAccess(actor.codes))
    throw new WorkflowError('无流程监控权限', 403);
  const state = load();
  const instance = findInstance(state, id, actor);
  if (!input || !input.requestId || input.requestId.length > 100)
    throw new WorkflowError('缺少有效请求标识');
  const fingerprint = JSON.stringify(input);
  const previous = instance.requests.find(
    (r) => r.id === input.requestId && r.actorId === actor.id,
  );
  if (previous) {
    if (previous.fingerprint !== fingerprint)
      throw new WorkflowError('请求标识已使用', 409);
    return buildContext(instance, actor, actors);
  }
  if (instance.status === 'completed' || instance.status === 'terminated')
    throw new WorkflowError('已结束的实例不能干预', 403);
  const definition = getWorkflow(instance.definitionId);
  const pending = instance.tasks.filter((t) => t.status === 'pending');
  const viewNode =
    definition.nodes.find((n) => n.id === pending[0]?.nodeId) ||
    definition.nodes.find((n) => n.id === instance.currentNodeId)!;
  const note = (input.opinion || '').trim();
  if (note.length > 2000) throw new WorkflowError('意见最多 2000 字');
  const at = now();
  if (input.action === 'suspend') {
    if (instance.status !== 'running')
      throw new WorkflowError('只有办理中的实例可以挂起');
    instance.status = 'suspended';
    const pausedAt = Date.parse(at);
    for (const task of pending) {
      if (task.dueAt) {
        task.dueRemainMs = Math.max(0, Date.parse(task.dueAt) - pausedAt);
      }
    }
    event(instance, viewNode, 'suspend', actor, note);
  } else if (input.action === 'resume') {
    if (instance.status !== 'suspended')
      throw new WorkflowError('只有已挂起的实例可以激活');
    instance.status = 'running';
    const resumed = Date.parse(at);
    for (const task of pending) {
      if (task.dueRemainMs != null) {
        task.dueAt = new Date(resumed + task.dueRemainMs).toISOString();
        task.dueRemainMs = undefined;
      }
    }
    event(instance, viewNode, 'resume', actor, note);
  } else if (input.action === 'terminate') {
    if (!note) throw new WorkflowError('终止必须填写原因');
    for (const task of pending) {
      task.status = 'cancelled';
      task.completedAt = at;
    }
    instance.status = 'terminated';
    instance.completedAt = at;
    event(instance, viewNode, 'terminate', actor, note);
    notify(
      state,
      [instance.initiatorId],
      'terminate',
      `已终止：${instance.title}`,
      `原因：${note}`,
      instance.id,
    );
  } else if (input.action === 'urge') {
    if (instance.status !== 'running')
      throw new WorkflowError('已挂起的实例请先激活再催办');
    if (pending.length === 0) throw new WorkflowError('当前没有待办可催办');
    event(
      instance,
      viewNode,
      'urge',
      actor,
      note ||
        `请尽快办理：${pending.flatMap((t) => t.assigneeNames).join('、')}`,
    );
    notify(
      state,
      pending.flatMap((t) => t.assigneeIds),
      'urge',
      `催办：${instance.title}`,
      note || `请尽快办理「${viewNode.name}」。`,
      instance.id,
    );
  } else if (input.action === 'reassign') {
    if (instance.status !== 'running')
      throw new WorkflowError('已挂起的实例请先激活再换人');
    const task =
      pending.find((t) => t.id === input.taskId) ||
      (pending.length === 1 ? pending[0] : undefined);
    if (!task) throw new WorkflowError('请选择要改派的待办');
    const targetId = String(input.targetUserId || '').trim();
    if (!targetId) throw new WorkflowError('请选择换人对象');
    if (task.assigneeIds.includes(targetId))
      throw new WorkflowError('对方已是该待办办理人');
    const recipient = actors.find((a) => a.id === targetId);
    if (!recipient || !canHandleWorkflow(recipient))
      throw new WorkflowError('换人对象没有流程办理权限或已失效');
    if (
      instance.tasks.some(
        (t) =>
          t.status === 'pending' &&
          t.nodeId === task.nodeId &&
          t.assigneeIds.includes(recipient.id),
      )
    )
      throw new WorkflowError('对方已有本节点待办');
    const from = task.assigneeNames.join('、');
    const dueAt = task.dueAt;
    task.status = 'cancelled';
    task.completedAt = at;
    const node = definition.nodes.find((n) => n.id === task.nodeId) || viewNode;
    pushHumanTask(state, instance, node, [recipient], at, dueAt, task.groupId);
    event(
      instance,
      node,
      'reassign',
      actor,
      note
        ? `换人：${from} → ${recipient.name}。${note}`
        : `换人：${from} → ${recipient.name}`,
    );
  } else throw new WorkflowError('不支持的干预操作');
  instance.revision++;
  instance.requests.push({
    id: input.requestId,
    actorId: actor.id,
    fingerprint,
  });
  write(state);
  return buildContext(instance, actor, actors);
}

/**
 * 把实例压成列表行（办理页与监控页共用）
 * @param instance 流程实例
 */
function toInstanceRow(instance: WorkflowInstance) {
  const pending = instance.tasks.filter((t) => t.status === 'pending');
  return {
    id: instance.id,
    definitionName: instance.definitionName,
    version: instance.version,
    businessNo: instance.businessNo,
    title: instance.title,
    base: instance.base,
    bizId: instance.bizId || instance.businessNo,
    initiatorName: instance.initiatorName,
    status: instance.status,
    createdAt: instance.createdAt,
    currentNodeName:
      pending.length > 0
        ? [
            ...new Set(
              pending.map(
                (t) =>
                  getWorkflow(instance.definitionId).nodes.find(
                    (n) => n.id === t.nodeId,
                  )?.name || '',
              ),
            ),
          ]
            .filter(Boolean)
            .join('、')
        : getWorkflow(instance.definitionId).nodes.find(
            (n) => n.id === instance.currentNodeId,
          )?.name,
    taskArrivedAt: pending[0]?.arrivedAt,
    pendingAssigneeNames: [...new Set(pending.flatMap((t) => t.assigneeNames))],
    urged: pending.some((t) =>
      instance.events.some((e) => e.action === 'urge' && e.at >= t.arrivedAt),
    ),
    dueAt: pending
      .map((t) => t.dueAt)
      .filter(Boolean)
      .toSorted()[0],
    slaStatus: (() => {
      const dueAt = pending
        .map((t) => t.dueAt)
        .filter(Boolean)
        .toSorted()[0];
      const node = getWorkflow(instance.definitionId).nodes.find(
        (n) => n.id === pending[0]?.nodeId,
      );
      const bucket = slaBucket(dueAt, node?.sla?.warnHours);
      return bucket === 'none' ? undefined : bucket;
    })(),
  };
}

/**
 * 查询实例列表：todo/done/started/cc 按本人范围；monitor 为全量（需监控权限）
 * @param actor 当前用户
 * @param tab todo | done | started | cc | monitor
 */
export function listInstances(actor: RuntimeActor, tab: string) {
  const state = load();
  if (tab === 'monitor') {
    if (!hasWorkflowMonitorAccess(actor.codes))
      throw new WorkflowError('无流程监控权限', 403);
    return state.instances
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toInstanceRow);
  }
  return state.instances
    .filter((i) => mayRead(i, actor))
    .filter((i) =>
      tab === 'started'
        ? i.initiatorId === actor.id && !i.parentInstanceId
        : tab === 'done'
          ? i.tasks.some((t) => t.completedBy === actor.id)
          : tab === 'cc'
            ? i.tasks.some(
                (t) =>
                  t.status === 'copied' && t.assigneeIds.includes(actor.id),
              )
            : i.status === 'running' &&
              i.tasks.some(
                (t) =>
                  t.status === 'pending' && t.assigneeIds.includes(actor.id),
              ),
    )
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toInstanceRow);
}
/** 解析发起入参中的协议编号（兼容旧字段 businessNo） */
function startAgreementNo(input: {
  agreementNo?: unknown;
  businessNo?: unknown;
}) {
  const raw =
    typeof input.agreementNo === 'string' && input.agreementNo.trim()
      ? input.agreementNo
      : input.businessNo;
  try {
    return workflowDataFromAgreement(String(raw || '')).agreementNo;
  } catch (error) {
    throw new WorkflowError(
      error instanceof Error ? error.message : '请选择要办理的协议',
    );
  }
}
export function startInstance(
  input: {
    agreementNo?: string;
    businessNo?: string;
    data?: Record<string, unknown>;
    definitionId: string;
    requestId: string;
    title?: string;
  },
  actor: RuntimeActor,
  actors: RuntimeActor[],
) {
  const state = load();
  const fingerprint = JSON.stringify(input);
  const previous = state.starts.find(
    (s) => s.actorId === actor.id && s.requestId === input.requestId,
  );
  if (!input.requestId || input.requestId.length > 100)
    throw new WorkflowError('缺少有效请求标识');
  if (previous) {
    if (previous.fingerprint !== fingerprint)
      throw new WorkflowError('请求标识重复但内容不同', 409);
    return buildContext(
      findInstance(state, previous.instanceId, actor),
      actor,
      actors,
    );
  }
  const definition = getWorkflow(input.definitionId);
  if (definition.status !== 'published')
    throw new WorkflowError('该版本未发布或已停用，不可新发起');
  let data: Record<string, unknown>;
  let agreementNo: string;
  try {
    agreementNo = startAgreementNo(input);
    data = workflowDataFromAgreement(agreementNo);
  } catch (error) {
    throw new WorkflowError(
      error instanceof Error ? error.message : '请选择要办理的协议',
    );
  }
  const title = (
    input.title || `${String(data.compensatee || '')}协议审核`
  ).trim();
  if (!title || title.length > 100)
    throw new WorkflowError('流程标题必填且最多 100 字');
  if (
    state.instances.some(
      (i) =>
        (i.bizId || i.businessNo) === agreementNo &&
        i.familyId === (definition.familyId || definition.id) &&
        isInFlight(i.status),
    )
  )
    throw new WorkflowError('该协议在此流程中已有在途实例');
  const first = definition.nodes.find((n) => n.type === 'start');
  if (!first) throw new WorkflowError('流程缺少开始节点');
  const instance: WorkflowInstance = {
    id: newId('instance'),
    definitionId: definition.id,
    familyId: definition.familyId || definition.id,
    definitionName: definition.name,
    version: definition.version || 1,
    businessNo: agreementNo,
    title,
    base: definition.base,
    bizTable: definition.businessTable || 'XieYi',
    bizId: agreementNo,
    initiatorId: actor.id,
    initiatorName: actor.name,
    status: 'running',
    currentNodeId: first.id,
    revision: 1,
    createdAt: now(),
    data,
    tasks: [],
    events: [],
    returnStack: [],
    requests: [],
  };
  for (const field of BUSINESS_FIELDS)
    validateValue(field, instance.data[field.key], true);
  const entered = enter(state, instance, definition, first.id, actor, actors);
  state.instances.push(instance);
  afterEnter(state, instance, entered, actor, actors);
  state.starts.push({
    actorId: actor.id,
    requestId: input.requestId,
    fingerprint,
    instanceId: instance.id,
  });
  write(state);
  return buildContext(instance, actor, actors);
}
function validateValue(field: RuntimeField, value: unknown, required: boolean) {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (typeof value === 'string' && !value.trim())
  ) {
    if (required && field.required)
      throw new WorkflowError(`请填写「${field.label}」`);
    return;
  }
  if (
    field.type === 'number' &&
    (typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (field.min !== undefined && value < field.min) ||
      (field.max !== undefined && value > field.max))
  )
    throw new WorkflowError(`「${field.label}」数值不合法`);
  if (
    ['date', 'text', 'textarea'].includes(field.type) &&
    (typeof value !== 'string' ||
      value.length > (field.maxLength ?? 5000) ||
      value.length < (field.minLength ?? 0))
  )
    throw new WorkflowError(`「${field.label}」格式或长度不合法`);
  if (field.type === 'date' && typeof value === 'string') {
    const pattern =
      field.dateMode === 'datetime'
        ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
        : /^\d{4}-\d{2}-\d{2}$/;
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (
      !pattern.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value.slice(0, 10)
    )
      throw new WorkflowError(`「${field.label}」日期格式不正确`);
  }
  if (field.type === 'boolean' && typeof value !== 'boolean')
    throw new WorkflowError(`「${field.label}」必须为布尔值`);
  if (field.type === 'select' && !field.options?.some((o) => o.value === value))
    throw new WorkflowError(`「${field.label}」不是允许的选项`);
  if (field.type === 'table') {
    if (
      !Array.isArray(value) ||
      value.length > Math.min(200, field.maxItems ?? 200) ||
      (required && value.length < (field.minItems ?? (field.required ? 1 : 0)))
    )
      throw new WorkflowError(`「${field.label}」明细格式或行数不正确`);
    for (const row of value) {
      if (
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        Object.keys(row).some((k) => !field.children?.some((f) => f.key === k))
      )
        throw new WorkflowError(`「${field.label}」明细包含未授权字段`);
      for (const child of field.children || [])
        validateValue(child, row[child.key], required && !child.hidden);
    }
  }
}
function mergeData(
  instance: WorkflowInstance,
  form: RuntimeForm,
  input: Record<string, unknown>,
  required: boolean,
) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new WorkflowError('表单数据格式不正确');
  for (const [key, value] of Object.entries(input)) {
    const field = form.fields.find((f) => f.key === key);
    if (
      !field ||
      field.hidden ||
      (field.readonly && !same(value, instance.data[key]))
    )
      throw new WorkflowError(`字段「${key}」不可修改`, 403);
    if (field.readonly) continue;
    if (
      field.type === 'table' &&
      field.children?.some((c) => c.readonly || c.hidden) &&
      !same(value, instance.data[key])
    )
      throw new WorkflowError(
        `表格「${field.label}」含受保护列，当前禁止整体修改`,
        403,
      );
    validateValue(field, value, required);
    instance.data[key] = value;
  }
  if (required)
    for (const field of form.fields.filter((f) => !f.hidden && !f.readonly))
      validateValue(field, instance.data[field.key], true);
}
export function actOnInstance(
  id: string,
  input: WorkflowActionInput,
  actor: RuntimeActor,
  actors: RuntimeActor[],
) {
  const state = load();
  const instance = findInstance(state, id, actor);
  if (!input || !input.requestId || input.requestId.length > 100)
    throw new WorkflowError('缺少有效请求标识');
  const fingerprint = JSON.stringify(input);
  const previous = instance.requests.find(
    (r) => r.id === input.requestId && r.actorId === actor.id,
  );
  if (previous) {
    if (previous.fingerprint !== fingerprint)
      throw new WorkflowError('请求标识已使用', 409);
    return buildContext(instance, actor, actors);
  }
  const task = instance.tasks.find(
    (t) => t.id === input.taskId && t.status === 'pending',
  );
  if (
    !task ||
    instance.status !== 'running' ||
    instance.revision !== input.revision
  )
    throw new WorkflowError(
      '任务已被其他用户处理或数据已更新，请刷新后重试',
      409,
    );
  const definition = getWorkflow(instance.definitionId);
  const node = definition.nodes.find((n) => n.id === task.nodeId)!;
  if (input.action === 'recall') {
    const recall = recallState(instance, actor, definition);
    if (!recall) throw new WorkflowError('当前不能撤回', 403);
    if (!recall.enabled) throw new WorkflowError(recall.reason || '不能撤回');
    const cancelledAt = now();
    for (const pending of instance.tasks.filter(
      (t) => t.status === 'pending',
    )) {
      pending.status = 'cancelled';
      pending.completedAt = cancelledAt;
    }
    instance.joinArrivals = {};
    const source = definition.nodes.find((n) => n.id === recall.targetNodeId)!;
    event(
      instance,
      source,
      'recall',
      actor,
      (input.opinion || '').trim(),
      [],
      recall.targetNodeId,
    );
    afterEnter(
      state,
      instance,
      enter(state, instance, definition, recall.targetNodeId, actor, actors),
      actor,
      actors,
    );
    instance.revision++;
    instance.requests.push({
      id: input.requestId,
      actorId: actor.id,
      fingerprint,
    });
    write(state);
    return buildContext(instance, actor, actors);
  }
  if (!task.assigneeIds.includes(actor.id))
    throw new WorkflowError('您不是该任务的办理人', 403);
  // 转办：取消当前待办并给目标人新建同节点待办，不推进节点、不回写协议
  if (input.action === 'transfer') {
    if (!node.allowTransfer) throw new WorkflowError('当前节点不允许转办', 403);
    const targetId = String(input.targetUserId || '').trim();
    if (!targetId) throw new WorkflowError('请选择转办人');
    if (targetId === actor.id) throw new WorkflowError('不能转办给自己');
    const recipient = actors.find(
      (a) =>
        a.id === targetId &&
        (a.codes.includes('Workflow:Use') ||
          a.codes.includes('System:Workflow:Manage')),
    );
    if (!recipient) throw new WorkflowError('转办对象没有流程办理权限或已失效');
    if (
      instance.tasks.some(
        (t) =>
          t.status === 'pending' &&
          t.nodeId === node.id &&
          t.assigneeIds.includes(recipient.id),
      )
    )
      throw new WorkflowError('对方已有本节点待办');
    const note = (input.opinion || '').trim();
    if (note.length > 2000) throw new WorkflowError('意见最多 2000 字');
    // 节点要求转回时记下原办理人；再次转办仍回到最初的转办人。转回对象本人时清掉标记，避免他再提交一次才离开
    const chained =
      task.returnToUserId || (node.transferReturn ? actor.id : undefined);
    const returnToUserId =
      chained && chained !== recipient.id ? chained : undefined;
    const returnName = returnToUserId
      ? actors.find((a) => a.id === returnToUserId)?.name || '原办理人'
      : '';
    const transferredAt = now();
    const dueAt = task.dueAt;
    task.status = 'cancelled';
    task.completedAt = transferredAt;
    task.completedBy = actor.id;
    pushHumanTask(
      state,
      instance,
      node,
      [recipient],
      transferredAt,
      dueAt,
      task.groupId,
    );
    const created = instance.tasks.at(-1);
    if (created && returnToUserId) created.returnToUserId = returnToUserId;
    const handed = note
      ? `转办给：${recipient.name}。${note}`
      : `转办给：${recipient.name}`;
    event(
      instance,
      node,
      'transfer',
      actor,
      returnToUserId ? `${handed}。办完后转回${returnName}审核` : handed,
    );
    instance.revision++;
    instance.requests.push({
      id: input.requestId,
      actorId: actor.id,
      fingerprint,
    });
    write(state);
    return buildContext(instance, actor, actors);
  }
  if (
    !['pass', 'reject', 'save', 'submit'].includes(input.action) ||
    !node.buttons.includes(input.action)
  )
    throw new WorkflowError('当前节点不允许此操作', 403);
  if (
    (input.action === 'submit' && node.type !== 'task') ||
    (input.action === 'pass' && node.type !== 'approve')
  )
    throw new WorkflowError('操作与节点类型不匹配');
  const opinion = (input.opinion || '').trim();
  if (opinion.length > 2000) throw new WorkflowError('意见最多 2000 字');
  if (input.action === 'reject' && !opinion)
    throw new WorkflowError('驳回意见不能为空');
  const form = effectiveForm(definition, node, actor, true, actors);
  let nextAgreement: ReturnType<typeof loadWorkflowAgreement> | undefined;
  if (instance.bizId && input.agreement) {
    try {
      const current = loadWorkflowAgreement(instance.bizId);
      nextAgreement = applyAgreementPatch(current, input.agreement, {
        canAct: true,
        nodeType: node.type,
        fieldAccess: node.fieldAccess,
      });
      instance.data = {
        ...instance.data,
        ...projectAgreementToWorkflowData(nextAgreement),
      };
    } catch (error) {
      throw new WorkflowError(
        error instanceof Error ? error.message : '协议资料不合法',
      );
    }
  }
  mergeData(
    instance,
    form,
    input.data || {},
    ['pass', 'submit'].includes(input.action),
  );
  const written = new Set<string>();
  const frozenFields = definition.frozenForms?.[node.id]?.fields || form.fields;
  if (input.action === 'save')
    runDataActions(instance, node, 'save', frozenFields, written);
  let heldForCountersign = false;
  let sequentialNext: RuntimeActor | undefined;
  /** 对方办结后待办回到的原办理人；有值时本节点不离开 */
  let handBackOwner: RuntimeActor | undefined;
  if (input.action === 'save') event(instance, node, 'save', actor, opinion);
  else {
    if (
      (input.action === 'submit' || input.action === 'pass') &&
      task.returnToUserId &&
      task.returnToUserId !== actor.id
    ) {
      const owner = actors.find(
        (a) =>
          a.id === task.returnToUserId &&
          (a.codes.includes('Workflow:Use') ||
            a.codes.includes('System:Workflow:Manage')),
      );
      if (!owner) throw new WorkflowError('原办理人已失效，无法转回');
      if (
        instance.tasks.some(
          (t) =>
            t.status === 'pending' &&
            t.id !== task.id &&
            t.nodeId === node.id &&
            t.assigneeIds.includes(owner.id),
        )
      )
        throw new WorkflowError('原办理人已有本节点待办');
      handBackOwner = owner;
    }
    let target: string | undefined;
    let edgeIds: string[] = [];
    if (!handBackOwner && input.action === 'pass' && isSequential(node)) {
      const ordered = orderedAssignees(node, instance, actors);
      const groupId = task.groupId;
      const completed = instance.tasks.filter(
        (t) =>
          t.nodeId === node.id &&
          isVote(t) &&
          (!groupId || t.groupId === groupId),
      ).length;
      if (completed + 1 < ordered.length)
        sequentialNext = ordered[completed + 1];
    }
    if (handBackOwner) {
      // 转回原办理人，不沿通过连线离开本节点
    } else if (input.action === 'reject') {
      if (
        !targets(instance, definition, node).some(
          (t) => t.id === input.targetNodeId,
        )
      )
        throw new WorkflowError('驳回目标不在允许且已办理的范围内');
      target = input.targetNodeId!;
      edgeIds = definition.edges
        .filter(
          (e) =>
            e.type === 'reject' && e.source === node.id && e.target === target,
        )
        .map((e) => e.id);
      instance.returnStack =
        node.resubmitMode === 'return'
          ? [
              ...instance.returnStack.filter((r) => r.targetNodeId !== target),
              { targetNodeId: target, returnNodeId: node.id },
            ]
          : [];
      const cancelledAt = now();
      for (const other of instance.tasks.filter(
        (t) => t.status === 'pending' && t.id !== task.id,
      )) {
        other.status = 'cancelled';
        other.completedAt = cancelledAt;
      }
      instance.joinArrivals = {};
    } else if (
      input.action === 'pass' &&
      isAllSign(node) &&
      instance.tasks.some(
        (t) =>
          t.status === 'pending' && t.id !== task.id && t.nodeId === node.id,
      )
    ) {
      heldForCountersign = true;
    } else if (sequentialNext) {
      heldForCountersign = true;
    } else if (input.action === 'pass' && isRatio(node)) {
      const peers = ratioPeers(instance, node.id, task.groupId);
      const seats = peers.filter((t) => isRatioSeat(t));
      const passed = seats.filter((t) => isVote(t)).length + 1;
      const required = ratioPassCount(seats.length, node.approveRatio ?? 50);
      if (passed < required) heldForCountersign = true;
      else {
        const cancelledAt = now();
        for (const other of peers) {
          if (other.status === 'pending' && other.id !== task.id) {
            other.status = 'cancelled';
            other.completedAt = cancelledAt;
          }
        }
        const pendingReturn = instance.returnStack.at(-1);
        if (pendingReturn?.targetNodeId === node.id) {
          target = pendingReturn.returnNodeId;
          instance.returnStack.pop();
        } else {
          const edge = definition.edges.find(
            (e) => e.source === node.id && e.type === 'pass',
          );
          if (!edge) throw new WorkflowError('缺少通过路径');
          target = edge.target;
          edgeIds = [edge.id];
        }
      }
    } else {
      const pendingReturn = instance.returnStack.at(-1);
      if (pendingReturn?.targetNodeId === node.id) {
        target = pendingReturn.returnNodeId;
        instance.returnStack.pop();
      } else {
        const edge = definition.edges.find(
          (e) => e.source === node.id && e.type === 'pass',
        );
        if (!edge) throw new WorkflowError('缺少通过路径');
        target = edge.target;
        edgeIds = [edge.id];
      }
    }
    task.status = input.action === 'reject' ? 'rejected' : 'completed';
    task.completedAt = now();
    task.completedBy = actor.id;
    if (handBackOwner) task.handoff = true;
    if (handBackOwner) {
      event(
        instance,
        node,
        'transferReturn',
        actor,
        opinion
          ? `已办结，转回${handBackOwner.name}审核。${opinion}`
          : `已办结，转回${handBackOwner.name}审核`,
      );
    } else {
      event(instance, node, input.action, actor, opinion, edgeIds, target);
    }
    if (input.action === 'reject') {
      notify(
        state,
        [instance.initiatorId],
        'reject',
        `已驳回：${instance.title}`,
        opinion || `「${node.name}」已驳回。`,
        instance.id,
      );
    }
    if (handBackOwner) {
      pushHumanTask(
        state,
        instance,
        node,
        [handBackOwner],
        task.arrivedAt,
        task.dueAt,
        task.groupId,
      );
    } else if (!heldForCountersign) {
      if (input.action === 'submit' || input.action === 'pass')
        runDataActions(instance, node, input.action, frozenFields, written);
      if (!target) throw new WorkflowError('缺少通过路径');
      afterEnter(
        state,
        instance,
        enter(
          state,
          instance,
          definition,
          target,
          actor,
          actors,
          edgeIds[0],
          written,
        ),
        actor,
        actors,
      );
    } else if (sequentialNext) {
      pushHumanTask(
        state,
        instance,
        node,
        [sequentialNext],
        now(),
        undefined,
        task.groupId,
      );
    }
  }
  instance.revision++;
  instance.requests.push({
    id: input.requestId,
    actorId: actor.id,
    fingerprint,
  });
  // 流转成功或转回原办理人后再回写协议；撤回、会签未齐票不改协议
  if (instance.bizId && (handBackOwner || !heldForCountersign)) {
    try {
      let detail = nextAgreement;
      if (!detail) {
        syncAgreementFromWorkflow(instance.bizId, instance.data);
        detail = loadWorkflowAgreement(instance.bizId);
      }
      persistWorkflowAgreement(
        applyUnlockedFlowFields(detail, instance.data, {
          nodeType: node.type,
          fieldAccess: node.fieldAccess,
          unlockKeys: [...written],
        }),
      );
    } catch (error) {
      throw new WorkflowError(
        error instanceof Error ? error.message : '回写协议失败',
      );
    }
  }
  write(state);
  return buildContext(instance, actor, actors);
}

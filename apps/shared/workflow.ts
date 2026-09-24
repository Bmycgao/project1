/** Workflow design contract shared by the editor, publication API and runtime. */
import { WORKFLOW_FIELD_CATALOG } from './workflow-runtime';

export type NodeType =
  | 'approve'
  | 'cc'
  | 'condition'
  | 'end'
  | 'parallel'
  | 'start'
  | 'subflow'
  | 'task';
export type AssigneeType =
  | 'departmentLeader'
  | 'field'
  | 'initiator'
  | 'role'
  | 'user';
export interface WorkflowNode {
  id: string;
  code: string;
  name: string;
  type: NodeType;
  x: number;
  y: number;
  description: string;
  assignee: { field: string; ids: string[]; type: AssigneeType; };
  form: { id: string; type: 'form' | 'page'; };
  buttons: string[];
  rejectMode: 'initiator' | 'previous' | 'specified';
  resubmitMode: 'restart' | 'return';
  allowRecall: boolean;
  /** 当前办理人是否可以把待办转给其他人 */
  allowTransfer?: boolean;
  /** 转办后对方提交或通过时，待办回到转办人，由转办人再办理；驳回仍按驳回路径退回 */
  transferReturn?: boolean;
  /**
   * 审批办理方式：any 任一人通过即可；all 会签全部通过才流转；
   * sequential 按办理人名单顺序依次审批；ratio 达到百分比即流转。
   * 填报节点忽略该字段。
   */
  approveMode?: 'all' | 'any' | 'ratio' | 'sequential';
  /** 比例会签通过百分比，1–100；仅 approveMode 为 ratio 时生效 */
  approveRatio?: number;
  /** Optional per-field restrictions. Roles and template restrictions can only narrow these. */
  fieldAccess?: Record<string, 'edit' | 'hidden' | 'readonly'>;
  /** 子流程节点绑定的已发布流程编码（同基地） */
  subflowCode?: string;
  /** 办理时限与超时提醒（自然日折算为小时） */
  sla?: {
    /** 办理时限小时数，0 或不配表示不限 */
    durationHours?: number;
    /** 超时策略：仅提醒 / 催办（写催办记录并通知）；不开放自动通过 */
    overtime?: 'remind' | 'urge';
    /** 临期提前小时数 */
    warnHours?: number;
  };
  /** 到达或点按钮时给字段赋值 / 抄字段（不含公式） */
  dataActions?: WorkflowDataAction[];
}
export const DATA_ACTION_WHENS = ['arrive', 'save', 'submit', 'pass'] as const;
export const DATA_ACTION_KINDS = ['set', 'copy'] as const;
export type WorkflowDataActionWhen = (typeof DATA_ACTION_WHENS)[number];
export type WorkflowDataActionKind = (typeof DATA_ACTION_KINDS)[number];
export interface WorkflowDataAction {
  when: WorkflowDataActionWhen;
  kind: WorkflowDataActionKind;
  /** 写入的目标字段 */
  field: string;
  /** kind=set 时的字面量 */
  value?: string;
  /** kind=copy 时的来源字段 */
  from?: string;
}
export const DATA_ACTION_WHEN_LABELS: Record<WorkflowDataActionWhen, string> = {
  arrive: '到达节点',
  save: '保存时',
  submit: '提交时',
  pass: '通过时',
};
export const DATA_ACTION_KIND_LABELS: Record<WorkflowDataActionKind, string> = {
  set: '赋固定值',
  copy: '抄已有字段',
};
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type: 'condition' | 'pass' | 'reject';
  label: string;
  condition: string;
  isDefault: boolean;
}
export interface WorkflowDocument {
  schemaVersion: 1;
  code: string;
  name: string;
  category: string;
  base: string;
  businessTable: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport: { x: number; y: number; zoom: number };
}
export interface WorkflowRecord extends WorkflowDocument {
  id: string;
  status: 'disabled' | 'draft' | 'published';
  familyId?: string;
  version?: number;
  publishedAt?: string;
  publishedBy?: string;
  frozenForms?: Record<string, import('./workflow-runtime').RuntimeForm>;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  /** 保存或发布时记下的按钮、时限、数据动作、字段权限变更，只读，不参与流转 */
  changeLog?: WorkflowChangeEntry[];
}
/** 一次保存或发布产生的配置变更 */
export interface WorkflowChangeEntry {
  /** ISO 时间 */
  at: string;
  /** 操作人账号 */
  by: string;
  /** save 保存草稿；publish 发布 */
  action: 'publish' | 'save';
  lines: string[];
}
export interface WorkflowIssue {
  message: string;
  nodeId?: string;
  edgeId?: string;
}
export interface WorkflowOptions {
  roles: { id: string; name: string }[];
  users: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  views: { id: string; name: string; type: 'form' | 'page' }[];
  /** 可供子流程节点绑定的已发布流程 */
  workflows?: { code: string; id: string; name: string }[];
}
export const NODE_LABELS: Record<NodeType, string> = {
  start: '开始',
  task: '填报 / 办理',
  approve: '审批',
  cc: '抄送',
  parallel: '并行网关',
  subflow: '子流程',
  condition: '条件分支',
  end: '结束',
};
export const CATEGORIES = ['协议', '摸底', '交房', '结算', '付款', '其他'];
export const STANDARD_BUTTONS = [
  { code: 'save', label: '保存草稿' },
  { code: 'submit', label: '提交' },
  { code: 'pass', label: '通过' },
  { code: 'reject', label: '驳回' },
  { code: 'recall', label: '撤回' },
];
export function newId(prefix: string) {
  // getRandomValues also works on intranet HTTP pages, where randomUUID may be unavailable.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `${prefix}_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}
export function createNode(
  type: NodeType,
  x: number,
  y: number,
  sequence: number,
): WorkflowNode {
  return {
    id: newId('node'),
    code: `N_${sequence}`,
    name: NODE_LABELS[type],
    type,
    x,
    y,
    description: '',
    assignee: {
      type: type === 'task' ? 'initiator' : 'role',
      ids: [],
      field: '',
    },
    form: { type: 'page', id: '' },
    buttons:
      type === 'task'
        ? ['save', 'submit']
        : type === 'approve'
          ? ['pass', 'reject']
          : [],
    rejectMode: 'previous',
    resubmitMode: 'return',
    allowRecall: false,
    allowTransfer: false,
    approveMode: 'any',
  };
}
export function createDocument(): WorkflowDocument {
  return {
    schemaVersion: 1,
    code: '',
    name: '',
    category: '协议',
    base: '',
    businessTable: 'XieYi',
    description: '',
    nodes: [],
    edges: [],
    viewport: { x: 60, y: 100, zoom: 1 },
  };
}
/** Business validation allows unfinished drafts, but prevents treating them as valid designs. */
export function validateWorkflow(doc: WorkflowDocument): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  if (!doc.name.trim()) issues.push({ message: '请填写流程名称' });
  if (!/^[A-Za-z][\w-]*$/.test(doc.code))
    issues.push({
      message: '流程编码须以字母开头，仅含字母、数字、下划线或短横线',
    });
  if (!doc.base.trim()) issues.push({ message: '请填写所属基地编码' });
  if (!doc.businessTable.trim()) issues.push({ message: '请填写绑定业务表' });
  const starts = doc.nodes.filter((n) => n.type === 'start');
  const ends = doc.nodes.filter((n) => n.type === 'end');
  if (starts.length !== 1)
    issues.push({
      message: '流程必须有且只有一个开始节点',
      nodeId: starts[1]?.id,
    });
  if (ends.length === 0) issues.push({ message: '流程至少需要一个结束节点' });
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  const normal = doc.edges.filter(
    (e) => e.type !== 'reject' && nodes.has(e.source) && nodes.has(e.target),
  );
  const reachable = (from: string, reverse = false) => {
    const seen = new Set<string>();
    const queue = [from];
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const edge of normal) {
        if ((reverse ? edge.target : edge.source) === id)
          queue.push(reverse ? edge.source : edge.target);
      }
    }
    return seen;
  };
  const fromStart = starts[0] ? reachable(starts[0].id) : new Set<string>();
  const toEnd = new Set(ends.flatMap((n) => [...reachable(n.id, true)]));
  const codes = new Set<string>();
  for (const node of doc.nodes) {
    const add = (message: string) =>
      issues.push({
        message: `${node.name || '未命名节点'}：${message}`,
        nodeId: node.id,
      });
    if (!node.name.trim()) add('请填写名称');
    if (!/^[A-Za-z][\w-]*$/.test(node.code) || codes.has(node.code))
      add('节点编码须合法且在流程内唯一');
    codes.add(node.code);
    if (!fromStart.has(node.id)) add('无法从开始节点到达');
    if (!toEnd.has(node.id)) add('没有可到达结束节点的正向路径');
    const incoming = doc.edges.filter((e) => e.target === node.id);
    const outgoing = doc.edges.filter((e) => e.source === node.id);
    if (node.type === 'start' && incoming.length > 0)
      add('开始节点不能有流入连线，请驳回到填报节点');
    if (node.type === 'end' && outgoing.length > 0)
      add('结束节点不能有流出连线');
    if (node.type === 'task' || node.type === 'approve' || node.type === 'cc') {
      const person = node.type === 'cc' ? '抄送人' : '办理人';
      if (
        ['departmentLeader', 'role', 'user'].includes(node.assignee.type) &&
        node.assignee.ids.length === 0
      )
        add(`尚未配置${person}`);
      if (node.assignee.type === 'field' && !node.assignee.field.trim())
        add(`请填写${person}字段`);
      if (!outgoing.some((e) => e.type === 'pass')) add('至少需要一条通过连线');
      if (
        node.type !== 'cc' &&
        node.buttons.includes('reject') &&
        !outgoing.some((e) => e.type === 'reject')
      )
        add('已配置驳回按钮，请绘制允许的驳回连线');
    }
    if (node.type === 'parallel') {
      const passIn = incoming.filter((e) => e.type !== 'reject');
      const passOut = outgoing.filter((e) => e.type !== 'reject');
      if (outgoing.some((e) => e.type === 'reject'))
        add('并行网关不能引出驳回，请从分支上的办理节点驳回');
      if (
        passOut.some((e) => e.type !== 'pass') ||
        passIn.some((e) => e.type !== 'pass')
      )
        add('并行网关连线必须是通过类型');
      if (passOut.length >= 2 && passIn.length >= 2)
        add('同一并行网关不能同时分叉又汇聚，请拆成两个网关');
      else if (passOut.length >= 2) {
        if (passIn.length !== 1) add('分叉网关需要恰好一条流入');
      } else if (passIn.length >= 2) {
        if (passOut.length !== 1) add('汇聚网关需要恰好一条通过连线');
      } else add('并行网关需至少两个分叉出口或两个汇入');
    }
    if (node.type === 'subflow') {
      if (!(node.subflowCode || '').trim()) add('请选择要调用的子流程');
      if (!outgoing.some((e) => e.type === 'pass')) add('至少需要一条通过连线');
    }
    if (node.type === 'condition') {
      if (outgoing.length < 2) add('条件节点至少需要两个分支');
      if (outgoing.some((e) => e.type !== 'condition'))
        add('流出连线必须是条件分支');
      if (outgoing.filter((e) => e.isDefault).length !== 1)
        add('必须配置且仅配置一条“否则”兜底分支');
      const expressions = new Set<string>();
      for (const edge of outgoing.filter((e) => !e.isDefault)) {
        const expression = edge.condition.trim();
        if (!expression)
          issues.push({
            message: `${node.name}：分支缺少条件表达式`,
            edgeId: edge.id,
          });
        else if (expressions.has(expression))
          issues.push({
            message: `${node.name}：分支条件重复`,
            edgeId: edge.id,
          });
        expressions.add(expression);
      }
    } else if (
      node.type !== 'parallel' &&
      outgoing.filter((e) => e.type !== 'reject').length > 1
    )
      add('多个正向出口请通过条件节点或并行网关分流');
  }
  for (const edge of doc.edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    const add = (message: string) =>
      issues.push({
        message: `连线「${edge.label || '未命名'}」：${message}`,
        edgeId: edge.id,
      });
    if (!source || !target) {
      add('存在悬空端点');
      continue;
    }
    if (edge.source === edge.target) add('不能连接节点自身');
    if (edge.type === 'reject') {
      if (
        !['approve', 'task'].includes(source.type) ||
        !['approve', 'task'].includes(target.type)
      )
        add('驳回只能连接办理或审批节点');
      if (!reachable(target.id).has(source.id) || source.id === target.id)
        add('只能退回正向路径上的上游节点');
    } else if (edge.type === 'condition' && source.type !== 'condition')
      add('条件连线必须从条件节点出发');
    if (edge.isDefault && edge.type !== 'condition')
      add('只有条件分支可以设为兜底');
  }
  // Kahn's algorithm excludes rejection edges: backward business routes are intentional.
  const indegrees = new Map(
    doc.nodes.map((n) => [
      n.id,
      normal.filter((e) => e.target === n.id).length,
    ]),
  );
  const queue = doc.nodes.filter((n) => !indegrees.get(n.id)).map((n) => n.id);
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const edge of normal.filter((e) => e.source === id)) {
      const count = indegrees.get(edge.target)! - 1;
      indegrees.set(edge.target, count);
      if (!count) queue.push(edge.target);
    }
  }
  for (const [nodeId, count] of indegrees)
    if (count)
      issues.push({
        message: '正向路径存在环路或受环路阻塞，请检查连线',
        nodeId,
      });
  return issues;
}
/** 校验节点时限配置形态 */
function isSla(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const sla = value as {
    durationHours?: unknown;
    overtime?: unknown;
    warnHours?: unknown;
  };
  const hours = (v: unknown) =>
    v === undefined ||
    (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 8760);
  return (
    hours(sla.durationHours) &&
    hours(sla.warnHours) &&
    (sla.overtime === undefined ||
      sla.overtime === 'remind' ||
      sla.overtime === 'urge')
  );
}
/** 校验数据动作数组形态，未配置视为合法 */
function isDataActions(value: unknown) {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 20) return false;
  return value.every((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const action = item as WorkflowDataAction;
    return (
      DATA_ACTION_WHENS.includes(action.when) &&
      DATA_ACTION_KINDS.includes(action.kind) &&
      typeof action.field === 'string' &&
      action.field.length <= 100 &&
      (action.value === undefined ||
        (typeof action.value === 'string' && action.value.length <= 2000)) &&
      (action.from === undefined ||
        (typeof action.from === 'string' && action.from.length <= 100))
    );
  });
}
/** Shape validation is stricter than business validation; malformed payloads never enter the store. */
export function isWorkflowDocument(input: unknown): input is WorkflowDocument {
  if (!input || typeof input !== 'object') return false;
  const d = input as WorkflowDocument;
  const str = (v: unknown) => typeof v === 'string' && v.length <= 5000;
  const ids = (v: unknown): v is string[] =>
    Array.isArray(v) && v.length <= 500 && v.every(str);
  if (
    d.schemaVersion !== 1 ||
    ![d.code, d.name, d.category, d.base, d.businessTable, d.description].every(
      str,
    )
  )
    return false;
  if (
    !d.viewport ||
    ![d.viewport.x, d.viewport.y, d.viewport.zoom].every(Number.isFinite) ||
    d.viewport.zoom < 0.25 ||
    d.viewport.zoom > 2
  )
    return false;
  if (
    !Array.isArray(d.nodes) ||
    !Array.isArray(d.edges) ||
    d.nodes.length > 200 ||
    d.edges.length > 600
  )
    return false;
  if (
    !d.nodes.every(
      (n) =>
        n &&
        [n.id, n.code, n.name, n.description].every(str) &&
        n.id &&
        Object.hasOwn(NODE_LABELS, n.type) &&
        [n.x, n.y].every(Number.isFinite) &&
        n.assignee &&
        ['departmentLeader', 'field', 'initiator', 'role', 'user'].includes(
          n.assignee.type,
        ) &&
        ids(n.assignee.ids) &&
        str(n.assignee.field) &&
        n.form &&
        ['form', 'page'].includes(n.form.type) &&
        str(n.form.id) &&
        ids(n.buttons) &&
        ['initiator', 'previous', 'specified'].includes(n.rejectMode) &&
        ['restart', 'return'].includes(n.resubmitMode) &&
        typeof n.allowRecall === 'boolean' &&
        (n.allowTransfer === undefined ||
          typeof n.allowTransfer === 'boolean') &&
        (n.transferReturn === undefined ||
          typeof n.transferReturn === 'boolean') &&
        (n.approveMode === undefined ||
          n.approveMode === 'any' ||
          n.approveMode === 'all' ||
          n.approveMode === 'sequential' ||
          n.approveMode === 'ratio') &&
        (n.approveRatio === undefined ||
          (Number.isInteger(n.approveRatio) &&
            n.approveRatio >= 1 &&
            n.approveRatio <= 100)) &&
        (n.subflowCode === undefined || str(n.subflowCode)) &&
        (n.sla === undefined || isSla(n.sla)) &&
        isDataActions(n.dataActions) &&
        (n.fieldAccess === undefined ||
          (!!n.fieldAccess &&
            typeof n.fieldAccess === 'object' &&
            !Array.isArray(n.fieldAccess) &&
            Object.entries(n.fieldAccess).every(
              ([key, mode]) =>
                /^[A-Za-z_][\w.]*$/.test(key) &&
                !key
                  .split('.')
                  .some((p) =>
                    ['__proto__', 'constructor', 'prototype'].includes(p),
                  ) &&
                ['edit', 'hidden', 'readonly'].includes(mode),
            ))),
    )
  )
    return false;
  if (
    !d.edges.every(
      (e) =>
        e &&
        [e.id, e.source, e.target, e.label, e.condition].every(str) &&
        e.id &&
        ['condition', 'pass', 'reject'].includes(e.type) &&
        typeof e.isDefault === 'boolean',
    )
  )
    return false;
  return (
    new Set(d.nodes.map((n) => n.id)).size === d.nodes.length &&
    new Set(d.edges.map((e) => e.id)).size === d.edges.length
  );
}
/**
 * 比例会签所需通过人数
 * @param total 本轮候选人人数
 * @param percent 通过百分比，1–100
 */
export function ratioPassCount(total: number, percent: number): number {
  const people = Math.max(1, Math.floor(total));
  const ratio = Math.min(100, Math.max(1, Math.round(percent)));
  return Math.max(1, Math.ceil((people * ratio) / 100));
}

export interface WorkflowDiffLine {
  kind: 'add' | 'change' | 'remove';
  message: string;
}
const APPROVE_MODE_LABELS: Record<
  NonNullable<WorkflowNode['approveMode']>,
  string
> = {
  any: '任一人通过',
  all: '会签（全部通过）',
  sequential: '依次审批',
  ratio: '比例会签',
};
const ASSIGNEE_LABELS: Record<AssigneeType, string> = {
  role: '指定角色',
  user: '指定人员',
  departmentLeader: '指定部门负责人',
  initiator: '发起人本人',
  field: '表单字段',
};
/** 办理人策略的可读说明，含候选 id 或字段名 */
function assigneeText(node: WorkflowNode) {
  const label = ASSIGNEE_LABELS[node.assignee.type];
  if (node.assignee.type === 'field')
    return `${label}（${node.assignee.field || '未填'}）`;
  if (node.assignee.ids.length > 0)
    return `${label}（${node.assignee.ids.join('、')}）`;
  return label;
}
/** 审批办理方式说明；比例会签带上百分比 */
function approveText(node: WorkflowNode) {
  if (node.type !== 'approve') return '';
  const mode = node.approveMode || 'any';
  if (mode === 'ratio') return `比例会签 ${node.approveRatio ?? 50}%`;
  return APPROVE_MODE_LABELS[mode];
}
function edgeTypeLabel(type: WorkflowEdge['type']) {
  if (type === 'reject') return '驳回';
  if (type === 'condition') return '条件';
  return '通过';
}
function nodeTitle(node: WorkflowNode) {
  return `${node.name}（${NODE_LABELS[node.type]}）`;
}
const FIELD_ACCESS_LABELS: Record<'edit' | 'hidden' | 'readonly', string> = {
  edit: '可编辑',
  readonly: '只读',
  hidden: '隐藏',
};
/** 字段目录名；目录外的键原样显示 */
function fieldLabel(key: string) {
  return WORKFLOW_FIELD_CATALOG.find((item) => item.key === key)?.label || key;
}
/** 按钮中文名，未知编码原样保留 */
function buttonLabel(code: string) {
  return STANDARD_BUTTONS.find((item) => item.code === code)?.label || code;
}
/** 节点按钮文案 */
function buttonsText(node: WorkflowNode) {
  const text = (node.buttons || []).map((code) => buttonLabel(code)).join('、');
  return text || '无';
}
/** 办理时限文案；未填小时数视为不限 */
function slaText(node: WorkflowNode) {
  const hours = node.sla?.durationHours || 0;
  if (!hours) return '不限';
  const overtime = node.sla?.overtime === 'urge' ? '超时催办' : '超时仅提醒';
  const warn = node.sla?.warnHours
    ? `，提前 ${node.sla.warnHours} 小时提醒`
    : '';
  return `${hours} 小时，${overtime}${warn}`;
}
/** 单条数据动作文案 */
function dataActionText(action: WorkflowDataAction) {
  const when = DATA_ACTION_WHEN_LABELS[action.when] || action.when;
  const target = fieldLabel(action.field);
  if (action.kind === 'copy')
    return `${when}把${fieldLabel(action.from || '')}抄到${target}`;
  return `${when}把${target}设为「${action.value ?? ''}」`;
}
/** 节点全部数据动作文案 */
function dataActionsText(node: WorkflowNode) {
  const text = (node.dataActions || [])
    .map((action) => dataActionText(action))
    .join('；');
  return text || '无';
}
/** 字段权限文案，按字段键排序，避免只改顺序就算变更 */
function fieldAccessText(node: WorkflowNode) {
  const entries = Object.entries(node.fieldAccess || {}).toSorted(
    ([left], [right]) => left.localeCompare(right),
  );
  if (entries.length === 0) return '无';
  return entries
    .map(
      ([key, mode]) => `${fieldLabel(key)}${FIELD_ACCESS_LABELS[mode] || mode}`,
    )
    .join('、');
}
/** 文案不同才记一条 */
function pushConfigChange(
  lines: string[],
  nodeName: string,
  label: string,
  beforeText: string,
  afterText: string,
) {
  if (beforeText !== afterText)
    lines.push(`节点「${nodeName}」${label}由${beforeText}改为${afterText}`);
}
/** 新增或删除节点时，只摘出四类配置里实际配过的部分 */
function configuredParts(node: WorkflowNode) {
  const parts: string[] = [];
  if (node.buttons?.length) parts.push(`按钮（${buttonsText(node)}）`);
  if (node.sla?.durationHours) parts.push(`时限（${slaText(node)}）`);
  if (node.dataActions?.length)
    parts.push(`数据动作（${dataActionsText(node)}）`);
  if (Object.keys(node.fieldAccess || {}).length > 0)
    parts.push(`字段权限（${fieldAccessText(node)}）`);
  return parts;
}

/**
 * 对比两个版本在按钮、时限、数据动作、字段权限上的差异
 * @param before 旧版本设计
 * @param after 新版本设计
 */
export function diffWorkflowConfig(
  before: WorkflowDocument,
  after: WorkflowDocument,
): string[] {
  const lines: string[] = [];
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  for (const next of after.nodes) {
    const prev = beforeNodes.get(next.id);
    if (!prev) {
      const parts = configuredParts(next);
      if (parts.length > 0)
        lines.push(`新增节点「${next.name}」：${parts.join('，')}`);
      continue;
    }
    pushConfigChange(
      lines,
      next.name,
      '按钮',
      buttonsText(prev),
      buttonsText(next),
    );
    pushConfigChange(lines, next.name, '时限', slaText(prev), slaText(next));
    pushConfigChange(
      lines,
      next.name,
      '数据动作',
      dataActionsText(prev),
      dataActionsText(next),
    );
    pushConfigChange(
      lines,
      next.name,
      '字段权限',
      fieldAccessText(prev),
      fieldAccessText(next),
    );
  }
  for (const prev of before.nodes) {
    if (afterNodes.has(prev.id)) continue;
    const parts = configuredParts(prev);
    if (parts.length > 0)
      lines.push(`删除节点「${prev.name}」，一并移除${parts.join('，')}`);
  }
  return lines;
}

function endpointName(doc: WorkflowDocument, id: string) {
  return doc.nodes.find((n) => n.id === id)?.name || id;
}
function edgePath(doc: WorkflowDocument, edge: WorkflowEdge) {
  return `${endpointName(doc, edge.source)} → ${endpointName(doc, edge.target)}`;
}

/**
 * 对比同一流程的两个版本（before 为较旧版本）
 * @param before 旧版本设计
 * @param after 新版本设计
 */
export function diffWorkflowVersions(
  before: WorkflowDocument,
  after: WorkflowDocument,
): WorkflowDiffLine[] {
  const lines: WorkflowDiffLine[] = [];
  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]));
  const afterNodes = new Map(after.nodes.map((n) => [n.id, n]));
  for (const node of after.nodes.values()) {
    if (!beforeNodes.has(node.id))
      lines.push({ kind: 'add', message: `新增节点「${nodeTitle(node)}」` });
  }
  for (const node of beforeNodes.values()) {
    if (!afterNodes.has(node.id))
      lines.push({
        kind: 'remove',
        message: `删除节点「${nodeTitle(node)}」`,
      });
  }
  for (const next of after.nodes.values()) {
    const prev = beforeNodes.get(next.id);
    if (!prev) continue;
    if (prev.name !== next.name)
      lines.push({
        kind: 'change',
        message: `节点「${prev.name}」改名为「${next.name}」`,
      });
    if (assigneeText(prev) !== assigneeText(next))
      lines.push({
        kind: 'change',
        message: `节点「${next.name}」办理人由${assigneeText(prev)}改为${assigneeText(next)}`,
      });
    const prevMode = approveText(prev);
    const nextMode = approveText(next);
    if (prevMode !== nextMode && (prevMode || nextMode))
      lines.push({
        kind: 'change',
        message: `节点「${next.name}」办理方式由${prevMode || '无'}改为${nextMode || '无'}`,
      });
    if (!!prev.transferReturn !== !!next.transferReturn)
      lines.push({
        kind: 'change',
        message: `节点「${next.name}」转办转回由${prev.transferReturn ? '开启' : '关闭'}改为${next.transferReturn ? '开启' : '关闭'}`,
      });
  }
  const beforeEdges = new Map(before.edges.map((e) => [e.id, e]));
  const afterEdges = new Map(after.edges.map((e) => [e.id, e]));
  for (const edge of after.edges) {
    if (beforeEdges.has(edge.id)) continue;
    const condition = edge.isDefault
      ? '，否则'
      : edge.condition
        ? `，${edge.condition}`
        : '';
    lines.push({
      kind: 'add',
      message: `新增连线「${edgePath(after, edge)}」（${edgeTypeLabel(edge.type)}${condition}）`,
    });
  }
  for (const edge of before.edges) {
    if (!afterEdges.has(edge.id))
      lines.push({
        kind: 'remove',
        message: `删除连线「${edgePath(before, edge)}」`,
      });
  }
  for (const next of after.edges) {
    const prev = beforeEdges.get(next.id);
    if (!prev) continue;
    const parts: string[] = [];
    if (prev.source !== next.source || prev.target !== next.target)
      parts.push(
        `路径由「${edgePath(before, prev)}」改为「${edgePath(after, next)}」`,
      );
    if (prev.type !== next.type)
      parts.push(
        `类型由${edgeTypeLabel(prev.type)}改为${edgeTypeLabel(next.type)}`,
      );
    if (
      (prev.condition || '') !== (next.condition || '') ||
      prev.isDefault !== next.isDefault
    )
      parts.push(
        `条件由「${prev.isDefault ? '否则' : prev.condition || '无'}」改为「${next.isDefault ? '否则' : next.condition || '无'}」`,
      );
    if (prev.label !== next.label)
      parts.push(`标签由「${prev.label}」改为「${next.label}」`);
    if (parts.length > 0)
      lines.push({ kind: 'change', message: `连线变更：${parts.join('；')}` });
  }
  for (const message of diffWorkflowConfig(before, after))
    lines.push({ kind: 'change', message });
  return lines;
}

export function documentOf(record: WorkflowDocument): WorkflowDocument {
  const {
    schemaVersion,
    code,
    name,
    category,
    base,
    businessTable,
    description,
    nodes,
    edges,
    viewport,
  } = record;
  return JSON.parse(
    JSON.stringify({
      schemaVersion,
      code,
      name,
      category,
      base,
      businessTable,
      description,
      nodes,
      edges,
      viewport,
    }),
  );
}

/** 导出可跨环境复制的流程设计 JSON */
export function exportWorkflowJson(doc: WorkflowDocument): string {
  return `${JSON.stringify(documentOf(doc), null, 2)}\n`;
}

/**
 * 解析导入的流程设计 JSON
 * @param raw 文件或粘贴的文本
 */
export function parseWorkflowJson(raw: string): WorkflowDocument {
  const text = String(raw || '').trim();
  if (!text) throw new Error('请提供流程 JSON');
  if (text.length > 1_000_000) throw new Error('流程 JSON 过大');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('不是合法的 JSON');
  }
  if (!isWorkflowDocument(parsed))
    throw new Error('不是当前版本的流程设计文件（schemaVersion 须为 1）');
  return documentOf(parsed);
}

/**
 * 把导入图应用到当前草稿
 * @param current 当前草稿
 * @param incoming 导入文档
 * @param keepIdentity true 时保留当前名称/编码/基地/分类/业务表
 */
export function applyImportedWorkflow(
  current: WorkflowDocument,
  incoming: WorkflowDocument,
  keepIdentity = true,
): WorkflowDocument {
  const next = documentOf(incoming);
  if (!keepIdentity) return next;
  return {
    ...next,
    code: current.code,
    name: current.name,
    category: current.category,
    base: current.base,
    businessTable: current.businessTable,
  };
}

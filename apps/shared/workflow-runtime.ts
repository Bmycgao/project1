import type { WorkflowRecord } from './workflow';

export interface RuntimeField {
  key: string;
  label: string;
  type:
    | 'boolean'
    | 'date'
    | 'number'
    | 'select'
    | 'table'
    | 'text'
    | 'textarea';
  required: boolean;
  readonly: boolean;
  hidden: boolean;
  options?: { label: string; value: boolean | number | string }[];
  children?: RuntimeField[];
  defaultValue?: unknown;
  visibleCodes?: string[];
  editableCodes?: string[];
  visibleCodeGroups?: string[][];
  editableCodeGroups?: string[][];
  min?: number;
  max?: number;
  maxLength?: number;
  minLength?: number;
  minItems?: number;
  maxItems?: number;
  dateMode?: 'date' | 'datetime';
}
export interface RuntimeForm {
  title: string;
  fields: RuntimeField[];
}
export interface RuntimeActor {
  id: string;
  name: string;
  roleIds: string[];
  codes: string[];
  deptId?: string;
}
export interface WorkflowTask {
  id: string;
  nodeId: string;
  assigneeIds: string[];
  assigneeNames: string[];
  /** cancelled：会签被他人驳回、依次未轮到或上一环节撤回时作废；copied：抄送知会，不产生待办 */
  status: 'cancelled' | 'completed' | 'copied' | 'pending' | 'rejected';
  arrivedAt: string;
  /** 会签/依次审批同一轮的分组标识 */
  groupId?: string;
  /** 转办后须回到的原办理人；对方提交或通过时不离开本节点 */
  returnToUserId?: string;
  /** 本次办结只是转回原办理人，不计入会签或依次票数 */
  handoff?: boolean;
  /** 节点时限截止时间 */
  dueAt?: string;
  /** 临期通知已发送 */
  warnedAt?: string;
  /** 超时通知已发送 */
  overdueNotifiedAt?: string;
  /** 挂起时剩余时限毫秒，激活后加回 */
  dueRemainMs?: number;
  completedAt?: string;
  completedBy?: string;
}
export interface WorkflowEvent {
  id: string;
  nodeId: string;
  nodeName: string;
  action: string;
  actorId: string;
  actorName: string;
  at: string;
  opinion: string;
  edgeIds: string[];
  targetNodeId?: string;
}
export interface WorkflowInstance {
  id: string;
  definitionId: string;
  familyId: string;
  definitionName: string;
  version: number;
  businessNo: string;
  title: string;
  base: string;
  /** 绑定业务表，协议为 XieYi */
  bizTable?: string;
  /** 绑定业务主键，协议为协议编号 */
  bizId?: string;
  initiatorId: string;
  initiatorName: string;
  status: 'completed' | 'running' | 'suspended' | 'terminated';
  currentNodeId: string;
  revision: number;
  createdAt: string;
  completedAt?: string;
  data: Record<string, unknown>;
  tasks: WorkflowTask[];
  events: WorkflowEvent[];
  returnStack: { returnNodeId: string; targetNodeId: string; }[];
  requests: { actorId: string; fingerprint: string; id: string; }[];
  /** 并行汇聚已到达的流入连线（joinNodeId → edgeId[]） */
  joinArrivals?: Record<string, string[]>;
  /** 作为子流程被拉起时指向父实例 */
  parentInstanceId?: string;
  /** 父流程中发起本实例的子流程节点 */
  parentNodeId?: string;
}
export interface WorkflowContext {
  instance: Omit<WorkflowInstance, 'requests' | 'returnStack'>;
  definition: WorkflowRecord;
  form: RuntimeForm;
  task?: WorkflowTask;
  buttons: { code: string; enabled: boolean; label: string; reason?: string }[];
  rejectTargets: { id: string; name: string }[];
  canAct: boolean;
  /** 绑定协议的完整详情，供办理页嵌协议模块 */
  agreement?: Record<string, unknown>;
  /** 当前节点是否允许改协议正文（填报可改，审批默认只读） */
  agreementEditable?: boolean;
  /** 会签/依次/比例进度；多人审批时出现 */
  countersign?: {
    /** all 会签；sequential 依次；ratio 比例 */
    mode?: 'all' | 'ratio' | 'sequential';
    passed: number;
    pendingNames: string[];
    /** 配置的通过百分比 */
    percent?: number;
    /** 比例会签达到该人数即流转 */
    required?: number;
    total: number;
  };
  /** 转办候选人（节点允许转办且当前可办理时返回） */
  transferCandidates?: { id: string; name: string }[];
  /** 本次转办办完后会回到当前办理人 */
  transferWillReturn?: boolean;
  /** 当前待办办结后要转回的原办理人姓名 */
  transferReturnName?: string;
  /** 具备监控权限且实例未结束时，可在监控页干预 */
  canIntervene?: boolean;
  /** 换人候选人（有流程办理权限的账号） */
  interveneCandidates?: { id: string; name: string }[];
  /** 当前待办，换人时用于选择改派哪一笔 */
  interveneTasks?: {
    assigneeIds: string[];
    assigneeNames: string[];
    id: string;
    nodeName: string;
  }[];
  /** 当前待办时限 */
  sla?: {
    dueAt: string;
    remainMs: number;
    status: 'dueSoon' | 'ok' | 'overdue';
  };
}
export interface WorkflowActionInput {
  requestId: string;
  taskId: string;
  revision: number;
  action: 'pass' | 'recall' | 'reject' | 'save' | 'submit' | 'transfer';
  data?: Record<string, unknown>;
  /** 办理页提交的协议整单（服务端按节点权限合并） */
  agreement?: Record<string, unknown>;
  opinion?: string;
  targetNodeId?: string;
  /** 转办目标用户 ID */
  targetUserId?: string;
}
/** 监控干预：换人 / 挂起 / 激活 / 终止 / 催办 */
export interface WorkflowInterveneInput {
  requestId: string;
  revision: number;
  action: 'reassign' | 'resume' | 'suspend' | 'terminate' | 'urge';
  opinion?: string;
  /** 换人目标用户 ID */
  targetUserId?: string;
  /** 并行/会签时指定要改派的待办 */
  taskId?: string;
}
/** 流程站内通知（Mock，对应需求 Tidings 通道） */
export interface WorkflowNotice {
  id: string;
  userId: string;
  type:
    | 'arrive'
    | 'cc'
    | 'complete'
    | 'dueSoon'
    | 'overdue'
    | 'reject'
    | 'terminate'
    | 'urge';
  title: string;
  message: string;
  instanceId: string;
  at: string;
  read: boolean;
}
export const BUSINESS_FIELDS: RuntimeField[] = [
  {
    key: 'agreementNo',
    label: '协议编号',
    type: 'text',
    required: true,
    readonly: true,
    hidden: false,
  },
  {
    key: 'compensatee',
    label: '被补偿人',
    type: 'text',
    required: true,
    readonly: false,
    hidden: false,
  },
  {
    key: 'houseAddress',
    label: '房屋坐落',
    type: 'text',
    required: true,
    readonly: false,
    hidden: false,
  },
  {
    key: 'BuChangJinE',
    label: '补偿金额（元）',
    type: 'number',
    required: true,
    readonly: false,
    hidden: false,
    min: 0,
  },
];

/** 设计器字段权限可选目录：头字段走协议模块，flow 写入协议 flowFields */
export interface WorkflowFieldCatalogItem {
  key: string;
  label: string;
  type: RuntimeField['type'];
  group: string;
  persist: 'basic' | 'flow' | 'header';
}

export const WORKFLOW_FIELD_CATALOG: WorkflowFieldCatalogItem[] = [
  {
    key: 'agreementNo',
    label: '协议编号',
    type: 'text',
    group: '协议头',
    persist: 'header',
  },
  {
    key: 'compensatee',
    label: '被补偿人',
    type: 'text',
    group: '协议头',
    persist: 'header',
  },
  {
    key: 'houseAddress',
    label: '房屋坐落',
    type: 'text',
    group: '协议头',
    persist: 'header',
  },
  {
    key: 'BuChangJinE',
    label: '补偿金额',
    type: 'number',
    group: '协议头',
    persist: 'header',
  },
  {
    key: 'remark',
    label: '协议备注',
    type: 'textarea',
    group: '协议头',
    persist: 'basic',
  },
  {
    key: 'legalOpinion',
    label: '法务意见',
    type: 'textarea',
    group: '节点字段',
    persist: 'flow',
  },
  {
    key: 'acceptOpinion',
    label: '受理意见',
    type: 'textarea',
    group: '节点字段',
    persist: 'flow',
  },
  {
    key: 'handlerUserId',
    label: '经办人',
    type: 'select',
    group: '人员',
    persist: 'basic',
  },
  {
    key: 'assistUserId',
    label: '协办人',
    type: 'select',
    group: '人员',
    persist: 'basic',
  },
];

/** 协议上可用来取办理人的人员字段，值为用户 ID，多人可用逗号或顿号分隔 */
export const WORKFLOW_PERSON_FIELDS = [
  { key: 'handlerUserId', label: '经办人' },
  { key: 'assistUserId', label: '协办人' },
] as const;

const HEADER_FIELD_KEYS = new Set(BUSINESS_FIELDS.map((f) => f.key));

/**
 * 把尚未出现在默认协议头中的字段编进冻结表单
 * @param keys 字段标识
 */
export function extraFieldsFromKeys(keys: string[]): RuntimeField[] {
  const extras: RuntimeField[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (!key || HEADER_FIELD_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    const item = WORKFLOW_FIELD_CATALOG.find((c) => c.key === key);
    extras.push({
      key,
      label: item?.label || key,
      type: item?.type || 'textarea',
      required: false,
      readonly: false,
      hidden: false,
    });
  }
  return extras;
}

/**
 * 把节点 fieldAccess / 数据动作里尚未出现在默认协议头中的字段编进冻结表单
 * @param fieldAccess 节点字段权限
 * @param extraKeys 额外字段（如数据动作目标/来源）
 */
export function extraFieldsFromAccess(
  fieldAccess?: Record<string, 'edit' | 'hidden' | 'readonly'>,
  extraKeys: string[] = [],
): RuntimeField[] {
  return extraFieldsFromKeys([...Object.keys(fieldAccess || {}), ...extraKeys]);
}

/**
 * 按触发时机执行数据动作：赋固定值或抄已有字段，不支持公式
 * @param data 当前实例数据
 * @param actions 节点上配置的动作
 * @param when 到达 / 保存 / 提交 / 通过
 * @param fields 冻结表单字段（用于类型转换）
 */
export function applyWorkflowDataActions(
  data: Record<string, unknown>,
  actions: import('./workflow').WorkflowDataAction[] | undefined,
  when: import('./workflow').WorkflowDataActionWhen,
  fields: RuntimeField[],
): { data: Record<string, unknown>; written: string[] } {
  const list = (actions || []).filter((action) => action.when === when);
  if (list.length === 0) return { data, written: [] };
  const next = { ...data };
  const written: string[] = [];
  const byKey = new Map(fields.map((field) => [field.key, field]));
  for (const action of list) {
    const field = String(action.field || '').trim();
    if (!field) throw new Error('数据动作缺少目标字段');
    const target = byKey.get(field);
    if (target?.type === 'table')
      throw new Error(`数据动作不能写入表格字段「${field}」`);
    let raw: unknown;
    if (action.kind === 'copy') {
      const from = String(action.from || '').trim();
      if (!from) throw new Error('数据动作缺少抄贝来源字段');
      raw = next[from];
    } else raw = action.value ?? '';
    next[field] = coerceDataActionValue(target, raw, field);
    written.push(field);
  }
  return { data: next, written };
}

/**
 * 把数据动作的字面量转成字段类型
 * @param field 冻结字段元数据，缺省按文本
 * @param raw 固定值或抄来的值
 * @param key 目标字段名（报错用）
 */
function coerceDataActionValue(
  field: RuntimeField | undefined,
  raw: unknown,
  key: string,
): unknown {
  const type = field?.type || 'textarea';
  if (type === 'table') throw new Error(`数据动作不能写入表格字段「${key}」`);
  if (raw === undefined || raw === null)
    return type === 'number' ? undefined : '';
  if (type === 'number') {
    if (raw === '') return undefined;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value))
      throw new Error(`数据动作无法把「${key}」写成数字`);
    return value;
  }
  if (type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0' || raw === '') return false;
    throw new Error(`数据动作无法把「${key}」写成布尔值`);
  }
  return String(raw);
}

export const ACTION_LABELS: Record<string, string> = {
  start: '发起',
  save: '保存',
  submit: '提交',
  pass: '通过',
  reject: '驳回',
  recall: '撤回',
  transfer: '转办',
  transferReturn: '转回审核',
  reassign: '换人',
  suspend: '挂起',
  resume: '激活',
  terminate: '终止',
  urge: '催办',
  overdue: '超时',
  dueSoon: '临期',
  route: '条件路由',
  cc: '抄送',
  split: '并行分叉',
  join: '并行汇聚',
  joinWait: '等待汇聚',
  subflow: '进入子流程',
  subflowDone: '子流程结束',
  end: '结束',
};

/** 实例状态文案（办理列表 / 监控 / 详情共用） */
export const INSTANCE_STATUS_LABELS: Record<string, string> = {
  running: '办理中',
  completed: '已结束',
  suspended: '已挂起',
  terminated: '已终止',
};

/**
 * 按自然小时计算截止时间；未配或 0 表示不限
 * @param arrivedAt 到达时间
 * @param durationHours 办理时限小时数
 */
export function computeDueAt(arrivedAt: string, durationHours?: number) {
  if (!durationHours || durationHours <= 0) return undefined;
  const start = Date.parse(arrivedAt);
  if (!Number.isFinite(start)) return undefined;
  return new Date(start + durationHours * 3_600_000).toISOString();
}

/**
 * 时限状态：未配 / 正常 / 临期 / 超时
 * @param dueAt 截止时间
 * @param warnHours 临期提前小时
 * @param at 当前时间戳
 */
export function slaBucket(
  dueAt: string | undefined,
  warnHours = 0,
  at = Date.now(),
): 'dueSoon' | 'none' | 'ok' | 'overdue' {
  if (!dueAt) return 'none';
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return 'none';
  if (at >= due) return 'overdue';
  if (warnHours > 0 && at >= due - warnHours * 3_600_000) return 'dueSoon';
  return 'ok';
}

/**
 * 剩余/超时文案
 * @param dueAt 截止时间
 * @param at 当前时间戳
 */
export function formatRemain(dueAt: string | undefined, at = Date.now()) {
  if (!dueAt) return '';
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return '';
  const ms = due - at;
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  const text =
    hours >= 24
      ? `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`
      : hours
        ? `${hours} 小时${mins ? ` ${mins} 分` : ''}`
        : `${Math.max(1, mins)} 分`;
  return ms >= 0 ? `剩余 ${text}` : `已超时 ${text}`;
}

/** 流程菜单/按钮权限码（与菜单管理 authCode、角色授权一致） */
export const WORKFLOW_AUTH = {
  manage: 'System:Workflow:Manage',
  create: 'System:Workflow:Create',
  copy: 'System:Workflow:Copy',
  publish: 'System:Workflow:Publish',
  version: 'System:Workflow:Version',
  disable: 'System:Workflow:Disable',
  delete: 'System:Workflow:Delete',
  use: 'Workflow:Use',
  start: 'Workflow:Start',
  monitor: 'Workflow:Monitor',
} as const;

/**
 * 是否具备流程设计类权限（Manage 为总开关）
 * @param codes 用户权限码
 * @param need 具体按钮码；缺省时只判断能否进设计菜单
 */
export function hasWorkflowDesignAccess(
  codes: string[] | undefined,
  need?: string,
) {
  const set = new Set(codes || []);
  if (set.has('System:*') || set.has(WORKFLOW_AUTH.manage)) return true;
  return need ? set.has(need) : false;
}

/**
 * 是否可看全部实例（监控页 / 管理员检查）
 * @param codes 用户权限码
 */
export function hasWorkflowMonitorAccess(codes: string[] | undefined) {
  const set = new Set(codes || []);
  return (
    set.has('System:*') ||
    set.has(WORKFLOW_AUTH.manage) ||
    set.has(WORKFLOW_AUTH.monitor)
  );
}

/**
 * 是否具备流程运行权限
 * @param codes 用户权限码
 * @param action start=发起实例，handle=待办/已办/详情
 */
export function hasWorkflowRuntimeAccess(
  codes: string[] | undefined,
  action: 'handle' | 'start',
) {
  const set = new Set(codes || []);
  if (set.has('System:*') || set.has(WORKFLOW_AUTH.manage)) return true;
  if (action === 'start') return set.has(WORKFLOW_AUTH.start);
  return (
    set.has(WORKFLOW_AUTH.use) ||
    set.has(WORKFLOW_AUTH.start) ||
    set.has(WORKFLOW_AUTH.monitor)
  );
}

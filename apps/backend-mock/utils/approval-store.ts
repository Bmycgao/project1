/**
 * 审批流程内存 Mock 数据与引擎（固定三节点）
 * 节点：发起人提交 → 主管审批 → 仓库确认
 */

export type NodeStatus = 'pending' | 'approved' | 'rejected' | 'waiting';
export type InstanceStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface FlowNode {
  approverName?: string;
  code: string;
  name: string;
  remark?: string;
  sort: number;
  status: NodeStatus;
  time?: string;
}

export interface RecordItem {
  action: 'approve' | 'reject' | 'submit';
  operatorName: string;
  remark?: string;
  time: string;
}

export interface ApprovalInstance {
  bizTitle: string;
  bizType: string;
  createTime: string;
  currentNodeCode?: string;
  id: string;
  initiatorName: string;
  nodes: FlowNode[];
  records: RecordItem[];
  status: InstanceStatus;
}

const formatterCN = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** 生成固定三节点模板 */
function createDefaultNodes(): FlowNode[] {
  return [
    {
      code: 'submit',
      name: '提交申请',
      sort: 1,
      status: 'approved',
      approverName: '发起人',
      time: formatterCN.format(new Date()),
    },
    {
      code: 'manager',
      name: '主管审批',
      sort: 2,
      status: 'pending',
      approverName: '部门主管',
    },
    {
      code: 'warehouse',
      name: '仓库确认',
      sort: 3,
      status: 'waiting',
      approverName: '仓管员',
    },
  ];
}

let seed = 1;
const instances: ApprovalInstance[] = [];

/** 初始化几条演示数据 */
function ensureSeedData() {
  if (instances.length > 0) return;
  const demo = createInstance({
    bizTitle: '原料出库-演示单',
    bizType: 'outbound',
    initiatorName: 'Vben',
  });
  instances.push(demo);
}

/**
 * 创建审批实例
 * @param opts 业务信息
 */
export function createInstance(opts: {
  bizTitle: string;
  bizType: string;
  initiatorName: string;
}): ApprovalInstance {
  const nodes = createDefaultNodes();
  const now = formatterCN.format(new Date());
  const instance: ApprovalInstance = {
    id: `AP${Date.now()}${seed++}`,
    bizTitle: opts.bizTitle,
    bizType: opts.bizType,
    initiatorName: opts.initiatorName,
    createTime: now,
    status: 'pending',
    currentNodeCode: 'manager',
    nodes,
    records: [
      {
        action: 'submit',
        operatorName: opts.initiatorName,
        remark: '提交审批',
        time: now,
      },
    ],
  };
  return instance;
}

/** 获取全部实例 */
export function listAllInstances() {
  ensureSeedData();
  return instances;
}

/**
 * 按 ID 查找实例
 * @param id 实例 ID
 */
export function findInstance(id: string) {
  ensureSeedData();
  return instances.find((item) => item.id === id);
}

/**
 * 新增实例到内存列表
 * @param instance 实例
 */
export function addInstance(instance: ApprovalInstance) {
  instances.unshift(instance);
  return instance;
}

/**
 * 审批通过：推进到下一节点，全部通过则结束
 * @param id 实例 ID
 * @param operatorName 操作人
 * @param remark 意见
 */
export function approveById(
  id: string,
  operatorName: string,
  remark?: string,
) {
  const instance = findInstance(id);
  if (!instance || instance.status !== 'pending') {
    throw new Error('实例不存在或状态不可审批');
  }
  const now = formatterCN.format(new Date());
  const current = instance.nodes.find((n) => n.code === instance.currentNodeCode);
  if (!current || current.status !== 'pending') {
    throw new Error('当前节点不可审批');
  }
  current.status = 'approved';
  current.time = now;
  current.remark = remark;
  current.approverName = operatorName;
  instance.records.push({
    action: 'approve',
    operatorName,
    remark: remark || '同意',
    time: now,
  });

  const next = instance.nodes
    .filter((n) => n.sort > current.sort)
    .sort((a, b) => a.sort - b.sort)[0];

  if (!next) {
    instance.status = 'approved';
    instance.currentNodeCode = undefined;
  } else {
    next.status = 'pending';
    instance.currentNodeCode = next.code;
  }
  return instance;
}

/**
 * 审批驳回：流程结束
 * @param id 实例 ID
 * @param operatorName 操作人
 * @param remark 意见
 */
export function rejectById(id: string, operatorName: string, remark?: string) {
  const instance = findInstance(id);
  if (!instance || instance.status !== 'pending') {
    throw new Error('实例不存在或状态不可审批');
  }
  const now = formatterCN.format(new Date());
  const current = instance.nodes.find((n) => n.code === instance.currentNodeCode);
  if (!current) {
    throw new Error('当前节点不存在');
  }
  current.status = 'rejected';
  current.time = now;
  current.remark = remark;
  current.approverName = operatorName;
  instance.status = 'rejected';
  instance.records.push({
    action: 'reject',
    operatorName,
    remark: remark || '驳回',
    time: now,
  });
  return instance;
}

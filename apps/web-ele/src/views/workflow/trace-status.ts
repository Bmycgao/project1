import type { NodeType } from '../../../../shared/workflow';

/** 运行图节点的填充、描边和状态文字 */
export interface TraceNodeStatus {
  fill: string;
  stroke: string;
  width: number;
  label: string;
}

/** 判断运行图节点颜色所需的实例片段 */
export interface TraceStatusInput {
  /** 节点 id */
  nodeId: string;
  /** 节点类型；只有并行汇聚才显示等待 */
  nodeType: NodeType;
  /** 实例状态 */
  instanceStatus: 'completed' | 'running' | 'suspended' | 'terminated';
  /** 实例记下的单一当前节点；子流程等待时没有待办，仍标办理中 */
  currentNodeId: string;
  /** 该节点是否还有未办完的待办 */
  pending: boolean;
  /** 审批记录里是否出现过该节点 */
  visited: boolean;
  /** 非驳回流入条数；达到 2 才是汇聚 */
  incomingCount: number;
  /** 已到达的汇聚流入条数；未在等待时不传 */
  arrivedCount?: number;
}

const ACTIVE = {
  fill: '#e8f3ff',
  stroke: '#3478d4',
  width: 3.5,
  label: '办理中',
} as const;
const DONE = {
  fill: '#e7f6ef',
  stroke: '#15976c',
  width: 2.5,
  label: '已完成',
} as const;
const JOIN_WAIT = {
  fill: '#fff7ed',
  stroke: '#d97706',
  width: 2.5,
  label: '等待汇聚',
} as const;
const IDLE = {
  fill: 'var(--el-bg-color)',
  stroke: '#94a3b8',
  width: 1.5,
  label: '未到达',
} as const;

/**
 * 运行图节点状态。并行分支按各自待办标办理中；汇聚未到齐单独标等待。
 * @param input 节点、待办和汇聚到达情况
 */
export function traceNodeStatus(input: TraceStatusInput): TraceNodeStatus {
  const open =
    input.instanceStatus === 'running' || input.instanceStatus === 'suspended';
  if (open && (input.pending || input.currentNodeId === input.nodeId))
    return { ...ACTIVE };
  if (
    open &&
    input.nodeType === 'parallel' &&
    input.incomingCount >= 2 &&
    input.arrivedCount !== undefined &&
    input.arrivedCount < input.incomingCount
  )
    return { ...JOIN_WAIT };
  if (input.visited) return { ...DONE };
  return { ...IDLE };
}

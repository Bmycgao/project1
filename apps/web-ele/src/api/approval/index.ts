import type { Recordable } from '@vben/types';

import { requestClient } from '#/api/request';

/** 审批流程相关类型与接口 */
export namespace ApprovalApi {
  /** 节点状态 */
  export type NodeStatus = 'pending' | 'approved' | 'rejected' | 'waiting';

  /** 流程实例状态 */
  export type InstanceStatus =
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'cancelled';

  /** 流程节点定义/快照 */
  export interface FlowNode {
    /** 审批人展示名 */
    approverName?: string;
    /** 节点编码 */
    code: string;
    /** 节点名称 */
    name: string;
    /** 处理意见 */
    remark?: string;
    /** 排序（从小到大） */
    sort: number;
    status: NodeStatus;
    /** 处理时间 */
    time?: string;
  }

  /** 审批历史记录 */
  export interface RecordItem {
    action: 'approve' | 'reject' | 'submit';
    operatorName: string;
    remark?: string;
    time: string;
  }

  /** 流程实例 */
  export interface Instance {
    [key: string]: any;
    /** 业务单据标题 */
    bizTitle: string;
    /** 业务类型，如 leave / purchase */
    bizType: string;
    /** 当前节点编码 */
    currentNodeCode?: string;
    id: string;
    /** 流程节点快照 */
    nodes: FlowNode[];
    /** 发起人 */
    initiatorName: string;
    records: RecordItem[];
    status: InstanceStatus;
    createTime: string;
  }
}

/**
 * 分页查询待我审批列表
 * @param params 查询参数
 */
async function getTodoList(params: Recordable<any>) {
  return requestClient.get<{
    items: ApprovalApi.Instance[];
    total: number;
  }>('/approval/todo/list', { params });
}

/**
 * 分页查询我发起的审批
 * @param params 查询参数
 */
async function getInitiatedList(params: Recordable<any>) {
  return requestClient.get<{
    items: ApprovalApi.Instance[];
    total: number;
  }>('/approval/initiated/list', { params });
}

/**
 * 获取审批实例详情
 * @param id 实例 ID
 */
async function getApprovalDetail(id: string) {
  return requestClient.get<ApprovalApi.Instance>(`/approval/instance/${id}`);
}

/**
 * 发起一条演示审批单
 * @param data 业务标题与类型
 */
async function createApproval(data: {
  bizTitle: string;
  bizType: string;
}) {
  return requestClient.post<ApprovalApi.Instance>('/approval/instance', data);
}

/**
 * 审批通过
 * @param id 实例 ID
 * @param remark 意见
 */
async function approveInstance(id: string, remark?: string) {
  return requestClient.post(`/approval/instance/${id}/approve`, { remark });
}

/**
 * 审批驳回
 * @param id 实例 ID
 * @param remark 意见
 */
async function rejectInstance(id: string, remark?: string) {
  return requestClient.post(`/approval/instance/${id}/reject`, { remark });
}

export {
  approveInstance,
  createApproval,
  getApprovalDetail,
  getInitiatedList,
  getTodoList,
  rejectInstance,
};

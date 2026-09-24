import type { WorkflowRecord } from '../../../shared/workflow';
import type {
  WorkflowActionInput,
  WorkflowContext,
  WorkflowInterveneInput,
  WorkflowNotice,
} from '../../../shared/workflow-runtime';
export {
  formatRemain,
  hasWorkflowRuntimeAccess,
  INSTANCE_STATUS_LABELS,
  WORKFLOW_AUTH,
} from '../../../shared/workflow-runtime';
import { requestClient } from '#/api/request';
export interface WorkflowInstanceRow {
  id: string;
  definitionName: string;
  version: number;
  businessNo: string;
  title: string;
  base: string;
  /** 绑定的协议编号 */
  bizId?: string;
  initiatorName: string;
  status: string;
  createdAt: string;
  currentNodeName: string;
  taskArrivedAt?: string;
  /** 当前待办办理人（监控页展示） */
  pendingAssigneeNames?: string[];
  /** 当前待办被催办过 */
  urged?: boolean;
  /** 当前待办最早截止时间 */
  dueAt?: string;
  /** 时限状态 */
  slaStatus?: 'dueSoon' | 'ok' | 'overdue';
}
export interface WorkflowAgreementOption {
  agreementNo: string;
  compensatee: string;
  houseAddress: string;
  amount: number;
  statusValue: string;
  title: string;
}
export const getStartableWorkflows = () =>
  requestClient.get<WorkflowRecord[]>('/workflow/definitions');
export const getWorkflowAgreements = () =>
  requestClient.get<WorkflowAgreementOption[]>('/workflow/agreements');
export const getWorkflowInstances = (tab: string) =>
  requestClient.get<WorkflowInstanceRow[]>('/workflow/instances', {
    params: { tab },
  });
export const getWorkflowContext = (id: string) =>
  requestClient.get<WorkflowContext>(
    `/workflow/instances/${encodeURIComponent(id)}`,
  );
export const startWorkflow = (input: {
  agreementNo: string;
  definitionId: string;
  requestId: string;
  title?: string;
}) => requestClient.post<WorkflowContext>('/workflow/instances', input);
export const submitWorkflowAction = (id: string, input: WorkflowActionInput) =>
  requestClient.post<WorkflowContext>(
    `/workflow/instances/${encodeURIComponent(id)}/action`,
    input,
  );
/** 监控干预：换人 / 挂起 / 激活 / 终止 / 催办 */
export const interveneWorkflow = (id: string, input: WorkflowInterveneInput) =>
  requestClient.post<WorkflowContext>(
    `/workflow/instances/${encodeURIComponent(id)}/intervene`,
    input,
  );
export const getWorkflowNotices = () =>
  requestClient.get<WorkflowNotice[]>('/workflow/notices');
/** 标记站内通知已读；不传 id 则全部已读 */
export const markWorkflowNoticeRead = (id?: string) =>
  requestClient.post<WorkflowNotice[]>(
    '/workflow/notices/read',
    id ? { id } : {},
  );

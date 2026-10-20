import type { WorkflowButtonConfig } from '../../../../shared/workflow';

import { requestClient } from '#/api/request';

export interface WorkflowButtonResource extends WorkflowButtonConfig {
  code: string;
  builtIn?: boolean;
  status: 0 | 1;
}

const base = '/system/workflow-buttons';
export const getWorkflowButtonResources = () =>
  requestClient.get<WorkflowButtonResource[]>(`${base}/list`);
export const createWorkflowButtonResource = (data: WorkflowButtonResource) =>
  requestClient.post<WorkflowButtonResource>(base, data);
export const updateWorkflowButtonResource = (
  code: string,
  data: WorkflowButtonResource,
) =>
  requestClient.put<WorkflowButtonResource>(
    `${base}/${encodeURIComponent(code)}`,
    data,
  );
export const deleteWorkflowButtonResource = (code: string) =>
  requestClient.delete(`${base}/${encodeURIComponent(code)}`);

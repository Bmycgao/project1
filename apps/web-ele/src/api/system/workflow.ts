import type {
  WorkflowDocument,
  WorkflowIssue,
  WorkflowOptions,
  WorkflowRecord,
} from '../../../../shared/workflow';

import { requestClient } from '#/api/request';
export interface PublicationCheck {
  issues: WorkflowIssue[];
  revision: number;
  name: string;
  version: number;
  nodeCount: number;
  formCount: number;
}
export const checkWorkflowPublication = (id: string) =>
  requestClient.get<PublicationCheck>(
    `/system/workflow/${encodeURIComponent(id)}/check`,
  );
export const getWorkflowMenuCatalogs = () =>
  requestClient.get<{ id: string; title: string }[]>(
    '/system/workflow/menu-catalogs',
  );
export const publishWorkflowVersion = (
  id: string,
  revision: number,
  menu?: { generateMenu: boolean; menuParentId?: string; menuTitle?: string },
) =>
  requestClient.post<WorkflowRecord>(
    `/system/workflow/${encodeURIComponent(id)}/publish`,
    { revision, ...menu },
  );
export const createWorkflowVersion = (id: string) =>
  requestClient.post<WorkflowRecord>(
    `/system/workflow/${encodeURIComponent(id)}/version`,
  );
export const disableWorkflowVersion = (id: string, revision: number) =>
  requestClient.post<WorkflowRecord>(
    `/system/workflow/${encodeURIComponent(id)}/disable`,
    { revision },
  );
export const getWorkflowList = () =>
  requestClient.get<WorkflowRecord[]>('/system/workflow/list');
export const getWorkflow = (id: string) =>
  requestClient.get<WorkflowRecord>(
    `/system/workflow/${encodeURIComponent(id)}`,
  );
export const getWorkflowOptions = () =>
  requestClient.get<WorkflowOptions>('/system/workflow/options');
export const createWorkflow = (data: WorkflowDocument) =>
  requestClient.post<WorkflowRecord>('/system/workflow', data);
export const updateWorkflow = (
  id: string,
  data: WorkflowDocument,
  revision: number,
) =>
  requestClient.put<WorkflowRecord>(
    `/system/workflow/${encodeURIComponent(id)}`,
    { ...data, revision },
  );
export const deleteWorkflow = (id: string) =>
  requestClient.delete(`/system/workflow/${encodeURIComponent(id)}`);

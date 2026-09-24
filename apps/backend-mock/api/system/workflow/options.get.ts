import type { WorkflowOptions } from '../../../../shared/workflow';

import { eventHandler } from 'h3';
import { MOCK_DEPT_TREE } from '~/utils/mock-dept';
import { fcSchemaStore } from '~/utils/mock-fc-schema';
import { pageSchemaStore } from '~/utils/mock-page-schema';
import { roleStore, userStore } from '~/utils/rbac-store';
import { workflowRequest } from '~/utils/workflow-api';
import { listWorkflows } from '~/utils/workflow-store';

export default eventHandler((event) =>
  workflowRequest(event, () => {
    const departments: WorkflowOptions['departments'] = [];
    interface Department {
      id: string;
      name: string;
      status: number;
      children?: Department[];
    }
    function flatten(nodes: Department[], parent = '') {
      for (const node of nodes) {
        const name = parent ? `${parent} / ${node.name}` : node.name;
        if (node.status === 1) departments.push({ id: String(node.id), name });
        if (node.children) flatten(node.children, name);
      }
    }
    flatten(MOCK_DEPT_TREE);
    const result: WorkflowOptions = {
      roles: roleStore
        .filter((r) => r.status === 1)
        .map((r) => ({ id: r.id, name: r.name })),
      users: userStore
        .filter((u) => u.status === 1)
        .map((u) => ({ id: String(u.id), name: `${u.name} (${u.username})` })),
      departments,
      views: [
        ...pageSchemaStore
          .filter((v) => v.status === 1)
          .map((v) => ({
            id: v.id,
            name: v.title || v.name,
            type: 'page' as const,
          })),
        ...fcSchemaStore
          .filter((v) => v.status === 1)
          .map((v) => ({ id: v.id, name: v.name, type: 'form' as const })),
      ],
      workflows: listWorkflows()
        .filter((d) => d.status === 'published')
        .map((d) => ({
          id: d.id,
          code: d.code,
          name: `${d.name}（${d.code}）`,
        })),
    };
    return result;
  }),
);

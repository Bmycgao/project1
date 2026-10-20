import type { WorkflowRecord } from '../../shared/workflow';

import { WORKFLOW_AUTH } from '../../shared/workflow-runtime';
import {
  createMenuNode,
  ensureMenuStoreHydrated,
  findMenuNode,
  updateMenuNode,
} from './menu-store';
import { MOCK_MENU_LIST } from './mock-data';
import { grantNewMenuToDefaultRoles } from './rbac-store';
import { listWorkflows } from './workflow-store';

export function publishedWorkflowFamilies(): WorkflowRecord[] {
  const seen = new Set<string>();
  return listWorkflows().filter((flow) => {
    const familyId = flow.familyId || flow.id;
    if (flow.status !== 'published' || seen.has(familyId)) return false;
    seen.add(familyId);
    return true;
  });
}

function walkMenus(
  visitor: (menu: any) => void,
  menus: any[] = MOCK_MENU_LIST,
) {
  for (const menu of menus) {
    visitor(menu);
    if (menu.children?.length) walkMenus(visitor, menu.children);
  }
}

export function workflowMenuForFamily(familyId: string): any | undefined {
  ensureMenuStoreHydrated();
  let found: any;
  walkMenus((menu) => {
    if (String(menu.meta?.workflowFamilyId || '') === familyId) found = menu;
  });
  return found;
}

export function workflowMenuCatalogs() {
  ensureMenuStoreHydrated();
  const catalogs: { id: string; title: string }[] = [];
  walkMenus((menu) => {
    if (menu.type === 'catalog' && menu.status !== 0)
      catalogs.push({
        id: String(menu.id),
        title: String(menu.meta?.title || menu.name),
      });
  });
  return catalogs;
}

/** Validate a menu binding and derive its route on the server. */
export function prepareWorkflowMenu(
  data: Record<string, any>,
  currentId?: string,
): Record<string, any> {
  const familyId = String(data.meta?.workflowFamilyId || '').trim();
  if (!familyId) return data;
  const flow = publishedWorkflowFamilies().find(
    (item) => (item.familyId || item.id) === familyId,
  );
  if (!flow) throw new Error('只能绑定当前已发布的流程');
  if (data.type !== 'menu') throw new Error('流程只能绑定菜单项');
  const existing = workflowMenuForFamily(familyId);
  if (existing && String(existing.id) !== String(currentId || ''))
    throw new Error('该流程已有菜单，请编辑现有菜单');
  const parent = data.pid ? findMenuNode(data.pid) : undefined;
  if (data.pid && (!parent || parent.type !== 'catalog'))
    throw new Error('流程菜单只能放在根目录或分组目录下');
  return {
    ...data,
    path: `/workflow-flow/${familyId}`,
    component: '/workflow/index',
    authCode: WORKFLOW_AUTH.use,
    meta: {
      ...data.meta,
      workflowFamilyId: familyId,
      workflowCode: flow.code,
      workflowBase: flow.base,
    },
  };
}

/** Publishing may create a menu once; subsequent versions reuse the same route. */
export function ensurePublishedWorkflowMenu(
  flow: WorkflowRecord,
  title?: string,
  parentId?: string,
  roleIds?: string[],
) {
  const familyId = flow.familyId || flow.id;
  const existing = workflowMenuForFamily(familyId);
  if (existing) {
    if (existing.status === 0)
      updateMenuNode(existing.id, { ...existing, status: 1 });
    return existing;
  }
  const data = prepareWorkflowMenu({
    pid: parentId || undefined,
    type: 'menu',
    name: `WorkflowFlow_${familyId}`,
    status: 1,
    meta: {
      title: String(title || flow.name).trim() || flow.name,
      icon: 'mdi:vector-polyline',
      workflowFamilyId: familyId,
    },
  });
  const menu = createMenuNode(data);
  grantNewMenuToDefaultRoles(menu.id, roleIds);
  return menu;
}

export function disableWorkflowMenu(familyId: string) {
  const menu = workflowMenuForFamily(familyId);
  if (menu && menu.status !== 0)
    updateMenuNode(menu.id, { ...menu, status: 0 });
}

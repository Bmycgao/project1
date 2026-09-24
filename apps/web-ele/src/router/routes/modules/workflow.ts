import type { RouteRecordRaw } from 'vue-router';
const routes: RouteRecordRaw[] = [
  {
    path: '/workflow',
    name: 'WorkflowTasks',
    component: () => import('#/views/workflow/index.vue'),
    meta: { title: '流程办理', icon: 'mdi:clipboard-check-outline', order: 80 },
  },
  {
    path: '/workflow/instances/:id',
    name: 'WorkflowInstance',
    component: () => import('#/views/workflow/detail.vue'),
    meta: { title: '流程办理详情', hideInMenu: true, activePath: '/workflow' },
  },
];
export default routes;

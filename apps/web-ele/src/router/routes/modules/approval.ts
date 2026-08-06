import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/** 审批中心：待办 / 我发起的 / 详情 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'mdi:clipboard-check-outline',
      order: 2000,
      title: $t('approval.title'),
    },
    name: 'Approval',
    path: '/approval',
    children: [
      {
        path: 'todo',
        name: 'ApprovalTodo',
        meta: {
          icon: 'mdi:clipboard-list-outline',
          title: $t('approval.todo'),
        },
        component: () => import('#/views/approval/todo/index.vue'),
      },
      {
        path: 'initiated',
        name: 'ApprovalInitiated',
        meta: {
          icon: 'mdi:send-outline',
          title: $t('approval.initiated'),
        },
        component: () => import('#/views/approval/initiated/index.vue'),
      },
      {
        path: 'detail/:id',
        name: 'ApprovalDetail',
        meta: {
          hideInMenu: true,
          title: $t('approval.detail'),
        },
        component: () => import('#/views/approval/detail/index.vue'),
      },
    ],
  },
];

export default routes;

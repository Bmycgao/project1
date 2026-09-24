import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/** 系统管理：用户 / 角色 / 菜单 / 部门（权限可配置） */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'ion:settings-outline',
      order: 9997,
      title: $t('system.title'),
    },
    name: 'System',
    path: '/system',
    children: [
      {
        path: 'workflow',
        name: 'SystemWorkflow',
        meta: {
          icon: 'mdi:vector-polyline',
          title: '流程设计',
        },
        component: () => import('#/views/system/workflow/list.vue'),
      },
      {
        path: 'workflow/edit/:id',
        name: 'SystemWorkflowEdit',
        meta: {
          title: '流程设计器',
          hideInMenu: true,
          activePath: '/system/workflow',
        },
        component: () => import('#/views/system/workflow/edit.vue'),
      },
      {
        path: 'workflow/monitor',
        name: 'SystemWorkflowMonitor',
        meta: {
          icon: 'mdi:monitor-dashboard',
          title: '流程监控',
        },
        component: () => import('#/views/system/workflow/monitor.vue'),
      },
      {
        path: 'user',
        name: 'SystemUser',
        meta: {
          icon: 'mdi:user',
          title: $t('system.user.title'),
        },
        component: () => import('#/views/system/user/list.vue'),
      },
      {
        path: 'role',
        name: 'SystemRole',
        meta: {
          icon: 'mdi:account-group',
          title: $t('system.role.title'),
        },
        component: () => import('#/views/system/role/list.vue'),
      },
      {
        path: 'menu',
        name: 'SystemMenu',
        meta: {
          icon: 'mdi:menu',
          title: $t('system.menu.title'),
        },
        component: () => import('#/views/system/menu/list.vue'),
      },
      {
        path: 'dept',
        name: 'SystemDept',
        meta: {
          icon: 'charm:organisation',
          title: $t('system.dept.title'),
        },
        component: () => import('#/views/system/dept/list.vue'),
      },
    ],
  },
];

export default routes;

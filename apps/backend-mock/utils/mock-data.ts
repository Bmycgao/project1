export interface UserInfo {
  id: number;
  password: string;
  realName: string;
  roles: string[];
  username: string;
  homePath?: string;
}

export interface TimezoneOption {
  offset: number;
  timezone: string;
}

export const MOCK_USERS: UserInfo[] = [
  {
    id: 0,
    password: '123456',
    realName: 'Vben',
    roles: ['super'],
    username: 'vben',
    homePath: '/dashboard/workspace',
  },
  {
    id: 1,
    password: '123456',
    realName: 'Admin',
    roles: ['admin'],
    username: 'admin',
    homePath: '/dashboard/workspace',
  },
  {
    id: 2,
    password: '123456',
    realName: 'Jack',
    roles: ['user'],
    username: 'jack',
    homePath: '/dashboard/analytics',
  },
];

export const MOCK_CODES = [
  // super
  {
    codes: [
      'AC_100100',
      'AC_100110',
      'AC_100120',
      'AC_100010',
      'System:Menu:Create',
      'System:Menu:Edit',
      'System:Menu:Delete',
      'System:Dept:Create',
      'System:Dept:Edit',
      'System:Dept:Delete',
      'System:User:Create',
      'System:Role:Edit',
      'Approval:Approve',
      'Approval:Reject',
    ],
    username: 'vben',
  },
  {
    // admin
    codes: [
      'AC_100010',
      'AC_100020',
      'AC_100030',
      'System:Menu:Create',
      'System:Menu:Edit',
      'System:Dept:Create',
      'Approval:Approve',
      'Approval:Reject',
    ],
    username: 'admin',
  },
  {
    // user
    codes: ['AC_1000001', 'AC_1000002', 'Approval:Approve'],
    username: 'jack',
  },
];

/**
 * 统一菜单源：菜单管理页与侧栏导航共用这一份数据
 * - /system/menu/list 直接返回
 * - /menu/all 经 buildAccessMenus 转换后按用户下发
 */
export const MOCK_MENU_LIST: any[] = [
  {
    id: 1,
    name: 'Dashboard',
    status: 1,
    type: 'catalog',
    path: '/dashboard',
    meta: {
      icon: 'lucide:layout-dashboard',
      order: -1,
      title: 'page.dashboard.title',
    },
    children: [
      {
        id: 101,
        pid: 1,
        status: 1,
        type: 'menu',
        name: 'Analytics',
        path: 'analytics',
        component: '/dashboard/analytics/index',
        meta: {
          affixTab: true,
          icon: 'lucide:area-chart',
          title: 'page.dashboard.analytics',
          keepAlive: true,
        },
      },
      {
        id: 102,
        pid: 1,
        status: 1,
        type: 'menu',
        name: 'Workspace',
        path: 'workspace',
        component: '/dashboard/workspace/index',
        meta: {
          icon: 'carbon:workspace',
          title: 'page.dashboard.workspace',
        },
      },
    ],
  },
  {
    id: 4,
    name: 'Demos',
    status: 1,
    type: 'catalog',
    path: '/demos',
    meta: {
      icon: 'ic:baseline-view-in-ar',
      keepAlive: true,
      order: 1000,
      title: 'demos.title',
    },
    children: [
      {
        id: 401,
        pid: 4,
        status: 1,
        type: 'menu',
        name: 'NaiveDemos',
        path: 'element',
        component: '/demos/element/index',
        meta: { title: 'demos.elementPlus' },
      },
      {
        id: 402,
        pid: 4,
        status: 1,
        type: 'menu',
        name: 'BasicForm',
        path: 'form',
        component: '/demos/form/basic',
        meta: { title: 'demos.form' },
      },
    ],
  },
  {
    id: 3,
    name: 'Approval',
    status: 1,
    type: 'catalog',
    path: '/approval',
    meta: {
      icon: 'mdi:clipboard-check-outline',
      order: 2000,
      title: 'approval.title',
    },
    children: [
      {
        id: 301,
        pid: 3,
        path: 'todo',
        name: 'ApprovalTodo',
        authCode: 'Approval:Todo',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:clipboard-list-outline',
          title: 'approval.todo',
        },
        component: '/approval/todo/index',
        children: [
          {
            id: 30_101,
            pid: 301,
            name: 'ApprovalApprove',
            status: 1,
            type: 'button',
            authCode: 'Approval:Approve',
            meta: { title: 'approval.approve' },
          },
          {
            id: 30_102,
            pid: 301,
            name: 'ApprovalReject',
            status: 1,
            type: 'button',
            authCode: 'Approval:Reject',
            meta: { title: 'approval.reject' },
          },
        ],
      },
      {
        id: 302,
        pid: 3,
        path: 'initiated',
        name: 'ApprovalInitiated',
        authCode: 'Approval:Initiated',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:send-outline',
          title: 'approval.initiated',
        },
        component: '/approval/initiated/index',
      },
      {
        id: 303,
        pid: 3,
        path: 'detail/:id',
        name: 'ApprovalDetail',
        status: 1,
        type: 'menu',
        meta: {
          hideInMenu: true,
          title: 'approval.detail',
        },
        component: '/approval/detail/index',
      },
    ],
  },
  {
    id: 2,
    name: 'System',
    status: 1,
    type: 'catalog',
    path: '/system',
    meta: {
      icon: 'ion:settings-outline',
      order: 9997,
      title: 'system.title',
    },
    children: [
      {
        id: 203,
        pid: 2,
        path: 'user',
        name: 'SystemUser',
        authCode: 'System:User:List',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:user',
          title: 'system.user.title',
        },
        component: '/system/user/list',
        children: [
          {
            id: 20_301,
            pid: 203,
            name: 'SystemUserCreate',
            status: 1,
            type: 'button',
            authCode: 'System:User:Create',
            meta: { title: 'common.create' },
          },
          {
            id: 20_302,
            pid: 203,
            name: 'SystemUserEdit',
            status: 1,
            type: 'button',
            authCode: 'System:User:Edit',
            meta: { title: 'common.edit' },
          },
          {
            id: 20_303,
            pid: 203,
            name: 'SystemUserDelete',
            status: 1,
            type: 'button',
            authCode: 'System:User:Delete',
            meta: { title: 'common.delete' },
          },
        ],
      },
      {
        id: 204,
        pid: 2,
        path: 'role',
        name: 'SystemRole',
        authCode: 'System:Role:List',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:account-group',
          title: 'system.role.title',
        },
        component: '/system/role/list',
        children: [
          {
            id: 20_501,
            pid: 204,
            name: 'SystemRoleCreate',
            status: 1,
            type: 'button',
            authCode: 'System:Role:Create',
            meta: { title: 'common.create' },
          },
          {
            id: 20_502,
            pid: 204,
            name: 'SystemRoleEdit',
            status: 1,
            type: 'button',
            authCode: 'System:Role:Edit',
            meta: { title: 'common.edit' },
          },
        ],
      },
      {
        id: 201,
        pid: 2,
        path: 'menu',
        name: 'SystemMenu',
        authCode: 'System:Menu:List',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:menu',
          title: 'system.menu.title',
        },
        component: '/system/menu/list',
        children: [
          {
            id: 20_101,
            pid: 201,
            name: 'SystemMenuCreate',
            status: 1,
            type: 'button',
            authCode: 'System:Menu:Create',
            meta: { title: 'common.create' },
          },
          {
            id: 20_102,
            pid: 201,
            name: 'SystemMenuEdit',
            status: 1,
            type: 'button',
            authCode: 'System:Menu:Edit',
            meta: { title: 'common.edit' },
          },
          {
            id: 20_103,
            pid: 201,
            name: 'SystemMenuDelete',
            status: 1,
            type: 'button',
            authCode: 'System:Menu:Delete',
            meta: { title: 'common.delete' },
          },
        ],
      },
      {
        id: 202,
        pid: 2,
        path: 'dept',
        name: 'SystemDept',
        authCode: 'System:Dept:List',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'charm:organisation',
          title: 'system.dept.title',
        },
        component: '/system/dept/list',
        children: [
          {
            id: 20_401,
            pid: 202,
            name: 'SystemDeptCreate',
            status: 1,
            type: 'button',
            authCode: 'System:Dept:Create',
            meta: { title: 'common.create' },
          },
          {
            id: 20_402,
            pid: 202,
            name: 'SystemDeptEdit',
            status: 1,
            type: 'button',
            authCode: 'System:Dept:Edit',
            meta: { title: 'common.edit' },
          },
          {
            id: 20_403,
            pid: 202,
            name: 'SystemDeptDelete',
            status: 1,
            type: 'button',
            authCode: 'System:Dept:Delete',
            meta: { title: 'common.delete' },
          },
        ],
      },
      {
        id: 206,
        pid: 2,
        path: 'page-schema',
        name: 'SystemPageSchema',
        authCode: 'System:PageSchema:List',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:table-cog',
          title: 'system.pageSchema.title',
        },
        component: '/system/page-schema/list',
      },
    ],
  },
  {
    id: 6,
    name: 'BizConfig',
    status: 1,
    type: 'catalog',
    path: '/biz',
    meta: {
      icon: 'mdi:view-dashboard-edit-outline',
      order: 500,
      title: 'system.biz.title',
    },
    children: [
      {
        id: 601,
        pid: 6,
        path: 'customer',
        name: 'BizCustomer',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:account-tie',
          title: '客户列表',
          /** 关联页面配置 ID，动态列表页按此渲染字段 */
          schemaId: 'PS1001',
        },
        component: '/system/dynamic-list/index',
      },
      {
        id: 602,
        pid: 6,
        path: 'material',
        name: 'BizMaterial',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:package-variant-closed',
          title: '物料列表',
          schemaId: 'PS1002',
        },
        component: '/system/dynamic-list/index',
      },
      {
        id: 603,
        pid: 6,
        path: 'mortgage-entry',
        name: 'BizMortgageEntry',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:home-city-outline',
          title: '抵押信息录入',
          /** 关联页面配置 PS1100 */
          schemaId: 'PS1100',
        },
        component: '/system/dynamic-list/index',
      },
      {
        id: 604,
        pid: 6,
        path: 'mortgage-entry/detail/:agreementNo',
        name: 'BizMortgageDetail',
        status: 1,
        type: 'menu',
        meta: {
          hideInMenu: true,
          activePath: '/biz/mortgage-entry',
          title: '抵押信息详情',
        },
        component: '/biz/mortgage/detail/index',
      },
    ],
  },
  /** 电子协议：同一列表组件 + 不同 scene（按钮/数据不同） */
  {
    id: 7,
    name: 'EAgreement',
    status: 1,
    type: 'catalog',
    path: '/e-agree',
    meta: {
      icon: 'mdi:file-document-edit-outline',
      order: 480,
      title: '电子协议',
    },
    children: [
      {
        id: 701,
        pid: 7,
        path: 'entry',
        name: 'EAgreeEntry',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:file-plus-outline',
          title: '协议信息录入',
          /** 场景码：决定按钮 + list?scene= */
          sceneId: 'entry',
          schemaId: 'PS_AGREE_ENTRY',
        },
        component: '/biz/agreement/list/index',
      },
      {
        id: 702,
        pid: 7,
        path: 'lawyer-audit',
        name: 'EAgreeLawyerAudit',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:account-tie-outline',
          title: '小组律师审核',
          sceneId: 'lawyer_audit',
          schemaId: 'PS_AGREE_LAWYER',
        },
        component: '/biz/agreement/list/index',
      },
      {
        id: 799,
        pid: 7,
        path: 'detail/:agreementNo',
        name: 'BizAgreementDetail',
        status: 1,
        type: 'menu',
        meta: {
          hideInMenu: true,
          activePath: '/e-agree/entry',
          title: '协议详情',
        },
        component: '/biz/agreement/detail/index',
      },
    ],
  },
  /** 信息查询：仍复用同一列表 + 不同 scene */
  {
    id: 8,
    name: 'EQuery',
    status: 1,
    type: 'catalog',
    path: '/e-query',
    meta: {
      icon: 'mdi:magnify',
      order: 470,
      title: '信息查询',
    },
    children: [
      {
        id: 801,
        pid: 8,
        path: 'preview',
        name: 'EAgreePreview',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:file-eye-outline',
          title: '协议信息预览',
          sceneId: 'preview',
          schemaId: 'PS_AGREE_PREVIEW',
        },
        component: '/biz/agreement/list/index',
      },
      {
        id: 802,
        pid: 8,
        path: 'view',
        name: 'EAgreeView',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:eye-outline',
          title: '查看',
          sceneId: 'view',
          schemaId: 'PS_AGREE_VIEW',
        },
        component: '/biz/agreement/list/index',
      },
    ],
  },
];

/** 普通用户可见的顶级菜单 name */
const JACK_MENU_NAMES = new Set(['Dashboard', 'Approval']);

/**
 * 将管理端菜单节点转为侧栏路由节点（过滤 button / 禁用项 / 无 path 的非法项）
 * @param node 管理菜单节点
 */
function convertMenuNodeToRoute(node: any): any | null {
  if (!node || node.status === 0 || node.type === 'button') {
    return null;
  }

  // path 为空会导致 vue-router addRoute 崩溃（Cannot read properties of undefined）
  const path = typeof node.path === 'string' ? node.path.trim() : '';
  if (!path) {
    return null;
  }

  const children = (node.children || [])
    .map((child: any) => convertMenuNodeToRoute(child))
    .filter(Boolean);

  const meta = { ...(node.meta || {}) };
  const route: Record<string, any> = {
    name: node.name,
    path,
    meta,
  };

  // 内嵌：布局内 iframe；外链：新窗口打开（均走 IFrameView）
  if (node.type === 'embedded') {
    route.component = 'IFrameView';
    meta.iframeSrc = meta.iframeSrc || node.linkSrc || path;
  } else if (node.type === 'link') {
    route.component = 'IFrameView';
    meta.link = meta.link || node.linkSrc || path;
  } else if (node.component) {
    // 去掉首尾空白，避免前端组件映射失败变成 404
    route.component = String(node.component).trim();
  }

  if (children.length > 0) {
    route.children = children;
    // 目录默认跳到第一个可访问子路由
    if (node.type === 'catalog' && !route.redirect) {
      const first = children.find((c: any) => !c.meta?.hideInMenu);
      if (first) {
        const childPath = String(first.path || '');
        route.redirect = childPath.startsWith('/')
          ? childPath
          : `${path.replace(/\/$/, '')}/${childPath}`;
      }
    }
  }

  return route;
}

/**
 * 清洗菜单树中的 component / path 空白（就地修改，修复历史脏数据）
 * @param list 菜单树
 */
function sanitizeMenuTree(list: any[] = MOCK_MENU_LIST) {
  for (const node of list) {
    if (typeof node.component === 'string') {
      node.component = node.component.trim();
    }
    if (typeof node.path === 'string') {
      node.path = node.path.trim();
    }
    if (node.children?.length) {
      sanitizeMenuTree(node.children);
    }
  }
}

sanitizeMenuTree();

/**
 * 根据菜单列表生成侧栏路由（登录 /menu/all 使用）
 * @param menuList 管理菜单树，默认取 MOCK_MENU_LIST
 * @param allowedNames 可选，仅保留这些顶级 name
 */
export function buildAccessMenus(
  menuList: any[] = MOCK_MENU_LIST,
  allowedNames?: Set<string>,
) {
  sanitizeMenuTree(menuList);
  return menuList
    .filter((item) => !allowedNames || allowedNames.has(item.name))
    .map((item) => convertMenuNodeToRoute(item))
    .filter(Boolean);
}

/**
 * 按登录用户生成侧栏菜单
 * @param username 用户名
 */
export function buildAccessMenusForUser(username: string) {
  if (username === 'jack') {
    return buildAccessMenus(MOCK_MENU_LIST, JACK_MENU_NAMES);
  }
  return buildAccessMenus(MOCK_MENU_LIST);
}

/** @deprecated 兼容旧引用；请优先用 buildAccessMenusForUser */
export const MOCK_MENUS = [
  {
    menus: buildAccessMenus(),
    username: 'vben',
  },
  {
    menus: buildAccessMenus(),
    username: 'admin',
  },
  {
    menus: buildAccessMenus(MOCK_MENU_LIST, JACK_MENU_NAMES),
    username: 'jack',
  },
];

export function getMenuIds(menus: any[]) {
  const ids: number[] = [];
  menus.forEach((item) => {
    ids.push(item.id);
    if (item.children && item.children.length > 0) {
      ids.push(...getMenuIds(item.children));
    }
  });
  return ids;
}

/**
 * 时区选项
 */
export const TIME_ZONE_OPTIONS: TimezoneOption[] = [
  {
    offset: -5,
    timezone: 'America/New_York',
  },
  {
    offset: 0,
    timezone: 'Europe/London',
  },
  {
    offset: 8,
    timezone: 'Asia/Shanghai',
  },
  {
    offset: 9,
    timezone: 'Asia/Tokyo',
  },
  {
    offset: 9,
    timezone: 'Asia/Seoul',
  },
];

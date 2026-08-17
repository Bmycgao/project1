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
  /** 协议演示：录入岗（只看录入菜单 + 录入类按钮） */
  {
    id: 3,
    password: '123456',
    realName: '录入员',
    roles: ['entry'],
    username: 'entry',
    homePath: '/e-agree/entry',
  },
  /** 协议演示：律师审核岗 */
  {
    id: 4,
    password: '123456',
    realName: '律师审核',
    roles: ['lawyer'],
    username: 'lawyer',
    homePath: '/e-agree/lawyer-audit',
  },
  /** 协议演示：查询岗（信息查询菜单） */
  {
    id: 5,
    password: '123456',
    realName: '查询员',
    roles: ['viewer'],
    username: 'viewer',
    homePath: '/e-query/preview',
  },
];

/** 协议动作权限码（与前端 Agree:actionCode 一一对应） */
const AGREE_ACTION_CODES = [
  'Agree:add',
  'Agree:delete',
  'Agree:edit',
  'Agree:export',
  'Agree:submitReview',
  'Agree:conditionalSign',
  'Agree:approve',
  'Agree:reject',
  'Agree:rejectRecord',
  'Agree:rejectPrev',
  'Agree:preview1',
  'Agree:preview2',
  'Agree:ticket1',
  'Agree:ticket2',
  'Agree:preSave',
  'Agree:companyAgree',
  'Agree:unlicensedAgree',
  'Agree:previewSupply',
  'Agree:previewChange',
  'Agree:previewAgree',
];

/** 协议菜单权限码 */
const AGREE_MENU_CODES = [
  'Agree:Menu:Entry',
  'Agree:Menu:Lawyer',
  'Agree:Menu:Preview',
  'Agree:Menu:View',
  'Agree:Menu:Detail',
];

/** 录入岗按钮码 */
const ENTRY_ACTION_CODES = [
  'Agree:add',
  'Agree:delete',
  'Agree:edit',
  'Agree:export',
  'Agree:submitReview',
  'Agree:conditionalSign',
  'Agree:rejectRecord',
  'Agree:rejectPrev',
  'Agree:preview1',
  'Agree:preview2',
];

/** 律师岗按钮码 */
const LAWYER_ACTION_CODES = [
  'Agree:approve',
  'Agree:reject',
  'Agree:rejectRecord',
  'Agree:preview1',
  'Agree:preview2',
  'Agree:ticket1',
  'Agree:ticket2',
];

/** 查询岗按钮码（预览/查看场景；含仅可见演示码） */
const VIEWER_ACTION_CODES = [
  'Agree:View:edit',
  'Agree:export',
  'Agree:preSave',
  'Agree:companyAgree',
  'Agree:unlicensedAgree',
  'Agree:previewSupply',
  'Agree:previewChange',
  'Agree:previewAgree',
];

export const MOCK_CODES = [
  // super：通配 Agree:*，列表按钮不过滤
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
      'Agree:*',
      ...AGREE_MENU_CODES,
      ...AGREE_ACTION_CODES,
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
      'Agree:*',
      ...AGREE_MENU_CODES,
      ...AGREE_ACTION_CODES,
    ],
    username: 'admin',
  },
  {
    // user：仅看板
    codes: ['AC_1000001', 'AC_1000002'],
    username: 'jack',
  },
  {
    username: 'entry',
    codes: ['Agree:Menu:Entry', 'Agree:Menu:Detail', ...ENTRY_ACTION_CODES],
  },
  {
    username: 'lawyer',
    codes: ['Agree:Menu:Lawyer', 'Agree:Menu:Detail', ...LAWYER_ACTION_CODES],
  },
  {
    username: 'viewer',
    codes: [
      'Agree:Menu:Preview',
      'Agree:Menu:View',
      'Agree:Menu:Detail',
      ...VIEWER_ACTION_CODES,
    ],
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
  // {
  //   id: 3,
  //   name: 'Approval',
  //   status: 1,
  //   type: 'catalog',
  //   path: '/approval',
  //   meta: {
  //     icon: 'mdi:clipboard-check-outline',
  //     order: 2000,
  //     title: 'approval.title',
  //   },
  //   children: [
  //     {
  //       id: 301,
  //       pid: 3,
  //       path: 'todo',
  //       name: 'ApprovalTodo',
  //       authCode: 'Approval:Todo',
  //       status: 1,
  //       type: 'menu',
  //       meta: {
  //         icon: 'mdi:clipboard-list-outline',
  //         title: 'approval.todo',
  //       },
  //       component: '/approval/todo/index',
  //       children: [
  //         {
  //           id: 30_101,
  //           pid: 301,
  //           name: 'ApprovalApprove',
  //           status: 1,
  //           type: 'button',
  //           authCode: 'Approval:Approve',
  //           meta: { title: 'approval.approve' },
  //         },
  //         {
  //           id: 30_102,
  //           pid: 301,
  //           name: 'ApprovalReject',
  //           status: 1,
  //           type: 'button',
  //           authCode: 'Approval:Reject',
  //           meta: { title: 'approval.reject' },
  //         },
  //       ],
  //     },
  //     {
  //       id: 302,
  //       pid: 3,
  //       path: 'initiated',
  //       name: 'ApprovalInitiated',
  //       authCode: 'Approval:Initiated',
  //       status: 1,
  //       type: 'menu',
  //       meta: {
  //         icon: 'mdi:send-outline',
  //         title: 'approval.initiated',
  //       },
  //       component: '/approval/initiated/index',
  //     },
  //     {
  //       id: 303,
  //       pid: 3,
  //       path: 'detail/:id',
  //       name: 'ApprovalDetail',
  //       status: 1,
  //       type: 'menu',
  //       meta: {
  //         hideInMenu: true,
  //         title: 'approval.detail',
  //       },
  //       component: '/approval/detail/index',
  //     },
  //   ],
  // },
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
        authCode: 'Agree:Menu:Entry',
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
        /** 按钮资源：角色管理可勾选；列表运行时再按权限码过滤 */
        children: [
          {
            id: 70_101,
            pid: 701,
            name: 'AgreeEntryAdd',
            status: 1,
            type: 'button',
            authCode: 'Agree:add',
            meta: { title: '新增' },
          },
          {
            id: 70_102,
            pid: 701,
            name: 'AgreeEntryDelete',
            status: 1,
            type: 'button',
            authCode: 'Agree:delete',
            meta: { title: '删除' },
          },
          {
            id: 70_103,
            pid: 701,
            name: 'AgreeEntryEdit',
            status: 1,
            type: 'button',
            authCode: 'Agree:edit',
            meta: { title: '修改' },
          },
          {
            id: 70_104,
            pid: 701,
            name: 'AgreeEntrySubmit',
            status: 1,
            type: 'button',
            authCode: 'Agree:submitReview',
            meta: { title: '提交复核' },
          },
          {
            id: 70_105,
            pid: 701,
            name: 'AgreeEntryExport',
            status: 1,
            type: 'button',
            authCode: 'Agree:export',
            meta: { title: '导出' },
          },
          /** 字段权限资源（角色勾选 → accessCodes，驱动列表列/详情字段） */
          {
            id: 70_111,
            pid: 701,
            name: 'AgreeFieldBatchGroup',
            status: 1,
            type: 'button',
            authCode: 'Agree:Field:batchGroup',
            meta: { title: '字段-批次分组' },
          },
          {
            id: 70_112,
            pid: 701,
            name: 'AgreeFieldPhone',
            status: 1,
            type: 'button',
            authCode: 'Agree:Field:phone',
            meta: { title: '字段-电话' },
          },
          {
            id: 70_113,
            pid: 701,
            name: 'AgreeFieldIdNo',
            status: 1,
            type: 'button',
            authCode: 'Agree:Field:idNo',
            meta: { title: '字段-证件号' },
          },
          {
            id: 70_114,
            pid: 701,
            name: 'AgreeFieldAmount',
            status: 1,
            type: 'button',
            authCode: 'Agree:Field:amount',
            meta: { title: '字段-补偿金额' },
          },
          {
            id: 70_115,
            pid: 701,
            name: 'AgreeFieldDebtAmount',
            status: 1,
            type: 'button',
            authCode: 'Agree:Field:debtAmount',
            meta: { title: '字段-债权金额' },
          },
        ],
      },
      {
        id: 702,
        pid: 7,
        path: 'lawyer-audit',
        name: 'EAgreeLawyerAudit',
        authCode: 'Agree:Menu:Lawyer',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:account-tie-outline',
          title: '小组律师审核',
          sceneId: 'lawyer_audit',
          schemaId: 'PS_AGREE_LAWYER',
        },
        component: '/biz/agreement/list/index',
        children: [
          {
            id: 70_201,
            pid: 702,
            name: 'AgreeLawyerApprove',
            status: 1,
            type: 'button',
            authCode: 'Agree:approve',
            meta: { title: '审核通过' },
          },
          {
            id: 70_202,
            pid: 702,
            name: 'AgreeLawyerReject',
            status: 1,
            type: 'button',
            authCode: 'Agree:reject',
            meta: { title: '驳回' },
          },
          {
            id: 70_211,
            pid: 702,
            name: 'AgreeLawyerFieldBatchGroup',
            status: 1,
            type: 'button',
            authCode: 'Agree:Field:batchGroup',
            meta: { title: '字段-批次分组' },
          },
          {
            id: 70_212,
            pid: 702,
            name: 'AgreeLawyerFieldPhone',
            status: 1,
            type: 'button',
            authCode: 'Agree:Field:phone',
            meta: { title: '字段-电话' },
          },
          {
            id: 70_213,
            pid: 702,
            name: 'AgreeLawyerFieldIdNo',
            status: 1,
            type: 'button',
            authCode: 'Agree:Field:idNo',
            meta: { title: '字段-证件号' },
          },
          {
            id: 70_214,
            pid: 702,
            name: 'AgreeLawyerFieldAmount',
            status: 1,
            type: 'button',
            authCode: 'Agree:Field:amount',
            meta: { title: '字段-补偿金额' },
          },
          {
            id: 70_215,
            pid: 702,
            name: 'AgreeLawyerFieldDebtAmount',
            status: 1,
            type: 'button',
            authCode: 'Agree:Field:debtAmount',
            meta: { title: '字段-债权金额' },
          },
        ],
      },
      {
        id: 799,
        pid: 7,
        path: 'detail/:agreementNo',
        name: 'BizAgreementDetail',
        authCode: 'Agree:Menu:Detail',
        status: 1,
        type: 'menu',
        meta: {
          hideInMenu: true,
          /** 默认兜底；进详情后会按 query.activePath / scene 动态覆盖 */
          activePath: '/e-agree/entry',
          title: '协议详情',
        },
        component: '/biz/agreement/detail/index',
        /** 详情区域资源：角色勾选 → 控制左侧 Tab 显隐 */
        children: [
          {
            id: 79_901,
            pid: 799,
            name: 'AgreeModuleBasic',
            status: 1,
            type: 'button',
            authCode: 'Agree:Module:basic',
            meta: { title: '区域-基础信息' },
          },
          {
            id: 79_906,
            pid: 799,
            name: 'AgreeModuleHouses',
            status: 1,
            type: 'button',
            authCode: 'Agree:Module:houses',
            meta: { title: '区域-房屋信息' },
          },
          {
            id: 79_905,
            pid: 799,
            name: 'AgreeModuleCompensation',
            status: 1,
            type: 'button',
            authCode: 'Agree:Module:compensation',
            meta: { title: '区域-补偿安置' },
          },
          {
            id: 79_902,
            pid: 799,
            name: 'AgreeModuleRewards',
            status: 1,
            type: 'button',
            authCode: 'Agree:Module:rewards',
            meta: { title: '区域-奖励补贴' },
          },
          {
            id: 79_907,
            pid: 799,
            name: 'AgreeModulePopulation',
            status: 1,
            type: 'button',
            authCode: 'Agree:Module:population',
            meta: { title: '区域-协议人口信息' },
          },
        ],
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
        authCode: 'Agree:Menu:Preview',
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
        authCode: 'Agree:Menu:View',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'mdi:eye-outline',
          title: '查看',
          sceneId: 'view',
          schemaId: 'PS_AGREE_VIEW',
        },
        component: '/biz/agreement/list/index',
        children: [
          {
            id: 80_201,
            pid: 802,
            name: 'AgreeViewEdit',
            status: 1,
            type: 'button',
            /** 仅可见：列表显示「修改」但置灰（文档 2.4 演示） */
            authCode: 'Agree:View:edit',
            meta: { title: '修改（仅可见）' },
          },
          {
            id: 80_202,
            pid: 802,
            name: 'AgreeViewExport',
            status: 1,
            type: 'button',
            /** 可操作：正常点击 */
            authCode: 'Agree:export',
            meta: { title: '导出' },
          },
        ],
      },
    ],
  },
];

/**
 * 按用户限制可见菜单 name（任意层级）
 * all = 全量菜单；否则只保留名单内节点（父级有子则保留）
 */
const USER_MENU_NAME_ACCESS: Record<string, Set<string> | 'all'> = {
  vben: 'all',
  admin: 'all',
  jack: new Set(['Dashboard', 'Analytics', 'Workspace']),
  entry: new Set([
    'Dashboard',
    'Analytics',
    'Workspace',
    'EAgreement',
    'EAgreeEntry',
    'BizAgreementDetail',
  ]),
  lawyer: new Set([
    'Dashboard',
    'Analytics',
    'Workspace',
    'EAgreement',
    'EAgreeLawyerAudit',
    'BizAgreementDetail',
  ]),
  viewer: new Set([
    'Dashboard',
    'Analytics',
    'Workspace',
    'EQuery',
    'EAgreePreview',
    'EAgreeView',
    // 详情路由挂在电子协议下，查询岗也需注册该隐藏路由
    'EAgreement',
    'BizAgreementDetail',
  ]),
};

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
    // 目录下若没有可展示子菜单（仅隐藏详情等），侧栏也隐藏该目录
    if (node.type === 'catalog') {
      const visibleChild = children.find((c: any) => !c.meta?.hideInMenu);
      if (!visibleChild) {
        meta.hideInMenu = true;
      }
    }
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
 * 按允许的菜单 name 过滤管理菜单树
 * - 父菜单在名单内时，保留其 button 子节点（供权限码/角色树）
 * - 父不在名单但有子菜单保留时，只带可访问的子菜单
 * @param list 菜单树
 * @param allowedNames 允许的 name 集合
 */
function filterMenusByAllowedNames(list: any[], allowedNames: Set<string>): any[] {
  const result: any[] = [];
  for (const node of list) {
    const rawChildren: any[] = node.children || [];
    const buttonChildren = rawChildren.filter((c) => c.type === 'button');
    const nonButtonChildren = rawChildren.filter((c) => c.type !== 'button');
    const filteredChildren = filterMenusByAllowedNames(
      nonButtonChildren,
      allowedNames,
    );
    const selfAllowed = allowedNames.has(node.name);
    if (!selfAllowed && filteredChildren.length === 0) {
      continue;
    }
    result.push({
      ...node,
      children: selfAllowed
        ? [...filteredChildren, ...buttonChildren]
        : filteredChildren,
    });
  }
  return result;
}

/**
 * 根据菜单列表生成侧栏路由（登录 /menu/all 使用）
 * @param menuList 管理菜单树，默认取 MOCK_MENU_LIST
 * @param allowedNames 可选，仅保留这些菜单 name（任意层级）
 */
export function buildAccessMenus(
  menuList: any[] = MOCK_MENU_LIST,
  allowedNames?: Set<string>,
) {
  sanitizeMenuTree(menuList);
  const source = allowedNames
    ? filterMenusByAllowedNames(menuList, allowedNames)
    : menuList;
  return source.map((item) => convertMenuNodeToRoute(item)).filter(Boolean);
}

/**
 * 按登录用户生成侧栏菜单
 * @param username 用户名
 */
export function buildAccessMenusForUser(username: string) {
  const access = USER_MENU_NAME_ACCESS[username];
  if (!access || access === 'all') {
    return buildAccessMenus(MOCK_MENU_LIST);
  }
  return buildAccessMenus(MOCK_MENU_LIST, access);
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
    menus: buildAccessMenusForUser('jack'),
    username: 'jack',
  },
  {
    menus: buildAccessMenusForUser('entry'),
    username: 'entry',
  },
  {
    menus: buildAccessMenusForUser('lawyer'),
    username: 'lawyer',
  },
  {
    menus: buildAccessMenusForUser('viewer'),
    username: 'viewer',
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

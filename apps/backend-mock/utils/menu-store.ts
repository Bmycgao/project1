import { WORKFLOW_AUTH } from '../../shared/workflow-runtime';
/**
 * 菜单树内存操作：增删改直接改 MOCK_MENU_LIST，侧栏与管理页同源
 * 变更后写入 menu.json，重启可恢复（与 rbac / page-schema 同一套落盘）
 */
import { MOCK_MENU_LIST } from './mock-data';
import { readPersistJson, writePersistJson } from './mock-persist';

/** 落盘文件名（运行时多在 .nitro/data） */
const MENU_PERSIST_FILE = 'menu.json';

/** 新建菜单自增 ID 起点（需大于种子数据最大 id） */
let idSeed = 10_000;

/** 是否已从磁盘恢复过 */
let hydrated = false;

/**
 * 遍历菜单树，取最大数字 id（用于校正 idSeed）
 * @param list 菜单列表
 */
function findMaxNumericId(list: any[]): number {
  let max = 0;
  for (const item of list) {
    const n = Number(item?.id);
    if (Number.isFinite(n) && n > max) max = n;
    if (item?.children?.length) {
      const childMax = findMaxNumericId(item.children);
      if (childMax > max) max = childMax;
    }
  }
  return max;
}

/**
 * 用给定树原地替换 MOCK_MENU_LIST（保持引用，其它模块 import 仍有效）
 * @param menus 新菜单树
 */
function replaceMockMenuList(menus: any[]) {
  MOCK_MENU_LIST.length = 0;
  MOCK_MENU_LIST.push(...menus);
}

/**
 * 落盘当前菜单树与 idSeed
 */
function persistMenuStore() {
  writePersistJson(MENU_PERSIST_FILE, {
    menus: MOCK_MENU_LIST,
    idSeed,
  });
}

/**
 * 从磁盘恢复菜单；无文件则按当前种子校正 idSeed
 * 须在首次读 MOCK_MENU_LIST 业务数据前调用
 */
export function ensureMenuStoreHydrated() {
  if (hydrated) return;
  hydrated = true;

  const saved = readPersistJson<{
    idSeed?: number;
    menus?: any[];
  }>(MENU_PERSIST_FILE);

  if (saved?.menus?.length) {
    replaceMockMenuList(structuredClone(saved.menus));
    idSeed =
      typeof saved.idSeed === 'number' && saved.idSeed > 0
        ? saved.idSeed
        : Math.max(idSeed, findMaxNumericId(MOCK_MENU_LIST));
  } else {
    // 无落盘：沿用 mock-data 种子，idSeed 不低于树内最大 id
    idSeed = Math.max(idSeed, findMaxNumericId(MOCK_MENU_LIST));
  }

  // 落盘菜单可能早于新增种子：补齐打印模板菜单
  ensureSystemPrintTemplateMenuSeed();
  ensureMiniappNavigationMenuSeed();
  ensureMiniappUsersMenuSeed();
  ensureSystemWorkflowMenuSeed();
  ensureWorkflowRuntimeMenuSeed();
  ensureAgreePreviewButtonSeed();
  hideLegacyPrintDesignMenu();
  fixPrintDesignMenuComponent();
}

/** 兼容已有落盘菜单，保留已存在入口的人工配置。 */
function ensureMiniappNavigationMenuSeed() {
  const system = MOCK_MENU_LIST.find((menu) => String(menu.id) === '2');
  if (!system?.children) return;
  let page = system.children.find(
    (menu: any) => menu.name === 'SystemMiniappNavigation',
  );
  let changed = false;
  if (!page) {
    page = {
      id: 210,
      pid: system.id,
      path: 'miniapp-navigation',
      name: 'SystemMiniappNavigation',
      authCode: 'System:MiniappNavigation:List',
      status: 1,
      type: 'menu',
      meta: { icon: 'mdi:cellphone-cog', title: '小程序导航' },
      component: '/system/miniapp-navigation/index',
      children: [],
    };
    system.children.push(page);
    changed = true;
  }
  if (
    ensureMenuButtons(page, [
      {
        id: 21_001,
        name: 'SystemMiniappNavigationEdit',
        authCode: 'System:MiniappNavigation:Edit',
        title: '发布导航',
      },
    ])
  )
    changed = true;
  if (changed) persistMenuStore();
}

// 新页面和按钮进入现有菜单权限体系；不会把小程序角色当作 PC 管理权限。
function ensureMiniappUsersMenuSeed() {
  const system = MOCK_MENU_LIST.find((menu) => String(menu.id) === '2');
  if (!system?.children) return;
  let page = system.children.find(
    (menu: any) => menu.name === 'SystemMiniappUsers',
  );
  let changed = false;
  if (!page) {
    page = {
      id: 211,
      pid: system.id,
      path: 'miniapp-users',
      name: 'SystemMiniappUsers',
      authCode: 'System:MiniappUser:List',
      status: 1,
      type: 'menu',
      meta: { icon: 'mdi:account-group', title: '小程序用户' },
      component: '/system/miniapp-users/index',
      children: [],
    };
    system.children.push(page);
    changed = true;
  }
  if (
    ensureMenuButtons(page, [
      {
        id: 21_101,
        name: 'SystemMiniappUserEditRole',
        authCode: 'System:MiniappUser:EditRole',
        title: '分配小程序角色',
      },
    ])
  )
    changed = true;
  if (changed) persistMenuStore();
}

function ensureWorkflowRuntimeMenuSeed() {
  const seeds = [
    {
      id: 9100,
      pid: 0,
      path: '/workflow',
      name: 'WorkflowTasks',
      authCode: WORKFLOW_AUTH.use,
      status: 1,
      type: 'menu',
      meta: {
        icon: 'mdi:clipboard-check-outline',
        title: '流程办理',
        order: 80,
      },
      component: '/workflow/index',
      children: [],
    },
    {
      id: 9101,
      pid: 0,
      path: '/workflow/instances/:id',
      name: 'WorkflowInstance',
      authCode: WORKFLOW_AUTH.use,
      status: 1,
      type: 'menu',
      meta: {
        hideInMenu: true,
        activePath: '/workflow',
        title: '流程办理详情',
      },
      component: '/workflow/detail',
    },
  ];
  let changed = false;
  for (const seed of seeds) {
    if (!MOCK_MENU_LIST.some((m) => m.name === seed.name)) {
      MOCK_MENU_LIST.push(seed);
      changed = true;
    }
  }
  const tasks = MOCK_MENU_LIST.find((m) => m.name === 'WorkflowTasks');
  if (
    ensureMenuButtons(tasks, [
      {
        id: 91_001,
        name: 'WorkflowStart',
        authCode: WORKFLOW_AUTH.start,
        title: '发起流程',
      },
    ])
  )
    changed = true;
  if (changed) persistMenuStore();
}

/** 在父菜单下补齐按钮权限（按 name 去重，兼容旧落盘） */
function ensureMenuButtons(
  parent: any,
  buttons: Array<{ authCode: string; id: number; name: string; title: string }>,
) {
  if (!parent) return false;
  parent.children ||= [];
  let changed = false;
  for (const button of buttons) {
    if (parent.children.some((c: any) => c.name === button.name)) continue;
    parent.children.push({
      id: button.id,
      pid: parent.id,
      name: button.name,
      status: 1,
      type: 'button',
      authCode: button.authCode,
      meta: { title: button.title },
    });
    changed = true;
  }
  return changed;
}

/** 补齐已有落盘菜单中的流程设计入口，保留用户修改过的菜单配置。 */
function ensureSystemWorkflowMenuSeed() {
  const system = MOCK_MENU_LIST.find((m) => String(m.id) === '2');
  if (!system?.children) return;
  const seeds = [
    {
      id: 209,
      pid: 2,
      path: 'workflow',
      name: 'SystemWorkflow',
      authCode: WORKFLOW_AUTH.manage,
      status: 1,
      type: 'menu',
      meta: { icon: 'mdi:vector-polyline', title: '流程设计' },
      component: '/system/workflow/list',
      children: [],
    },
    {
      id: 2091,
      pid: 2,
      path: 'workflow/edit/:id',
      name: 'SystemWorkflowEdit',
      authCode: WORKFLOW_AUTH.manage,
      status: 1,
      type: 'menu',
      meta: {
        hideInMenu: true,
        activePath: '/system/workflow',
        title: '流程设计器',
      },
      component: '/system/workflow/edit',
    },
    {
      id: 2092,
      pid: 2,
      path: 'workflow/monitor',
      name: 'SystemWorkflowMonitor',
      authCode: WORKFLOW_AUTH.monitor,
      status: 1,
      type: 'menu',
      meta: { icon: 'mdi:monitor-dashboard', title: '流程监控' },
      component: '/system/workflow/monitor',
    },
    {
      id: 2093,
      pid: 2,
      path: 'workflow/buttons',
      name: 'SystemWorkflowButtons',
      authCode: WORKFLOW_AUTH.manage,
      status: 1,
      type: 'menu',
      meta: { icon: 'mdi:gesture-tap-button', title: '按钮管理' },
      component: '/system/workflow-button/list',
    },
  ];
  let changed = false;
  for (const seed of seeds) {
    if (!system.children.some((m: any) => m.name === seed.name)) {
      system.children.push(seed);
      changed = true;
    }
  }
  const listMenu = system.children.find(
    (m: any) => m.name === 'SystemWorkflow',
  );
  if (
    ensureMenuButtons(listMenu, [
      {
        id: 20_901,
        name: 'SystemWorkflowCreate',
        authCode: WORKFLOW_AUTH.create,
        title: '新建流程',
      },
      {
        id: 20_902,
        name: 'SystemWorkflowCopy',
        authCode: WORKFLOW_AUTH.copy,
        title: '复制流程',
      },
      {
        id: 20_903,
        name: 'SystemWorkflowPublish',
        authCode: WORKFLOW_AUTH.publish,
        title: '发布流程',
      },
      {
        id: 20_904,
        name: 'SystemWorkflowVersion',
        authCode: WORKFLOW_AUTH.version,
        title: '新建版本',
      },
      {
        id: 20_905,
        name: 'SystemWorkflowDisable',
        authCode: WORKFLOW_AUTH.disable,
        title: '停用流程',
      },
      {
        id: 20_906,
        name: 'SystemWorkflowDelete',
        authCode: WORKFLOW_AUTH.delete,
        title: '删除草稿',
      },
    ])
  )
    changed = true;
  if (changed) persistMenuStore();
}

/**
 * 系统管理下补齐「打印模板」菜单
 */
function ensureSystemPrintTemplateMenuSeed() {
  const system = MOCK_MENU_LIST.find((m) => String(m.id) === '2');
  if (!system?.children) return;
  const exists = system.children.some((c: any) => String(c.id) === '208');
  if (exists) return;
  const fcEditIdx = system.children.findIndex(
    (c: any) => String(c.id) === '2071',
  );
  const seeds = [
    {
      id: 208,
      pid: 2,
      path: 'print-template',
      name: 'SystemPrintTemplate',
      authCode: 'System:PrintTemplate:List',
      status: 1,
      type: 'menu',
      meta: {
        icon: 'mdi:printer-settings',
        title: 'system.printTemplate.title',
      },
      component: '/system/print-template/list',
    },
    {
      id: 2081,
      pid: 2,
      path: 'print-template/edit/:id',
      name: 'SystemPrintTemplateEdit',
      authCode: 'System:PrintTemplate:List',
      status: 1,
      type: 'menu',
      meta: {
        hideInMenu: true,
        activePath: '/system/print-template',
        title: 'system.printTemplate.editTitle',
      },
      component: '/system/print-template/edit',
    },
  ];
  if (fcEditIdx === -1) {
    system.children.push(...seeds);
  } else {
    system.children.splice(fcEditIdx + 1, 0, ...seeds);
  }
  persistMenuStore();
}

/** 协议录入/律师审核菜单下补齐附件预览按钮权限（旧落盘可能缺失） */
function ensureAgreePreviewButtonSeed() {
  const seeds: Record<string, any[]> = {
    '701': [
      {
        id: 70_106,
        pid: 701,
        name: 'AgreeEntryPreview1',
        status: 1,
        type: 'button',
        authCode: 'Agree:preview1',
        meta: { title: '附件一预览' },
      },
      {
        id: 70_107,
        pid: 701,
        name: 'AgreeEntryPreview2',
        status: 1,
        type: 'button',
        authCode: 'Agree:preview2',
        meta: { title: '附件二预览' },
      },
    ],
    '702': [
      {
        id: 70_203,
        pid: 702,
        name: 'AgreeLawyerRejectRecord',
        status: 1,
        type: 'button',
        authCode: 'Agree:rejectRecord',
        meta: { title: '驳回记录' },
      },
      {
        id: 70_204,
        pid: 702,
        name: 'AgreeLawyerPreview1',
        status: 1,
        type: 'button',
        authCode: 'Agree:preview1',
        meta: { title: '附件一预览' },
      },
      {
        id: 70_205,
        pid: 702,
        name: 'AgreeLawyerPreview2',
        status: 1,
        type: 'button',
        authCode: 'Agree:preview2',
        meta: { title: '附件二预览' },
      },
      {
        id: 70_206,
        pid: 702,
        name: 'AgreeLawyerTicket1',
        status: 1,
        type: 'button',
        authCode: 'Agree:ticket1',
        meta: { title: '房票附件一' },
      },
      {
        id: 70_207,
        pid: 702,
        name: 'AgreeLawyerTicket2',
        status: 1,
        type: 'button',
        authCode: 'Agree:ticket2',
        meta: { title: '房票附件二' },
      },
    ],
  };

  let changed = false;
  const eAgree = MOCK_MENU_LIST.find((m) => String(m.id) === '7');
  if (!eAgree?.children) return;

  for (const menuId of ['701', '702']) {
    const menu = eAgree.children.find((c: any) => String(c.id) === menuId);
    if (!menu) continue;
    if (!menu.children) menu.children = [];
    for (const seed of seeds[menuId] || []) {
      const exists = menu.children.some(
        (c: any) =>
          String(c.id) === String(seed.id) ||
          String(c.authCode) === String(seed.authCode),
      );
      if (!exists) {
        menu.children.push({ ...seed });
        changed = true;
      }
    }
  }
  if (changed) persistMenuStore();
}

/**
 * 隐藏电子协议下旧的打印设计入口（已迁至系统管理）
 */
function hideLegacyPrintDesignMenu() {
  const eAgree = MOCK_MENU_LIST.find((m) => String(m.id) === '7');
  const node = eAgree?.children?.find((c: any) => String(c.id) === '703');
  if (!node) return;
  let changed = false;
  if (node.status !== 0) {
    node.status = 0;
    changed = true;
  }
  node.meta = { ...node.meta, hideInMenu: true };
  if (changed) persistMenuStore();
}

/**
 * 已存在的打印设计菜单若 component 路径过旧，纠正为 index 形式
 */
function fixPrintDesignMenuComponent() {
  const eAgree = MOCK_MENU_LIST.find((m) => String(m.id) === '7');
  const node = eAgree?.children?.find((c: any) => String(c.id) === '703');
  if (!node) return;
  const want = '/biz/agreement/print/designer/index';
  if (String(node.component || '').trim() === want) return;
  node.component = want;
  persistMenuStore();
}

// 模块加载即尝试恢复（create/update/delete 入口会 import 本文件）
ensureMenuStoreHydrated();

/**
 * 在树中查找节点
 * @param id 菜单 ID
 * @param list 当前层级列表
 */
export function findMenuNode(
  id: number | string,
  list: any[] = MOCK_MENU_LIST,
): any | null {
  ensureMenuStoreHydrated();
  const target = String(id);
  for (const item of list) {
    if (String(item.id) === target) {
      return item;
    }
    if (item.children?.length) {
      const found = findMenuNode(id, item.children);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 从树中卸下节点（不销毁，返回节点本身）
 * @param id 菜单 ID
 * @param list 当前层级列表
 */
function detachMenuNode(
  id: number | string,
  list: any[] = MOCK_MENU_LIST,
): any | null {
  const target = String(id);
  const index = list.findIndex((item) => String(item.id) === target);
  if (index !== -1) {
    return list.splice(index, 1)[0] ?? null;
  }
  for (const item of list) {
    if (item.children?.length) {
      const found = detachMenuNode(id, item.children);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 在树中删除节点并落盘
 * @param id 菜单 ID
 * @param list 当前层级列表
 */
export function removeMenuNode(
  id: number | string,
  list: any[] = MOCK_MENU_LIST,
): boolean {
  ensureMenuStoreHydrated();
  const existing = findMenuNode(id, list);
  if (existing?.meta?.workflowFamilyId) {
    existing.status = 0;
    persistMenuStore();
    return true;
  }
  const ok = !!detachMenuNode(id, list);
  if (ok) persistMenuStore();
  return ok;
}

/**
 * 校验可导航菜单是否具备合法 path
 * @param data 表单数据
 */
function assertNavigablePath(data: Record<string, any>) {
  const type = data.type || 'menu';
  if (type === 'button') {
    return;
  }
  const path = typeof data.path === 'string' ? data.path.trim() : '';
  if (!path) {
    throw new Error('路由地址不能为空（目录/菜单/内嵌/外链均需填写）');
  }
}

/**
 * 子菜单 path 相对化：父级 /demo + 子级 /demo/test → test
 * @param path 原始 path
 * @param parentPath 父级 path
 */
function normalizeChildPath(path: string, parentPath?: string) {
  if (!parentPath || !path.startsWith('/')) {
    return path;
  }
  const prefix = `${parentPath.replace(/\/$/, '')}/`;
  if (path.startsWith(prefix)) {
    return path.slice(prefix.length);
  }
  return path;
}

/**
 * 将节点挂到指定父级（无 pid 则挂根）
 * @param node 菜单节点
 * @param pid 父级 ID
 */
function attachMenuNode(node: any, pid?: null | number | string) {
  if (pid !== undefined && pid !== null && pid !== '') {
    const parent = findMenuNode(pid);
    if (!parent) {
      throw new Error('上级菜单不存在');
    }
    if (String(parent.id) === String(node.id)) {
      throw new Error('不能将菜单设置为自己的下级');
    }
    parent.children = parent.children || [];
    node.pid = parent.id;
    if (typeof node.path === 'string' && parent.path) {
      node.path = normalizeChildPath(node.path, String(parent.path));
    }
    parent.children.push(node);
    return node;
  }
  delete node.pid;
  MOCK_MENU_LIST.push(node);
  return node;
}

/**
 * 新增菜单节点并落盘
 * @param data 表单数据（可含 pid）
 */
export function createMenuNode(data: Record<string, any>) {
  ensureMenuStoreHydrated();
  assertNavigablePath(data);
  const id = ++idSeed;
  const node = {
    ...data,
    id,
    path: typeof data.path === 'string' ? data.path.trim() : data.path,
    component:
      typeof data.component === 'string'
        ? data.component.trim()
        : data.component,
    status: data.status ?? 1,
    children: data.children || [],
  };
  const attached = attachMenuNode(node, data.pid);
  persistMenuStore();
  return attached;
}

/**
 * 更新菜单节点并落盘（支持修改上级 pid 并重新挂载）
 * @param id 菜单 ID
 * @param data 表单数据
 */
export function updateMenuNode(id: number | string, data: Record<string, any>) {
  ensureMenuStoreHydrated();
  const existing = findMenuNode(id);
  if (!existing) {
    return null;
  }

  const nextPid =
    data.pid === undefined ? (existing.pid ?? undefined) : data.pid;
  const pidChanged = String(nextPid ?? '') !== String(existing.pid ?? '');

  const next = {
    ...data,
    path:
      typeof data.path === 'string'
        ? data.path.trim()
        : (data.path ?? existing.path),
    component:
      typeof data.component === 'string'
        ? data.component.trim()
        : (data.component ?? existing.component),
    type: data.type ?? existing.type,
  };
  assertNavigablePath({ ...existing, ...next });

  if (pidChanged) {
    const node = detachMenuNode(id);
    if (!node) {
      return null;
    }
    Object.assign(node, next, {
      id: node.id,
      children: node.children,
    });
    const attached = attachMenuNode(node, nextPid);
    persistMenuStore();
    return attached;
  }

  Object.assign(existing, next, {
    id: existing.id,
    children: existing.children,
    pid: existing.pid,
  });
  persistMenuStore();
  return existing;
}

/** Drag a navigable menu and persist its new parent and sibling order. */
export function moveMenuNode(
  id: number | string,
  targetId: number | string,
  position: 'after' | 'before' | 'inner',
) {
  ensureMenuStoreHydrated();
  const source = findMenuNode(id);
  const target = findMenuNode(targetId);
  if (
    !source ||
    !target ||
    source.type === 'button' ||
    target.type === 'button'
  )
    throw new Error('只能拖动菜单或目录');
  if (String(id) === String(targetId)) throw new Error('不能将菜单拖到自身');
  if (position === 'inner' && target.type !== 'catalog')
    throw new Error('只能放入分组目录');
  const contains = (node: any, wanted: string): boolean =>
    (node.children || []).some(
      (child: any) => String(child.id) === wanted || contains(child, wanted),
    );
  if (contains(source, String(targetId)))
    throw new Error('不能将菜单拖到自己的下级');

  function locate(
    idToFind: string,
    list: any[] = MOCK_MENU_LIST,
    parent?: any,
    parentPath = '',
  ):
    | undefined
    | { fullPath: string; index: number; list: any[]; parent?: any } {
    for (let index = 0; index < list.length; index++) {
      const node = list[index];
      const path = String(node.path || '');
      const fullPath = path.startsWith('/')
        ? path
        : `${parentPath.replace(/\/$/, '')}/${path}`;
      if (String(node.id) === idToFind)
        return { index, list, parent, fullPath };
      const found = locate(idToFind, node.children || [], node, fullPath);
      if (found) return found;
    }
    return undefined;
  }
  const sourceLocation = locate(String(id));
  if (!sourceLocation) throw new Error('菜单不存在，请刷新后重试');
  const plannedParent =
    position === 'inner' ? target : locate(String(targetId))?.parent;
  if (
    source.meta?.workflowFamilyId &&
    plannedParent &&
    plannedParent.type !== 'catalog'
  )
    throw new Error('流程菜单只能放在根目录或分组目录下');
  const originalPath = sourceLocation.fullPath;
  sourceLocation.list.splice(sourceLocation.index, 1);
  const targetLocation = locate(String(targetId));
  if (!targetLocation) throw new Error('目标菜单不存在，请刷新后重试');
  const destination =
    position === 'inner' ? (target.children ||= []) : targetLocation.list;
  const index =
    position === 'inner'
      ? destination.length
      : targetLocation.index + (position === 'after' ? 1 : 0);
  destination.splice(index, 0, source);
  const parent = position === 'inner' ? target : targetLocation.parent;
  if (parent) source.pid = parent.id;
  else delete source.pid;
  // Preserve the route when moving a formerly relative child to a new parent.
  source.path = originalPath;
  destination.forEach((node: any, order: number) => {
    node.meta ||= {};
    node.meta.order = order * 10;
  });
  persistMenuStore();
  return source;
}

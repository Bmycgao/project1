/**
 * RBAC 内存存储：角色权限 + 用户绑角色
 * 登录后 /auth/codes、/menu/all 均由此汇总，不再按用户名写死
 */
import {
  buildAccessMenus,
  getMenuIds,
  MOCK_MENU_LIST,
  type UserInfo,
} from './mock-data';
import { readPersistJson, writePersistJson } from './mock-persist';

/** 系统角色 */
export interface RbacRole {
  id: string;
  name: string;
  /** 角色编码（写入用户 JWT roles） */
  code: string;
  status: 0 | 1;
  /** 授权的菜单/按钮 ID */
  permissions: Array<number | string>;
  remark?: string;
  createTime: string;
}

/** 系统用户（同时可登录） */
export interface RbacUser {
  id: number | string;
  username: string;
  password: string;
  /** 列表展示名 */
  name: string;
  realName: string;
  roleIds: string[];
  /** 冗余：由 roleIds 推导，兼容 JWT */
  roles: string[];
  homePath?: string;
  status: 0 | 1;
  deptId?: string;
  remark?: string;
  createTime: string;
}

const formatterCN = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** 当前时间文案 */
function nowText() {
  return formatterCN.format(new Date());
}

/**
 * 按菜单 name 收集该节点及全部子孙 ID（含按钮，保留原始 id 类型）
 * @param names 菜单 name 列表
 */
function collectIdsByMenuNames(names: string[]): Array<number | string> {
  const want = new Set(names);
  const ids: Array<number | string> = [];

  /** 递归收集节点及子孙 */
  function collectAll(node: any) {
    ids.push(node.id);
    for (const child of node.children || []) {
      collectAll(child);
    }
  }

  /** 在树中查找目标 name */
  function walk(list: any[]) {
    for (const node of list) {
      if (want.has(node.name)) {
        collectAll(node);
      } else if (node.children?.length) {
        walk(node.children);
      }
    }
  }

  walk(MOCK_MENU_LIST);
  return [...new Set(ids)];
}

/** 看板相关菜单 ID */
const DASHBOARD_IDS = collectIdsByMenuNames([
  'Dashboard',
  'Analytics',
  'Workspace',
]);

/** 系统管理全树（超管/管理员） */
const SYSTEM_IDS = collectIdsByMenuNames(['System']);

/** 按 name 查找菜单 ID */
function findMenuIdByName(
  name: string,
  list: any[] = MOCK_MENU_LIST,
): null | number | string {
  for (const node of list) {
    if (node.name === name) return node.id;
    if (node.children?.length) {
      const found = findMenuIdByName(name, node.children);
      if (found !== null && found !== undefined) return found;
    }
  }
  return null;
}

const E_AGREE_CATALOG_ID = findMenuIdByName('EAgreement');
const E_QUERY_CATALOG_ID = findMenuIdByName('EQuery');
const DETAIL_MENU_ID = findMenuIdByName('BizAgreementDetail');

/**
 * 按 authCode 收集菜单/按钮 ID
 * @param codes 权限码列表
 */
function collectIdsByAuthCodes(codes: string[]): Array<number | string> {
  const want = new Set(codes);
  const ids: Array<number | string> = [];

  /** 递归扫描 */
  function walk(list: any[]) {
    for (const node of list) {
      if (node.authCode && want.has(String(node.authCode))) {
        ids.push(node.id);
      }
      if (node.children?.length) walk(node.children);
    }
  }

  walk(MOCK_MENU_LIST);
  return [...new Set(ids)];
}

/** 详情全部区域按钮 ID */
const ALL_MODULE_PERM_IDS = collectIdsByAuthCodes([
  'Agree:Module:basic',
  'Agree:Module:signing',
  'Agree:Module:signMaterial',
  'Agree:Module:certifyMaterial',
  'Agree:Module:compensation',
]);

/** 查询岗仅看基础信息 + 签约 */
const VIEWER_MODULE_PERM_IDS = collectIdsByAuthCodes([
  'Agree:Module:basic',
  'Agree:Module:signing',
]);

const ENTRY_PERM_IDS = [
  ...DASHBOARD_IDS,
  ...(E_AGREE_CATALOG_ID ? [E_AGREE_CATALOG_ID] : []),
  ...collectIdsByMenuNames(['EAgreeEntry', 'BizAgreementDetail']),
];

const LAWYER_PERM_IDS = [
  ...DASHBOARD_IDS,
  ...(E_AGREE_CATALOG_ID ? [E_AGREE_CATALOG_ID] : []),
  ...collectIdsByMenuNames(['EAgreeLawyerAudit', 'BizAgreementDetail']),
];

const VIEWER_PERM_IDS = [
  ...DASHBOARD_IDS,
  ...(E_QUERY_CATALOG_ID ? [E_QUERY_CATALOG_ID] : []),
  ...(E_AGREE_CATALOG_ID ? [E_AGREE_CATALOG_ID] : []),
  ...collectIdsByMenuNames(['EAgreePreview', 'EAgreeView']),
  // 详情菜单本体 + 仅部分区域（勿 collect 详情全部子按钮）
  ...(DETAIL_MENU_ID ? [DETAIL_MENU_ID] : []),
  ...VIEWER_MODULE_PERM_IDS,
];

const ALL_MENU_IDS = getMenuIds(MOCK_MENU_LIST);

/**
 * 规范化权限 ID（尽量与菜单树 id 类型一致，便于角色树回显勾选）
 * @param list 原始 permissions
 */
function normalizePermIds(list: unknown): Array<number | string> {
  return (Array.isArray(list) ? list : []).map((p) => {
    if (typeof p === 'number') return p;
    const s = String(p);
    const n = Number(s);
    return Number.isFinite(n) && String(n) === s ? n : s;
  });
}

/** 角色表 */
export let roleStore: RbacRole[] = [
  {
    id: 'R_SUPER',
    name: '超级管理员',
    code: 'super',
    status: 1,
    permissions: ALL_MENU_IDS,
    remark: '拥有全部菜单与按钮权限',
    createTime: nowText(),
  },
  {
    id: 'R_ADMIN',
    name: '系统管理员',
    code: 'admin',
    status: 1,
    permissions: [...new Set([...DASHBOARD_IDS, ...SYSTEM_IDS, ...ENTRY_PERM_IDS, ...LAWYER_PERM_IDS, ...VIEWER_PERM_IDS])],
    remark: '系统管理 + 协议相关',
    createTime: nowText(),
  },
  {
    id: 'R_ENTRY',
    name: '协议录入岗',
    code: 'entry',
    status: 1,
    permissions: [...new Set(ENTRY_PERM_IDS)],
    remark: '电子协议录入与提交复核',
    createTime: nowText(),
  },
  {
    id: 'R_LAWYER',
    name: '律师审核岗',
    code: 'lawyer',
    status: 1,
    permissions: [...new Set(LAWYER_PERM_IDS)],
    remark: '小组律师审核通过/驳回',
    createTime: nowText(),
  },
  {
    id: 'R_VIEWER',
    name: '信息查询岗',
    code: 'viewer',
    status: 1,
    permissions: [...new Set(VIEWER_PERM_IDS)],
    remark: '信息查询与协议预览',
    createTime: nowText(),
  },
  {
    id: 'R_USER',
    name: '普通用户',
    code: 'user',
    status: 1,
    permissions: [...new Set(DASHBOARD_IDS)],
    remark: '仅看板',
    createTime: nowText(),
  },
];

let roleIdSeed = 2000;
let userIdSeed = 100;

/**
 * 根据 roleIds 同步 roles 编码
 * @param roleIds 角色 ID 列表
 */
function roleCodesFromIds(roleIds: string[]): string[] {
  const set = new Set(roleIds.map(String));
  return roleStore
    .filter((r) => set.has(r.id) && r.status === 1)
    .map((r) => r.code);
}

/** 用户表（可登录） */
export let userStore: RbacUser[] = [
  {
    id: 0,
    username: 'vben',
    password: '123456',
    name: 'Vben',
    realName: 'Vben',
    roleIds: ['R_SUPER'],
    roles: ['super'],
    homePath: '/dashboard/workspace',
    status: 1,
    deptId: 'D1001',
    remark: '超级管理员演示账号',
    createTime: nowText(),
  },
  {
    id: 1,
    username: 'admin',
    password: '123456',
    name: 'Admin',
    realName: 'Admin',
    roleIds: ['R_ADMIN'],
    roles: ['admin'],
    homePath: '/dashboard/workspace',
    status: 1,
    deptId: 'D1001',
    remark: '系统管理员',
    createTime: nowText(),
  },
  {
    id: 2,
    username: 'jack',
    password: '123456',
    name: 'Jack',
    realName: 'Jack',
    roleIds: ['R_USER'],
    roles: ['user'],
    homePath: '/dashboard/analytics',
    status: 1,
    deptId: 'D1002',
    remark: '仅看板',
    createTime: nowText(),
  },
  {
    id: 3,
    username: 'entry',
    password: '123456',
    name: '录入员',
    realName: '录入员',
    roleIds: ['R_ENTRY'],
    roles: ['entry'],
    homePath: '/e-agree/entry',
    status: 1,
    deptId: 'D1002',
    remark: '协议录入岗',
    createTime: nowText(),
  },
  {
    id: 4,
    username: 'lawyer',
    password: '123456',
    name: '律师审核',
    realName: '律师审核',
    roleIds: ['R_LAWYER'],
    roles: ['lawyer'],
    homePath: '/e-agree/lawyer-audit',
    status: 1,
    deptId: 'D1002',
    remark: '律师审核岗',
    createTime: nowText(),
  },
  {
    id: 5,
    username: 'viewer',
    password: '123456',
    name: '查询员',
    realName: '查询员',
    roleIds: ['R_VIEWER'],
    roles: ['viewer'],
    homePath: '/e-query/preview',
    status: 1,
    deptId: 'D1002',
    remark: '信息查询岗',
    createTime: nowText(),
  },
];

const RBAC_PERSIST_FILE = 'rbac.json';

/**
 * 落盘角色与用户（配置台改动能跨重启保留）
 */
function persistRbacStore() {
  writePersistJson(RBAC_PERSIST_FILE, {
    roles: roleStore,
    users: userStore,
    roleIdSeed,
    userIdSeed,
  });
}

/**
 * 从磁盘恢复 RBAC
 */
function hydrateRbacFromDisk() {
  const saved = readPersistJson<{
    roleIdSeed?: number;
    roles?: RbacRole[];
    userIdSeed?: number;
    users?: RbacUser[];
  }>(RBAC_PERSIST_FILE);
  if (!saved?.roles?.length || !saved?.users?.length) return;
  roleStore = saved.roles;
  userStore = saved.users;
  if (typeof saved.roleIdSeed === 'number') roleIdSeed = saved.roleIdSeed;
  if (typeof saved.userIdSeed === 'number') userIdSeed = saved.userIdSeed;
}

hydrateRbacFromDisk();

/**
 * 给演示角色补上新增的「详情区域」按钮 ID（兼容已落盘的旧 rbac.json）
 * 只追加缺失项，不覆盖角色已取消的其它权限
 */
function ensureAgreeModulePermissions() {
  let changed = false;

  /**
   * @param roleId 角色
   * @param extraIds 应具备的模块按钮 ID
   */
  function merge(roleId: string, extraIds: Array<number | string>) {
    const role = roleStore.find((r) => r.id === roleId);
    if (!role) return;
    const set = new Set(role.permissions.map(String));
    for (const id of extraIds) {
      if (!set.has(String(id))) {
        role.permissions.push(id);
        changed = true;
      }
    }
  }

  merge('R_ENTRY', ALL_MODULE_PERM_IDS);
  merge('R_LAWYER', ALL_MODULE_PERM_IDS);
  merge('R_ADMIN', ALL_MODULE_PERM_IDS);
  merge('R_SUPER', ALL_MODULE_PERM_IDS);
  merge('R_VIEWER', VIEWER_MODULE_PERM_IDS);
  // 查询岗若曾 collect 过详情全部子节点，去掉材料/补偿区域（演示差异）
  const viewer = roleStore.find((r) => r.id === 'R_VIEWER');
  if (viewer) {
    const keep = new Set(VIEWER_MODULE_PERM_IDS.map(String));
    const deny = new Set(
      ALL_MODULE_PERM_IDS.map(String).filter((id) => !keep.has(id)),
    );
    const next = viewer.permissions.filter((p) => !deny.has(String(p)));
    if (next.length !== viewer.permissions.length) {
      viewer.permissions = next;
      changed = true;
    }
  }

  if (changed) persistRbacStore();
}

ensureAgreeModulePermissions();

/**
 * 按用户名查找可登录用户
 * @param username 登录名
 */
export function findRbacUserByUsername(username: string) {
  return userStore.find(
    (u) => u.username === username && u.status === 1,
  );
}

/**
 * 转为 JWT / 前端 UserInfo 结构
 * @param user RBAC 用户
 */
export function toAuthUserInfo(user: RbacUser): UserInfo {
  return {
    id: Number(user.id) || 0,
    password: user.password,
    realName: user.realName || user.name,
    roles: roleCodesFromIds(user.roleIds),
    username: user.username,
    homePath: user.homePath,
  };
}

/**
 * 汇总用户拥有的菜单/按钮 ID（多角色并集）
 * @param user 用户
 */
export function resolvePermissionIds(user: RbacUser): Set<string> {
  const roleIdSet = new Set((user.roleIds || []).map(String));
  const ids = new Set<string>();
  for (const role of roleStore) {
    if (!roleIdSet.has(role.id) || role.status !== 1) continue;
    for (const pid of role.permissions || []) {
      ids.add(String(pid));
    }
  }
  return ids;
}

/**
 * 是否超管（拥有全部菜单或 super 角色）
 * @param user 用户
 */
function isSuperUser(user: RbacUser) {
  return (user.roleIds || []).includes('R_SUPER')
    || roleCodesFromIds(user.roleIds).includes('super');
}

/**
 * 从菜单树收集 authCode
 * @param allowedIds 允许的菜单 ID；null 表示全部
 */
function collectAuthCodes(
  list: any[],
  allowedIds: Set<string> | null,
  out: Set<string>,
) {
  for (const node of list) {
    const id = String(node.id);
    if (!allowedIds || allowedIds.has(id)) {
      if (node.authCode) {
        out.add(String(node.authCode));
      }
    }
    if (node.children?.length) {
      // 超管走全部；普通用户仍递归，由子节点自己的 id 判断
      collectAuthCodes(node.children, allowedIds, out);
    }
  }
}

/**
 * 解析用户权限码（给 /auth/codes）
 * @param user 用户
 */
export function resolveAccessCodes(user: RbacUser): string[] {
  const codes = new Set<string>();
  if (isSuperUser(user)) {
    codes.add('Agree:*');
    collectAuthCodes(MOCK_MENU_LIST, null, codes);
    return [...codes];
  }
  const allowed = resolvePermissionIds(user);
  collectAuthCodes(MOCK_MENU_LIST, allowed, codes);
  return [...codes];
}

/**
 * 按角色 ID 解析权限码（配置预览用，不依赖具体用户）
 * @param roleId 角色 ID，如 R_ENTRY
 */
export function resolveAccessCodesByRoleId(roleId: string): string[] {
  const role = roleStore.find((r) => String(r.id) === String(roleId));
  if (!role || role.status !== 1) return [];

  const codes = new Set<string>();
  if (role.code === 'super' || role.id === 'R_SUPER') {
    codes.add('Agree:*');
    collectAuthCodes(MOCK_MENU_LIST, null, codes);
    return [...codes];
  }

  const allowed = new Set((role.permissions || []).map(String));
  collectAuthCodes(MOCK_MENU_LIST, allowed, codes);
  return [...codes];
}

/**
 * 按角色 ID 查角色（预览展示名）
 * @param roleId 角色 ID
 */
export function findRbacRoleById(roleId: string) {
  return roleStore.find((r) => String(r.id) === String(roleId)) || null;
}

/**
 * 新建菜单后自动写入角色 permissions，避免「菜单管理可见、侧栏被过滤」
 * 默认：超管 + 系统管理员；可再并入操作者当前角色
 * @param menuId 新菜单 ID
 * @param extraRoleIds 额外角色（如当前登录用户的 roleIds）
 */
export function grantNewMenuToDefaultRoles(
  menuId: number | string,
  extraRoleIds?: Array<number | string>,
) {
  const targets = new Set<string>([
    'R_SUPER',
    'R_ADMIN',
    ...(extraRoleIds || []).map(String),
  ]);
  const [normalizedId] = normalizePermIds([menuId]);
  let changed = false;

  for (const roleId of targets) {
    const role = roleStore.find((r) => String(r.id) === roleId);
    if (!role) continue;
    const set = new Set(role.permissions.map(String));
    if (set.has(String(normalizedId))) continue;
    role.permissions.push(normalizedId);
    changed = true;
  }

  if (changed) {
    persistRbacStore();
  }
  return changed;
}

/**
 * 把已授权节点的祖先目录 ID 一并补上（避免只勾按钮时丢父菜单）
 * @param allowedIds 原始权限 ID
 */
function expandWithAncestorIds(allowedIds: Set<string>): Set<string> {
  const expanded = new Set(allowedIds);

  /**
   * @param list 当前层
   * @param ancestors 祖先 id
   * @returns 本支是否命中权限
   */
  function walk(
    list: any[],
    ancestors: Array<number | string>,
  ): boolean {
    let branchHit = false;
    for (const node of list) {
      const id = String(node.id);
      const children: any[] = node.children || [];
      const childHit = children.length ? walk(children, [...ancestors, node.id]) : false;
      const selfHit = allowedIds.has(id);
      if (selfHit || childHit) {
        branchHit = true;
        expanded.add(id);
        for (const a of ancestors) {
          expanded.add(String(a));
        }
      }
    }
    return branchHit;
  }

  walk(MOCK_MENU_LIST, []);
  return expanded;
}

/**
 * 按权限 ID 过滤菜单树
 * - 菜单：自身在权限中，或有可展示的子菜单，或有任一按钮权限 → 保留
 * - 按钮：仅当按钮 ID 在权限中才保留（可单独取消「导出」）
 * @param list 菜单树
 * @param allowedIds 允许 ID
 */
function filterMenusByAllowedIds(list: any[], allowedIds: Set<string>): any[] {
  const result: any[] = [];
  for (const node of list) {
    const rawChildren: any[] = node.children || [];
    const buttonChildren = rawChildren.filter((c) => c.type === 'button');
    const nonButtonChildren = rawChildren.filter((c) => c.type !== 'button');
    const filteredChildren = filterMenusByAllowedIds(
      nonButtonChildren,
      allowedIds,
    );
    // 只要勾了任意按钮，就应保留该菜单入口
    const keptButtons = buttonChildren.filter((b) =>
      allowedIds.has(String(b.id)),
    );
    const selfAllowed = allowedIds.has(String(node.id));
    const keepNode =
      selfAllowed || filteredChildren.length > 0 || keptButtons.length > 0;
    if (!keepNode) {
      continue;
    }
    result.push({
      ...node,
      children: [...filteredChildren, ...keptButtons],
    });
  }
  return result;
}

/**
 * 解析用户侧栏菜单（给 /menu/all）
 * @param user 用户
 */
export function resolveAccessMenus(user: RbacUser) {
  if (isSuperUser(user)) {
    return buildAccessMenus(MOCK_MENU_LIST);
  }
  const allowed = expandWithAncestorIds(resolvePermissionIds(user));
  const filtered = filterMenusByAllowedIds(MOCK_MENU_LIST, allowed);
  return buildAccessMenus(filtered);
}

/** —— 角色 CRUD —— */

/**
 * 查询角色列表（内存）
 * @param query 筛选
 */
export function queryRoles(query: Record<string, any> = {}) {
  let list = structuredClone(roleStore);
  if (query.name) {
    list = list.filter((item) =>
      String(item.name).includes(String(query.name)),
    );
  }
  if (query.id) {
    list = list.filter((item) =>
      String(item.id).toLowerCase().includes(String(query.id).toLowerCase()),
    );
  }
  if (query.remark) {
    list = list.filter((item) =>
      String(item.remark || '').includes(String(query.remark)),
    );
  }
  if (['0', '1'].includes(String(query.status))) {
    list = list.filter((item) => item.status === Number(query.status));
  }
  return list;
}

/**
 * 创建角色
 * @param body 表单
 */
export function createRoleRecord(body: Record<string, any>) {
  const id = String(body.id || `R${roleIdSeed++}`);
  const row: RbacRole = {
    id,
    name: String(body.name || '未命名角色'),
    code: String(body.code || id.toLowerCase()),
    status: (body.status === 0 ? 0 : 1) as 0 | 1,
    permissions: normalizePermIds(body.permissions),
    remark: body.remark,
    createTime: nowText(),
  };
  roleStore.unshift(row);
  persistRbacStore();
  return structuredClone(row);
}

/**
 * 更新角色
 * @param id 角色 ID
 * @param body 表单
 */
export function updateRoleRecord(id: string, body: Record<string, any>) {
  const row = roleStore.find((r) => String(r.id) === String(id));
  if (!row) {
    throw new Error('角色不存在');
  }
  if (body.name !== undefined) row.name = String(body.name);
  if (body.code !== undefined) row.code = String(body.code);
  if (body.status !== undefined) row.status = body.status === 0 ? 0 : 1;
  if (body.permissions !== undefined) {
    row.permissions = normalizePermIds(body.permissions);
  }
  if (body.remark !== undefined) row.remark = body.remark;
  // 同步已绑该角色用户的 roles 字段
  for (const u of userStore) {
    if (u.roleIds.map(String).includes(String(id))) {
      u.roles = roleCodesFromIds(u.roleIds);
    }
  }
  persistRbacStore();
  return structuredClone(row);
}

/**
 * 删除角色
 * @param id 角色 ID
 */
export function removeRoleRecord(id: string) {
  const before = roleStore.length;
  roleStore = roleStore.filter((r) => String(r.id) !== String(id));
  for (const u of userStore) {
    u.roleIds = u.roleIds.filter((rid) => String(rid) !== String(id));
    u.roles = roleCodesFromIds(u.roleIds);
  }
  if (roleStore.length < before) {
    persistRbacStore();
  }
  return roleStore.length < before;
}

/** —— 用户 CRUD —— */

/**
 * 查询用户列表
 * @param query 筛选
 */
export function queryUsers(query: Record<string, any> = {}) {
  let list = userStore.map((u) => publicUser(u));
  if (query.name) {
    list = list.filter(
      (item) =>
        String(item.name).includes(String(query.name))
        || String(item.username).includes(String(query.name)),
    );
  }
  if (query.username) {
    list = list.filter((item) =>
      String(item.username).includes(String(query.username)),
    );
  }
  if (query.id) {
    list = list.filter((item) =>
      String(item.id).toLowerCase().includes(String(query.id).toLowerCase()),
    );
  }
  if (query.remark) {
    list = list.filter((item) =>
      String(item.remark || '').includes(String(query.remark)),
    );
  }
  if (['0', '1'].includes(String(query.status))) {
    list = list.filter((item) => item.status === Number(query.status));
  }
  if (query.deptId) {
    list = list.filter((item) => String(item.deptId) === String(query.deptId));
  }
  return list;
}

/**
 * 对外用户对象（无密码，带角色名）
 * @param user 用户
 */
export function publicUser(user: RbacUser) {
  const roleIdSet = new Set(user.roleIds.map(String));
  const roleNames = roleStore
    .filter((r) => roleIdSet.has(r.id))
    .map((r) => r.name);
  const { password: _p, ...rest } = user;
  return {
    ...rest,
    roleNames,
    roles: roleCodesFromIds(user.roleIds),
  };
}

/**
 * 创建用户
 * @param body 表单
 */
export function createUserRecord(body: Record<string, any>) {
  const username = String(body.username || '').trim();
  if (!username) {
    throw new Error('登录账号不能为空');
  }
  if (userStore.some((u) => u.username === username)) {
    throw new Error('登录账号已存在');
  }
  const roleIds = (body.roleIds || []).map(String);
  const id = body.id ?? userIdSeed++;
  const row: RbacUser = {
    id,
    username,
    password: String(body.password || '123456'),
    name: String(body.name || body.realName || username),
    realName: String(body.realName || body.name || username),
    roleIds,
    roles: roleCodesFromIds(roleIds),
    homePath: body.homePath || '/dashboard/analytics',
    status: (body.status === 0 ? 0 : 1) as 0 | 1,
    deptId: body.deptId ? String(body.deptId) : undefined,
    remark: body.remark,
    createTime: nowText(),
  };
  userStore.unshift(row);
  persistRbacStore();
  return publicUser(row);
}

/**
 * 更新用户
 * @param id 用户 ID
 * @param body 表单
 */
export function updateUserRecord(id: string, body: Record<string, any>) {
  const row = userStore.find((u) => String(u.id) === String(id));
  if (!row) {
    throw new Error('用户不存在');
  }
  if (body.username !== undefined) {
    const next = String(body.username).trim();
    if (
      next
      && userStore.some(
        (u) => u.username === next && String(u.id) !== String(id),
      )
    ) {
      throw new Error('登录账号已存在');
    }
    if (next) row.username = next;
  }
  if (body.password) {
    row.password = String(body.password);
  }
  if (body.name !== undefined) row.name = String(body.name);
  if (body.realName !== undefined) row.realName = String(body.realName);
  if (body.roleIds !== undefined) {
    row.roleIds = (body.roleIds || []).map(String);
    row.roles = roleCodesFromIds(row.roleIds);
  }
  if (body.status !== undefined) row.status = body.status === 0 ? 0 : 1;
  if (body.deptId !== undefined) {
    row.deptId = body.deptId ? String(body.deptId) : undefined;
  }
  if (body.remark !== undefined) row.remark = body.remark;
  if (body.homePath !== undefined) row.homePath = body.homePath;
  persistRbacStore();
  return publicUser(row);
}

/**
 * 删除用户
 * @param id 用户 ID
 */
export function removeUserRecord(id: string) {
  const before = userStore.length;
  userStore = userStore.filter((u) => String(u.id) !== String(id));
  if (userStore.length < before) {
    persistRbacStore();
  }
  return userStore.length < before;
}

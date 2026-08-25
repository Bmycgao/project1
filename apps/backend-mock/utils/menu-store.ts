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
    return;
  }

  // 无落盘：沿用 mock-data 种子，idSeed 不低于树内最大 id
  idSeed = Math.max(idSeed, findMaxNumericId(MOCK_MENU_LIST));
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

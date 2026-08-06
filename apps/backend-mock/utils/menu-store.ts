/**
 * 菜单树内存操作：增删改直接改 MOCK_MENU_LIST，侧栏与管理页同源
 */
import { MOCK_MENU_LIST } from './mock-data';

let idSeed = 10_000;

/**
 * 在树中查找节点
 * @param id 菜单 ID
 * @param list 当前层级列表
 */
export function findMenuNode(
  id: string | number,
  list: any[] = MOCK_MENU_LIST,
): any | null {
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
  id: string | number,
  list: any[] = MOCK_MENU_LIST,
): any | null {
  const target = String(id);
  const index = list.findIndex((item) => String(item.id) === target);
  if (index >= 0) {
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
 * 在树中删除节点
 * @param id 菜单 ID
 * @param list 当前层级列表
 */
export function removeMenuNode(
  id: string | number,
  list: any[] = MOCK_MENU_LIST,
): boolean {
  return !!detachMenuNode(id, list);
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
function attachMenuNode(node: any, pid?: string | number | null) {
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
 * 新增菜单节点
 * @param data 表单数据（可含 pid）
 */
export function createMenuNode(data: Record<string, any>) {
  assertNavigablePath(data);
  const id = ++idSeed;
  const node = {
    ...data,
    id,
    path: typeof data.path === 'string' ? data.path.trim() : data.path,
    status: data.status ?? 1,
    children: data.children || [],
  };
  return attachMenuNode(node, data.pid);
}

/**
 * 更新菜单节点（支持修改上级 pid 并重新挂载）
 * @param id 菜单 ID
 * @param data 表单数据
 */
export function updateMenuNode(id: string | number, data: Record<string, any>) {
  const existing = findMenuNode(id);
  if (!existing) {
    return null;
  }

  const nextPid =
    data.pid !== undefined ? data.pid : (existing.pid ?? undefined);
  const pidChanged = String(nextPid ?? '') !== String(existing.pid ?? '');

  const next = {
    ...data,
    path:
      typeof data.path === 'string'
        ? data.path.trim()
        : (data.path ?? existing.path),
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
    return attachMenuNode(node, nextPid);
  }

  Object.assign(existing, next, {
    id: existing.id,
    children: existing.children,
    pid: existing.pid,
  });
  return existing;
}

import { requestClient } from '#/api/request';

/** 系统菜单相关类型与接口 */
export namespace SystemMenuApi {
  export const MenuTypes = [
    'catalog',
    'menu',
    'embedded',
    'link',
    'button',
  ] as const;

  export interface SystemMenu {
    [key: string]: any;
    authCode?: string;
    children?: SystemMenu[];
    component?: string;
    id: string;
    meta?: {
      icon?: string;
      keepAlive?: boolean;
      order?: number;
      title?: string;
      [key: string]: any;
    };
    name: string;
    path?: string;
    pid?: string;
    status?: 0 | 1;
    type: (typeof MenuTypes)[number];
  }
}

/**
 * 获取完整菜单树（含按钮权限节点）
 */
async function getMenuList() {
  return requestClient.get<SystemMenuApi.SystemMenu[]>('/system/menu/list');
}

/**
 * 校验菜单 name 是否已存在
 * @param name 菜单 name
 * @param id 编辑时排除自身 ID
 */
async function isMenuNameExists(name: string, id?: string) {
  return requestClient.get<boolean>('/system/menu/name-exists', {
    params: { id, name },
  });
}

/**
 * 校验菜单 path 是否已存在
 * @param path 路由 path
 * @param id 编辑时排除自身 ID
 */
async function isMenuPathExists(path: string, id?: string) {
  return requestClient.get<boolean>('/system/menu/path-exists', {
    params: { id, path },
  });
}

/**
 * 创建菜单
 * @param data 菜单表单数据
 */
async function createMenu(
  data: Omit<SystemMenuApi.SystemMenu, 'children' | 'id'>,
) {
  return requestClient.post('/system/menu', data);
}

/**
 * 更新菜单
 * @param id 菜单 ID
 * @param data 菜单表单数据
 */
async function updateMenu(
  id: string,
  data: Omit<SystemMenuApi.SystemMenu, 'children' | 'id'>,
) {
  return requestClient.put(`/system/menu/${id}`, data);
}

/**
 * 删除菜单
 * @param id 菜单 ID
 */
async function deleteMenu(id: string) {
  return requestClient.delete(`/system/menu/${id}`);
}

export {
  createMenu,
  deleteMenu,
  getMenuList,
  isMenuNameExists,
  isMenuPathExists,
  updateMenu,
};

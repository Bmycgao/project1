import type { Recordable } from '@vben/types';

import { requestClient } from '#/api/request';

/** 系统角色相关类型与接口 */
export namespace SystemRoleApi {
  export interface SystemRole {
    [key: string]: any;
    id: string;
    name: string;
    /** 授权的菜单/按钮 ID 列表 */
    permissions: string[];
    remark?: string;
    status: 0 | 1;
  }
}

/**
 * 分页查询角色列表
 * @param params 查询参数
 */
async function getRoleList(params: Recordable<any>) {
  return requestClient.get<{ items: SystemRoleApi.SystemRole[]; total: number }>(
    '/system/role/list',
    { params },
  );
}

/**
 * 创建角色（含菜单授权）
 * @param data 角色表单数据
 */
async function createRole(data: Omit<SystemRoleApi.SystemRole, 'id'>) {
  return requestClient.post('/system/role', data);
}

/**
 * 更新角色
 * @param id 角色 ID
 * @param data 角色表单数据
 */
async function updateRole(
  id: string,
  data: Partial<Omit<SystemRoleApi.SystemRole, 'id'>>,
) {
  return requestClient.put(`/system/role/${id}`, data);
}

/**
 * 删除角色
 * @param id 角色 ID
 */
async function deleteRole(id: string) {
  return requestClient.delete(`/system/role/${id}`);
}

export { createRole, deleteRole, getRoleList, updateRole };

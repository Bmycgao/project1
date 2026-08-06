import type { Recordable } from '@vben/types';

import { requestClient } from '#/api/request';

/** 系统用户相关类型与接口 */
export namespace SystemUserApi {
  export interface SystemUser {
    [key: string]: any;
    /** 部门 ID */
    deptId?: string;
    id: string;
    name: string;
    /** 角色权限菜单 ID 列表 */
    permissions?: string[];
    remark?: string;
    status: 0 | 1;
  }
}

/**
 * 分页查询用户列表
 * @param params 查询参数（含 page/pageSize/筛选条件）
 */
async function getUserList(params: Recordable<any>) {
  return requestClient.get<{ items: SystemUserApi.SystemUser[]; total: number }>(
    '/system/user/list',
    { params },
  );
}

/**
 * 创建用户
 * @param data 用户表单数据
 */
async function createUser(data: Omit<SystemUserApi.SystemUser, 'id'>) {
  return requestClient.post('/system/user', data);
}

/**
 * 更新用户
 * @param id 用户 ID
 * @param data 用户表单数据
 */
async function updateUser(
  id: string,
  data: Partial<Omit<SystemUserApi.SystemUser, 'id'>>,
) {
  return requestClient.put(`/system/user/${id}`, data);
}

/**
 * 删除用户
 * @param id 用户 ID
 */
async function deleteUser(id: string) {
  return requestClient.delete(`/system/user/${id}`);
}

export { createUser, deleteUser, getUserList, updateUser };

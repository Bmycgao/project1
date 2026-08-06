import { requestClient } from '#/api/request';

/** 系统部门相关类型与接口 */
export namespace SystemDeptApi {
  export interface SystemDept {
    [key: string]: any;
    children?: SystemDept[];
    id: string;
    name: string;
    pid?: string;
    remark?: string;
    status: 0 | 1;
  }
}

/**
 * 获取部门树列表
 */
async function getDeptList() {
  return requestClient.get<SystemDeptApi.SystemDept[]>('/system/dept/list');
}

/**
 * 创建部门
 * @param data 部门表单数据
 */
async function createDept(
  data: Omit<SystemDeptApi.SystemDept, 'children' | 'id'>,
) {
  return requestClient.post('/system/dept', data);
}

/**
 * 更新部门
 * @param id 部门 ID
 * @param data 部门表单数据
 */
async function updateDept(
  id: string,
  data: Omit<SystemDeptApi.SystemDept, 'children' | 'id'>,
) {
  return requestClient.put(`/system/dept/${id}`, data);
}

/**
 * 删除部门
 * @param id 部门 ID
 */
async function deleteDept(id: string) {
  return requestClient.delete(`/system/dept/${id}`);
}

export { createDept, deleteDept, getDeptList, updateDept };

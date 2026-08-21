import type { Recordable } from '@vben/types';

import { requestClient } from '#/api/request';

/** FormCreate 表单/表格模板 */
export namespace FcSchemaApi {
  export interface FcSchema {
    id: string;
    name: string;
    kind: 'form' | 'table';
    remark?: string;
    status: 0 | 1;
    rule: Record<string, any>[];
    option?: Record<string, unknown>;
    updatedAt?: string;
  }
}

/** 内置块默认模板 id（与 mock 种子一致） */
export const DEFAULT_FC_BINDINGS: Record<string, string> = {
  basic: 'FC_BASIC',
  population: 'FC_POPULATION',
  houses: 'FC_HOUSES',
  compensation: 'FC_COMPENSATION',
  rewards: 'FC_REWARDS',
};

/** 模块 key → fc-schema id */
export type FcBindingsMap = Record<string, string | undefined>;

/**
 * 拉取模板列表
 * @param params keyword / kind / status
 */
async function getFcSchemaList(params?: Recordable<any>) {
  return requestClient.get<FcSchemaApi.FcSchema[]>('/system/fc-schema/list', {
    params,
  });
}

/**
 * 拉取单个模板
 * @param id 模板 id
 */
async function getFcSchema(id: string) {
  return requestClient.get<FcSchemaApi.FcSchema>(`/system/fc-schema/${id}`);
}

/** 新建模板 */
async function createFcSchema(
  data: Omit<FcSchemaApi.FcSchema, 'id' | 'updatedAt'>,
) {
  return requestClient.post<FcSchemaApi.FcSchema>('/system/fc-schema', data);
}

/** 更新模板 */
async function updateFcSchema(id: string, data: Partial<FcSchemaApi.FcSchema>) {
  return requestClient.put<FcSchemaApi.FcSchema>(
    `/system/fc-schema/${id}`,
    data,
  );
}

/** 删除模板 */
async function deleteFcSchema(id: string) {
  return requestClient.delete(`/system/fc-schema/${id}`);
}

export {
  createFcSchema,
  deleteFcSchema,
  getFcSchema,
  getFcSchemaList,
  updateFcSchema,
};

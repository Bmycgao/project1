import type { Recordable } from '@vben/types';

import { requestClient } from '#/api/request';

/** 配置化列表 - 页面字段 Schema */
export namespace PageSchemaApi {
  export type ColumnType = 'text' | 'status' | 'tag';

  export interface Column {
    field: string;
    title: string;
    visible: boolean;
    width?: number;
    minWidth?: number;
    cellType?: ColumnType;
  }

  export interface QueryField {
    field: string;
    title: string;
    component: 'Input' | 'Select';
    options?: { label: string; value: string | number }[];
  }

  export interface PageSchema {
    id: string;
    name: string;
    title: string;
    remark?: string;
    status: 0 | 1;
    columns: Column[];
    queryFields: QueryField[];
    mockCount?: number;
    /** entity | template | scene */
    schemaKind?: 'entity' | 'scene' | 'template';
    columnTemplateId?: string;
    scene?: string;
    buttons?: { code: string; label: string; type?: string; group?: string }[];
    /** 场景数据范围：允许的状态值（后端可按 scene 或本字段过滤） */
    statusIn?: string[];
  }
}

/** 获取页面配置列表 */
async function getPageSchemaList(params?: Recordable<any>) {
  return requestClient.get<PageSchemaApi.PageSchema[]>(
    '/system/page-schema/list',
    { params },
  );
}

/** 获取单个页面配置 */
async function getPageSchema(id: string) {
  return requestClient.get<PageSchemaApi.PageSchema>(
    `/system/page-schema/${id}`,
  );
}

/** 创建页面配置 */
async function createPageSchema(
  data: Omit<PageSchemaApi.PageSchema, 'id'>,
) {
  return requestClient.post('/system/page-schema', data);
}

/** 更新页面配置 */
async function updatePageSchema(
  id: string,
  data: Partial<PageSchemaApi.PageSchema>,
) {
  return requestClient.put(`/system/page-schema/${id}`, data);
}

/** 删除页面配置 */
async function deletePageSchema(id: string) {
  return requestClient.delete(`/system/page-schema/${id}`);
}

/**
 * 按配置拉取动态列表数据
 * @param params 含 schemaId、分页与查询字段
 */
async function getDynamicDataList(params: Recordable<any>) {
  return requestClient.get<{ items: Recordable<any>[]; total: number }>(
    '/system/dynamic-data/list',
    { params },
  );
}

export {
  createPageSchema,
  deletePageSchema,
  getDynamicDataList,
  getPageSchema,
  getPageSchemaList,
  updatePageSchema,
};

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

  export interface ButtonBind {
    api?: string;
    method?: 'DELETE' | 'GET' | 'POST' | 'PUT';
    confirmText?: string;
    successMsg?: string;
    redirect?: string;
    showWhenStatusIn?: string[];
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
    buttons?: {
      code: string;
      label: string;
      type?: string;
      group?: string;
      /** 差异化操作绑定 */
      bind?: ButtonBind;
    }[];
    /** 场景数据范围：允许的状态值（后端可按 scene 或本字段过滤） */
    statusIn?: string[];
    /** 字段显隐/可编辑规则（通常配在列模板上，场景继承） */
    fieldRules?: {
      field: string;
      hidden?: boolean;
      visibleCodes?: string[];
      editableCodes?: string[];
      remark?: string;
      /** 展示格式：金额/日期等 */
      displayFormat?: {
        type?: 'date' | 'money' | 'text';
        datePattern?: 'YYYY-MM-DD' | 'YYYY年MM月DD日';
        thousandSeparator?: boolean;
        decimals?: number;
        prefix?: string;
      };
    }[];
    /**
     * 详情页挂载的业务模块（场景配置）
     * 未配置则详情默认挂载全部模块，再与角色 Agree:Module:* 求交
     */
  modules?: {
    key: string;
    enabled: boolean;
    /** 显示顺序，越小越靠前 */
    order?: number;
    /** 栅格占比 8/12/16/24 */
    span?: number;
  }[];
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

/** 配置历史摘要（列表用，不含完整 snapshot） */
export interface PageSchemaHistorySummary {
  versionId: string;
  schemaId: string;
  savedAt: string;
  title?: string;
  schemaKind?: string;
  buttonCount?: number;
  columnCount?: number;
}

/**
 * 拉取配置历史版本
 * @param id 配置 ID
 */
async function getPageSchemaHistory(id: string) {
  return requestClient.get<PageSchemaHistorySummary[]>(
    `/system/page-schema/${id}/history`,
  );
}

/**
 * 回滚到指定历史版本
 * @param id 配置 ID
 * @param versionId 版本 ID
 */
async function rollbackPageSchema(id: string, versionId: string) {
  return requestClient.post<PageSchemaApi.PageSchema>(
    `/system/page-schema/${id}/rollback`,
    { versionId },
  );
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
  getPageSchemaHistory,
  getPageSchemaList,
  rollbackPageSchema,
  updatePageSchema,
};

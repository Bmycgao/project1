import type { Recordable } from '@vben/types';

import { requestClient } from '#/api/request';

/** 配置化列表 - 页面字段 Schema */
export namespace PageSchemaApi {
  export type ColumnType = 'status' | 'tag' | 'text';

  export interface Column {
    field: string;
    title: string;
    visible: boolean;
    width?: number;
    minWidth?: number;
    cellType?: ColumnType;
    /** 显示顺序，越小越靠前 */
    order?: number;
  }

  export interface QueryField {
    field: string;
    title: string;
    component: 'Input' | 'Select';
    options?: { label: string; value: number | string }[];
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
      /** 差异化操作绑定 */
      bind?: ButtonBind;
      code: string;
      group?: string;
      label: string;
      type?: string;
    }[];
    /** 场景数据范围：允许的状态值（后端可按 scene 或本字段过滤） */
    statusIn?: string[];
    /** 字段显隐/可编辑规则（通常配在列模板上，场景继承） */
    fieldRules?: {
      /** 展示格式：金额/日期等 */
      displayFormat?: {
        datePattern?: 'YYYY-MM-DD' | 'YYYY年MM月DD日';
        decimals?: number;
        prefix?: string;
        thousandSeparator?: boolean;
        type?: 'date' | 'money' | 'text';
      };
      editableCodes?: string[];
      field: string;
      hidden?: boolean;
      remark?: string;
      visibleCodes?: string[];
    }[];
    /**
     * 详情页挂载的业务模块（场景配置）
     * 未配置则详情默认挂载全部模块，再与角色 Agree:Module:* 求交
     */
    modules?: {
      authCode?: string;
      custom?: boolean;
      desc?: string;
      enabled: boolean;
      key: string;
      label?: string;
      order?: number;
      span?: number;
      widgetKind?: 'form' | 'table';
    }[];
    /**
     * Epic 低代码表单 Schema（历史字段，读时忽略，新配置走 fcRules）
     */
    epicSchemas?: {
      [key: string]: Record<string, any> | undefined;
      basic?: Record<string, any>;
      population?: Record<string, any>;
    };
    /**
     * FormCreate 规则：详情每块一份（历史内嵌，新配置走 fcBindings）
     */
    fcRules?: {
      [moduleKey: string]: Record<string, any>[] | undefined;
    };
    /**
     * FormCreate 模板引用：moduleKey → fc-schema id
     */
    fcBindings?: {
      [moduleKey: string]: string | undefined;
    };
    /**
     * 模块内部字段/子块配置（场景级）
     * 5 块：basic / houses / compensation / rewards / population
     */
    moduleInner?: {
      /** 配置台新建的业务组件 */
      [key: string]: ModuleInnerBlock | undefined;
      basic?: ModuleInnerBlock;
      certifyMaterial?: ModuleInnerBlock;
      compensation?: ModuleInnerBlock;
      houses?: ModuleInnerBlock;
      material?: ModuleInnerBlock;
      population?: ModuleInnerBlock;
      rewards?: ModuleInnerBlock;
      /** 以下为旧字段，读时忽略 */
      rightHolders?: ModuleInnerBlock;
      signing?: ModuleInnerBlock;
      signMaterial?: ModuleInnerBlock;
    };
  }

  /** 模块内部配置块 */
  export interface ModuleInnerBlock {
    sections: {
      /** 配置台新增的自定义表格子块 */
      custom?: boolean;
      enabled: boolean;
      fields: {
        accessField?: string;
        cellType?: string;
        controlType?: string;
        custom?: boolean;
        enabled: boolean;
        key: string;
        label: string;
        minWidth?: number;
        options?: { label: string; value: string }[];
        order: number;
        placeholder?: string;
        required?: boolean;
        span?: number;
      }[];
      key: string;
      label: string;
      order: number;
      /** 本场景已删除的内置字段，normalize 不再补回 */
      removedFieldKeys?: string[];
      subtitle?: string;
      tableOptions?: {
        allowAdd?: boolean;
        allowRemove?: boolean;
        minRows?: number;
      };
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
async function createPageSchema(data: Omit<PageSchemaApi.PageSchema, 'id'>) {
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

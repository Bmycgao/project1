import type { Recordable } from '@vben/types';

import { requestClient } from '#/api/request';

/** 打印模板（hiprint JSON） */
export namespace PrintTemplateApi {
  export interface PrintTemplate {
    id: string;
    /** 业务引用码，如 PrintFujian1 */
    templateCode: string;
    name: string;
    bizType?: string;
    remark?: string;
    status: 0 | 1;
    templateJson: Record<string, any>;
    version?: number;
    updatedAt?: string;
  }
}

/** 动作 code → 默认模板编码（页面未配 bind.printTemplateCode 时使用） */
export const DEFAULT_PRINT_TEMPLATE_BY_ACTION: Record<string, string> = {
  preview1: 'PrintFujian1',
  preview2: 'PrintFujian2',
  ticket1: 'PrintTicket1',
  ticket2: 'PrintTicket2',
  companyAgree: 'PrintAgreement',
  unlicensedAgree: 'PrintAgreement',
  preSave: 'PrintAgreement',
  previewSupply: 'PrintAgreement',
};

/**
 * 拉取打印模板列表
 * @param params keyword / bizType / status
 */
async function getPrintTemplateList(params?: Recordable<any>) {
  return requestClient.get<PrintTemplateApi.PrintTemplate[]>(
    '/system/print-template/list',
    { params },
  );
}

/**
 * 按 id 拉取模板（设计器编辑）
 * @param id 记录 id
 */
async function getPrintTemplate(id: string) {
  return requestClient.get<PrintTemplateApi.PrintTemplate>(
    `/system/print-template/${id}`,
  );
}

/**
 * 按 templateCode 拉取模板（业务预览）
 * @param code 模板编码
 */
async function getPrintTemplateByCode(code: string) {
  return requestClient.get<PrintTemplateApi.PrintTemplate>(
    `/system/print-template/code/${encodeURIComponent(code)}`,
  );
}

/** 新建打印模板 */
async function createPrintTemplate(
  data: Omit<PrintTemplateApi.PrintTemplate, 'id' | 'updatedAt'>,
) {
  return requestClient.post<PrintTemplateApi.PrintTemplate>(
    '/system/print-template',
    data,
  );
}

/** 更新打印模板 */
async function updatePrintTemplate(
  id: string,
  data: Partial<PrintTemplateApi.PrintTemplate>,
) {
  return requestClient.put<PrintTemplateApi.PrintTemplate>(
    `/system/print-template/${id}`,
    data,
  );
}

/** 删除打印模板 */
async function deletePrintTemplate(id: string) {
  return requestClient.delete(`/system/print-template/${id}`);
}

export {
  createPrintTemplate,
  deletePrintTemplate,
  getPrintTemplate,
  getPrintTemplateByCode,
  getPrintTemplateList,
  updatePrintTemplate,
};

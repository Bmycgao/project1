/**
 * 协议业务 API：列表（按 scene）+ 详情分模块/全部保存 + 列表批量动作
 */
import type { Recordable } from '@vben/types';

import type {
  AgreementDetail,
  AgreementListItem,
  AgreementModuleKey,
} from '#/views/biz/agreement/types';

import { requestClient } from '#/api/request';

/** 协议列表查询参数 */
export interface AgreementListQuery {
  scene: string;
  keyword?: string;
  statusValue?: string;
  page?: number;
  pageSize?: number;
}

/** 按场景拉取协议列表（同一接口） */
async function getAgreementList(params: AgreementListQuery) {
  return requestClient.get<{ items: AgreementListItem[]; total: number }>(
    '/biz/agreement/list',
    { params: params as Recordable<any> },
  );
}

/**
 * 获取协议详情
 * @param agreementNo 协议编号
 * @param extra 列表带入的附加字段（首次初始化用）
 */
async function getAgreementDetail(
  agreementNo: string,
  extra?: Recordable<any>,
) {
  return requestClient.get<AgreementDetail>('/biz/agreement/detail', {
    params: { agreementNo, ...extra },
  });
}

/**
 * 保存单个模块
 * @param agreementNo 协议编号
 * @param module 模块标识
 * @param data 模块 getValues 结果
 */
async function saveAgreementModule(
  agreementNo: string,
  module: AgreementModuleKey,
  data: Recordable<any>,
) {
  return requestClient.put<AgreementDetail>(
    `/biz/agreement/module/${module}`,
    { agreementNo, data },
  );
}

/**
 * 全部保存
 * @param payload 完整详情
 */
async function saveAgreementAll(payload: Recordable<any>) {
  return requestClient.put<AgreementDetail>('/biz/agreement/detail', payload);
}

/**
 * 提交复核（详情页：保存并标记待复核）
 * @param payload 完整详情
 */
async function submitAgreement(payload: Recordable<any>) {
  return requestClient.post<AgreementDetail>(
    '/biz/agreement/submit',
    payload,
  );
}

/**
 * 列表批量提交复核（只需协议编号）
 * @param agreementNos 协议编号列表
 */
async function submitAgreementBatch(agreementNos: string[]) {
  return requestClient.post<{ items: AgreementDetail[]; total: number }>(
    '/biz/agreement/batch-submit',
    { agreementNos },
  );
}

/**
 * 批量删除协议
 * @param agreementNos 协议编号列表
 */
async function deleteAgreements(agreementNos: string[]) {
  return requestClient.post<{ removed: number }>('/biz/agreement/delete', {
    agreementNos,
  });
}

/**
 * 列表审核通过
 * @param agreementNos 协议编号列表
 */
async function approveAgreements(agreementNos: string[]) {
  return requestClient.post<{ items: AgreementDetail[]; total: number }>(
    '/biz/agreement/approve',
    { agreementNos },
  );
}

/**
 * 列表驳回
 * @param agreementNos 协议编号列表
 * @param remark 驳回原因
 */
async function rejectAgreements(agreementNos: string[], remark?: string) {
  return requestClient.post<{ items: AgreementDetail[]; total: number }>(
    '/biz/agreement/reject',
    { agreementNos, remark },
  );
}

/**
 * 新建草稿协议
 * @param input 可选被补偿人 / 地址
 */
async function createAgreement(input?: {
  compensatee?: string;
  houseAddress?: string;
}) {
  return requestClient.post<AgreementListItem>('/biz/agreement/create', input || {});
}

export {
  approveAgreements,
  createAgreement,
  deleteAgreements,
  getAgreementDetail,
  getAgreementList,
  rejectAgreements,
  saveAgreementAll,
  saveAgreementModule,
  submitAgreement,
  submitAgreementBatch,
};

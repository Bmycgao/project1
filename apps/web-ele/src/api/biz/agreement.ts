/**
 * 协议业务 API：列表（按 scene）+ 详情分模块/全部保存
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
 * 提交复核（保存并标记待复核）
 * @param payload 完整详情
 */
async function submitAgreement(payload: Recordable<any>) {
  return requestClient.post<AgreementDetail>(
    '/biz/agreement/submit',
    payload,
  );
}

export {
  getAgreementDetail,
  getAgreementList,
  saveAgreementAll,
  saveAgreementModule,
  submitAgreement,
};

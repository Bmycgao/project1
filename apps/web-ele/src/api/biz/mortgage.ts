/**
 * 抵押详情页 API
 */
import type { Recordable } from '@vben/types';

import { requestClient } from '#/api/request';

/** 抵押业务类型 */
export namespace MortgageApi {
  export interface RightHolderRow {
    id: string;
    agreementNo: string;
    name: string;
    idNo: string;
    phone: string;
  }

  export interface HouseRow {
    id: string;
    address: string;
    certNo: string;
    propertyType: string;
  }

  export interface MortgageInfoData {
    loanStartTime: string;
    loanTerm: number | string;
    remainingTerm: number | string;
    remainingLoan: number | string;
    repayMethod: string;
    interestRate: number | string;
    performance: string;
    accountConsistent: string;
  }

  export interface MortgageMaterialRow {
    id: string;
    category: string;
    required: string;
    limitFile: string;
    supplementFile: string;
  }

  export interface MortgageBasicModule {
    rightHolders: RightHolderRow[];
    houses: HouseRow[];
  }

  export interface MortgageDetail {
    id?: string;
    agreementNo: string;
    status?: 'draft' | 'submitted';
    rightHolders: RightHolderRow[];
    houses: HouseRow[];
    mortgageInfo: MortgageInfoData[];
    materials: MortgageMaterialRow[];
  }

  export type ModuleKey = 'basic' | 'material' | 'mortgage';
}

/** 获取抵押详情 */
async function getMortgageDetail(
  agreementNo: string,
  extra?: Recordable<any>,
) {
  return requestClient.get<MortgageApi.MortgageDetail>('/biz/mortgage/detail', {
    params: { agreementNo, ...extra },
  });
}

/**
 * 保存单个模块
 * @param agreementNo 协议编号
 * @param module 模块标识
 * @param data 模块数据
 */
async function saveMortgageModule(
  agreementNo: string,
  module: MortgageApi.ModuleKey,
  data:
    | MortgageApi.MortgageBasicModule
    | MortgageApi.MortgageInfoData[]
    | MortgageApi.MortgageMaterialRow[],
) {
  return requestClient.put<MortgageApi.MortgageDetail>(
    `/biz/mortgage/module/${module}`,
    { agreementNo, data },
  );
}

/**
 * 全部保存（三模块一起）
 * @param payload 完整详情或部分字段
 */
async function saveMortgageAll(payload: Recordable<any>) {
  return requestClient.put<MortgageApi.MortgageDetail>(
    '/biz/mortgage/detail',
    payload,
  );
}

/**
 * 提交（保存并标记已提交）
 * @param payload 完整详情
 */
async function submitMortgage(payload: Recordable<any>) {
  return requestClient.post<MortgageApi.MortgageDetail>(
    '/biz/mortgage/submit',
    payload,
  );
}

export {
  getMortgageDetail,
  saveMortgageAll,
  saveMortgageModule,
  submitMortgage,
};

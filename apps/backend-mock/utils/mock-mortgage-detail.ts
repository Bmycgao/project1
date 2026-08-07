/**
 * 抵押详情内存 Store（按协议编号缓存，支持分模块保存）
 * 类型请从 ./mortgage-detail-types 单独导入，避免 Nitro 重复导出警告
 */
import type {
  MortgageBasicModule,
  MortgageDetail,
  MortgageInfoData,
  MortgageMaterialRow,
  MortgageModuleKey,
} from './mortgage-detail-types';

const detailCache = new Map<string, MortgageDetail>();

/**
 * 生成默认详情
 * @param agreementNo 协议编号
 * @param extra 列表带入字段
 */
export function createDefaultMortgageDetail(
  agreementNo: string,
  extra: Record<string, any> = {},
): MortgageDetail {
  const name = extra.compensatee || '陈丽沙';
  const address = extra.houseAddress || '翠园街十八巷8号304';
  return {
    id: extra.id || `mortgage-${agreementNo}`,
    agreementNo,
    status: 'draft',
    rightHolders: [
      {
        id: 'rh-1',
        agreementNo,
        name,
        idNo: '441581199101212387',
        phone: '-',
      },
    ],
    houses: [
      {
        id: 'hs-1',
        address,
        certNo: '深房地字第2000622984号',
        propertyType: '经产权登记的市场商品房',
      },
    ],
    mortgageInfo: [
      {
        loanStartTime: '2024-08-29 00:00:00',
        loanTerm: 60,
        remainingTerm: 38,
        remainingLoan: 1_000_000,
        repayMethod: '按期还息一次还本',
        interestRate: 0.033,
        performance: '每月还息2475元',
        accountConsistent: '是',
      },
    ],
    materials: [
      {
        id: 'mt-1',
        category: '抵押资料',
        required: '否',
        limitFile: '',
        supplementFile: '',
      },
      {
        id: 'mt-2',
        category: '三方协议',
        required: '否',
        limitFile: '',
        supplementFile: '',
      },
    ],
  };
}

/**
 * 获取或初始化详情
 * @param agreementNo 协议编号
 * @param extra 首次创建时的附加字段
 */
export function getOrCreateMortgageDetail(
  agreementNo: string,
  extra: Record<string, any> = {},
) {
  const key = String(agreementNo);
  let node = detailCache.get(key);
  if (!node) {
    node = createDefaultMortgageDetail(key, extra);
    detailCache.set(key, node);
  }
  return structuredClone(node);
}

/**
 * 保存整个详情
 * @param payload 详情数据
 */
export function saveMortgageDetailAll(payload: Partial<MortgageDetail>) {
  const agreementNo = String(payload.agreementNo || '');
  if (!agreementNo) {
    throw new Error('缺少协议编号');
  }
  const current = getOrCreateMortgageDetail(agreementNo);
  const next: MortgageDetail = {
    ...current,
    ...payload,
    agreementNo,
    rightHolders: payload.rightHolders ?? current.rightHolders,
    houses: payload.houses ?? current.houses,
    mortgageInfo: payload.mortgageInfo ?? current.mortgageInfo,
    materials: payload.materials ?? current.materials,
  };
  detailCache.set(agreementNo, next);
  return structuredClone(next);
}

/**
 * 按模块保存
 * @param agreementNo 协议编号
 * @param module 模块
 * @param data 模块数据
 */
export function saveMortgageDetailModule(
  agreementNo: string,
  module: MortgageModuleKey,
  data: MortgageBasicModule | MortgageInfoData[] | MortgageMaterialRow[],
) {
  const current = getOrCreateMortgageDetail(agreementNo);
  if (module === 'basic') {
    const basic = data as MortgageBasicModule;
    current.rightHolders = basic.rightHolders || [];
    current.houses = basic.houses || [];
  } else if (module === 'mortgage') {
    current.mortgageInfo = data as MortgageInfoData[];
  } else if (module === 'material') {
    current.materials = data as MortgageMaterialRow[];
  }
  detailCache.set(agreementNo, current);
  return structuredClone(current);
}

/**
 * 提交详情
 * @param payload 详情
 */
export function submitMortgageDetail(payload: Partial<MortgageDetail>) {
  const saved = saveMortgageDetailAll({ ...payload, status: 'submitted' });
  return saved;
}

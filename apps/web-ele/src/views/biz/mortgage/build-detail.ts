import type {
  MortgageDetail,
  MortgageRowPayload,
} from '../types';

/**
 * 按协议编号生成前端兜底详情（接口失败/未就绪时也能展示）
 * @param row 路由参数与 query
 */
export function buildMortgageDetailLocal(
  row: MortgageRowPayload = {},
): MortgageDetail {
  const agreementNo = String(row.agreementNo || 'LL-4-028');
  const name = String(row.compensatee || '陈丽沙');
  const address = String(row.houseAddress || '翠园街十八巷8号304');

  return {
    id: String(row.id || `mortgage-${agreementNo}`),
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

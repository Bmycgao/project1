import type { AgreementDetail, AgreementListItem } from './types';

/** 演示全量协议池（各场景从此过滤，模拟同一张表） */
export const MOCK_AGREEMENT_LIST: AgreementListItem[] = [
  {
    id: 'A001',
    agreementNo: 'LL-4-015',
    compensatee: '陈爱然',
    houseAddress: '翠园街十八巷7号202',
    statusValue: '告知单',
    signType: '正常签约',
    isSigned: '未签约',
    batchGroup: '-',
  },
  {
    id: 'A002',
    agreementNo: 'LL-4-021',
    compensatee: '刘培林',
    houseAddress: '翠园街十六巷3号501',
    statusValue: '待复核',
    signType: '附条件签约',
    isSigned: '未签约',
    batchGroup: '2024-一期',
  },
  {
    id: 'A003',
    agreementNo: 'LL-4-028',
    compensatee: '陈丽沙',
    houseAddress: '翠园街十八巷8号304',
    statusValue: '签约已确认',
    signType: '正常签约',
    isSigned: '已签约',
    batchGroup: '2024-二期',
  },
  {
    id: 'A004',
    agreementNo: 'LL-4-022',
    compensatee: '王敏',
    houseAddress: '翠园街十七巷2号101',
    statusValue: '组长已复核',
    signType: '正常签约',
    isSigned: '未签约',
    batchGroup: '2024-一期',
  },
  {
    id: 'A005',
    agreementNo: 'LL-4-016',
    compensatee: '赵强',
    houseAddress: '翠园街十五巷9号303',
    statusValue: '组长已复核',
    signType: '附条件签约',
    isSigned: '未签约',
    batchGroup: '2024-二期',
  },
  {
    id: 'A006',
    agreementNo: 'LL-7-049',
    compensatee: '林浩',
    houseAddress: '翠园街十九巷5号5-6',
    statusValue: '项目经理已审核',
    signType: '正常签约',
    isSigned: '未签约',
    batchGroup: '-',
  },
  {
    id: 'A007',
    agreementNo: 'LL-ceshi01',
    compensatee: 'AA',
    houseAddress: '日志测试建筑01',
    statusValue: '已锁定',
    signType: '正常签约',
    isSigned: '未签约',
    batchGroup: '-',
  },
];

/**
 * 按协议编号生成详情演示数据
 * @param agreementNo 协议编号
 * @param listRow 列表行（可选）
 */
export function buildAgreementDetail(
  agreementNo: string,
  listRow?: Partial<AgreementListItem>,
): AgreementDetail {
  const row =
    listRow ||
    MOCK_AGREEMENT_LIST.find((i) => i.agreementNo === agreementNo) ||
    MOCK_AGREEMENT_LIST[0];
  if (!row) {
    throw new Error('演示协议列表为空，无法构建详情');
  }
  return {
    id: row.id || `A-${agreementNo}`,
    agreementNo,
    status: 'draft',
    statusValue: row.statusValue || '告知单',
    signType: row.signType || '正常签约',
    isSigned: row.isSigned || '未签约',
    basic: {
      agreementNo,
      agreementName: `${row.houseAddress || '协议'}建设协议-${row.compensatee || ''}`,
      department: '征收事务部',
      acquirer: '市土地储备中心',
      compensatee: row.compensatee || '陈爱然',
      amount: 5_880_000,
      signDate: '2026-03-15',
      statusValue: row.statusValue || '告知单',
      remark: '',
    },
    rightHolders: [
      {
        id: 'rh-1',
        agreementNo,
        name: row.compensatee || '陈爱然',
        idNo: '120105198302102426',
        phone: '-',
      },
    ],
    houses: [
      {
        id: 'hs-1',
        address: row.houseAddress || '翠园街十八巷7号202',
        certNo: '粤 (2020) 深圳市不动产权第0095283号',
        propertyType: '经产权登记的市场商品房',
        buildArea: 128.6,
        expropriatedArea: 128.6,
        houseType: '厂房',
        structure: '钢混',
        yearBuilt: '2012',
        floor: '2',
        evalValue: 4_586_400,
      },
    ],
    /** 自定义子块默认空：由页面配置新增子块后，详情里点「新增」加行 */
    basicTables: {},
    signing: {
      houseAddress: row.houseAddress || '翠园街十八巷7号202',
      compensateMethod: '产权调换',
      decorateEval: '否',
      hasMortgage: '否',
      mortgagee: '',
      debtAmount: 1_280_000.5,
      hasSeal: '否',
      sealCourt: '',
      signDate: '2026-03-15',
    },
    contact: {
      address: '',
      contact: '',
      phone: '',
      emergency: '',
    },
    signMaterials: [
      {
        id: 'sm-1',
        category: '身份证明',
        required: '是',
        fileName: '',
        remark: '',
      },
      {
        id: 'sm-2',
        category: '产权证明',
        required: '是',
        fileName: '',
        remark: '',
      },
    ],
    certifyMaterials: [
      {
        id: 'cm-1',
        category: '资格认定表',
        required: '是',
        fileName: '',
        remark: '',
      },
    ],
    compensation: {
      settleType: '产权调换',
      settleAddress: '',
      amount: 4_586_400,
      remark: '',
    },
    compensationItems: [
      {
        id: 'ci-1',
        name: '房屋补偿',
        calcType: '面积×单价',
        quantity: 128.6,
        unitPrice: 20_000,
        amount: 2_572_000,
        remark: '',
      },
      {
        id: 'ci-2',
        name: '装修补偿',
        calcType: '评估',
        quantity: 1,
        unitPrice: 860_000,
        amount: 860_000,
        remark: '',
      },
      {
        id: 'ci-3',
        name: '搬迁补助',
        calcType: '定额',
        quantity: 1,
        unitPrice: 50_000,
        amount: 50_000,
        remark: '',
      },
      {
        id: 'ci-4',
        name: '临时安置',
        calcType: '定额',
        quantity: 6,
        unitPrice: 18_400,
        amount: 110_400,
        remark: '',
      },
    ],
    rewardItems: [
      {
        id: 'ri-1',
        name: '签约奖励',
        condition: '约定期内签约',
        amount: 80_000,
        remark: '',
      },
      {
        id: 'ri-2',
        name: '搬迁奖励',
        condition: '按期腾空',
        amount: 30_000,
        remark: '',
      },
      {
        id: 'ri-3',
        name: '配合征收奖励',
        condition: '无信访',
        amount: 20_000,
        remark: '',
      },
    ],
    population: {
      headName: row.compensatee || '陈爱然',
      idNo: '120105198302102426',
      familySize: 6,
      phone: '-',
      hukouAddress: row.houseAddress || '翠园街十八巷7号202',
      remark: '',
    },
    extraForms: {},
    extraTables: {},
  };
}

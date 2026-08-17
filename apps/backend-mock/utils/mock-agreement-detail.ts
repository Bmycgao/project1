/**
 * 协议详情内存 Store（按协议编号缓存，支持分模块 / 全部保存）
 * 类型请从 ./agreement-detail-types 单独导入，避免 Nitro 重复导出警告
 */
import type {
  AgreementDetail,
  AgreementModuleKey,
} from './agreement-detail-types';
import {
  AGREE_ALL_ROWS,
  patchAgreeListRow,
  removeAgreeListRows,
} from './mock-agreement-list';

const detailCache = new Map<string, AgreementDetail>();

/**
 * 生成默认详情
 * @param agreementNo 协议编号
 * @param extra 列表带入字段
 */
export function createDefaultAgreementDetail(
  agreementNo: string,
  extra: Record<string, any> = {},
): AgreementDetail {
  const listRow = AGREE_ALL_ROWS.find((r) => r.agreementNo === agreementNo);
  const name = String(extra.compensatee || listRow?.compensatee || '陈爱然');
  const address = String(
    extra.houseAddress || listRow?.houseAddress || '翠园街十八巷7号202',
  );
  return {
    id: String(extra.id || listRow?.id || `A-${agreementNo}`),
    agreementNo,
    status: 'draft',
    statusValue: String(listRow?.statusValue || '告知单'),
    signType: String(listRow?.signType || '正常签约'),
    isSigned: String(listRow?.isSigned || '未签约'),
    basic: {
      agreementNo,
      agreementName: `${address}建设协议-${name}`,
      department: '征收事务部',
      acquirer: '市土地储备中心',
      compensatee: name,
      amount: 5880000,
      signDate: '2026-03-15',
      statusValue: String(listRow?.statusValue || '告知单'),
      remark: '',
    },
    rightHolders: [
      {
        id: 'rh-1',
        agreementNo,
        name,
        idNo: '120105198302102426',
        phone: '-',
      },
    ],
    houses: [
      {
        id: 'hs-1',
        address,
        certNo: '粤 (2020) 深圳市不动产权第0095283号',
        propertyType: '经产权登记的市场商品房',
        buildArea: 128.6,
        expropriatedArea: 128.6,
        houseType: '厂房',
        structure: '钢混',
        yearBuilt: '2012',
        floor: '2',
        evalValue: 4586400,
      },
    ],
    basicTables: {},
    signing: {
      houseAddress: address,
      compensateMethod: '产权调换',
      decorateEval: '否',
      hasMortgage: '否',
      mortgagee: '',
      debtAmount: 1280000.5,
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
      amount: 4586400,
      remark: '',
    },
    compensationItems: [
      {
        id: 'ci-1',
        name: '房屋补偿',
        calcType: '面积×单价',
        quantity: 128.6,
        unitPrice: 20000,
        amount: 2572000,
        remark: '',
      },
      {
        id: 'ci-2',
        name: '装修补偿',
        calcType: '评估',
        quantity: 1,
        unitPrice: 860000,
        amount: 860000,
        remark: '',
      },
      {
        id: 'ci-3',
        name: '搬迁补助',
        calcType: '定额',
        quantity: 1,
        unitPrice: 50000,
        amount: 50000,
        remark: '',
      },
      {
        id: 'ci-4',
        name: '临时安置',
        calcType: '定额',
        quantity: 6,
        unitPrice: 18400,
        amount: 110400,
        remark: '',
      },
    ],
    rewardItems: [
      {
        id: 'ri-1',
        name: '签约奖励',
        condition: '约定期内签约',
        amount: 80000,
        remark: '',
      },
      {
        id: 'ri-2',
        name: '搬迁奖励',
        condition: '按期腾空',
        amount: 30000,
        remark: '',
      },
      {
        id: 'ri-3',
        name: '配合征收奖励',
        condition: '无信访',
        amount: 20000,
        remark: '',
      },
    ],
    population: {
      headName: name,
      idNo: '120105198302102426',
      familySize: 6,
      phone: '-',
      hukouAddress: address,
      remark: '',
    },
  };
}

/**
 * 获取或初始化详情
 * @param agreementNo 协议编号
 * @param extra 首次创建时的附加字段
 */
export function getOrCreateAgreementDetail(
  agreementNo: string,
  extra: Record<string, any> = {},
) {
  const key = String(agreementNo);
  let node = detailCache.get(key);
  if (!node) {
    node = createDefaultAgreementDetail(key, extra);
    detailCache.set(key, node);
  } else {
    if (!node.basicTables || typeof node.basicTables !== 'object') {
      node.basicTables = {};
    }
    if (!node.basic) {
      node.basic = createDefaultAgreementDetail(key, extra).basic;
    }
    const fresh = createDefaultAgreementDetail(key, extra);
    if (!Array.isArray(node.compensationItems)) {
      node.compensationItems = fresh.compensationItems;
    }
    if (!Array.isArray(node.rewardItems)) {
      node.rewardItems = fresh.rewardItems;
    }
    if (!node.population) {
      node.population = fresh.population;
    }
  }
  return structuredClone(node);
}

/**
 * 保存整个详情
 * @param payload 详情数据
 */
export function saveAgreementDetailAll(payload: Partial<AgreementDetail>) {
  const agreementNo = String(payload.agreementNo || '');
  if (!agreementNo) {
    throw new Error('缺少协议编号');
  }
  const current = getOrCreateAgreementDetail(agreementNo);
  const next: AgreementDetail = {
    ...current,
    ...payload,
    agreementNo,
    basic: payload.basic ?? current.basic,
    rightHolders: payload.rightHolders ?? current.rightHolders,
    houses: payload.houses ?? current.houses,
    basicTables: payload.basicTables ?? current.basicTables ?? {},
    signing: payload.signing ?? current.signing,
    contact: payload.contact ?? current.contact,
    signMaterials: payload.signMaterials ?? current.signMaterials,
    certifyMaterials: payload.certifyMaterials ?? current.certifyMaterials,
    compensation: payload.compensation ?? current.compensation,
    compensationItems: payload.compensationItems ?? current.compensationItems,
    rewardItems: payload.rewardItems ?? current.rewardItems,
    population: payload.population ?? current.population,
  };
  detailCache.set(agreementNo, next);
  // 详情保存时同步列表展示字段
  patchAgreeListRow(agreementNo, {
    statusValue: next.statusValue,
    compensatee:
      next.basic?.compensatee || next.rightHolders?.[0]?.name,
    houseAddress: next.signing?.houseAddress || next.houses?.[0]?.address,
    signType: next.signType,
    isSigned: next.isSigned,
  });
  return structuredClone(next);
}

/**
 * 按模块保存（data 为该模块 getValues 的结果）
 * @param agreementNo 协议编号
 * @param module 模块
 * @param data 模块数据
 */
export function saveAgreementDetailModule(
  agreementNo: string,
  module: AgreementModuleKey,
  data: Record<string, any>,
) {
  const current = getOrCreateAgreementDetail(agreementNo);
  if (module === 'basic') {
    if (data.basic) {
      current.basic = data.basic;
      if (data.basic.agreementNo) current.agreementNo = data.basic.agreementNo;
      if (data.basic.statusValue) current.statusValue = data.basic.statusValue;
    }
    current.basicTables = data.basicTables ?? current.basicTables ?? {};
  } else if (module === 'houses') {
    current.houses = data.houses ?? current.houses;
  } else if (module === 'compensation') {
    current.compensationItems =
      data.compensationItems ?? current.compensationItems;
    current.compensation = data.compensation ?? current.compensation;
  } else if (module === 'rewards') {
    current.rewardItems = data.rewardItems ?? current.rewardItems;
  } else if (module === 'population') {
    current.population = data.population ?? current.population;
  } else {
    throw new Error(`未知模块：${module}`);
  }
  detailCache.set(agreementNo, current);
  return structuredClone(current);
}

/**
 * 提交复核（先全量保存再改状态，并同步列表行）
 * @param payload 详情
 */
export function submitAgreementDetail(payload: Partial<AgreementDetail>) {
  const saved = saveAgreementDetailAll({
    ...payload,
    status: 'review',
    statusValue: '待复核',
  });
  patchAgreeListRow(saved.agreementNo, {
    statusValue: '待复核',
    compensatee:
      saved.basic?.compensatee ||
      saved.rightHolders?.[0]?.name ||
      findListCompensatee(saved.agreementNo),
    houseAddress:
      saved.signing?.houseAddress ||
      saved.houses?.[0]?.address ||
      undefined,
  });
  return saved;
}

/**
 * 仅按协议编号提交复核（列表批量用，无需完整详情体）
 * @param agreementNos 协议编号列表
 */
export function submitAgreementByNos(agreementNos: string[]) {
  const results = [];
  for (const no of agreementNos) {
    const detail = getOrCreateAgreementDetail(no);
    results.push(
      submitAgreementDetail({
        ...detail,
        agreementNo: no,
      }),
    );
  }
  return results;
}

/**
 * 列表审核通过：组长已复核 → 项目经理已审核
 * @param agreementNos 协议编号列表
 */
export function approveAgreementByNos(agreementNos: string[]) {
  const results = [];
  for (const no of agreementNos) {
    const detail = getOrCreateAgreementDetail(no);
    const next = saveAgreementDetailAll({
      ...detail,
      status: 'approved',
      statusValue: '项目经理已审核',
    });
    patchAgreeListRow(no, { statusValue: '项目经理已审核' });
    results.push(next);
  }
  return results;
}

/**
 * 列表驳回：回到告知单
 * @param agreementNos 协议编号列表
 * @param remark 驳回原因（写入详情备注位，演示用）
 */
export function rejectAgreementByNos(agreementNos: string[], remark?: string) {
  const results = [];
  for (const no of agreementNos) {
    const detail = getOrCreateAgreementDetail(no);
    const next = saveAgreementDetailAll({
      ...detail,
      status: 'draft',
      statusValue: '告知单',
      compensation: {
        ...detail.compensation,
        remark: remark
          ? `驳回：${remark}`
          : detail.compensation?.remark || '',
      },
    });
    patchAgreeListRow(no, { statusValue: '告知单' });
    results.push(next);
  }
  return results;
}

/**
 * 删除协议（详情缓存 + 列表行）
 * @param agreementNos 协议编号列表
 */
export function deleteAgreementByNos(agreementNos: string[]) {
  for (const no of agreementNos) {
    detailCache.delete(String(no));
  }
  return removeAgreeListRows(agreementNos);
}

/** 从列表池取被补偿人（兜底） */
function findListCompensatee(agreementNo: string) {
  return AGREE_ALL_ROWS.find((r) => r.agreementNo === agreementNo)?.compensatee;
}

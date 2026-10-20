/**
 * 协议详情 Store（列表与详情原子落盘，支持分模块 / 全部保存）
 * 类型请从 ./agreement-detail-types 单独导入，避免 Nitro 重复导出警告
 */
import type {
  AgreementDetail,
  AgreementModuleKey,
} from './agreement-detail-types';

import {
  agreementStore,
  findAgreeListRow,
  isDemoAgreementNo,
  removeAgreeListRows,
} from './mock-agreement-list';

/**
 * 初始化空白草稿；业务事实只使用明确传入或已存在的资料。
 * @param agreementNo 协议编号
 * @param extra 列表带入字段
 */
export function createDefaultAgreementDetail(
  agreementNo: string,
  extra: Record<string, any> = {},
): AgreementDetail {
  const row = findAgreeListRow(agreementNo);
  const statusValue = String(row?.statusValue || '草稿');
  return {
    id: String(extra.id || row?.id || `A-${agreementNo}`),
    agreementNo,
    status: 'draft',
    statusValue,
    signType: String(row?.signType || ''),
    isSigned: String(row?.isSigned || '未签约'),
    basic: {
      agreementNo,
      agreementName: '',
      department: '',
      acquirer: '',
      compensatee: String(extra.compensatee ?? row?.compensatee ?? ''),
      amount: '',
      signDate: '',
      statusValue,
      remark: '',
    },
    rightHolders: [],
    houses: [],
    basicTables: {},
    signing: {
      houseAddress: String(extra.houseAddress ?? row?.houseAddress ?? ''),
      compensateMethod: '',
      decorateEval: '',
      hasMortgage: '',
      mortgagee: '',
      debtAmount: '',
      hasSeal: '',
      sealCourt: '',
      signDate: '',
    },
    contact: { address: '', contact: '', phone: '', emergency: '' },
    signMaterials: [],
    certifyMaterials: [],
    compensation: { settleType: '', settleAddress: '', amount: '', remark: '' },
    compensationItems: [],
    rewardItems: [],
    population: {
      headName: '',
      idNo: '',
      familySize: '',
      phone: '',
      hukouAddress: '',
      remark: '',
    },
    extraForms: {},
    extraTables: {},
    flowFields: {},
  };
}

/** 仅为内置演示记录生成样例资料，新增协议不得调用。 */
function createDemoAgreementDetail(
  agreementNo: string,
  extra: Record<string, any> = {},
): AgreementDetail {
  const listRow = findAgreeListRow(agreementNo);
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
      amount: 5_880_000,
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
        evalValue: 4_586_400,
      },
    ],
    basicTables: {},
    signing: {
      houseAddress: address,
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
      headName: name,
      idNo: '120105198302102426',
      familySize: 6,
      phone: '-',
      hukouAddress: address,
      remark: '',
    },
    extraForms: {},
    extraTables: {},
    flowFields: {},
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
  const row = findAgreeListRow(agreementNo);
  if (!row) throw new Error('协议不存在或已删除，请刷新列表');
  const key = row.agreementNo;
  let node = agreementStore.detail(key);
  if (node) {
    if (!node.basicTables || typeof node.basicTables !== 'object') {
      node.basicTables = {};
    }
    if (!node.basic) {
      node.basic = createDefaultAgreementDetail(key, extra).basic;
    }
    const fresh = createDefaultAgreementDetail(key, extra);
    node.compensationItems = Array.isArray(node.compensationItems)
      ? node.compensationItems.filter(
          (row: { id?: string }) => row?.id !== 'ci-hmerge-demo',
        )
      : fresh.compensationItems;
    if (!Array.isArray(node.rewardItems)) {
      node.rewardItems = fresh.rewardItems;
    }
    if (!node.population) {
      node.population = fresh.population;
    }
    if (!node.extraForms || typeof node.extraForms !== 'object') {
      node.extraForms = {};
    }
    if (!node.extraTables || typeof node.extraTables !== 'object') {
      node.extraTables = {};
    }
    if (!node.flowFields || typeof node.flowFields !== 'object') {
      node.flowFields = {};
    }
  } else {
    node = isDemoAgreementNo(key)
      ? createDemoAgreementDetail(key, extra)
      : createDefaultAgreementDetail(key, extra);
  }
  node.id = row.id;
  node.agreementNo = row.agreementNo;
  node.basic.agreementNo = row.agreementNo;
  node.agreementNoEditable = agreementStore.numberEditable(row.id);
  const entryAccess = agreementStore.entryWriteAccess(row.id);
  node.entryEditable = entryAccess.editable;
  node.entryReadonlyReason = entryAccess.reason;
  return structuredClone(node);
}

/**
 * 保存整个详情
 * @param payload 详情数据
 */
export function saveAgreementDetailAll(payload: Partial<AgreementDetail>) {
  const listRow = findAgreeListRow(
    String(payload.id || payload.agreementNo || ''),
  );
  if (!listRow) {
    throw new Error('协议不存在或已删除，请刷新列表');
  }
  if (payload.id && payload.id !== listRow.id) {
    throw new Error('协议内部标识不一致，请重新打开协议');
  }
  const current = getOrCreateAgreementDetail(listRow.id);
  const rootNo = payload.agreementNo;
  const basicNo = payload.basic?.agreementNo;
  const proposedRoot =
    rootNo &&
    rootNo !== current.agreementNo &&
    findAgreeListRow(rootNo)?.id !== listRow.id;
  if (
    proposedRoot &&
    basicNo !== null &&
    basicNo !== undefined &&
    basicNo !== current.agreementNo &&
    basicNo !== rootNo
  )
    throw new Error('协议编号不一致，请核对后保存');
  const agreementNo = String(
    basicNo !== null && basicNo !== undefined && basicNo !== current.agreementNo
      ? basicNo
      : proposedRoot
        ? rootNo
        : (basicNo ?? current.agreementNo),
  ).trim();
  if (
    !agreementNo ||
    agreementNo.length > 64 ||
    // oxlint-disable-next-line eslint/no-control-regex -- Agreement identifiers must reject ASCII control characters.
    /[\u0000-\u001F\u007F]/.test(agreementNo)
  )
    throw new Error('协议编号必填，最多64个字符，不能包含控制字符');
  const renamed = agreementNo !== current.agreementNo;
  if (renamed && !agreementStore.numberEditable(listRow.id))
    throw new Error('协议已提交或已签约，不能修改编号');
  const next: AgreementDetail = {
    ...current,
    ...payload,
    id: current.id,
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
    extraForms: payload.extraForms ?? current.extraForms ?? {},
    extraTables: payload.extraTables ?? current.extraTables ?? {},
    flowFields: payload.flowFields ?? current.flowFields ?? {},
  };
  next.basic = { ...next.basic, agreementNo, statusValue: next.statusValue };
  next.rightHolders = next.rightHolders.map((holder) => ({
    ...holder,
    agreementNo,
  }));
  if (next.flowFields && Object.hasOwn(next.flowFields, 'agreementNo'))
    next.flowFields = { ...next.flowFields, agreementNo };
  agreementStore.update((draft) => {
    if (
      draft.rows.some(
        (row) =>
          row.id !== listRow.id &&
          (row.agreementNo === agreementNo || row.id === agreementNo),
      ) ||
      (Object.hasOwn(draft.aliases, agreementNo) &&
        draft.aliases[agreementNo] !== listRow.id)
    ) {
      throw new Error('协议编号已存在或曾被其他协议使用，请换一个编号');
    }
    if (renamed) {
      Object.defineProperty(draft.aliases, current.agreementNo, {
        value: listRow.id,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      draft.numberChanges.push({
        agreementId: listRow.id,
        from: current.agreementNo,
        to: agreementNo,
        at: new Date().toISOString(),
      });
    }
    if (
      (!current.agreementNoEditable ||
        next.statusValue !== '草稿' ||
        next.status !== 'draft' ||
        next.isSigned === '已签约') &&
      !draft.lockedIds.includes(listRow.id)
    )
      draft.lockedIds.push(listRow.id);
    next.agreementNoEditable =
      next.statusValue === '草稿' &&
      next.isSigned !== '已签约' &&
      !draft.lockedIds.includes(listRow.id);
    draft.details[listRow.id] = next;
    const row = draft.rows.find((item) => item.id === listRow.id);
    if (!row) throw new Error('协议不存在或已删除，请刷新列表');
    Object.assign(row, {
      agreementNo,
      statusValue: next.statusValue,
      compensatee:
        next.basic?.compensatee || next.rightHolders?.[0]?.name || '',
      houseAddress:
        next.signing?.houseAddress || next.houses?.[0]?.address || '',
      signType: next.signType,
      isSigned: next.isSigned,
    });
  });
  return getOrCreateAgreementDetail(listRow.id);
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
  } else if (data?.extraForms || data?.extraTables) {
    current.extraForms = {
      ...current.extraForms,
      ...data.extraForms,
    };
    current.extraTables = {
      ...current.extraTables,
      ...data.extraTables,
    };
  } else {
    throw new Error(`未知模块：${module}`);
  }
  return saveAgreementDetailAll(current);
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
        remark: remark ? `驳回：${remark}` : detail.compensation?.remark || '',
      },
    });
    results.push(next);
  }
  return results;
}

/**
 * 删除协议（详情缓存 + 列表行）
 * @param agreementNos 协议编号列表
 */
export function deleteAgreementByNos(agreementNos: string[]) {
  return removeAgreeListRows(agreementNos);
}

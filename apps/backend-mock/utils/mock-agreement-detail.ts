/**
 * 协议详情内存 Store（按协议编号缓存，支持分模块 / 全部保存）
 * 类型请从 ./agreement-detail-types 单独导入，避免 Nitro 重复导出警告
 */
import type {
  AgreementDetail,
  AgreementModuleKey,
} from './agreement-detail-types';
import { AGREE_ALL_ROWS } from './mock-agreement-list';

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
      },
    ],
    signing: {
      houseAddress: address,
      compensateMethod: '产权调换',
      decorateEval: '否',
      hasMortgage: '否',
      mortgagee: '',
      debtAmount: 0,
      hasSeal: '否',
      sealCourt: '',
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
      amount: 0,
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
    rightHolders: payload.rightHolders ?? current.rightHolders,
    houses: payload.houses ?? current.houses,
    signing: payload.signing ?? current.signing,
    contact: payload.contact ?? current.contact,
    signMaterials: payload.signMaterials ?? current.signMaterials,
    certifyMaterials: payload.certifyMaterials ?? current.certifyMaterials,
    compensation: payload.compensation ?? current.compensation,
  };
  detailCache.set(agreementNo, next);
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
    current.rightHolders = data.rightHolders ?? current.rightHolders;
    current.houses = data.houses ?? current.houses;
  } else if (module === 'signing') {
    current.signing = data.signing ?? current.signing;
    current.contact = data.contact ?? current.contact;
  } else if (module === 'signMaterial') {
    current.signMaterials = data.signMaterials ?? current.signMaterials;
  } else if (module === 'certifyMaterial') {
    current.certifyMaterials =
      data.certifyMaterials ?? current.certifyMaterials;
  } else if (module === 'compensation') {
    current.compensation = data.compensation ?? current.compensation;
  } else {
    throw new Error(`未知模块：${module}`);
  }
  detailCache.set(agreementNo, current);
  return structuredClone(current);
}

/**
 * 提交复核（先全量保存再改状态）
 * @param payload 详情
 */
export function submitAgreementDetail(payload: Partial<AgreementDetail>) {
  return saveAgreementDetailAll({
    ...payload,
    status: 'review',
    statusValue: '待复核',
  });
}

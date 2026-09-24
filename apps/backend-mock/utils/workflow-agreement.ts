/**
 * 流程实例与协议业务的映射：发起时灌入办理字段，办理成功后回写整份协议。
 */
import type { AgreementDetail, HouseRow } from './agreement-detail-types';

import {
  BUSINESS_FIELDS,
  WORKFLOW_FIELD_CATALOG,
  WORKFLOW_PERSON_FIELDS,
} from '../../shared/workflow-runtime';
import {
  getOrCreateAgreementDetail,
  saveAgreementDetailAll,
} from './mock-agreement-detail';
import { AGREE_ALL_ROWS, findAgreeListRow } from './mock-agreement-list';

/** 发起/办理页协议选项 */
export interface WorkflowAgreementOption {
  agreementNo: string;
  compensatee: string;
  houseAddress: string;
  amount: number;
  statusValue: string;
  title: string;
}

/** 节点字段权限（与设计契约一致） */
type FieldAccess = Record<string, 'edit' | 'hidden' | 'readonly'>;

/**
 * 校验协议存在于列表池（禁止手填不存在的编号）
 * @param agreementNo 协议编号
 */
export function requireExistingAgreement(agreementNo: unknown) {
  const no = typeof agreementNo === 'string' ? agreementNo.trim() : '';
  if (!no || no.length > 100) throw new Error('请选择要办理的协议');
  const row = findAgreeListRow(no);
  if (!row) throw new Error('请选择系统中已有的协议');
  return row;
}

/** 解析协议金额，非法时回 0 */
function amountOf(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

/**
 * 把协议详情投影成流程条件/默认字段
 * @param detail 协议详情
 */
export function projectAgreementToWorkflowData(detail: AgreementDetail) {
  const flow: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail.flowFields || {})) {
    if (value !== undefined) flow[key] = value;
  }
  const remark = detail.basic?.remark;
  if (remark !== undefined && remark !== '') flow.remark = remark;
  const people: Record<string, unknown> = {};
  for (const item of WORKFLOW_PERSON_FIELDS) {
    const raw = detail.basic?.[item.key];
    if (raw !== undefined && raw !== null && String(raw).trim() !== '')
      people[item.key] = raw;
  }
  return {
    agreementNo: String(detail.agreementNo || ''),
    compensatee: String(detail.basic?.compensatee || ''),
    houseAddress: String(
      detail.houses?.[0]?.address || detail.signing?.houseAddress || '',
    ),
    BuChangJinE: amountOf(detail.basic?.amount),
    ...flow,
    ...people,
  };
}

/**
 * 读取协议并投影成流程默认办理字段
 * @param agreementNo 协议编号
 */
export function workflowDataFromAgreement(agreementNo: string) {
  const row = requireExistingAgreement(agreementNo);
  const detail = getOrCreateAgreementDetail(agreementNo, row);
  return projectAgreementToWorkflowData(detail);
}

/**
 * 读取绑定协议的完整详情（办理页嵌模块用）
 * @param agreementNo 协议编号
 */
export function loadWorkflowAgreement(agreementNo: string) {
  const row = requireExistingAgreement(agreementNo);
  return getOrCreateAgreementDetail(agreementNo, row);
}

/**
 * 发起弹窗用的协议清单（含金额、默认标题）
 */
export function listWorkflowAgreements(): WorkflowAgreementOption[] {
  return AGREE_ALL_ROWS.map((row) => {
    const detail = getOrCreateAgreementDetail(row.agreementNo, row);
    const data = projectAgreementToWorkflowData(detail);
    return {
      agreementNo: row.agreementNo,
      compensatee: data.compensatee,
      houseAddress: data.houseAddress,
      amount: data.BuChangJinE,
      statusValue: String(detail.statusValue || row.statusValue),
      title: String(
        detail.basic?.agreementName || `${data.compensatee}协议审核`,
      ),
    };
  });
}

/** 客户端可合并的协议模块 */
const PATCH_KEYS = [
  'basic',
  'houses',
  'rightHolders',
  'signing',
  'contact',
  'signMaterials',
  'certifyMaterials',
  'compensation',
  'compensationItems',
  'rewardItems',
  'population',
  'basicTables',
  'extraForms',
  'extraTables',
  'signType',
  'isSigned',
  'statusValue',
] as const;

/**
 * 按节点类型与字段权限合并协议补丁；审批节点默认整单只读。
 * @param current 库中当前协议
 * @param incoming 办理页提交的协议
 * @param options 节点类型、字段权限、是否可办
 */
export function applyAgreementPatch(
  current: AgreementDetail,
  incoming: unknown,
  options: {
    canAct: boolean;
    fieldAccess?: FieldAccess;
    nodeType: string;
  },
): AgreementDetail {
  if (!options.canAct) throw new Error('当前不能修改协议');
  const next = structuredClone(current);
  if (incoming == null || options.nodeType === 'approve') return next;
  if (
    typeof incoming !== 'object' ||
    Array.isArray(incoming) ||
    JSON.stringify(incoming).length > 500_000
  )
    throw new Error('协议资料格式不正确');
  const src = incoming as Record<string, unknown>;
  for (const key of PATCH_KEYS) {
    if (!(key in src) || src[key] === undefined) continue;
    (next as Record<string, unknown>)[key] = structuredClone(src[key]);
  }
  next.id = current.id;
  next.agreementNo = current.agreementNo;
  next.status = current.status;
  if (next.basic) {
    next.basic = {
      ...current.basic,
      ...next.basic,
      agreementNo: current.agreementNo,
    };
  }
  restoreLockedAgreementFields(next, current, options.fieldAccess);
  return next;
}

/**
 * 只读/隐藏字段从当前协议还原，防止办理页篡改
 * @param next 合并后的协议
 * @param current 原协议
 * @param fieldAccess 节点字段权限
 */
function restoreLockedAgreementFields(
  next: AgreementDetail,
  current: AgreementDetail,
  fieldAccess?: FieldAccess,
) {
  next.basic.agreementNo = current.agreementNo;
  const locked = (key: string) => {
    const mode = fieldAccess?.[key];
    return mode === 'hidden' || mode === 'readonly';
  };
  if (locked('compensatee')) {
    next.basic.compensatee = current.basic.compensatee;
    if (next.rightHolders?.[0] && current.rightHolders?.[0])
      next.rightHolders[0] = {
        ...next.rightHolders[0],
        name: current.rightHolders[0].name,
      };
    if (next.population) next.population.headName = current.population.headName;
  }
  if (locked('houseAddress')) {
    next.houses = structuredClone(current.houses) as HouseRow[];
    next.signing = {
      ...next.signing,
      houseAddress: current.signing.houseAddress,
    };
    if (next.population)
      next.population.hukouAddress = current.population.hukouAddress;
  }
  if (locked('BuChangJinE')) {
    next.basic.amount = current.basic.amount;
  }
}

/**
 * 办理保存/提交后把可写字段回写到协议详情与列表（兼容仅头字段的旧 payload）
 * @param agreementNo 协议编号
 * @param data 流程实例当前 data
 */
export function syncAgreementFromWorkflow(
  agreementNo: string,
  data: Record<string, unknown>,
) {
  const row = findAgreeListRow(agreementNo);
  if (!row) return;
  const current = getOrCreateAgreementDetail(agreementNo, row);
  const compensatee = String(data.compensatee ?? current.basic?.compensatee);
  const houseAddress = String(
    data.houseAddress ??
      current.houses?.[0]?.address ??
      current.signing?.houseAddress,
  );
  const amount = amountOf(data.BuChangJinE ?? current.basic?.amount);
  const houses = (current.houses || []).map((house, index) =>
    index === 0 ? { ...house, address: houseAddress } : house,
  );
  saveAgreementDetailAll({
    ...current,
    basic: {
      ...current.basic,
      compensatee,
      amount,
    },
    houses:
      houses.length > 0
        ? houses
        : [
            {
              id: 'hs-wf',
              address: houseAddress,
              certNo: '',
              propertyType: '',
            },
          ],
    signing: {
      ...current.signing,
      houseAddress,
    },
    rightHolders: (current.rightHolders || []).map((holder, index) =>
      index === 0 ? { ...holder, name: compensatee } : holder,
    ),
    population: current.population
      ? {
          ...current.population,
          headName: compensatee,
          hukouAddress: houseAddress,
        }
      : current.population,
  });
}

/**
 * 把合并后的协议整单落库
 * @param detail 已按权限合并的协议
 */
export function persistWorkflowAgreement(detail: AgreementDetail) {
  return saveAgreementDetailAll(detail);
}

const HEADER_KEYS = new Set(BUSINESS_FIELDS.map((f) => f.key));

/**
 * 按节点权限把实例 data 中的节点字段写入协议（审批默认可写 fieldAccess=edit 的项）
 * @param detail 当前协议
 * @param data 流程实例 data
 * @param options 节点类型、字段权限，以及数据动作强制解锁的字段
 */
export function applyUnlockedFlowFields(
  detail: AgreementDetail,
  data: Record<string, unknown>,
  options: {
    fieldAccess?: FieldAccess;
    nodeType: string;
    unlockKeys?: string[];
  },
): AgreementDetail {
  const next = structuredClone(detail);
  next.flowFields = { ...next.flowFields };
  const unlocked = new Set(options.unlockKeys || []);
  const locked = (key: string) => {
    if (unlocked.has(key)) return false;
    const mode = options.fieldAccess?.[key];
    if (mode === 'hidden' || mode === 'readonly') return true;
    if (options.nodeType === 'approve') return mode !== 'edit';
    return false;
  };
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || HEADER_KEYS.has(key)) continue;
    if (locked(key)) continue;
    const item = WORKFLOW_FIELD_CATALOG.find((c) => c.key === key);
    if (item?.persist === 'basic' && next.basic) {
      if (key === 'remark') next.basic.remark = String(value ?? '');
      else if (WORKFLOW_PERSON_FIELDS.some((person) => person.key === key))
        next.basic[key] = value;
      continue;
    }
    if (item?.persist === 'header') continue;
    next.flowFields[key] = value;
  }
  return next;
}

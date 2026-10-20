/**
 * 协议列表全量数据 + 按 scene 过滤（模拟同一张表、同一接口）
 * 优先：页面配置里该 scene 的 statusIn；其次：内置 SCENE_STATUS_MAP
 * 列表写操作会改本数组，保证提交/删除后列表与详情状态一致
 */
import { randomUUID } from 'node:crypto';

import { AgreementStore } from './agreement-store';
import { pageSchemaStore } from './mock-page-schema';

export interface AgreeListRow {
  id: string;
  agreementNo: string;
  compensatee: string;
  houseAddress: string;
  statusValue: string;
  signType: string;
  isSigned: string;
  batchGroup: string;
}

/** 仅在尚无存档时使用的内置演示数据。 */
const DEFAULT_AGREE_ROWS: AgreeListRow[] = [
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
    compensatee: '测试用户',
    houseAddress: '测试地址1号',
    statusValue: '草稿',
    signType: '正常签约',
    isSigned: '未签约',
    batchGroup: '-',
  },
];

/** Only the bundled records may use sample detail data. */
const demoAgreementNos = new Set(
  DEFAULT_AGREE_ROWS.map((row) => row.agreementNo),
);

export const agreementStore = new AgreementStore(DEFAULT_AGREE_ROWS);
export const AGREE_ALL_ROWS = agreementStore.rows;

export function isDemoAgreementNo(agreementNo: string) {
  const row = findAgreeListRow(agreementNo);
  return row
    ? DEFAULT_AGREE_ROWS.some((seed) => seed.id === row.id)
    : demoAgreementNos.has(agreementNo);
}

/** 内置场景 → 状态白名单（页面配置未配 statusIn 时使用） */
const SCENE_STATUS_MAP: Record<string, string[] | undefined> = {
  entry: ['告知单', '待复核', '草稿'],
  lawyer_audit: ['组长已复核'],
  leader_audit: ['待复核'],
  preview: undefined,
  view: undefined,
};

/**
 * 解析场景允许的状态：页面配置优先
 * @param scene 场景码
 */
function resolveStatusAllow(
  scene: string,
  schemaId?: string,
): string[] | undefined {
  const enabled = pageSchemaStore.filter(
    (item) => item.schemaKind === 'scene' && item.status !== 0,
  );
  const fromSchema =
    enabled.find((item) => schemaId && String(item.id) === String(schemaId)) ||
    enabled.find((item) => String(item.scene) === String(scene));
  // 配了空数组 = 不过滤；未配该字段才退回内置场景
  if (fromSchema && Array.isArray(fromSchema.statusIn)) {
    return fromSchema.statusIn.length > 0 ? fromSchema.statusIn : undefined;
  }
  if (Object.prototype.hasOwnProperty.call(SCENE_STATUS_MAP, scene)) {
    return SCENE_STATUS_MAP[scene];
  }
  // 未知场景且无配置：不过滤（方便操作员新建场景先看全量，再收紧 statusIn）
  return undefined;
}

/**
 * 按场景过滤协议列表
 * @param options.scene 场景码
 * @param options.keyword 关键字
 * @param options.statusValue 额外状态筛选
 */
export function queryAgreeListByScene(options: {
  keyword?: string;
  scene: string;
  /** 菜单挂的页面配置，优先用它的状态范围 */
  schemaId?: string;
  statusValue?: string;
}) {
  const { scene, keyword, statusValue, schemaId } = options;
  const allow = resolveStatusAllow(scene, schemaId);

  let list = [...AGREE_ALL_ROWS];

  if (allow) {
    list = list.filter((r) => allow.includes(r.statusValue));
  }

  if (statusValue) {
    list = list.filter((r) => r.statusValue === statusValue);
  }

  const kw = String(keyword || '').trim();
  if (kw) {
    list = list.filter((r) =>
      [r.agreementNo, r.compensatee, r.houseAddress].some((v) =>
        String(v).includes(kw),
      ),
    );
  }

  return list;
}

/**
 * 按协议编号查找列表行
 * @param agreementNo 协议编号
 */
export function findAgreeListRow(agreementNo: string) {
  // oxlint-disable-next-line unicorn/no-array-callback-reference -- This repository lookup accepts a record reference, not a callback.
  return agreementStore.find(agreementNo);
}

/** 发起流程时持久化锁定；实例写入失败时可撤销本次新加的锁。 */
export function lockAgreementNumber(reference: string) {
  const row = findAgreeListRow(reference);
  if (!row) throw new Error('协议不存在或已删除');
  const added = agreementStore.update((draft) => {
    const number = !draft.lockedIds.includes(row.id);
    const body = !draft.workflowLockedIds?.includes(row.id);
    if (number) draft.lockedIds.push(row.id);
    if (body) (draft.workflowLockedIds ??= []).push(row.id);
    return { number, body };
  });
  return () => {
    if (added.number || added.body)
      agreementStore.update((draft) => {
        if (added.number)
          draft.lockedIds = draft.lockedIds.filter((id) => id !== row.id);
        if (added.body)
          draft.workflowLockedIds = draft.workflowLockedIds?.filter(
            (id) => id !== row.id,
          );
      });
  };
}

/**
 * 同步列表行状态（提交复核 / 审核等）
 * @param agreementNo 协议编号
 * @param patch 要合并的字段
 */
export function patchAgreeListRow(
  agreementNo: string,
  patch: Partial<AgreeListRow>,
) {
  const original = findAgreeListRow(agreementNo);
  if (!original) return null;
  return agreementStore.update((draft) => {
    const row = draft.rows.find((item) => item.id === original.id);
    if (!row) throw new Error('协议不存在或已删除，请刷新列表');
    // 标识不可修改；忽略 undefined，允许明确清空字段。
    const { id: _id, agreementNo: _number, ...fields } = patch;
    Object.assign(
      row,
      Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      ),
    );
    if (
      (row.statusValue !== '草稿' || row.isSigned === '已签约') &&
      !draft.lockedIds.includes(row.id)
    )
      draft.lockedIds.push(row.id);
    const detail = draft.details[row.id];
    if (detail) {
      detail.statusValue = row.statusValue;
      detail.basic.statusValue = row.statusValue;
      detail.signType = row.signType;
      detail.isSigned = row.isSigned;
      detail.basic.compensatee = row.compensatee;
      detail.signing.houseAddress = row.houseAddress;
    }
    return row;
  });
}

/**
 * 批量删除列表行
 * @param agreementNos 协议编号列表
 */
export function removeAgreeListRows(agreementNos: string[]) {
  const set = new Set(
    agreementNos
      .map((ref) => findAgreeListRow(ref)?.id)
      .filter((id): id is string => !!id),
  );
  if (set.size === 0) return 0;
  return agreementStore.update((draft) => {
    const before = draft.rows.length;
    for (const row of draft.rows.filter((item) => set.has(item.id))) {
      Object.defineProperty(draft.aliases, row.agreementNo, {
        value: row.id,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    draft.rows = draft.rows.filter((row) => !set.has(row.id));
    for (const no of set) Reflect.deleteProperty(draft.details, no);
    return before - draft.rows.length;
  });
}

/**
 * 新建草稿协议行
 * @param input 可选字段
 */
export function createAgreeListRow(
  input: {
    compensatee?: string;
    houseAddress?: string;
  } = {},
) {
  return agreementStore.update((draft) => {
    draft.sequence++;
    const uniqueId = randomUUID();
    const year = String(new Date().getFullYear());
    let next = draft.yearSequences[year] || 0;
    let agreementNo: string;
    do {
      agreementNo = `LL-${year}-${String(++next).padStart(4, '0')}`;
    } while (
      draft.rows.some(
        (row) => row.agreementNo === agreementNo || row.id === agreementNo,
      ) ||
      Object.hasOwn(draft.aliases, agreementNo)
    );
    draft.yearSequences[year] = next;
    const row: AgreeListRow = {
      id: `A-NEW-${uniqueId}`,
      agreementNo,
      compensatee: input.compensatee || '',
      houseAddress: input.houseAddress || '',
      statusValue: '草稿',
      signType: '',
      isSigned: '未签约',
      batchGroup: '',
    };
    draft.rows.unshift(row);
    return row;
  });
}

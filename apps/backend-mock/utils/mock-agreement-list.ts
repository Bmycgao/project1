/**
 * 协议列表全量数据 + 按 scene 过滤（模拟同一张表、同一接口）
 * 优先：页面配置里该 scene 的 statusIn；其次：内置 SCENE_STATUS_MAP
 */
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

/** 全量协议池 */
export const AGREE_ALL_ROWS: AgreeListRow[] = [
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
function resolveStatusAllow(scene: string): string[] | undefined {
  const fromSchema = pageSchemaStore.find(
    (item) =>
      item.schemaKind === 'scene' && String(item.scene) === String(scene),
  );
  if (fromSchema?.statusIn?.length) {
    return fromSchema.statusIn;
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
  scene: string;
  keyword?: string;
  statusValue?: string;
}) {
  const { scene, keyword, statusValue } = options;
  const allow = resolveStatusAllow(scene);

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

/**
 * 协议列表：共用列模板 + 多场景（按钮码 / 数据过滤不同，同一 list 接口）
 * 按钮只存动作码，文案与样式由 actions 注册表解析
 */
import {
  resolveToolbarButtons,
  type AgreeToolbarButton,
} from './actions';

export type { AgreeToolbarButton };

/** 场景配置 */
export interface AgreeSceneConfig {
  /** 场景码，请求 list 时带上 */
  scene: string;
  /** 页面配置 ID（可在页面配置里查看） */
  schemaId: string;
  title: string;
  remark: string;
  /** 详情打开模式 */
  detailMode: 'audit' | 'edit' | 'view';
  /**
   * 工具栏动作码列表（必须在 AGREE_ACTION_REGISTRY 中已注册）
   * 勿直接写 label；未注册的 code 会被 resolve 时丢弃
   */
  buttonCodes: string[];
  /** 前端兜底：允许出现的状态（最终以后端 scene 过滤为准） */
  statusIn?: string[];
}

/** 共用列（所有协议场景同一张表结构） */
export const AGREE_COLUMN_TEMPLATE = [
  { field: 'agreementNo', title: '协议编号', visible: true, minWidth: 130 },
  { field: 'compensatee', title: '被补偿人', visible: true, minWidth: 100 },
  { field: 'houseAddress', title: '房屋地址', visible: true, minWidth: 200 },
  {
    field: 'statusValue',
    title: '状态值',
    visible: true,
    minWidth: 120,
    cellType: 'tag' as const,
  },
  { field: 'signType', title: '签约类型', visible: true, minWidth: 110 },
  {
    field: 'isSigned',
    title: '是否签约',
    visible: true,
    minWidth: 100,
    cellType: 'tag' as const,
  },
  { field: 'batchGroup', title: '批次分组', visible: true, minWidth: 110 },
];

/** 列模板 ID（页面配置里可引用） */
export const AGREE_COLUMN_TEMPLATE_ID = 'PS_AGREE_COLS';

/**
 * 四个演示场景：录入 / 律师审核 / 预览 / 查看
 * 非开发「新建页」= 新菜单 + 选一个 scene（或扩展新 scene 配置）
 */
export const AGREE_SCENES: Record<string, AgreeSceneConfig> = {
  entry: {
    scene: 'entry',
    schemaId: 'PS_AGREE_ENTRY',
    title: '协议信息录入',
    remark: '电子协议 · 录入工作台',
    detailMode: 'edit',
    statusIn: ['告知单', '待复核', '草稿'],
    buttonCodes: [
      'add',
      'delete',
      'edit',
      'submitReview',
      'conditionalSign',
      'rejectRecord',
      'rejectPrev',
      'preview1',
      'preview2',
    ],
  },
  lawyer_audit: {
    scene: 'lawyer_audit',
    schemaId: 'PS_AGREE_LAWYER',
    title: '小组律师审核',
    remark: '电子协议 · 律师审核工作台',
    detailMode: 'audit',
    statusIn: ['组长已复核'],
    buttonCodes: [
      'approve',
      'reject',
      'rejectRecord',
      'preview1',
      'preview2',
      'ticket1',
      'ticket2',
    ],
  },
  preview: {
    scene: 'preview',
    schemaId: 'PS_AGREE_PREVIEW',
    title: '协议信息预览',
    remark: '信息查询 · 协议预览',
    detailMode: 'view',
    statusIn: undefined,
    buttonCodes: [
      'preSave',
      'companyAgree',
      'unlicensedAgree',
      'previewSupply',
      'previewChange',
      'previewAgree',
    ],
  },
  view: {
    scene: 'view',
    schemaId: 'PS_AGREE_VIEW',
    title: '查看',
    remark: '信息查询 · 查看',
    detailMode: 'view',
    statusIn: undefined,
    buttonCodes: ['edit'],
  },
};

/**
 * 按 scene 取配置
 * @param scene 场景码
 */
export function getAgreeScene(scene: string): AgreeSceneConfig | null {
  return AGREE_SCENES[scene] || null;
}

/**
 * 按 schemaId 反查场景
 * @param schemaId 页面配置 ID
 */
export function getAgreeSceneBySchemaId(schemaId: string): AgreeSceneConfig | null {
  return (
    Object.values(AGREE_SCENES).find((s) => s.schemaId === schemaId) || null
  );
}

/**
 * 解析场景工具栏按钮（只含已注册动作）
 * @param sceneCfg 场景配置
 */
export function getAgreeSceneButtons(
  sceneCfg: AgreeSceneConfig | null | undefined,
): AgreeToolbarButton[] {
  if (!sceneCfg) return [];
  return resolveToolbarButtons(sceneCfg.buttonCodes);
}

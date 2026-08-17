/** 协议签约模块标识（详情 5 块：基础/人口表单 + 房屋/补偿/奖励表格） */
export type AgreementModuleKey =
  | 'basic'
  | 'houses'
  | 'compensation'
  | 'rewards'
  | 'population';

/** 列表行 */
export interface AgreementListItem {
  id: string;
  agreementNo: string;
  compensatee: string;
  houseAddress: string;
  statusValue: string;
  signType: string;
  isSigned: string;
  batchGroup: string;
}

/** 权利人 */
export interface RightHolderRow {
  id: string;
  agreementNo: string;
  name: string;
  idNo: string;
  phone: string;
}

/** 房屋 */
export interface HouseRow {
  id: string;
  address: string;
  certNo: string;
  propertyType: string;
  /** 建筑面积 */
  buildArea?: string | number;
  /** 征收面积 */
  expropriatedArea?: string | number;
  /** 房屋类型 */
  houseType?: string;
  /** 结构 */
  structure?: string;
  /** 建成年份 */
  yearBuilt?: string;
  /** 楼层 */
  floor?: string;
  /** 评估价值 */
  evalValue?: string | number;
}

/** 基础信息表单（协议头 KV，对标详情页置顶表单） */
export interface BasicInfo {
  agreementNo: string;
  /** 协议名称 */
  agreementName: string;
  /** 所属部门 */
  department: string;
  /** 征收人 */
  acquirer: string;
  /** 被征收人 */
  compensatee: string;
  /** 协议金额 */
  amount: string | number;
  /** 签约日期 */
  signDate: string;
  /** 状态展示值 */
  statusValue: string;
  /** 备注 */
  remark: string;
  /** 配置台新增的扩展字段 */
  [key: string]: unknown;
}

/** 协议人口信息（户维度表单） */
export interface PopulationInfo {
  /** 户主姓名 */
  headName: string;
  idNo: string;
  /** 家庭人口 */
  familySize: string | number;
  phone: string;
  /** 户籍地址 */
  hukouAddress: string;
  remark: string;
  [key: string]: unknown;
}

/** 补偿安置行 */
export interface CompensationRow {
  id: string;
  name: string;
  calcType: string;
  quantity: string | number;
  unitPrice: string | number;
  amount: string | number;
  remark: string;
  [key: string]: unknown;
}

/** 奖励补贴行 */
export interface RewardRow {
  id: string;
  name: string;
  condition: string;
  amount: string | number;
  remark: string;
  [key: string]: unknown;
}

/** 基础信息自定义子块行（列由配置决定） */
export interface BasicTableRow {
  id: string;
  [key: string]: unknown;
}

/** 签约信息（单行业务，用表单而非宽表） */
export interface SigningInfo {
  houseAddress: string;
  compensateMethod: string;
  decorateEval: string;
  hasMortgage: string;
  mortgagee: string;
  debtAmount: string | number;
  hasSeal: string;
  sealCourt: string;
  /** 签约日期（展示格式由 fieldRules.displayFormat 控制） */
  signDate?: string;
}

/** 通讯信息 */
export interface ContactInfo {
  address: string;
  contact: string;
  phone: string;
  emergency: string;
}

/** 材料行 */
export interface MaterialRow {
  id: string;
  category: string;
  required: string;
  fileName: string;
  remark: string;
}

/** 补偿安置 */
export interface CompensationInfo {
  settleType: string;
  settleAddress: string;
  amount: string | number;
  remark: string;
}

/** 详情整体 */
export interface AgreementDetail {
  id: string;
  agreementNo: string;
  status: 'draft' | 'review' | 'submitted';
  statusValue: string;
  signType: string;
  isSigned: string;
  /** 协议头表单（与顶栏编号/状态同步） */
  basic: BasicInfo;
  rightHolders: RightHolderRow[];
  houses: HouseRow[];
  /**
   * 配置台「新增子块」产生的表格数据：sectionKey → 行数组
   * 内置权利人/房屋仍用上面两个字段
   */
  basicTables?: Record<string, BasicTableRow[]>;
  signing: SigningInfo;
  contact: ContactInfo;
  signMaterials: MaterialRow[];
  certifyMaterials: MaterialRow[];
  /** 旧版补偿对象（金额汇总仍可读） */
  compensation: CompensationInfo;
  /** 补偿安置表格行 */
  compensationItems: CompensationRow[];
  /** 奖励补贴表格行 */
  rewardItems: RewardRow[];
  /** 协议人口表单 */
  population: PopulationInfo;
}

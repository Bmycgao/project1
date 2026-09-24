/** 与前端协议详情 types 对齐的 mock 类型（避免跨包引用） */

export type AgreementModuleKey = string;

export interface RightHolderRow {
  id: string;
  agreementNo: string;
  name: string;
  idNo: string;
  phone: string;
}

export interface HouseRow {
  id: string;
  address: string;
  certNo: string;
  propertyType: string;
  buildArea?: number | string;
  expropriatedArea?: number | string;
  houseType?: string;
  structure?: string;
  yearBuilt?: string;
  floor?: string;
  evalValue?: number | string;
}

/** 协议头表单（含配置台扩展字段） */
export interface BasicInfo {
  agreementNo: string;
  agreementName: string;
  department: string;
  acquirer: string;
  compensatee: string;
  amount: number | string;
  signDate: string;
  statusValue: string;
  remark: string;
  [key: string]: unknown;
}

/** 协议人口表单 */
export interface PopulationInfo {
  headName: string;
  idNo: string;
  familySize: number | string;
  phone: string;
  hukouAddress: string;
  remark: string;
  [key: string]: unknown;
}

export interface CompensationRow {
  id: string;
  name: string;
  calcType: string;
  quantity: number | string;
  unitPrice: number | string;
  amount: number | string;
  remark: string;
  [key: string]: unknown;
}

export interface RewardRow {
  id: string;
  name: string;
  condition: string;
  amount: number | string;
  remark: string;
  [key: string]: unknown;
}

/** 自定义基础信息子块行 */
export interface BasicTableRow {
  id: string;
  [key: string]: unknown;
}

export interface SigningInfo {
  houseAddress: string;
  compensateMethod: string;
  decorateEval: string;
  hasMortgage: string;
  mortgagee: string;
  debtAmount: number | string;
  hasSeal: string;
  sealCourt: string;
  signDate?: string;
}

export interface ContactInfo {
  address: string;
  contact: string;
  phone: string;
  emergency: string;
}

export interface MaterialRow {
  id: string;
  category: string;
  required: string;
  fileName: string;
  remark: string;
}

export interface CompensationInfo {
  settleType: string;
  settleAddress: string;
  amount: number | string;
  remark: string;
}

export interface AgreementDetail {
  id: string;
  agreementNo: string;
  status: 'draft' | 'review' | 'submitted';
  statusValue: string;
  signType: string;
  isSigned: string;
  basic: BasicInfo;
  rightHolders: RightHolderRow[];
  houses: HouseRow[];
  /** 配置台新增子块的行数据 */
  basicTables?: Record<string, BasicTableRow[]>;
  signing: SigningInfo;
  contact: ContactInfo;
  signMaterials: MaterialRow[];
  certifyMaterials: MaterialRow[];
  compensation: CompensationInfo;
  compensationItems: CompensationRow[];
  rewardItems: RewardRow[];
  population: PopulationInfo;
  extraForms?: Record<string, Record<string, unknown>>;
  extraTables?: Record<string, Record<string, unknown>[]>;
  /** 流程节点额外字段（如法务意见），按字段标识存 */
  flowFields?: Record<string, unknown>;
}

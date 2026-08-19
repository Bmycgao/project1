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
  buildArea?: string | number;
  expropriatedArea?: string | number;
  houseType?: string;
  structure?: string;
  yearBuilt?: string;
  floor?: string;
  evalValue?: string | number;
}

/** 协议头表单（含配置台扩展字段） */
export interface BasicInfo {
  agreementNo: string;
  agreementName: string;
  department: string;
  acquirer: string;
  compensatee: string;
  amount: string | number;
  signDate: string;
  statusValue: string;
  remark: string;
  [key: string]: unknown;
}

/** 协议人口表单 */
export interface PopulationInfo {
  headName: string;
  idNo: string;
  familySize: string | number;
  phone: string;
  hukouAddress: string;
  remark: string;
  [key: string]: unknown;
}

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

export interface RewardRow {
  id: string;
  name: string;
  condition: string;
  amount: string | number;
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
  debtAmount: string | number;
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
  amount: string | number;
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
}

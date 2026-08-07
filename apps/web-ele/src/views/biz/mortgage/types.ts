/** 抵押详情列表入参 / 路由参数 */
export interface MortgageRowPayload {
  id?: string;
  agreementNo?: string;
  compensatee?: string;
  houseAddress?: string;
  [key: string]: any;
}

/** 权利人信息行 */
export interface RightHolderRow {
  id: string;
  agreementNo: string;
  name: string;
  idNo: string;
  phone: string;
}

/** 房屋列表行 */
export interface HouseRow {
  id: string;
  address: string;
  certNo: string;
  propertyType: string;
}

/** 抵押信息主数据 */
export interface MortgageInfoData {
  loanStartTime: string;
  loanTerm: number | string;
  remainingTerm: number | string;
  remainingLoan: number | string;
  repayMethod: string;
  interestRate: number | string;
  performance: string;
  accountConsistent: string;
}

/** 抵押资料行 */
export interface MortgageMaterialRow {
  id: string;
  category: string;
  required: string;
  limitFile: string;
  supplementFile: string;
}

/** 基础信息模块数据 */
export interface MortgageBasicModule {
  rightHolders: RightHolderRow[];
  houses: HouseRow[];
}

/** 抵押详情整体结构 */
export interface MortgageDetail {
  id?: string;
  agreementNo: string;
  status?: 'draft' | 'submitted';
  rightHolders: RightHolderRow[];
  houses: HouseRow[];
  mortgageInfo: MortgageInfoData[];
  materials: MortgageMaterialRow[];
}

/** Tab 模块标识 */
export type MortgageModuleKey = 'basic' | 'mortgage' | 'material';

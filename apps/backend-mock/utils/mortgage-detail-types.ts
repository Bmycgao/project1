/** 与前端 mortgage types 对齐的 mock 类型（避免跨包引用） */

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
}

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

export interface MortgageMaterialRow {
  id: string;
  category: string;
  required: string;
  limitFile: string;
  supplementFile: string;
}

export interface MortgageBasicModule {
  rightHolders: RightHolderRow[];
  houses: HouseRow[];
}

export interface MortgageDetail {
  id?: string;
  agreementNo: string;
  status?: 'draft' | 'submitted';
  rightHolders: RightHolderRow[];
  houses: HouseRow[];
  mortgageInfo: MortgageInfoData[];
  materials: MortgageMaterialRow[];
}

export type MortgageModuleKey = 'basic' | 'mortgage' | 'material';

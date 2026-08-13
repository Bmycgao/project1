/** 与前端协议详情 types 对齐的 mock 类型（避免跨包引用） */

export type AgreementModuleKey =
  | 'basic'
  | 'signing'
  | 'signMaterial'
  | 'certifyMaterial'
  | 'compensation';

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
  rightHolders: RightHolderRow[];
  houses: HouseRow[];
  signing: SigningInfo;
  contact: ContactInfo;
  signMaterials: MaterialRow[];
  certifyMaterials: MaterialRow[];
  compensation: CompensationInfo;
}

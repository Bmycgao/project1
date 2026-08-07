/** 协议签约模块标识 */
export type AgreementModuleKey =
  | 'basic'
  | 'signing'
  | 'signMaterial'
  | 'certifyMaterial'
  | 'compensation';

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
  rightHolders: RightHolderRow[];
  houses: HouseRow[];
  signing: SigningInfo;
  contact: ContactInfo;
  signMaterials: MaterialRow[];
  certifyMaterials: MaterialRow[];
  compensation: CompensationInfo;
}

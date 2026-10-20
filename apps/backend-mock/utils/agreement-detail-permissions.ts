import type { AgreementDetail } from './agreement-detail-types';

import {
  canAccessAgreementModule,
  isCustomAgreementModule,
} from '../../shared/agreement-module-access';

/** Read and write APIs use the same module grants as the two detail pages. */
export function projectAgreementDetailForCodes(
  detail: AgreementDetail,
  codes: string[],
): AgreementDetail {
  const result = structuredClone(detail);
  const allowed = (key: string) => canAccessAgreementModule(codes, key);
  const allowedCustom = (key: string) =>
    isCustomAgreementModule(key) && allowed(key);
  if (!allowed('basic')) {
    result.basic = {
      agreementNo: detail.agreementNo,
      agreementName: '',
      department: '',
      acquirer: '',
      compensatee: '',
      amount: '',
      signDate: '',
      statusValue: '',
      remark: '',
    };
    result.basicTables = {};
  }
  if (!allowed('houses')) result.houses = [];
  if (!allowed('compensation')) {
    result.compensation = {
      settleType: '',
      settleAddress: '',
      amount: '',
      remark: '',
    };
    result.compensationItems = [];
  }
  if (!allowed('rewards')) result.rewardItems = [];
  if (!allowed('population')) {
    result.population = {
      headName: '',
      idNo: '',
      familySize: '',
      phone: '',
      hukouAddress: '',
      remark: '',
    };
    result.rightHolders = [];
  }
  result.extraForms = Object.fromEntries(
    Object.entries(result.extraForms || {}).filter(([key]) =>
      allowedCustom(key),
    ),
  );
  result.extraTables = Object.fromEntries(
    Object.entries(result.extraTables || {}).filter(([key]) =>
      allowedCustom(key),
    ),
  );
  return result;
}

/** A whole-detail save must preserve data in modules the caller cannot see. */
export function restrictAgreementDetailWrite(
  payload: Partial<AgreementDetail>,
  current: AgreementDetail,
  codes: string[],
): Partial<AgreementDetail> {
  const result = structuredClone(payload);
  const allowed = (key: string) => canAccessAgreementModule(codes, key);
  const allowedCustom = (key: string) =>
    isCustomAgreementModule(key) && allowed(key);
  if (!allowed('basic')) {
    delete result.basic;
    result.agreementNo = current.agreementNo;
    delete result.basicTables;
  }
  if (!allowed('houses')) delete result.houses;
  if (!allowed('compensation')) {
    delete result.compensation;
    delete result.compensationItems;
  }
  if (!allowed('rewards')) delete result.rewardItems;
  if (!allowed('population')) {
    delete result.population;
    delete result.rightHolders;
  }
  result.extraForms = {
    ...current.extraForms,
    ...Object.fromEntries(
      Object.entries(result.extraForms || {}).filter(([key]) =>
        allowedCustom(key),
      ),
    ),
  };
  result.extraTables = {
    ...current.extraTables,
    ...Object.fromEntries(
      Object.entries(result.extraTables || {}).filter(([key]) =>
        allowedCustom(key),
      ),
    ),
  };
  return result;
}

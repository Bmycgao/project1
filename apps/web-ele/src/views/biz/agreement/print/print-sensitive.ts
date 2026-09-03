/**
 * 打印敏感数据：模板只存 field 名；正式打印前按 Agree:Field:* 打码
 * 设计器样例不走这里，避免排版时格子被打成 ***
 */
import type { AgreeFieldRule } from '../field-access';
import type { AgreePrintData } from './types';

import { DEFAULT_AGREE_FIELD_RULES, resolveFieldAccess } from '../field-access';
import { cloneTemplate } from './template-store';

/** 无权限时的打码文案 */
export const PRINT_SENSITIVE_MASK = '***';

/**
 * 打印专用字段规则（不并进列表 fieldRules，避免列表被征收人也被藏）
 * 权限码与菜单 Agree:Field:* 对齐，超管 Agree:* 仍全开
 */
export const PRINT_SENSITIVE_FIELD_RULES: AgreeFieldRule[] = [
  {
    field: 'compensatee',
    visibleCodes: ['Agree:Field:compensatee'],
    remark: '打印-被征收人 / 户名',
  },
  {
    field: 'certNo',
    visibleCodes: ['Agree:Field:certNo'],
    remark: '打印-产权证号',
  },
  {
    field: 'address',
    visibleCodes: ['Agree:Field:address'],
    remark: '打印-房屋地址',
  },
];

/** 打印 JSON key → 字段权限名 */
const PRINT_KEY_TO_ACCESS_FIELD: Record<string, string> = {
  compensatee: 'compensatee',
  householdName: 'compensatee',
  certNo: 'certNo',
  address: 'address',
  amount: 'amount',
  amountCn: 'amount',
  compensationTotal: 'amount',
  rewardTotal: 'amount',
  phone: 'phone',
  idNo: 'idNo',
};

/**
 * 页面 fieldRules + 打印专用敏感规则（同 field 以页面配置为准）
 * @param pageRules 列表/详情下发的规则
 */
export function mergePrintFieldRules(
  pageRules?: AgreeFieldRule[],
): AgreeFieldRule[] {
  const page = pageRules?.length ? pageRules : DEFAULT_AGREE_FIELD_RULES;
  const seen = new Set(page.map((r) => r.field));
  return [
    ...page,
    ...PRINT_SENSITIVE_FIELD_RULES.filter((r) => !seen.has(r.field)),
  ];
}

/**
 * 二维码 / 条码 / 元信息：只留协议编号，不拼姓名
 * @param agreementNo 协议编号
 * @param agreementName 协议名称
 */
export function buildPrintIdentity(
  agreementNo: string,
  agreementName: string,
): Pick<AgreePrintData, 'barcodeContent' | 'printMeta' | 'qrcodeContent'> {
  const no = String(agreementNo || '').trim();
  const name = String(agreementName || '协议').trim() || '协议';
  return {
    qrcodeContent: no ? `AGREE:${no}` : 'AGREE',
    barcodeContent: no,
    printMeta: `${name}|${no}`,
  };
}

/**
 * 无权限的顶层/行内字段打成 ***，再重写二维码（不含姓名）
 * @param printData 业务打印数据
 * @param rules 合并后的字段规则
 * @param accessCodes 当前用户权限码
 */
export function maskAgreePrintData(
  printData: AgreePrintData,
  rules: AgreeFieldRule[] | undefined,
  accessCodes: string[] | undefined,
): AgreePrintData {
  const next = cloneTemplate(printData) as AgreePrintData;
  const bag = next as unknown as Record<string, unknown>;

  const canSee = (accessField: string) =>
    resolveFieldAccess(accessField, rules, accessCodes).visible;

  for (const [printKey, accessField] of Object.entries(
    PRINT_KEY_TO_ACCESS_FIELD,
  )) {
    if (canSee(accessField)) continue;
    if (!(printKey in bag)) continue;
    const val = bag[printKey];
    if (val !== null && typeof val === 'object') continue;
    bag[printKey] = PRINT_SENSITIVE_MASK;
  }

  if (Array.isArray(next.houses)) {
    next.houses = next.houses.map((row) => {
      const patched = { ...row };
      if (!canSee('compensatee')) patched.householdName = PRINT_SENSITIVE_MASK;
      if (!canSee('certNo')) patched.certNo = PRINT_SENSITIVE_MASK;
      if (!canSee('address')) patched.address = PRINT_SENSITIVE_MASK;
      return patched;
    });
  }

  if (!canSee('amount')) {
    next.compensationItems = next.compensationItems.map((row) => ({
      ...row,
      amount: PRINT_SENSITIVE_MASK,
      unitPrice: PRINT_SENSITIVE_MASK,
    }));
    next.rewardItems = next.rewardItems.map((row) => ({
      ...row,
      amount: PRINT_SENSITIVE_MASK,
    }));
  }

  Object.assign(next, buildPrintIdentity(next.agreementNo, next.agreementName));
  return next;
}

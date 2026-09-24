/**
 * 把流程节点 fieldAccess 转成协议字段规则（隐藏/只读）
 * @param access 节点上的字段权限
 */
import type { AgreeFieldRule } from '../biz/agreement/access/field-access';

const ALIASES: Record<string, string[]> = {
  agreementNo: ['agreementNo'],
  compensatee: ['compensatee'],
  houseAddress: ['houseAddress', 'address'],
  BuChangJinE: ['amount', 'BuChangJinE'],
  remark: ['remark'],
};

export function agreeRulesFromWorkflowAccess(
  access?: Record<string, 'edit' | 'readonly' | 'hidden'>,
): AgreeFieldRule[] {
  const rules: AgreeFieldRule[] = [];
  for (const [key, mode] of Object.entries(access || {})) {
    const fields = ALIASES[key] || [key];
    for (const field of fields) {
      if (mode === 'hidden') rules.push({ field, hidden: true });
      else if (mode === 'readonly')
        rules.push({ field, editableCodes: ['Workflow:Field:Edit'] });
    }
  }
  return rules;
}

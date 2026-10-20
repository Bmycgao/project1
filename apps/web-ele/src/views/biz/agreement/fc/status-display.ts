import type { FcRule } from './types';

import { appendAgreementStatusOptions } from '../../../../../../shared/agreement-demo-status';
import { cloneFcRule } from './types';

/** 旧页面/流程快照缺少当前状态选项时补充显示，不修改已发布模板。 */
export function withCurrentAgreementStatus(
  rule: FcRule[],
  value: string,
): FcRule[] {
  const result = cloneFcRule(rule);
  function visit(rules: FcRule[]) {
    for (const item of rules) {
      if (!item || typeof item !== 'object') continue;
      if (item.field === 'statusValue' && Array.isArray(item.options)) {
        item.options = appendAgreementStatusOptions(item.options, [value]);
      }
      if (Array.isArray(item.children)) visit(item.children);
    }
  }
  visit(result);
  return result;
}

import { describe, expect, it } from 'vitest';
import { agreeRulesFromWorkflowAccess } from './agree-rules';

describe('agreeRulesFromWorkflowAccess', () => {
  it('maps workflow fieldAccess to agreement aliases', () => {
    const rules = agreeRulesFromWorkflowAccess({
      houseAddress: 'hidden',
      BuChangJinE: 'readonly',
      compensatee: 'edit',
    });
    expect(rules).toEqual(
      expect.arrayContaining([
        { field: 'houseAddress', hidden: true },
        { field: 'address', hidden: true },
        { field: 'amount', editableCodes: ['Workflow:Field:Edit'] },
        { field: 'BuChangJinE', editableCodes: ['Workflow:Field:Edit'] },
      ]),
    );
    expect(rules.some((r) => r.field === 'compensatee')).toBe(false);
  });
});

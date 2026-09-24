import { describe, expect, it } from 'vitest';

import { evaluateCondition } from './workflow-expression';
describe('safe workflow conditions', () => {
  it('handles amount thresholds, strings and boolean groups', () => {
    expect(
      evaluateCondition(
        "BuChangJinE >= 1000000 && (kind == '住宅' || urgent == true)",
        { BuChangJinE: 1_200_000, kind: '住宅', urgent: false },
      ),
    ).toBe(true);
    expect(
      evaluateCondition('BuChangJinE >= 1000000', { BuChangJinE: 990_000 }),
    ).toBe(false);
    expect(evaluateCondition('!(amount < 20)', { amount: 20 })).toBe(true);
  });
  it('rejects scripts, calls, assignment and prototype access', () => {
    for (const code of [
      'fetch("x")',
      'a = 1',
      'a > 1; process.exit()',
      'constructor == 1',
      'a.__proto__.x == 1',
      'a + 1 > 2',
    ])
      expect(() => evaluateCondition(code, {}, true)).toThrow();
  });
  it('does not coerce invalid amounts or quietly route missing values', () => {
    expect(() =>
      evaluateCondition('amount >= 1', { amount: '1200000' }),
    ).toThrow('数值');
    expect(() => evaluateCondition('missing > 0', {})).toThrow('没有值');
  });
  it('rejects malformed expressions at publication without executing them', () => {
    expect(() => evaluateCondition('(a > 1', {}, true)).toThrow();
    expect(() => evaluateCondition('a >', {}, true)).toThrow();
    expect(() => evaluateCondition('a > 1 &&', {}, true)).toThrow();
    expect(() =>
      evaluateCondition('a >= 1 && b == "x"', {}, true),
    ).not.toThrow();
  });
});

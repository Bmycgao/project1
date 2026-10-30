import { describe, expect, it } from 'vitest';

import { resolvePrintTextSections } from './print-long-text';
import {
  insertPrintTextExpression,
  locatePrintTextExpression,
} from './print-text-insert';

describe('long text expression insertion', () => {
  it('inserts in the middle and replaces selected text without changing surrounding content', () => {
    expect(
      insertPrintTextExpression('甲方姓名，签订协议。', 'compensatee', 2, 4),
    ).toEqual({ content: '甲方{{compensatee}}，签订协议。', cursor: 17 });
    expect(
      insertPrintTextExpression('金额：元', 'FORMAT_MONEY(amount, 2)', 3)
        .content,
    ).toBe('金额：{{FORMAT_MONEY(amount, 2)}}元');
  });
  it('finds and replaces a complete existing expression including multiline expressions', () => {
    const content = '金额：{{IF(amount > 0,\n amount, 0)}}元';
    const range = locatePrintTextExpression(content, 9);
    expect(range.expression).toBe('IF(amount > 0,\n amount, 0)');
    const updated = insertPrintTextExpression(
      content,
      'ROUND(amount, 2)',
      range.start,
      range.end,
    ).content;
    expect(updated).toBe('金额：{{ROUND(amount, 2)}}元');
    expect(locatePrintTextExpression(updated, updated.length)).toMatchObject({
      expression: '',
      start: updated.length,
    });
    expect(
      resolvePrintTextSections([{ content: updated, when: 'amount > 0' }], {
        amount: 12.345,
      }),
    ).toBe('金额：12.35元');
  });
});

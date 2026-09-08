import { describe, expect, it } from 'vitest';

import {
  AGREE_PRINT_FORMAT_GROUPS,
  createColumnFormatterSrc,
  formatPrintValue,
  tableSummaryDecimals,
} from './format-print-value';

describe('print value formats', () => {
  it('offers grouped, unique formats for the inspector', () => {
    const values = AGREE_PRINT_FORMAT_GROUPS.flatMap((group) =>
      group.options.map((option) => option.value),
    );
    expect(new Set(values).size).toBe(values.length);
    expect(AGREE_PRINT_FORMAT_GROUPS.map((group) => group.label)).toEqual([
      '数字',
      '金额',
      '日期',
      '日期时间',
      '时间',
    ]);
  });

  it('formats date, datetime and time variants', () => {
    const value = '2026-03-05 08:09:07';
    expect(formatPrintValue(value, 'dateSlash')).toBe('2026/03/05');
    expect(formatPrintValue(value, 'dateCnShort')).toBe('2026年3月5日');
    expect(formatPrintValue(value, 'dateCompact')).toBe('20260305');
    expect(formatPrintValue(value, 'datetimeSecond')).toBe(
      '2026-03-05 08:09:07',
    );
    expect(formatPrintValue(value, 'timeSecond')).toBe('08:09:07');
  });

  it('formats number, money and percent variants', () => {
    expect(formatPrintValue(12_345.678, 'number3')).toBe('12,345.678');
    expect(formatPrintValue(12_345.678, 'moneySymbol')).toBe('¥12,345.68');
    expect(formatPrintValue(0.1234, 'percent1')).toBe('12.3%');
    expect(formatPrintValue(12.3, 'percentRaw2')).toBe('12.30%');
    expect(formatPrintValue(12_345.67, 'moneyCn')).toBe(
      '壹万贰仟叁佰肆拾伍元陆角柒分',
    );
  });

  it('keeps table formatter and summary precision aligned', () => {
    // 与 hiprint formatter 同源：createColumnFormatterSrc 内嵌 formatPrintValue 同规则
    expect(createColumnFormatterSrc('datetimeSecond', false)).toContain(
      'datetimeSecond',
    );
    expect(formatPrintValue('2026-03-05 08:09:07', 'datetimeSecond')).toBe(
      '2026-03-05 08:09:07',
    );
    expect(createColumnFormatterSrc('moneySymbol', false)).toContain(
      'moneySymbol',
    );
    expect(formatPrintValue(12_345.678, 'moneySymbol')).toBe('¥12,345.68');
    expect(tableSummaryDecimals('moneySymbol')).toBe(2);
    expect(tableSummaryDecimals('money4')).toBe(4);
    expect(tableSummaryDecimals('percent0')).toBe(0);
  });
});

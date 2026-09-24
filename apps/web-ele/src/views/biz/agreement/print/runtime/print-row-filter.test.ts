import { describe, expect, it } from 'vitest';

import { TABLE_COLUMN_PRESETS } from '../data/fields';
import {
  buildFilterPresets,
  compileFilterCond,
  condForField,
  defaultFilterOp,
  fieldInFilterExpr,
  listColumnUniqueValues,
  listFilterChips,
  parseFilterExpr,
  upsertFieldFilter,
} from './print-row-filter';

/** 把列预设转成筛行弹窗用的列描述 */
function toFilterCols(tableField: string) {
  return (TABLE_COLUMN_PRESETS[tableField] || []).map((col) => ({
    field: col.field,
    title: col.title,
    align: col.align,
    tableSummary: Boolean(col.tableSummary),
  }));
}

describe('buildFilterPresets', () => {
  it('only prefills hide-zero amount and hide-empty name for reward tables', () => {
    const presets = buildFilterPresets(toFilterCols('rewardItems'));
    expect(presets.map((item) => item.label)).toEqual([
      '隐藏金额为 0 的行',
      '隐藏奖励项目为空的行',
    ]);
    expect(presets[0]?.conds).toEqual([
      { field: 'amount', op: 'gt', value: '0' },
    ]);
  });

  it('prefers evalValue and householdName on house tables', () => {
    const presets = buildFilterPresets(toFilterCols('houses'));
    expect(presets.map((item) => item.label)).toEqual([
      '隐藏评估价值为 0 的行',
      '隐藏户名为空的行',
    ]);
  });
});

describe('upsertFieldFilter', () => {
  const cols = toFilterCols('rewardItems');

  it('adds a column cond onto an empty filter', () => {
    expect(
      upsertFieldFilter('', 'amount', {
        field: 'amount',
        op: 'gt',
        value: '0',
      }),
    ).toEqual({ blocked: false, expr: 'amount > 0' });
  });

  it('replaces only the same column inside AND filters', () => {
    const next = upsertFieldFilter('amount > 0 && !EMPTY(name)', 'amount', {
      field: 'amount',
      op: 'gt',
      value: '100',
    });
    expect(next.blocked).toBe(false);
    expect(next.expr).toContain('amount > 100');
    expect(next.expr).toContain('!EMPTY(name)');
  });

  it('removes one column and keeps the rest', () => {
    expect(
      upsertFieldFilter('amount > 0 && !EMPTY(name)', 'amount', null),
    ).toEqual({ blocked: false, expr: '!EMPTY(name)' });
  });

  it('does not silently rewrite advanced expressions', () => {
    const expr = 'amount > 0 && (name == "a" || name == "b")';
    expect(
      upsertFieldFilter(expr, 'amount', {
        field: 'amount',
        op: 'gt',
        value: '1',
      }),
    ).toEqual({ blocked: true, expr });
  });

  it('builds chips and detects filtered columns', () => {
    const expr = 'amount > 0 && !EMPTY(name)';
    expect(listFilterChips(expr, cols).map((c) => c.label)).toEqual([
      '金额 大于 0',
      '奖励项目 不为空',
    ]);
    expect(fieldInFilterExpr(expr, 'amount')).toBe(true);
    expect(fieldInFilterExpr(expr, 'quantity')).toBe(false);
    expect(condForField(expr, 'amount')).toEqual({
      field: 'amount',
      op: 'gt',
      value: '0',
    });
    expect(defaultFilterOp('amount')).toBe('gt');
    expect(defaultFilterOp('name')).toBe('notEmpty');
  });

  it('compiles empty IN as a no-match filter and lists unique values', () => {
    expect(compileFilterCond({ field: 'name', op: 'in', value: '' })).toBe(
      'IN(name)',
    );
    expect(parseFilterExpr('IN(name)').conds[0]).toEqual({
      field: 'name',
      op: 'in',
      value: '',
    });
    const values = listColumnUniqueValues('rewardItems', 'name', 'amount > 0', {
      rewardItems: [
        { name: 'A', amount: 1 },
        { name: 'A', amount: 2 },
        { name: 'B', amount: 0 },
        { name: '', amount: 3 },
      ],
    } as any);
    expect(values.map((item) => [item.label, item.count])).toEqual([
      ['A', 2],
      ['(空白)', 1],
    ]);
  });
});

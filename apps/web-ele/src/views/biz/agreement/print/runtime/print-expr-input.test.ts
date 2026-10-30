import { describe, expect, it } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import { evalPrintExpr } from './print-expr';
import {
  compilePrintCondition,
  parsePrintCondition,
  serializePrintLiteral,
} from './print-expr-input';

describe('expression parameter authoring', () => {
  it('keeps text, numeric and boolean literals distinct', () => {
    expect(serializePrintLiteral('text', '100 + "20"')).toBe(
      String.raw`"100 + \"20\""`,
    );
    expect(serializePrintLiteral('text', '')).toBe('""');
    expect(serializePrintLiteral('number', '-1.25e2')).toBe('-1.25e2');
    for (const input of ['', '100 + 20', 'Infinity', '1e999', 'abc'])
      expect(serializePrintLiteral('number', input)).toBe('');
    expect(serializePrintLiteral('boolean', 'false')).toBe('false');
    expect(serializePrintLiteral('boolean', 'no')).toBe('');
  });

  it('requires all clauses, and compiles field comparisons and unary conditions', () => {
    expect(compilePrintCondition([], 'and')).toBe('');
    expect(
      compilePrintCondition(
        [{ field: 'amount', operator: '>', value: '' }],
        'and',
      ),
    ).toBe('');
    const rows = [
      { field: 'amount', operator: '>=', value: 'quantity' },
      { field: 'name', operator: 'not-empty', value: '' },
    ];
    const code = compilePrintCondition(rows, 'and');
    expect(code).toBe('(amount >= quantity) && (!EMPTY(name))');
    expect(
      evalPrintExpr(code, { amount: 20, quantity: 10, name: '张三' }),
    ).toBe(true);
    expect(evalPrintExpr(code, { amount: 20, quantity: 10, name: '' })).toBe(
      false,
    );
    expect(
      evalPrintExpr(compilePrintCondition(rows, 'or'), {
        amount: 0,
        quantity: 10,
        name: '张三',
      }),
    ).toBe(true);
    for (const operator of ['true', 'false', 'empty', 'not-empty'])
      expect(
        compilePrintCondition([{ field: 'flag', operator, value: '' }], 'and'),
      ).not.toBe('');
  });

  it('preserves expression precedence and supports text containment', () => {
    const code = compilePrintCondition(
      [{ field: 'amount', operator: '>', value: 'flag ? 10 : 20' }],
      'and',
    );
    expect(code).toBe('amount > (flag ? 10 : 20)');
    expect(evalPrintExpr(code, { amount: 15, flag: true })).toBe(true);
    expect(evalPrintExpr(code, { amount: 15, flag: false })).toBe(false);
    const contains = compilePrintCondition(
      [{ field: 'name', operator: 'contains', value: '"张"' }],
      'and',
    );
    expect(evalPrintExpr(contains, { name: '张三' })).toBe(true);
    const excludes = compilePrintCondition(
      [{ field: 'name', operator: 'not-contains', value: '"李"' }],
      'and',
    );
    expect(evalPrintExpr(excludes, { name: '张三' })).toBe(true);
  });
});

describe('condition hydration', () => {
  it('keeps field references and logical operators inside quoted text intact', () => {
    const code = '(amount >= quantity) && (name == "a && b || c")';
    const parsed = requireDefined(parsePrintCondition(code));
    expect(parsed.rows[0]?.value).toBe('quantity');
    expect(compilePrintCondition(parsed.rows, parsed.relation)).toBe(code);
    expect(
      evalPrintExpr(compilePrintCondition(parsed.rows, parsed.relation), {
        amount: 20,
        quantity: 10,
        name: 'a && b || c',
      }),
    ).toBe(true);
  });
  it('leaves complex precedence and saved membership formulas in formula mode', () => {
    for (const code of [
      'amount > quantity == false',
      'amount > 0 && (name == "a" || name == "b")',
      'IN(name, "a", "b")',
      'amount > (flag ? 10 : 20)',
    ])
      expect(parsePrintCondition(code)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import {
  evalPrintExpr,
  filterPrintRows,
  validatePrintExpr,
} from './print-expr';

describe('print expression DSL', () => {
  const scope = {
    amount: 120,
    fallback: 8,
    quantity: 12,
    unitPrice: 10,
  };

  it('supports conditions, ternary expressions and scientific functions', () => {
    expect(
      evalPrintExpr('IF(quantity > 10, unitPrice * 0.9, unitPrice)', scope),
    ).toBe(9);
    expect(evalPrintExpr('amount > 0 ? amount : fallback', scope)).toBe(120);
    expect(evalPrintExpr('IFS(amount < 0, -1, amount == 0, 0, 1)', scope)).toBe(
      1,
    );
    expect(evalPrintExpr('ROUND(POW(SQRT(81), 2) + MOD(7, 4), 0)', scope)).toBe(
      84,
    );
    expect(evalPrintExpr('CLAMP(amount, 0, 100)', scope)).toBe(100);
    expect(evalPrintExpr('1e3 + amount', scope)).toBe(1120);
    expect(evalPrintExpr('FORMAT_MONEY(12.34567, 4)', scope)).toBe('12.3457');
  });

  it('does not treat text inside string literals as variables', () => {
    expect(
      validatePrintExpr('CONCAT("buildArea", quantity)', scope),
    ).toMatchObject({ ok: true, preview: 'buildArea12' });
  });

  it('can replace an empty or zero cell with a slash while preserving values', () => {
    const expr =
      'IF(EMPTY(expropriatedArea) || NUMBER(expropriatedArea, 0) == 0, "/", expropriatedArea)';

    expect(evalPrintExpr(expr, { expropriatedArea: '' })).toBe('/');
    expect(evalPrintExpr(expr, { expropriatedArea: 0 })).toBe('/');
    expect(evalPrintExpr(expr, { expropriatedArea: '0' })).toBe('/');
    expect(evalPrintExpr(expr, { expropriatedArea: 45 })).toBe(45);
  });

  it('filters rows with the same DSL used by calculated cells', () => {
    const rows = [
      { amount: 0, status: '草稿' },
      { amount: 20, status: '生效' },
      { amount: 50, status: '作废' },
    ];
    expect(
      filterPrintRows(
        rows,
        'amount > 0 && status != "作废"',
        {},
        {
          silent: true,
        },
      ),
    ).toEqual([{ amount: 20, status: '生效' }]);
  });

  it.each([
    'missingField + 1',
    'window.alert(1)',
    'row.constructor',
    'fetch("/api")',
    'amount = 1',
    'amount; 1',
    '(() => 1)()',
  ])('rejects unsafe or invalid expression: %s', (expr) => {
    expect(validatePrintExpr(expr, scope).ok).toBe(false);
  });
});

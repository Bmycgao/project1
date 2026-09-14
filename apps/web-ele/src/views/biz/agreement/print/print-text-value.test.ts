import type { AgreePrintData } from './types';

import { describe, expect, it } from 'vitest';

import { resolveTextPreview } from './designer/template-model';
import { preparePrintTemplate } from './prepare-template';
import { resolvePrintTextValue } from './print-text-value';

function prepare(
  options: Record<string, unknown>[],
  data: Record<string, unknown>,
) {
  const template = {
    panels: [
      {
        printElements: options.map((item) => ({
          options: item,
          printElementType: { type: 'text' },
        })),
      },
    ],
  };
  const prepared = preparePrintTemplate(
    template,
    data as unknown as AgreePrintData,
  );
  const bag = prepared.printData as unknown as Record<string, unknown>;
  const texts: Record<string, any>[] =
    prepared.template.panels[0].printElements;
  return {
    bag,
    canvas: texts.map((el) =>
      resolveTextPreview(el.options, prepared.printData),
    ),
    // hiprint reads the runtime field directly, without another display conversion.
    printed: texts.map((el) => bag[el.options.field]),
    template,
    texts,
  };
}

describe('independent text display formats', () => {
  it('formats repeated amount bindings independently and leaves business data intact', () => {
    const data = { amount: 5_880_000 };
    const options = [
      { field: 'amount', agreeFormat: 'money' },
      { field: 'amount', agreeFormat: 'money4' },
      { field: 'amount', agreeFormat: 'moneyDollar' },
      { field: 'amount' },
    ];
    const result = prepare(options, data);
    expect(result.canvas).toEqual([
      '5,880,000.00',
      '5,880,000.0000',
      '$5,880,000.00',
      '5880000',
    ]);
    expect(result.printed).toEqual([
      '5,880,000.00',
      '5,880,000.0000',
      '$5,880,000.00',
      5_880_000,
    ]);
    expect(result.bag.amount).toBe(5_880_000);
    expect(data.amount).toBe(5_880_000);
    expect(options[1]).toEqual({ field: 'amount', agreeFormat: 'money4' });
    expect(result.texts[1]?.options.agreeFormat).toBeUndefined();
  });

  it('applies percentage and currency formatting exactly once', () => {
    const result = prepare(
      [
        { field: 'rate', agreeFormat: 'percent' },
        { field: 'rate', agreeFormat: 'percentRaw2' },
        { field: 'amount', agreeFormat: 'moneySymbol' },
      ],
      { rate: 0.1234, amount: 50 },
    );
    expect(result.canvas).toEqual(['12.34%', '0.12%', '¥50.00']);
    expect(result.printed).toEqual(result.canvas);
  });

  it('evaluates each expression against numeric business data before formatting', () => {
    const result = prepare(
      [
        { field: 'amount', agreeFormat: 'money' },
        {
          field: 'amount',
          agreeValueExpr: 'amount * 2',
          agreeFormat: 'moneyDollar',
        },
        {
          field: 'amount',
          agreeValueExpr: 'amount / 2',
          agreeFormat: 'money4',
        },
        {
          field: 'amount',
          agreeVisibleWhen: 'amount > 1000',
          agreeFormat: 'number0',
        },
      ],
      { amount: 1250 },
    );
    expect(result.canvas).toEqual([
      '1,250.00',
      '$2,500.00',
      '625.0000',
      '1,250',
    ]);
    expect(result.printed).toEqual(result.canvas);
    expect(result.bag.amount).toBe(1250);
  });

  it('supports unbound sample values and keeps blank values blank', () => {
    const result = prepare(
      [
        { testData: 12.3, agreeFormat: 'moneyDollar' },
        { field: 'missing', agreeFormat: 'moneyDollar' },
        { field: 'empty', agreeFormat: 'number2' },
      ],
      { empty: null },
    );
    expect(result.canvas).toEqual(['$12.30', '', '']);
    expect(result.printed).toEqual(result.canvas);
    expect(
      resolvePrintTextValue(
        { agreeValueExpr: 'amount * 2', agreeFormat: 'money4' },
        { amount: 1250 },
      ),
    ).toBe('2,500.0000');
  });

  it('keeps explicitly created calculation fields available to later expressions', () => {
    const result = prepare(
      [
        {
          field: 'calc_total',
          agreeValueExpr: 'amount * 2',
          agreeFormat: 'money',
        },
        { agreeValueExpr: 'calc_total / 2', agreeFormat: 'moneyDollar' },
      ],
      { amount: 1250 },
    );
    expect(result.bag.calc_total).toBe(2500);
    expect(result.canvas).toEqual(['2,500.00', '$1,250.00']);
  });
});

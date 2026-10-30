import { describe, expect, it } from 'vitest';

import { resolveTablePreview } from '../designer/template-model';
import { renderDocumentTable } from './document-renderer';
import { preparePrintTemplate } from './prepare-template';
import { maskPrintValue, normalizePrintMaskRules } from './print-masking';
import { resolvePrintTextValue } from './print-text-value';

const text = (options: Record<string, any>, type = 'text') => ({
  printElementType: { type },
  options,
});
const table = (field: string, columns: any[], extra = {}) =>
  text({ field, columns: [columns], ...extra }, 'table');
function prepare(
  elements: any[],
  data: Record<string, unknown>,
  rules: any[] = [],
) {
  const template = {
    agreeLayout: 'document-flow',
    agreePrintMaskRules: rules,
    panels: [{ width: 210, height: 297, printElements: elements }],
  };
  const snapshot = JSON.stringify(template);
  const source = JSON.stringify(data);
  const result = preparePrintTemplate(JSON.parse(snapshot), data as any);
  expect(JSON.stringify(template)).toBe(snapshot);
  expect(JSON.stringify(data)).toBe(source);
  return {
    data: result.printData as any,
    elements: result.template.panels[0].printElements,
    template: result.template,
  };
}
const values = (result: ReturnType<typeof prepare>) =>
  result.elements.map((element: any) =>
    resolvePrintTextValue(element.options, result.data),
  );

describe('打印脱敏', () => {
  it('支持常用规则、短值、Unicode、空值和上游已经打码的值', () => {
    const mask = (value: unknown, mode: any, extra = {}) =>
      maskPrintValue(value, { field: 'x', mode, ...extra });
    expect(mask('19112340005', 'phone')).toBe('191****0005');
    expect(mask('110101199001011234', 'idCard')).toBe('110***********1234');
    expect(mask('陈爱然', 'name')).toBe('陈**');
    expect(mask('𠮷小明', 'name')).toBe('𠮷**');
    expect(mask('1234', 'phone')).toBe('***');
    expect(mask('陈', 'name')).toBe('***');
    expect(mask('abcdef', 'custom', { keepStart: 1, keepEnd: 2 })).toBe(
      'a***ef',
    );
    expect(mask('abc', 'custom', { keepStart: 3, keepEnd: 0 })).toBe('***');
    expect(mask(0, 'all')).toBe('***');
    expect(mask(null, 'phone')).toBe('');
    expect(mask('', 'all')).toBe('');
    expect(mask('***', 'phone')).toBe('***');
  });

  it('规则保存为字段配置，去重并拒绝无效路径', () => {
    expect(
      normalizePrintMaskRules([
        { field: 'phone', mode: 'all' },
        { field: 'phone', mode: 'phone' },
        { field: 'houses.certNo', mode: 'custom', keepStart: -1, keepEnd: 2.8 },
        { field: '__proto__.phone', mode: 'all' },
        { field: 'x()', mode: 'all' },
        { field: 'bad', mode: 'unknown' },
      ]),
    ).toEqual([
      { field: 'phone', mode: 'phone' },
      { field: 'houses.certNo', mode: 'custom', keepStart: 0, keepEnd: 2 },
    ]);
  });

  it('所有文本绑定、长文本参数和编码内容使用同一字段规则，计算仍使用原值', () => {
    const result = prepare(
      [
        text({ field: 'phone' }),
        text({ field: 'phone', agreeFormat: 'number0' }),
        text({ field: 'phone', textType: 'qrcode' }),
        text({ field: 'phone', textType: 'barcode' }),
        text(
          {
            agreeTextSections: [
              {
                when: 'amount > 10',
                content: '联系{{phone}}，金额{{amount}}，计算{{amount * 2}}',
              },
            ],
            agreeTextSectionGap: 6,
          },
          'longText',
        ),
        text({ field: 'calc_double', agreeValueExpr: 'amount * 2' }),
        text({ field: 'amountCn' }),
        text({ testData: '固定文字' }),
      ],
      { phone: '19112340005', amount: 100, amountCn: '壹佰元整' },
      [
        { field: 'phone', mode: 'phone' },
        { field: 'amount', mode: 'all' },
      ],
    );
    expect(values(result)).toEqual([
      '191****0005',
      '191****0005',
      '191****0005',
      '191****0005',
      '联系191****0005，金额***，计算***',
      '***',
      '***',
      '固定文字',
    ]);
    expect(result.data.amount).toBe(100);
    expect(result.data.calc_double).toBe(200);
    expect(result.elements[4].options.__agreeTextBlocks).toEqual([
      '联系191****0005，金额***，计算***',
    ]);
  });

  it('引用敏感字段的嵌套与拼接结果统一隐藏，字符串常量不误判为字段', () => {
    const result = prepare(
      [
        text({ agreeValueExpr: 'CONCAT("电话：", phone)' }),
        text({ agreeValueExpr: 'IF(amount > 0, ROUND(amount * 2, 2), 0)' }),
        text({ agreeValueExpr: 'CONCAT("phone", " amount")' }),
        text({ field: 'calc_a', agreeValueExpr: 'amount * 2' }),
        text({ field: 'calc_b', agreeValueExpr: 'calc_a + 1' }),
        text({ field: 'calc_b' }),
      ],
      { phone: '19112340005', amount: 100 },
      [
        { field: 'phone', mode: 'phone' },
        { field: 'amount', mode: 'all' },
      ],
    );
    expect(values(result)).toEqual([
      '***',
      '***',
      'phone amount',
      '***',
      '***',
      '***',
    ]);
  });

  it('明细先计算筛选、合并再脱敏，汇总及自定义表尾也隐藏', () => {
    const result = prepare(
      [
        table(
          'items',
          [
            { field: 'phone', title: '手机号' },
            { field: 'amount', title: '金额', tableSummary: 'sum' },
            {
              field: 'double',
              title: '计算值',
              agreeColExpr: 'amount * 2',
              tableSummary: 'sum',
            },
          ],
          {
            agreeRowFilter: 'amount > 0',
            agreeFooters: [{ cells: [{ field: 'phone', colspan: 3 }] }],
          },
        ),
        text({ agreeValueExpr: 'SUM(items, "amount")' }),
      ],
      {
        phone: '19112340005',
        items: [
          { phone: '19112340005', amount: 10 },
          { phone: '19112340006', amount: 0 },
          { phone: '19112340007', amount: 20 },
        ],
      },
      [
        { field: 'items.phone', mode: 'phone' },
        { field: 'items.amount', mode: 'all' },
        { field: 'phone', mode: 'phone' },
      ],
    );
    const model = resolveTablePreview(
      result.elements[0].options,
      result.data,
      100,
      { rowsPrepared: true },
    );
    expect(model.bodyRows.map((row) => row.map((cell) => cell.text))).toEqual([
      ['191****0005', '***', '***'],
      ['191****0007', '***', '***'],
    ]);
    expect(result.data.items.map((row: any) => row.double)).toEqual([20, 40]);
    expect(model.footerRows[0]?.map((cell) => cell.text)).toEqual([
      '合计',
      '***',
      '***',
    ]);
    expect(model.footerRows[1]?.[0]?.text).toBe('191****0005');
    expect(values({ ...result, elements: result.elements.slice(1) })).toEqual([
      '***',
    ]);
    const printed = renderDocumentTable(
      result.elements[0].options,
      result.data,
    );
    expect(printed.textContent).toContain('191****0005');
    expect(printed.textContent).not.toContain('19112340005');
  });

  it('同一数据源多张表的运行时别名仍匹配原字段，其他表同名列不受影响', () => {
    const result = prepare(
      [
        table('items', [{ field: 'phone', title: '电话' }]),
        table('items', [{ field: 'phone', title: '电话' }]),
        table('other', [{ field: 'phone', title: '电话' }]),
      ],
      { items: [{ phone: '19112340005' }], other: [{ phone: '19112340006' }] },
      [{ field: 'items.phone', mode: 'phone' }],
    );
    const displays = result.elements.map(
      (el: any) =>
        resolveTablePreview(el.options, result.data, 10, { rowsPrepared: true })
          .bodyRows[0]?.[0]?.text,
    );
    expect(displays).toEqual(['191****0005', '191****0005', '19112340006']);
  });

  it('同表其他公开列的计算和汇总不会因手机号打码而隐藏', () => {
    const result = prepare(
      [
        table('items', [
          { field: 'phone', title: '电话' },
          { field: 'amount', title: '金额', tableSummary: 'sum' },
        ]),
        text({ agreeValueExpr: 'SUM(items, "amount")' }),
        text({ agreeValueExpr: 'CONCAT("合计", SUM(items, "amount"))' }),
      ],
      { items: [{ phone: '19112340005', amount: 12 }] },
      [{ field: 'items.phone', mode: 'phone' }],
    );
    const model = resolveTablePreview(
      result.elements[0].options,
      result.data,
      10,
      { rowsPrepared: true },
    );
    expect(model.bodyRows[0]?.[1]?.text).toBe('12');
    expect(model.footerRows[0]?.[1]?.text).toBe('12.00');
    expect(values({ ...result, elements: result.elements.slice(1) })).toEqual([
      '12',
      '合计12',
    ]);
  });

  it('固定表单同时支持主表字段、动态行字段和公式', () => {
    const result = prepare(
      [
        text(
          {
            agreeFormGrid: {
              columns: [100, 100],
              rows: [
                {
                  cells: [
                    { mode: 'field', value: 'root.phone' },
                    { mode: 'text', value: '固定信息' },
                  ],
                },
                {
                  source: 'items',
                  cells: [
                    { mode: 'field', value: 'row.phone' },
                    { mode: 'formula', value: 'row.amount * 2' },
                  ],
                },
              ],
            },
          },
          'table',
        ),
      ],
      { phone: '19112340005', items: [{ phone: '19112340006', amount: 100 }] },
      [
        { field: 'phone', mode: 'phone' },
        { field: 'items.phone', mode: 'phone' },
        { field: 'items.amount', mode: 'all' },
      ],
    );
    const model = resolveTablePreview(
      result.elements[0].options,
      result.data,
      100,
      { rowsPrepared: true },
    );
    expect(model.bodyRows.map((row) => row.map((cell) => cell.text))).toEqual([
      ['191****0005', '固定信息'],
      ['191****0006', '***'],
    ]);
  });

  it('单格覆盖公式的派生结果也隐藏，移除规则恢复正常输出', () => {
    const result = prepare(
      [
        table('items', [{ field: 'value', title: '结果' }], {
          agreeBodyCellExprs: [
            { field: 'value', colIndex: 0, rowIndex: 0, expr: 'amount * 2' },
          ],
        }),
      ],
      { items: [{ value: '', amount: 12 }] },
      [{ field: 'items.amount', mode: 'all' }],
    );
    expect(
      resolveTablePreview(result.elements[0].options, result.data, 10, {
        rowsPrepared: true,
      }).bodyRows[0]?.[0]?.text,
    ).toBe('***');
    expect(
      values(prepare([text({ field: 'phone' })], { phone: '19112340005' })),
    ).toEqual(['19112340005']);
  });

  it('业务入口已限制的字段不能通过关闭模板脱敏或计算恢复为零', () => {
    const result = prepare(
      [
        text({ field: 'phone' }),
        text({ agreeValueExpr: 'NUMBER(amount, 0)' }),
        text({ agreeValueExpr: 'SUM(items, "amount")' }),
      ],
      { phone: '***', amount: '***', items: [{ amount: '***' }] },
    );
    expect(values(result)).toEqual(['***', '***', '***']);
  });
});

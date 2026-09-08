import { describe, expect, it } from 'vitest';

import { enrichPrintDataForTemplate } from '../enrich-print-data';
import { preparePrintTemplate } from '../prepare-template';
import {
  extractTableHeaderGroups,
  findPrintElementByCanvasKey,
  flattenTableHeaderColumns,
  groupTableHeaderColumns,
  insertLeafTableColumn,
  listLeafTableCells,
} from '../print-element-meta';
import {
  applyAgreeBodyCellExprsToRows,
  applyAgreeBodyCellMergesToRows,
  createSameValueMergeSrc,
  evalNamedMergeFn,
} from '../print-table-runtime';
import {
  resolveTablePreview,
  resolveTextPreview,
  tablePreviewRowLimit,
} from './template-model';

describe('designer preview runtime parity', () => {
  const columns = [
    [
      {
        agreeMergeSame: true,
        align: 'left',
        field: 'name',
        title: '名称',
        width: 60,
      },
      { align: 'right', field: 'quantity', title: '数量', width: 40 },
      {
        agreeColExpr: 'quantity * unitPrice',
        agreeColFormat: 'money',
        align: 'right',
        field: 'amount',
        title: '金额',
        width: 60,
      },
    ],
  ];
  const sample = {
    grandTotal: 25,
    items: [
      { amount: 0, name: 'A', quantity: 2, unitPrice: 5 },
      { amount: 0, name: 'A', quantity: 3, unitPrice: 5 },
      { amount: 0, name: 'B', quantity: 0, unitPrice: 8 },
    ],
  } as any;

  it('uses calculate, filter, merge, format and footer rules in canvas order', () => {
    const preview = resolveTablePreview(
      {
        agreeFooters: [
          {
            cells: [
              { align: 'right', colspan: 2, text: '合计' },
              { align: 'right', colspan: 1, field: 'grandTotal' },
            ],
          },
        ],
        agreeRowFilter: 'amount > 0',
        columns,
        field: 'items',
      },
      sample,
      3,
    );

    expect(preview.sourceRowCount).toBe(3);
    expect(preview.filteredRowCount).toBe(2);
    expect(preview.bodyRows[0]?.[0]).toMatchObject({ rowspan: 2, text: 'A' });
    expect(preview.bodyRows[1]?.[0]?.hidden).toBe(true);
    expect(preview.bodyRows[0]?.[2]?.text).toBe('10.00');
    expect(preview.footerRows[0]?.map((cell) => cell.text)).toEqual([
      '合计',
      '25',
    ]);
  });

  it('does not calculate or filter rows a second time after runtime prepare', () => {
    const preparedRows = {
      items: [{ amount: 99, name: 'prepared', quantity: 0, unitPrice: 0 }],
    } as any;
    const preview = resolveTablePreview(
      {
        agreeRowFilter: 'amount > 1000',
        columns,
        field: 'items',
      },
      preparedRows,
      3,
      { rowsPrepared: true },
    );

    expect(preview.filteredRowCount).toBe(1);
    expect(preview.bodyRows[0]?.[2]?.text).toBe('99.00');
  });

  it('renders explicit table-body horizontal merges', () => {
    const preview = resolveTablePreview(
      {
        agreeBodyHMerges: [{ rowIndex: 0, spans: [2, 0, 1] }],
        columns,
        field: 'items',
      },
      sample,
      1,
    );
    expect(preview.bodyRows[0]?.[0]?.colspan).toBe(2);
    expect(preview.bodyRows[0]?.[1]?.hidden).toBe(true);
  });

  it('shows hiprint tableSummary rows on the canvas', () => {
    const summaryColumns: Record<string, any>[][] = structuredClone(columns);
    const amountCol = summaryColumns[0]?.[2];
    if (amountCol) amountCol.tableSummary = 'sum';
    const preview = resolveTablePreview(
      { columns: summaryColumns, field: 'items' },
      sample,
      2,
    );

    /** 汇总按全部数据计算，不受画布可见行数限制。 */
    expect(preview.bodyRows).toHaveLength(2);
    expect(preview.footerRows[0]?.map((cell) => cell.text)).toEqual([
      '',
      '',
      '合计:25.00',
    ]);
  });

  it('matches hiprint summary decimals for integer-like formats', () => {
    const summaryColumns: Record<string, any>[][] = structuredClone(columns);
    const amountCol = summaryColumns[0]?.[2];
    if (amountCol) {
      amountCol.agreeColFormat = 'money0';
      amountCol.tableSummary = 'sum';
    }
    const preview = resolveTablePreview(
      { columns: summaryColumns, field: 'items' },
      sample,
      2,
    );

    expect(preview.footerRows[0]?.[2]?.text).toBe('合计:25.00');
  });

  it('renders horizontal, vertical and rectangular body merges', () => {
    const rules = [{ colspan: 2, rowspan: 2, startCol: 1, startRow: 0 }];
    const preview = resolveTablePreview(
      {
        agreeBodyCellMerges: rules,
        columns,
        field: 'items',
      },
      sample,
      3,
    );
    expect(preview.bodyRows[0]?.[1]).toMatchObject({
      colspan: 2,
      rowspan: 2,
    });
    expect(preview.bodyRows[0]?.[2]?.hidden).toBe(true);
    expect(preview.bodyRows[1]?.[1]?.hidden).toBe(true);
    expect(preview.bodyRows[1]?.[2]?.hidden).toBe(true);

    const runtimeRows = applyAgreeBodyCellMergesToRows(sample.items, rules, 3);
    const mergeFn = evalNamedMergeFn(
      createSameValueMergeSrc(
        ['name', 'quantity', 'amount'],
        [],
        [false, false, false],
        [false, false, false],
        'items',
      ),
    );
    if (typeof mergeFn !== 'function') throw new Error('合并函数编译失败');
    expect(mergeFn(runtimeRows[0], {}, 1, 0, runtimeRows, {})).toEqual([2, 2]);
    expect(mergeFn(runtimeRows[1], {}, 1, 1, runtimeRows, {})).toEqual([0, 0]);
  });

  it('lets a single body cell override its column formula', () => {
    const preview = resolveTablePreview(
      {
        agreeBodyCellExprs: [
          {
            colIndex: 2,
            expr: 'quantity * unitPrice + 1',
            field: 'amount',
            rowIndex: 1,
          },
        ],
        columns,
        field: 'items',
      },
      sample,
      3,
    );
    expect(preview.bodyRows[0]?.[2]?.text).toBe('10.00');
    expect(preview.bodyRows[1]?.[2]?.text).toBe('16.00');

    expect(
      applyAgreeBodyCellExprsToRows(
        [{ amount: 0, quantity: 4, unitPrice: 5 }],
        [
          {
            colIndex: 2,
            expr: 'quantity * unitPrice + 1',
            field: 'amount',
            rowIndex: 0,
          },
        ],
        ['name', 'quantity', 'amount'],
        {},
      )[0]?.amount,
    ).toBe(21);
  });

  it('shows as many rows as the table design height can hold', () => {
    expect(tablePreviewRowLimit({ columns: [[{}]], height: 96 })).toBe(5);
    expect(tablePreviewRowLimit({ columns: [[{}], [{}]], height: 114 })).toBe(
      5,
    );
  });

  it('matches text expression and formatting behavior', () => {
    expect(
      resolveTextPreview(
        { agreeFormat: 'money', agreeValueExpr: 'grandTotal * 2' },
        sample,
      ),
    ).toBe('50.00');
  });

  it('locates a table selected with the canvas short key', () => {
    const template = {
      panels: [
        {
          printElements: [
            { options: { title: '说明' }, printElementType: { type: 'text' } },
            {
              options: { columns, field: 'items' },
              printElementType: { type: 'table' },
            },
          ],
        },
      ],
    };

    expect(findPrintElementByCanvasKey(template, '0:1', 'table')).toMatchObject(
      {
        elementIndex: 1,
        panelIndex: 0,
        type: 'table',
      },
    );
    expect(
      findPrintElementByCanvasKey(template, '0:0', 'table'),
    ).toBeUndefined();
    expect(findPrintElementByCanvasKey(template, 'bad-key')).toBeUndefined();
  });

  it('lets later calculated columns reference earlier calculated columns', () => {
    const template = {
      panels: [
        {
          printElements: [
            {
              options: {
                columns: [
                  [
                    { agreeColExpr: 'quantity * unitPrice', field: 'subtotal' },
                    { agreeColExpr: 'subtotal * 0.9', field: 'discounted' },
                  ],
                ],
                field: 'items',
              },
              printElementType: { type: 'table' },
            },
          ],
        },
      ],
    };
    const result = enrichPrintDataForTemplate(template, sample);
    expect((result as any).items[0]).toMatchObject({
      discounted: 9,
      subtotal: 10,
    });
  });

  it('isolates calculations when two tables reuse one data source', () => {
    const table = (factor: number) => ({
      options: {
        columns: [
          [
            { field: 'quantity', title: '数量' },
            {
              agreeColExpr: `quantity * ${factor}`,
              field: 'amount',
              title: '金额',
            },
          ],
        ],
        field: 'items',
      },
      printElementType: { type: 'table' },
    });
    const result = preparePrintTemplate(
      { panels: [{ printElements: [table(2), table(3)] }] },
      { items: [{ amount: 0, quantity: 5 }] } as any,
    );
    const [firstField, secondField] =
      result.template.panels[0].printElements.map(
        (el: Record<string, any>) => el.options.field,
      );

    expect(firstField).not.toBe('items');
    expect(secondField).not.toBe('items');
    expect(firstField).not.toBe(secondField);
    expect((result.printData as any)[firstField][0].amount).toBe(10);
    expect((result.printData as any)[secondField][0].amount).toBe(15);
    expect((result.printData as any).items[0].amount).toBe(0);
    expect(result.template.panels[0].panelPageRule).toBeUndefined();
    expect(result.template.panels[0].printElements[0].options).toMatchObject({
      tableFooterRepeat: 'last',
      tableHeaderRepeat: 'page',
    });
  });

  it('enables real table pagination and keeps repeated page headers clear', () => {
    const result = preparePrintTemplate(
      {
        panels: [
          {
            panelPageRule: 'none',
            paperFooter: 800,
            paperHeader: 28,
            printElements: [
              {
                options: { height: 22, left: 20, top: 20, width: 550 },
                printElementType: { type: 'text' },
              },
              {
                options: { height: 52, left: 510, top: 18, width: 52 },
                printElementType: { type: 'text' },
              },
              {
                options: { height: 16, left: 20, top: 52, width: 260 },
                printElementType: { type: 'text' },
              },
              {
                options: { columns, field: 'items', top: 146 },
                printElementType: { type: 'table' },
              },
            ],
          },
        ],
      },
      sample,
    );
    const panel = result.template.panels[0];

    expect(panel.panelPageRule).toBeUndefined();
    expect(panel.paperHeader).toBe(76);
    expect(panel.printElements[2].options.showInPage).toBe('first');
    expect(panel.printElements[3].options.tableHeaderRepeat).toBe('page');
    expect(panel.printElements[3].options.tableFooterRepeat).toBe('last');
  });

  it('moves a crowded table section to the next page instead of rendering a diagnostic block', () => {
    const result = preparePrintTemplate(
      {
        panels: [
          {
            paperFooter: 800,
            paperHeader: 70,
            printElements: [
              {
                options: {
                  agreeFlowGroup: 'rewards',
                  height: 18,
                  title: '三、奖励补贴',
                  top: 750,
                },
                printElementType: { type: 'text' },
              },
              {
                options: {
                  agreeFlowGroup: 'rewards',
                  columns,
                  field: 'items',
                  height: 36,
                  top: 764,
                },
                printElementType: { type: 'table' },
              },
              {
                options: { height: 18, title: '签字', top: 810 },
                printElementType: { type: 'text' },
              },
            ],
          },
        ],
      },
      sample,
    );
    const [title, tableElement, signature] =
      result.template.panels[0].printElements;

    expect(title.options.top).toBe(802);
    expect(tableElement.options.top).toBe(826);
    expect(signature.options.top).toBe(862);
  });
});

describe('grouped table headers', () => {
  it('preserves leaf bindings and formulas when grouping and flattening', () => {
    const source = [
      { agreeColExpr: 'quantity * price', field: 'amount', title: '金额' },
      { agreeColFormat: 'money', field: 'tax', title: '税额' },
      { field: 'remark', title: '备注' },
    ];
    const grouped = groupTableHeaderColumns(source, 0, 1, '计价信息');
    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.[0]).toMatchObject({ colspan: 2, title: '计价信息' });
    const nested = groupTableHeaderColumns(grouped, 0, 2, '费用信息');
    expect(nested).toHaveLength(3);
    expect(nested[0]?.[0]).toMatchObject({ colspan: 3, title: '费用信息' });
    const flattened = flattenTableHeaderColumns(nested);
    expect(listLeafTableCells(flattened)).toMatchObject([
      { agreeColExpr: 'quantity * price', field: 'amount' },
      { agreeColFormat: 'money', field: 'tax' },
      { field: 'remark' },
    ]);
  });

  it('creates a nested group for leaf columns 5–6 inside a wider group', () => {
    const leaves = [
      'index',
      'name',
      'calcType',
      'quantity',
      'unitPrice',
      'unitPrice2',
      'amount',
      'remark',
    ].map((field) => ({ field, title: field, width: 80 }));
    const outer = groupTableHeaderColumns([leaves], 3, 6, '计价信息');
    const nested = groupTableHeaderColumns(outer, 4, 5, '单价总');

    expect(nested).toHaveLength(3);
    expect(extractTableHeaderGroups(nested)).toEqual(
      expect.arrayContaining([
        { fromLeaf: 3, title: '计价信息', toLeaf: 6 },
        { fromLeaf: 4, title: '单价总', toLeaf: 5 },
      ]),
    );
    expect(listLeafTableCells(nested).map((cell) => cell.field)).toEqual(
      leaves.map((leaf) => leaf.field),
    );
  });

  it('inserts a leaf column inside its parent header group', () => {
    const source = groupTableHeaderColumns(
      [
        { field: 'quantity', title: '数量' },
        { field: 'unitPrice', title: '单价' },
        { field: 'amount', title: '金额' },
      ],
      1,
      2,
      '计价信息',
    );
    const result = insertLeafTableColumn(
      {
        panels: [
          {
            printElements: [
              {
                options: { columns: source },
                printElementType: { type: 'table' },
              },
            ],
          },
        ],
      },
      { elementIndex: 0, panelIndex: 0 },
      1,
      { field: 'unitPrice1', title: '单价1' },
    );
    const columns = result.panels[0]?.printElements[0]?.options.columns;
    expect(listLeafTableCells(columns).map((cell) => cell.field)).toEqual([
      'quantity',
      'unitPrice',
      'unitPrice1',
      'amount',
    ]);
    expect(
      columns[0]?.find(
        (cell: Record<string, any>) => cell.title === '计价信息',
      ),
    ).toMatchObject({ colspan: 3 });
  });
});

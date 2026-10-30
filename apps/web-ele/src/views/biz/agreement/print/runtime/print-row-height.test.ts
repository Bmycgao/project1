import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import { preparePrintTemplate } from './prepare-template';
import {
  detailRowHeight,
  identifyPrintRows,
  rowHeightOverride,
  setRowHeightOverride,
} from './print-row-height';

const columns = [
  [
    { title: '项目', field: 'name' },
    { title: '金额', field: 'amount' },
  ],
];
function prepare(
  options: Record<string, unknown>,
  items: Record<string, unknown>[],
  document = true,
) {
  return preparePrintTemplate(
    {
      ...(document ? { agreeLayout: 'document-flow' } : {}),
      panels: [
        {
          printElements: [
            {
              printElementType: { type: 'table' },
              options: {
                field: 'items',
                columns,
                tableBodyRowHeight: 24,
                ...options,
              },
            },
          ],
        },
      ],
    },
    { items } as any,
  );
}

describe('individual record heights', () => {
  it('follows a business id through sorting, filtering, renumbering and changed record content', () => {
    const items = [
      { id: 'a', name: '甲', amount: 1, index: 1 },
      { id: 'b', name: '乙', amount: 2, index: 2 },
      { id: 'c', name: '丙', amount: 3, index: 3 },
    ];
    const key = requireDefined(
      requireDefined(identifyPrintRows(items)[1]).__agreeRowKey,
    );
    const overrides = setRowHeightOverride({}, key, 40);
    const result = prepare(
      {
        agreeBodyRowHeights: overrides,
        agreeRowSort: [{ field: 'amount', dir: 'desc' }],
        agreeRowFilter: 'amount >= 2',
      },
      items.map((row) => ({ ...row, name: `${row.name}改名` })),
    );
    const options = result.template.panels[0].printElements[0].options;
    const rows = (result.printData as any).items;
    expect(
      rows.map((row: any) => [
        row.id,
        row.index,
        detailRowHeight(options, row),
      ]),
    ).toEqual([
      ['c', 1, 24],
      ['b', 2, 40],
    ]);
    expect(
      detailRowHeight({ ...options, tableBodyRowHeight: 30 }, rows[0]),
    ).toBe(30);
    expect(
      detailRowHeight({ ...options, tableBodyRowHeight: 30 }, rows[1]),
    ).toBe(40);
    const removed = prepare({ agreeBodyRowHeights: overrides }, [
      requireDefined(items[0]),
      requireDefined(items[2]),
    ]);
    expect(
      (removed.printData as any).items.map((row: any) =>
        detailRowHeight(
          removed.template.panels[0].printElements[0].options,
          row,
        ),
      ),
    ).toEqual([24, 24]);
    expect(items[1]).not.toHaveProperty('__agreeRowKey');
  });

  it('uses unique original content without ids and does not distinguish identical rows by display index', () => {
    const original = [
      { name: '甲', amount: 1, index: 1 },
      { name: '乙', amount: 2, index: 2 },
    ];
    const keys = identifyPrintRows(original);
    const result = prepare(
      {
        agreeBodyRowHeights: setRowHeightOverride(
          {},
          requireDefined(requireDefined(keys[1]).__agreeRowKey),
          42,
        ),
        agreeRowSort: [{ field: 'amount', dir: 'desc' }],
        columns: [
          [
            { title: '项目', field: 'name' },
            { title: '金额', field: 'amount', agreeColExpr: 'amount * 10' },
          ],
        ],
      },
      original,
    );
    expect(
      (result.printData as any).items.map((row: any) =>
        detailRowHeight(
          result.template.panels[0].printElements[0].options,
          row,
        ),
      ),
    ).toEqual([42, 24]);
    const duplicates = identifyPrintRows([
      { name: '同名', index: 1 },
      { name: '同名', index: 2 },
    ]);
    expect(duplicates.every((row) => row.__agreeRowKey === undefined)).toBe(
      true,
    );
    expect(
      requireDefined(identifyPrintRows([...original].toReversed())[0])
        .__agreeRowKey,
    ).toBe(requireDefined(keys[1]).__agreeRowKey);
  });

  it('preserves overrides in saved JSON and removes only the current override when restoring defaults', () => {
    const [a, b] = identifyPrintRows([{ id: 'a' }, { id: 'b' }]);
    const raw = setRowHeightOverride(
      setRowHeightOverride(
        {},
        requireDefined(requireDefined(a).__agreeRowKey),
        40,
      ),
      requireDefined(requireDefined(b).__agreeRowKey),
      50,
    );
    const restored = setRowHeightOverride(
      JSON.parse(JSON.stringify(raw)),
      requireDefined(requireDefined(a).__agreeRowKey),
    );
    expect(
      rowHeightOverride(restored, requireDefined(a).__agreeRowKey),
    ).toBeUndefined();
    expect(rowHeightOverride(restored, requireDefined(b).__agreeRowKey)).toBe(
      50,
    );
    expect(rowHeightOverride(raw, requireDefined(a).__agreeRowKey)).toBe(40);
  });

  it('applies the same override in legacy print row styling and preserves other custom row styles', () => {
    const items = [
      { id: 'a', name: '甲', amount: 1 },
      { id: 'b', name: '乙', amount: 2 },
    ];
    const key = requireDefined(
      requireDefined(identifyPrintRows(items)[1]).__agreeRowKey,
    );
    const result = prepare(
      {
        agreeBodyRowHeights: setRowHeightOverride({}, key, 40),
        rowStyler: 'function originalStyle() { return { color: "red" }; }',
      },
      items,
      false,
    );
    const styler = runInNewContext(
      `(${result.template.panels[0].printElements[0].options.rowStyler})`,
    );
    const rows = (result.printData as any).items;
    expect(styler(rows[0])).toEqual({ color: 'red' });
    expect(styler(rows[1])).toEqual({ color: 'red', height: '40pt' });
  });
});

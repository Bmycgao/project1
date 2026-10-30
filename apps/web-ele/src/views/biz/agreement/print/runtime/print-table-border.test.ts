import { describe, expect, it } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import { fragmentTable, renderDocumentTable } from './document-renderer';
import {
  normalizeTableBorders,
  resolveTableBorderControls,
} from './print-table-border';

const data = {
  items: [
    { category: '同类', name: '甲', amount: 1 },
    { category: '同类', name: '乙', amount: 2 },
    { category: '同类', name: '丙', amount: 3 },
  ],
} as any;
const options = {
  field: 'items',
  columns: [
    [
      { title: '类别', field: 'category', rowspan: 2, agreeMergeSame: true },
      { title: '信息', colspan: 2 },
    ],
    [
      { title: '名称', field: 'name' },
      { title: '金额', field: 'amount', tableSummary: 'sum' },
    ],
  ],
};

describe('unambiguous table border controls', () => {
  it('ignores malformed flags and reports mixed legacy edges without changing the source', () => {
    expect(
      normalizeTableBorders({
        outer: { top: false, bottom: 'false' },
        bodyInner: null,
        footerInner: true,
      }),
    ).toEqual({ outer: { top: false }, footerInner: true });
    const legacy = { tableHeaderBorder: 'noBorder' };
    const view = resolveTableBorderControls(legacy, {
      header: true,
      footer: false,
    });
    expect(view.outer).toEqual({
      top: false,
      bottom: true,
      left: false,
      right: false,
    });
    expect(view.mixedOuter).toEqual({ left: true, right: true });
    expect(view.headerDivider).toBe(false);
    expect(legacy).toEqual({ tableHeaderBorder: 'noBorder' });
    const explicit = resolveTableBorderControls(
      {
        ...legacy,
        tableBorder: 'border',
        agreeTableBorders: { outer: { bottom: false } },
      },
      { header: true, footer: false },
    );
    expect(explicit.outer).toEqual({
      top: true,
      bottom: false,
      left: true,
      right: true,
    });
    expect(explicit.mixedOuter).toEqual({ left: false, right: false });
  });

  it.each(['Top', 'Bottom', 'Left', 'Right'] as const)(
    'independently hides the %s perimeter while retaining internal lines',
    (side) => {
      const key = side.toLowerCase();
      const table = renderDocumentTable(
        { ...options, agreeTableBorders: { outer: { [key]: false } } },
        data,
      );
      const topLeft = requireDefined(
        table.querySelector<HTMLTableCellElement>('thead td'),
      );
      const topRight = requireDefined(
        requireDefined(table.querySelector<HTMLTableRowElement>('thead tr'))
          .cells[1],
      );
      const lastRow = requireDefined(
        table.querySelector<HTMLTableRowElement>('tbody tr:last-child'),
      );
      const firstBody = requireDefined(
        table.querySelector<HTMLTableCellElement>('tbody td'),
      );
      const edges = {
        Top: topLeft.style.borderTopStyle,
        Bottom: requireDefined(lastRow.cells[0]).style.borderBottomStyle,
        Left: firstBody.style.borderLeftStyle,
        Right: topRight.style.borderRightStyle,
      };
      for (const [edge, style] of Object.entries(edges))
        expect(style).toBe(edge === side ? 'hidden' : 'solid');
      expect(topRight.style.borderBottomStyle).toBe('solid');
      expect(firstBody.style.borderRightStyle).toBe('solid');
    },
  );

  it('owns both sides of each divider so neighbouring cell lines cannot override its visibility', () => {
    const table = renderDocumentTable(
      {
        ...options,
        agreeTableBorders: { headerDivider: false, footerDivider: false },
      },
      data,
    );
    const lastHeader = requireDefined(
      table.querySelector<HTMLTableRowElement>('thead tr:last-child'),
    );
    expect(requireDefined(lastHeader.cells[0]).style.borderBottomStyle).toBe(
      'hidden',
    );
    const firstBody = requireDefined(
      table.querySelector<HTMLTableRowElement>('tbody tr:first-child'),
    );
    expect(requireDefined(firstBody.cells[0]).style.borderTopStyle).toBe(
      'hidden',
    );
    const footer = requireDefined(
      table.querySelector<HTMLTableRowElement>('tbody tr:last-child'),
    );
    expect(requireDefined(footer.cells[0]).style.borderTopStyle).toBe('hidden');
    const lastBody = footer.previousElementSibling as HTMLTableRowElement;
    expect(requireDefined(lastBody.cells[0]).style.borderBottomStyle).toBe(
      'hidden',
    );
    expect(requireDefined(footer.cells[0]).style.borderBottomStyle).toBe(
      'solid',
    );
    const restored = renderDocumentTable(
      {
        ...options,
        tableHeaderBorder: 'noBorder',
        tableFooterBorder: 'noBorder',
        agreeTableBorders: { headerDivider: true, footerDivider: true },
      },
      data,
    );
    expect(
      requireDefined(restored.querySelector<HTMLTableCellElement>('tbody td'))
        .style.borderTopStyle,
    ).toBe('solid');
    expect(
      requireDefined(
        restored.querySelector<HTMLTableCellElement>('[data-doc-footer]'),
      ).style.borderTopStyle,
    ).toBe('solid');
  });

  it('controls inner grids independently of dividers and outer edges', () => {
    const table = renderDocumentTable(
      {
        ...options,
        agreeTableBorders: {
          headerInner: false,
          bodyInner: false,
          footerInner: false,
        },
      },
      data,
    );
    const firstHeader = requireDefined(
      table.querySelector<HTMLTableRowElement>('thead tr'),
    );
    const lastHeader = requireDefined(
      table.querySelector<HTMLTableRowElement>('thead tr:last-child'),
    );
    expect(requireDefined(firstHeader.cells[0]).style.borderRightStyle).toBe(
      'hidden',
    );
    expect(requireDefined(firstHeader.cells[1]).style.borderBottomStyle).toBe(
      'hidden',
    );
    expect(requireDefined(lastHeader.cells[0]).style.borderBottomStyle).toBe(
      'solid',
    );
    const body = requireDefined(
      table.querySelector<HTMLTableRowElement>('tbody tr'),
    );
    expect(requireDefined(body.cells[0]).style.borderRightStyle).toBe('hidden');
    expect(requireDefined(body.cells[0]).style.borderTopStyle).toBe('solid');
    expect(requireDefined(body.cells[0]).style.borderLeftStyle).toBe('solid');
    const footer = requireDefined(
      table.querySelector<HTMLTableRowElement>('tbody tr:last-child'),
    );
    expect(requireDefined(footer.cells[0]).style.borderRightStyle).toBe(
      'hidden',
    );
    expect(requireDefined(footer.cells[0]).style.borderTopStyle).toBe('solid');
    expect(requireDefined(footer.cells[0]).style.borderBottomStyle).toBe(
      'solid',
    );
  });

  it.each(['page', 'none'])(
    'retains independent top and bottom choices on every %s fragment without requiring footer content',
    (mode) => {
      const source = {
        field: 'items',
        tableHeaderRepeat: mode,
        columns: [
          [
            { title: '类别', field: 'category', agreeMergeSame: true },
            { title: '名称', field: 'name' },
          ],
        ],
        agreeTableBorders: {
          outer: { top: true, bottom: false },
          headerDivider: false,
          bodyInner: false,
        },
      };
      const snapshot = JSON.stringify(source);
      const table = renderDocumentTable(JSON.parse(snapshot), data);
      expect(table.querySelector('[data-doc-footer]')).toBeNull();
      for (const page of [
        fragmentTable(table, 0, 1),
        fragmentTable(table, 1, 3),
      ]) {
        expect(
          requireDefined(page.querySelector<HTMLTableCellElement>('td')).style
            .borderTopStyle,
        ).toBe('solid');
        const last = requireDefined(
          page.querySelector<HTMLTableRowElement>('tbody tr:last-child'),
        );
        expect(requireDefined(last.cells[0]).style.borderBottomStyle).toBe(
          'hidden',
        );
        const merged = requireDefined(
          page.querySelector<HTMLTableCellElement>('tbody td'),
        );
        expect(merged.style.borderBottomStyle).toBe('hidden');
      }
      expect(JSON.stringify(source)).toBe(snapshot);
    },
  );
});

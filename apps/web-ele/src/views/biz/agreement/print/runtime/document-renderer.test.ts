import { describe, expect, it } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import {
  fragmentTable,
  renderDocument,
  renderDocumentTable,
} from './document-renderer';
import { preparePrintTemplate } from './prepare-template';
import { createFormGrid } from './print-form-grid';
import { identifyPrintRows, setRowHeightOverride } from './print-row-height';

describe('long text section spacing', () => {
  it.each([undefined, 0, 8.5])(
    'renders the configured gap %s with no outer or hidden-block gap',
    async (gap) => {
      const fonts = Object.getOwnPropertyDescriptor(document, 'fonts');
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { ready: Promise.resolve() },
      });
      try {
        const prepared = preparePrintTemplate(
          {
            agreeLayout: 'document-flow',
            panels: [
              {
                printElements: [
                  {
                    printElementType: { type: 'longText' },
                    options: {
                      agreeTextSectionGap: gap,
                      agreeTextSections: [
                        { content: '第一段\n第二行', when: '' },
                        { content: '隐藏', when: 'false' },
                        { content: '{{missing}}', when: '' },
                        { content: '末段', when: '' },
                      ],
                    },
                  },
                ],
              },
            ],
          },
          {} as any,
        );
        const root = await renderDocument(
          prepared.template,
          prepared.printData,
        );
        const text = requireDefined(
          root.querySelector<HTMLElement>('[data-doc-text]'),
        );
        expect(text.textContent).toBe(
          gap === undefined ? '第一段\n第二行\n\n末段' : '第一段\n第二行末段',
        );
        expect([...text.children].map((el) => el.textContent)).toEqual(
          gap === undefined ? [] : ['第一段\n第二行', '末段'],
        );
        expect(
          [...text.children].map((el) => (el as HTMLElement).style.paddingTop),
        ).toEqual(gap === undefined ? [] : ['0pt', `${gap}pt`]);
        expect(
          text.lastElementChild?.getAttribute('style') || '',
        ).not.toContain('padding-bottom');
      } finally {
        if (fonts) Object.defineProperty(document, 'fonts', fonts);
        else Reflect.deleteProperty(document, 'fonts');
      }
    },
  );
});

describe('renderDocumentTable header attrs', () => {
  it('marks leaf range and field for designer header selection', () => {
    const table = renderDocumentTable(
      {
        field: 'rewardItems',
        columns: [
          [
            { title: '奖励项目', field: 'name', width: 80 },
            { title: '金额', field: 'amount', width: 80 },
          ],
        ],
      },
      { rewardItems: [{ name: 'a', amount: 1 }] } as any,
    );
    const headers = [
      ...table.querySelectorAll<HTMLTableCellElement>('thead td'),
    ];
    expect(headers).toHaveLength(2);
    expect(headers[0]?.dataset.docHeader).toBe('1');
    expect(headers[0]?.dataset.docLeafStart).toBe('0');
    expect(headers[0]?.dataset.docLeafEnd).toBe('0');
    expect(headers[0]?.dataset.docHeaderField).toBe('name');
    expect(headers[1]?.dataset.docLeafStart).toBe('1');
    expect(headers[1]?.dataset.docHeaderField).toBe('amount');
    expect(headers[0]?.querySelector('button')).toBeNull();
  });
});

describe('table minimum row heights', () => {
  it('keeps individual heights and vertically merged cells on continuation pages', () => {
    const items = [
      { id: 'a', name: '同类', amount: 1 },
      { id: 'b', name: '同类', amount: 2 },
      { id: 'c', name: '同类', amount: 3 },
    ];
    const key = requireDefined(
      requireDefined(identifyPrintRows(items)[1]).__agreeRowKey,
    );
    const prepared = preparePrintTemplate(
      {
        agreeLayout: 'document-flow',
        panels: [
          {
            printElements: [
              {
                printElementType: { type: 'table' },
                options: {
                  field: 'items',
                  tableBodyRowHeight: 24,
                  agreeBodyRowHeights: setRowHeightOverride({}, key, 40),
                  columns: [
                    [
                      { title: '项目', field: 'name', agreeMergeSame: true },
                      { title: '金额', field: 'amount' },
                    ],
                  ],
                },
              },
            ],
          },
        ],
      },
      { items } as any,
    );
    const table = renderDocumentTable(
      prepared.template.panels[0].printElements[0].options,
      prepared.printData,
    );
    expect(
      [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')].map(
        (row) => row.style.height,
      ),
    ).toEqual(['24pt', '40pt', '24pt']);
    const page = fragmentTable(table, 1, 3);
    expect(
      [...page.querySelectorAll<HTMLTableRowElement>('tbody tr')].map(
        (row) => row.style.height,
      ),
    ).toEqual(['40pt', '24pt']);
    expect(page.querySelector<HTMLTableCellElement>('tbody td')?.rowSpan).toBe(
      2,
    );
  });

  it('overrides only one repeated form record while retaining the template default after data reorder', () => {
    const items = [
      { id: 'a', address: '甲' },
      { id: 'b', address: '乙' },
    ];
    const key = requireDefined(
      requireDefined(identifyPrintRows(items)[1]).__agreeRowKey,
    );
    const grid = createFormGrid();
    requireDefined(grid.rows[3]).height = 24;
    requireDefined(grid.rows[3]).recordHeights = setRowHeightOverride(
      {},
      key,
      40,
    );
    const prepared = preparePrintTemplate(
      {
        agreeLayout: 'document-flow',
        panels: [
          {
            printElements: [
              {
                printElementType: { type: 'table' },
                options: { agreeFormGrid: JSON.parse(JSON.stringify(grid)) },
              },
            ],
          },
        ],
      },
      { houses: [...items].toReversed() } as any,
    );
    const table = renderDocumentTable(
      prepared.template.panels[0].printElements[0].options,
      prepared.printData,
    );
    expect(
      [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')].map(
        (row) => row.style.height,
      ),
    ).toEqual(['22pt', '22pt', '22pt', '40pt', '24pt', '22pt']);
  });
  it('sets each header row independently and all detail rows uniformly, including continuation pages', () => {
    const table = renderDocumentTable(
      {
        field: 'items',
        tableHeaderRowHeight: 18,
        agreeHeaderRowHeights: [40, 24],
        tableBodyRowHeight: 32,
        columns: [
          [
            { title: '项目信息', colspan: 2 },
            { title: '备注', field: 'remark', rowspan: 2 },
          ],
          [
            { title: '名称', field: 'name' },
            { title: '金额', field: 'amount' },
          ],
        ],
      },
      {
        items: [
          { name: '甲', amount: 1, remark: '长内容\n第二行' },
          { name: '乙', amount: 2 },
        ],
      } as any,
    );
    expect(
      [...table.querySelectorAll<HTMLTableRowElement>('thead tr')].map(
        (row) => row.style.height,
      ),
    ).toEqual(['40pt', '24pt']);
    expect(
      [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')].map(
        (row) => row.style.height,
      ),
    ).toEqual(['32pt', '32pt']);
    expect(
      [...table.querySelectorAll<HTMLTableCellElement>('td')].every(
        (cell) =>
          !cell.style.height && !cell.style.maxHeight && !cell.style.overflow,
      ),
    ).toBe(true);
    expect(table.textContent).toContain('长内容\n第二行');
    const continuation = fragmentTable(table, 1, 2);
    expect(
      continuation.querySelector<HTMLTableRowElement>('thead tr')?.style.height,
    ).toBe('40pt');
    expect(
      continuation.querySelector<HTMLTableRowElement>('tbody tr')?.style.height,
    ).toBe('32pt');
  });

  it('keeps fixed form heights on their rows and propagates a template row height to every repeated record', () => {
    const grid = createFormGrid();
    requireDefined(grid.rows[0]).height = 45;
    requireDefined(grid.rows[3]).height = 36;
    // A vertically merged cell gets its height from two independently sized rows.
    requireDefined(requireDefined(grid.rows[0]).cells[0]).rowspan = 2;
    requireDefined(requireDefined(grid.rows[1]).cells[0]).colspan = 1;
    const prepared = preparePrintTemplate(
      {
        agreeLayout: 'document-flow',
        panels: [
          {
            printElements: [
              {
                printElementType: { type: 'table' },
                options: { agreeFormGrid: grid },
              },
            ],
          },
        ],
      },
      { houses: [{ address: '甲' }, { address: '乙' }] } as any,
    );
    const options = prepared.template.panels[0].printElements[0].options;
    const table = renderDocumentTable(options, prepared.printData);
    const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    expect(rows.map((row) => row.style.height)).toEqual([
      '45pt',
      '22pt',
      '22pt',
      '36pt',
      '36pt',
      '22pt',
    ]);
    const merged = rows[0]?.querySelector('td');
    expect(merged?.rowSpan).toBe(2);
    expect(merged?.style.height).toBe('');
    expect(
      rows[3]?.querySelector<HTMLElement>('td')?.dataset.docTemplateRow,
    ).toBe('3');
    expect(
      rows[4]?.querySelector<HTMLElement>('td')?.dataset.docTemplateRow,
    ).toBe('3');
  });
});

describe('document table pagination headers', () => {
  const data = {
    compensationItems: [
      { index: 1, name: '补偿一' },
      { index: 2, name: '补偿二' },
      { index: 3, name: '补偿三' },
    ],
  } as any;
  const columns = [
    [
      { title: '序号', field: 'index', width: 60 },
      { title: '项目', field: 'name', width: 100 },
    ],
  ];

  it.each(['page', 'none'] as const)(
    'uses %s header mode on continuation pages without dropping records',
    (tableHeaderRepeat) => {
      const table = renderDocumentTable(
        { field: 'compensationItems', columns, tableHeaderRepeat },
        data,
      );
      const first = fragmentTable(table, 0, 1);
      const remainder = fragmentTable(table, 1, 3);
      const last = fragmentTable(remainder, 1, 2);

      expect(first.querySelectorAll('thead tr')).toHaveLength(1);
      expect(remainder.querySelectorAll('thead tr')).toHaveLength(
        tableHeaderRepeat === 'page' ? 1 : 0,
      );
      expect(last.querySelectorAll('thead tr')).toHaveLength(
        tableHeaderRepeat === 'page' ? 1 : 0,
      );
      expect(first.querySelector('tbody')?.textContent).toContain('补偿一');
      expect(
        fragmentTable(remainder, 0, 1).querySelector('tbody')?.textContent,
      ).toContain('补偿二');
      expect(last.querySelector('tbody')?.textContent).toContain('补偿三');
    },
  );

  it('omits the header when a single long record continues on the next page', () => {
    const table = renderDocumentTable(
      { field: 'compensationItems', columns, tableHeaderRepeat: 'none' },
      data,
    );
    expect(fragmentTable(table, 0, 3, true).querySelector('thead')).toBeNull();
  });
});

describe('table border regions and typography', () => {
  const options = {
    field: 'items',
    columns: [
      [
        { title: '类别', field: 'category', rowspan: 2, agreeMergeSame: true },
        { title: '项目信息', colspan: 2 },
      ],
      [
        { title: '名称', field: 'name' },
        { title: '金额', field: 'amount' },
      ],
    ],
    agreeFooters: [
      { cells: [{ text: '备注', colspan: 3 }] },
      {
        cells: [
          { text: '合计', colspan: 2 },
          { field: 'total', colspan: 1 },
        ],
      },
    ],
  };
  const data = {
    items: [
      { category: '同类', name: '甲', amount: 1 },
      { category: '同类', name: '乙', amount: 2 },
      { category: '同类', name: '丙', amount: 3 },
    ],
    total: 6,
  } as any;

  it.each(['Header', 'Footer'])(
    'hides the entire %s perimeter while retaining internal cell borders',
    (region) => {
      const table = renderDocumentTable(
        { ...options, [`table${region}Border`]: 'noBorder' },
        data,
      );
      const rows =
        region === 'Header'
          ? [...table.querySelectorAll<HTMLTableRowElement>('thead tr')]
          : [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')].slice(
              -2,
            );
      expect(
        requireDefined(requireDefined(rows[0]).cells[0]).style.borderTopStyle,
      ).toBe('hidden');
      expect(
        requireDefined(requireDefined(rows[0]).cells[0]).style.borderLeftStyle,
      ).toBe('hidden');
      expect(
        requireDefined(requireDefined(rows.at(-1)).cells[0]).style
          .borderBottomStyle,
      ).toBe('hidden');
      expect(
        requireDefined(requireDefined(rows.at(-1)).cells[0]).style
          .borderRightStyle,
      ).toBe('solid');
      expect(
        requireDefined(requireDefined(rows.at(-1)).cells[1]).style
          .borderRightStyle,
      ).toBe('hidden');
      expect(requireDefined(rows[0]).style.borderStyle).toBe('none');
      const firstCell = requireDefined(requireDefined(rows[0]).cells[0]);
      const borders =
        region === 'Header'
          ? {
              rowSpan: firstCell.rowSpan,
              bottom: firstCell.style.borderBottomStyle,
              nextBottom: requireDefined(requireDefined(rows[0]).cells[1]).style
                .borderBottomStyle,
            }
          : { bottom: firstCell.style.borderBottomStyle };
      expect(borders).toEqual(
        region === 'Header'
          ? { rowSpan: 2, bottom: 'hidden', nextBottom: 'solid' }
          : { bottom: 'solid' },
      );
    },
  );

  it.each(['Header', 'Footer'])(
    'keeps the %s perimeter but removes internal lines when cell borders are off',
    (region) => {
      const table = renderDocumentTable(
        { ...options, [`table${region}CellBorder`]: 'noBorder' },
        data,
      );
      const rows =
        region === 'Header'
          ? [...table.querySelectorAll<HTMLTableRowElement>('thead tr')]
          : [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')].slice(
              -2,
            );
      expect(
        requireDefined(requireDefined(rows[0]).cells[0]).style.borderTopStyle,
      ).toBe('solid');
      expect(
        requireDefined(requireDefined(rows.at(-1)).cells[0]).style
          .borderBottomStyle,
      ).toBe('solid');
      expect(
        requireDefined(requireDefined(rows.at(-1)).cells[0]).style
          .borderRightStyle,
      ).toBe('none');
      expect(
        requireDefined(requireDefined(rows.at(-1)).cells[1]).style
          .borderRightStyle,
      ).toBe('solid');
      expect(
        requireDefined(
          requireDefined(rows[0]).cells[region === 'Header' ? 1 : 0],
        ).style.borderBottomStyle,
      ).toBe('none');
    },
  );

  it.each(['border', 'noBorder'])(
    'gives explicit whole-table %s priority only on the page perimeter',
    (tableBorder) => {
      const table = renderDocumentTable(
        {
          ...options,
          tableBorder,
          tableHeaderBorder: 'noBorder',
          tableFooterBorder: 'noBorder',
        },
        data,
      );
      const style = tableBorder === 'border' ? 'solid' : 'hidden';
      expect(
        requireDefined(table.querySelector<HTMLTableCellElement>('thead td'))
          .style.borderTopStyle,
      ).toBe(style);
      expect(
        requireDefined(table.querySelector<HTMLTableCellElement>('thead td'))
          .style.borderLeftStyle,
      ).toBe(style);
      const last = requireDefined(
        table.querySelector<HTMLTableRowElement>('tbody tr:last-child'),
      );
      expect(requireDefined(last.cells[0]).style.borderBottomStyle).toBe(style);
      // The footer top is internal, so its own explicit setting still applies.
      expect(
        requireDefined(
          table.querySelector<HTMLTableCellElement>('[data-doc-footer]'),
        ).style.borderTopStyle,
      ).toBe('hidden');
      expect(table.style.borderStyle).toBe('none');
    },
  );

  it('removes all visible borders when every region is disabled', () => {
    const table = renderDocumentTable(
      {
        ...options,
        tableBorder: 'noBorder',
        tableHeaderBorder: 'noBorder',
        tableHeaderCellBorder: 'noBorder',
        tableBodyCellBorder: 'noBorder',
        tableFooterBorder: 'noBorder',
        tableFooterCellBorder: 'noBorder',
      },
      data,
    );
    for (const cell of table.querySelectorAll<HTMLTableCellElement>('td'))
      for (const side of [
        'borderTopStyle',
        'borderRightStyle',
        'borderBottomStyle',
        'borderLeftStyle',
      ] as const)
        expect(['none', 'hidden']).toContain(cell.style[side]);
  });

  it('applies the same outer border controls to fixed forms with merged cells and repeated rows', () => {
    const prepared = preparePrintTemplate(
      {
        agreeLayout: 'document-flow',
        panels: [
          {
            printElements: [
              {
                printElementType: { type: 'table' },
                options: {
                  agreeFormGrid: createFormGrid(),
                  tableBorder: 'noBorder',
                },
              },
            ],
          },
        ],
      },
      {
        agreementNo: 'TEST',
        houses: [
          { address: '甲', buildArea: 86 },
          { address: '乙', buildArea: 45 },
        ],
      } as any,
    );
    const table = renderDocumentTable(
      prepared.template.panels[0].printElements[0].options,
      prepared.printData,
    );
    expect(table.querySelectorAll('thead td')).toHaveLength(0);
    const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    expect(rows).toHaveLength(6);
    const merged = requireDefined(requireDefined(rows[1]).cells[0]);
    expect(merged.colSpan).toBe(4);
    expect(merged.style.borderLeftStyle).toBe('hidden');
    expect(merged.style.borderRightStyle).toBe('hidden');
    expect(merged.style.borderBottomStyle).toBe('solid');
    const continuation = fragmentTable(table, 3, 6);
    expect(
      requireDefined(
        continuation.querySelector<HTMLTableCellElement>('tbody td'),
      ).style.borderTopStyle,
    ).toBe('hidden');
    const total = requireDefined(
      requireDefined(
        continuation.querySelector<HTMLTableRowElement>('tbody tr:last-child'),
      ).cells[1],
    );
    expect(total.colSpan).toBe(3);
    expect(total.style.borderRightStyle).toBe('hidden');
    expect(total.style.borderBottomStyle).toBe('hidden');
    expect(continuation.textContent).toContain('甲');
    expect(continuation.textContent).toContain('乙');
  });

  it.each(['page', 'none'])(
    'recalculates merged cell edges on fragments with %s headers and keeps settings after JSON round trip',
    (tableHeaderRepeat) => {
      const original = {
        ...options,
        tableBodyCellBorder: 'noBorder',
        tableHeaderRepeat,
      };
      const snapshot = JSON.stringify(original);
      const table = renderDocumentTable(JSON.parse(snapshot), data);
      const first = fragmentTable(table, 0, 1);
      const remainder = fragmentTable(table, 1, 3);
      const last = fragmentTable(remainder, 1, 2);
      const firstMerged = requireDefined(
        first.querySelector<HTMLTableCellElement>('tbody td'),
      );
      const lastMerged = requireDefined(
        last.querySelector<HTMLTableCellElement>('tbody td'),
      );
      expect(firstMerged.rowSpan).toBe(1);
      expect(firstMerged.style.borderBottomStyle).toBe('solid');
      expect(lastMerged.style.borderBottomStyle).toBe('solid');
      expect(lastMerged.style.borderTopStyle).toBe(
        tableHeaderRepeat === 'none' ? 'solid' : 'none',
      );
      expect(last.querySelectorAll('thead').length).toBe(
        tableHeaderRepeat === 'none' ? 0 : 1,
      );
      expect(JSON.stringify(original)).toBe(snapshot);
    },
  );

  it.each([undefined, null, ''])(
    'uses actual typography defaults for cleared values (%s) and protects large multiline headers',
    (empty) => {
      const table = renderDocumentTable(
        {
          ...options,
          fontSize: empty,
          tableHeaderFontSize: empty,
          lineHeight: empty,
        },
        data,
      );
      const header = requireDefined(
        table.querySelector<HTMLTableCellElement>('thead td'),
      );
      expect(table.style.fontSize).toBe('10pt');
      expect(header.style.fontSize).toBe('10pt');
      expect(header.style.lineHeight).toBe('12.5pt');
      const large = renderDocumentTable(
        { ...options, fontSize: 10, tableHeaderFontSize: 24, lineHeight: 8 },
        data,
      );
      expect(
        requireDefined(large.querySelector<HTMLTableCellElement>('thead td'))
          .style.lineHeight,
      ).toBe('30pt');
    },
  );

  it('retains table colors, per-column overrides and header background on continuation pages', () => {
    const table = renderDocumentTable(
      {
        ...options,
        color: '#2563eb',
        backgroundColor: '#fafafa',
        tableHeaderBackground: '#eeeeee',
        tableHeaderFontWeight: '500',
        columns: [
          [
            {
              title: '项目',
              field: 'name',
              agreeColor: '#dc2626',
              agreeHeaderColor: '#16a34a',
            },
            { title: '金额', field: 'amount' },
          ],
        ],
      },
      data,
    );
    const page = fragmentTable(table, 1, 3);
    expect(page.style.color).toBe('#2563eb');
    expect(page.style.backgroundColor).toBe('#fafafa');
    const header = requireDefined(
      page.querySelector<HTMLTableCellElement>('thead td'),
    );
    expect(header.style.backgroundColor).toBe('#eeeeee');
    expect(header.style.color).toBe('#16a34a');
    expect(header.style.fontWeight).toBe('500');
    const cells = page.querySelectorAll<HTMLTableCellElement>(
      'tbody tr:first-child td',
    );
    expect(requireDefined(cells[0]).style.color).toBe('#dc2626');
    expect(requireDefined(cells[1]).style.color).toBe('inherit');
  });
});

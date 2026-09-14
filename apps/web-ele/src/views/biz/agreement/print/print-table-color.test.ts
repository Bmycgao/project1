import { describe, expect, it } from 'vitest';

import { preparePrintTemplate } from './prepare-template';
import { mergeAgreeCustomOptions } from './print-agree-options';
import {
  buildTableHeaderColumns,
  extractTableHeaderGroups,
  listLeafTableCells,
  patchLeafTableColumns,
} from './print-element-meta';
import {
  applyTableColorMeta,
  applyTableColorsRuntime,
  normalizeTableColor,
  resolveTableCellColor,
} from './print-table-color';
import {
  createFooterFormatterSrc,
  normalizeAgreeFooters,
} from './print-table-footer';

// Execute generated native engine callbacks to verify runtime compatibility.
// oxlint-disable-next-line eslint/no-new-func
const compile = (src: string) => new Function(`return (${src})`)();
const column = {
  title: '金额',
  field: 'amount',
  checked: true,
  agreeColor: '#2563eb',
  agreeColorWhen: 'value < 0',
  agreeConditionColor: '#dc2626',
  agreeHeaderColor: '#15803d',
};
function template() {
  return {
    panels: [
      {
        printElements: [
          {
            printElementType: { type: 'table' },
            options: {
              field: 'items',
              color: '#333333',
              columns: [[{ ...column }]],
            },
          },
        ],
      },
    ],
  };
}

describe('table text colors', () => {
  it('preserves group header colors when rebuilding and inherits defaults after clearing', () => {
    const leaves = [
      { title: 'A', field: 'a' },
      { title: 'B', field: 'b' },
    ];
    const columns = buildTableHeaderColumns(leaves, [
      { title: '分组', fromLeaf: 0, toLeaf: 1, agreeHeaderColor: '#15803d' },
    ]);
    const rebuilt = buildTableHeaderColumns(
      leaves,
      extractTableHeaderGroups(columns),
    );
    expect(rebuilt[0]?.[0]?.agreeHeaderColor).toBe('#15803d');
    const options: any = {
      color: '#333333',
      columns: [
        [
          {
            ...column,
            agreeColor: '',
            agreeHeaderColor: '',
            agreeColorWhen: '',
            agreeConditionColor: '',
          },
        ],
      ],
    };
    applyTableColorsRuntime(options);
    expect(compile(options.columns[0][0].styler2)(-5, {}).color).toBe(
      '#333333',
    );
    expect(compile(options.columns[0][0].stylerHeader)().color).toBe('#333333');
  });
  it('uses conditions on raw calculated values and falls back to the column color', () => {
    expect(resolveTableCellColor(column, { amount: -5 })).toBe('#dc2626');
    expect(resolveTableCellColor(column, { amount: 2 })).toBe('#2563eb');
    expect(
      resolveTableCellColor(
        { ...column, agreeConditionColor: '' },
        { amount: -5 },
      ),
    ).toBe('#2563eb');
    expect(
      resolveTableCellColor(
        { ...column, agreeColorWhen: "status == '异常'" },
        { status: '异常' },
      ),
    ).toBe('#dc2626');
    expect(normalizeTableColor('red; background:url(x)')).toBe('');
  });
  it('compiles body and header colors through JSON and preserves existing stylers', () => {
    const options: any = {
      color: '#333333',
      columns: [
        [{ ...column, styler2: 'function(){return {fontWeight:700}}' }],
      ],
    };
    const rows = applyTableColorMeta(
      [{ amount: -3 }, { amount: 4 }],
      options.columns,
      {},
    );
    applyTableColorsRuntime(options);
    const saved = JSON.parse(JSON.stringify(options));
    const style = compile(saved.columns[0][0].styler2);
    expect(style(-3, rows[0])).toEqual({ fontWeight: 700, color: '#dc2626' });
    expect(style(4, rows[1]).color).toBe('#2563eb');
    expect(compile(saved.columns[0][0].stylerHeader)().color).toBe('#15803d');
    expect(rows[0]?.amount).toBe(-3);
  });
  it('applies conditions after formulas and survives column editing and serialization', () => {
    const source = template();
    Object.assign(
      source.panels[0]?.printElements[0]?.options.columns[0]?.[0] || {},
      { agreeColExpr: 'quantity * price' },
    );
    const prepared = preparePrintTemplate(source, {
      items: [{ quantity: 2, price: -4 }],
    } as any);
    const data = prepared.printData as any;
    expect(data.items[0].amount).toBe(-8);
    expect(data.items[0].__agreeCellColors[0]).toBe('#dc2626');
    const edited = patchLeafTableColumns(
      source,
      { panelIndex: 0, elementIndex: 0 },
      listLeafTableCells(source.panels[0]?.printElements[0]?.options.columns),
    );
    const serialized = template();
    const serializedOptions = serialized.panels[0]?.printElements[0]?.options;
    if (!serializedOptions) throw new Error('Missing fixture options');
    serializedOptions.columns = [
      [{ title: '金额', field: 'amount', checked: true } as any],
    ];
    const restored = mergeAgreeCustomOptions(serialized, edited);
    expect(
      listLeafTableCells(
        restored.panels[0].printElements[0].options.columns,
      )[0],
    ).toMatchObject({
      agreeColor: column.agreeColor,
      agreeHeaderColor: column.agreeHeaderColor,
      agreeColorWhen: column.agreeColorWhen,
      agreeConditionColor: column.agreeConditionColor,
    });
  });
  it('keeps footer color in normalized and printed cells, with inheritance when cleared', () => {
    const rows = normalizeAgreeFooters(
      [{ cells: [{ colspan: 1, text: '合计', color: '#dc2626' }] }],
      1,
    );
    expect(compile(createFooterFormatterSrc(rows))({}, [], [], {})).toContain(
      'color:#dc2626',
    );
    const inherited = normalizeAgreeFooters(
      [{ cells: [{ colspan: 1, text: '合计' }] }],
      1,
    );
    expect(
      compile(createFooterFormatterSrc(inherited))({}, [], [], {}),
    ).toContain('color:inherit');
  });
});

import type { FormGrid } from './print-form-grid';

import { describe, expect, it } from 'vitest';

import {
  resolveTablePreview,
  tablePreviewRowLimit,
} from '../designer/template-model';
import { buildToolboxPrintElement } from '../template/print-element-meta';
import { preparePrintTemplate } from './prepare-template';
import {
  compileFormGrid,
  createFormGrid,
  emptyFormCell,
  formGridSpans,
  mergeFormCells,
  normalizeFormGrid,
  readFormField,
  resizeFormGrid,
} from './print-form-grid';
import { evalNamedMergeFn } from './print-table-runtime';

const sample = {
  agreementNo: 'XY-001',
  signDate: '2026-09-14',
  amount: 120,
  houses: [
    { address: '甲', area: 20, buildArea: 20 },
    { address: '乙', area: 30, buildArea: 30 },
  ],
  rewards: [{ name: '签约奖励', amount: 12 }],
};
const blankGrid = (): FormGrid => ({
  version: 1,
  columns: [100, 100, 100],
  rows: Array.from({ length: 4 }, () => ({
    cells: Array.from({ length: 3 }, emptyFormCell),
  })),
});

describe('form grid bindings and repeated rows', () => {
  it('mixes fixed bindings, multiple arrays, row formulas and a final total', () => {
    const grid = createFormGrid();
    grid.rows.push({
      source: 'rewards',
      cells: [
        { mode: 'field', value: 'row.name' },
        { mode: 'field', value: 'row.amount', format: 'money' },
        { mode: 'field', value: 'root.agreementNo' },
        emptyFormCell(),
      ],
    });
    grid.rows.push({
      cells: [
        { mode: 'text', value: '总面积' },
        { mode: 'formula', value: 'SUM(houses, "area")' },
        emptyFormCell(),
        emptyFormCell(),
      ],
    });
    const { rows } = compileFormGrid(grid, sample);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({
      __form_c0: '协议编号',
      __form_c1: 'XY-001',
      __form_c3: '2026-09-14',
    });
    expect(rows[3]).toMatchObject({
      __form_c0: '1',
      __form_c1: '甲',
      __form_c2: '20',
    });
    expect(rows[4]).toMatchObject({ __form_c0: '2', __form_c1: '乙' });
    expect(rows[5]).toMatchObject({
      __form_c1: '120.00',
      agreeCellMerges: [
        [1, 1],
        [1, 3],
        [0, 0],
        [0, 0],
      ],
    });
    expect(rows[6]).toMatchObject({
      __form_c0: '签约奖励',
      __form_c1: '12.00',
      __form_c2: 'XY-001',
    });
    expect(rows[7]).toMatchObject({ __form_c1: '50' });
  });

  it('preserves an empty detail line or removes it according to the row setting', () => {
    const grid = createFormGrid();
    expect(compileFormGrid(grid, {}).rows).toHaveLength(5);
    expect(compileFormGrid(grid, {}).rows[3]).toMatchObject({
      __form_c0: '',
      __form_c1: '',
    });
    grid.rows[3]!.empty = 'omit';
    expect(compileFormGrid(grid, {}).rows).toHaveLength(4);
  });

  it('reads nested fields without executing expressions or exposing inherited properties', () => {
    expect(
      readFormField(
        { data: { items: [{ name: '姓名' }] } },
        'data.items[0].name',
      ),
    ).toBe('姓名');
    expect(readFormField({}, 'constructor')).toBeUndefined();
    expect(
      readFormField(Object.create({ private: 'secret' }), 'private'),
    ).toBeUndefined();
  });

  it('does not change source data or saved cells between previews', () => {
    const grid = createFormGrid();
    const original = JSON.stringify({ grid, sample });
    expect(compileFormGrid(grid, sample)).toEqual(
      compileFormGrid(JSON.parse(JSON.stringify(grid)), sample),
    );
    expect(JSON.stringify({ grid, sample })).toBe(original);
  });
});

describe('form grid structure', () => {
  it('merges a fixed rectangle and restores covered values on split', () => {
    const grid = blankGrid();
    grid.rows[1]!.cells[1]!.value = '保留内容';
    const merged = mergeFormCells(grid, 0, 0, 1, 1);
    expect(formGridSpans(merged)[0]).toEqual([
      [2, 2],
      [0, 0],
      [1, 1],
    ]);
    expect(formGridSpans(merged)[1]).toEqual([
      [0, 0],
      [0, 0],
      [1, 1],
    ]);
    Object.assign(merged.rows[0]!.cells[0]!, { colspan: 1, rowspan: 1 });
    expect(compileFormGrid(merged, {}).rows[1]?.__form_c1).toBe('保留内容');
  });

  it('rejects partial overlaps and merges crossing a repeated row', () => {
    const merged = mergeFormCells(blankGrid(), 0, 0, 1, 1);
    expect(() => mergeFormCells(merged, 1, 1, 2, 2)).toThrow('先拆分');
    merged.rows[2]!.source = 'houses';
    expect(() => mergeFormCells(merged, 2, 0, 3, 1)).toThrow('动态明细行');
    expect(formGridSpans(mergeFormCells(merged, 2, 0, 2, 2))[2]).toEqual([
      [1, 3],
      [0, 0],
      [0, 0],
    ]);
  });

  it.each(['column', 'row'] as const)(
    'preserves merges and contents when inserting and removing a %s',
    (axis) => {
      const grid = mergeFormCells(blankGrid(), 0, 0, 1, 1);
      grid.rows[0]!.cells[0]!.value = '主格';
      const inserted = resizeFormGrid(grid, axis, 1);
      expect(formGridSpans(inserted)[0]?.[0]).toEqual(
        axis === 'row' ? [3, 2] : [2, 3],
      );
      const deleted = resizeFormGrid(inserted, axis, 0, true);
      expect(formGridSpans(deleted)[0]?.[0]).toEqual([2, 2]);
      expect(deleted.rows[0]?.cells[0]?.value).toBe('主格');
      expect(normalizeFormGrid(deleted)).toEqual(deleted);
    },
  );
});

describe('form grid canvas and print parity', () => {
  it('survives template serialization and compiles to native printable table rows with exact cell spans', () => {
    const element = buildToolboxPrintElement('formGrid', 20, 100)!;
    const source = JSON.parse(
      JSON.stringify({
        panels: [
          {
            width: 210,
            height: 297,
            paperFooter: 800,
            printElements: [element, element],
          },
        ],
      }),
    );
    const before = JSON.stringify(source);
    const result = preparePrintTemplate(source, sample as any);
    const [first, second] = result.template.panels[0].printElements;
    expect(first.options.field).not.toBe(second.options.field);
    expect(first.options.tableHeaderRepeat).toBe('none');
    expect(
      first.options.columns[0].reduce(
        (sum: number, col: any) => sum + col.width,
        0,
      ),
    ).toBe(550);
    const preview = resolveTablePreview(
      first.options,
      result.printData,
      tablePreviewRowLimit(first.options),
      { rowsPrepared: true },
    );
    expect(preview.headerRows).toEqual([]);
    expect(preview.bodyRows).toHaveLength(6);
    expect(preview.bodyRows[3]?.[1]?.text).toBe('甲');
    expect(preview.bodyRows[5]?.[1]).toMatchObject({
      colspan: 3,
      text: '120.00',
    });
    const merge = evalNamedMergeFn(first.options.rowsColumnsMerge);
    const rows = (result.printData as any)[first.options.field];
    expect(typeof merge).toBe('function');
    if (typeof merge === 'function')
      expect(merge(rows[5], {}, 1, 5, rows, {})).toEqual([1, 3]);
    expect(JSON.stringify(source)).toBe(before);
    expect(source.panels[0].printElements[0].options).not.toHaveProperty(
      'field',
    );
  });

  it('escapes data in print output and keeps per-cell alignment and minimum height', () => {
    const source = {
      panels: [
        { printElements: [buildToolboxPrintElement('formGrid', 20, 100)] },
      ],
    };
    const result = preparePrintTemplate(source, {
      ...sample,
      agreementNo: '<img src=x>\n&',
    } as any);
    const options = result.template.panels[0].printElements[0].options;
    const data = (result.printData as any)[options.field];
    // 仅执行本模块生成的固定函数源码，与打印引擎的加载方式一致。

    const formatter = eval(`(${options.columns[0][1].formatter2})`);

    const styler = eval(`(${options.columns[0][0].styler2})`);
    expect(formatter(data[0].__form_c1)).toBe('&lt;img src=x&gt;<br/>&amp;');
    expect(styler('', data[1])).toMatchObject({
      height: '22pt',
      fontWeight: '700',
      textAlign: 'left',
    });
  });

  it('does not truncate long repeated lists in the canvas model', () => {
    const result = preparePrintTemplate(
      {
        panels: [
          { printElements: [buildToolboxPrintElement('formGrid', 20, 100)] },
        ],
      },
      {
        ...sample,
        houses: Array.from({ length: 70 }, (_, index) => ({
          address: `房屋${index}`,
          area: 1,
        })),
      } as any,
    );
    const options = result.template.panels[0].printElements[0].options;
    expect(
      resolveTablePreview(
        options,
        result.printData,
        tablePreviewRowLimit(options),
        { rowsPrepared: true },
      ).bodyRows,
    ).toHaveLength(74);
    expect(result.template.panels[0].panelPageRule).toBeUndefined();
  });

  it('removes an entirely empty form table and lets following body content fill the space', () => {
    const element = buildToolboxPrintElement('formGrid', 20, 100)!;
    Object.assign(element.options, {
      agreeFormGrid: {
        version: 1,
        columns: [100],
        rows: [
          {
            source: 'houses',
            empty: 'omit',
            cells: [{ mode: 'field', value: 'row.address' }],
          },
        ],
      },
    });
    const result = preparePrintTemplate(
      {
        panels: [
          {
            printElements: [
              element,
              {
                printElementType: { type: 'text' },
                options: { top: 250, height: 20, title: '说明' },
              },
            ],
          },
        ],
      },
      { ...sample, houses: [] } as any,
    );
    expect(result.template.panels[0].printElements).toHaveLength(1);
    expect(result.template.panels[0].printElements[0].options.top).toBe(100);
  });
});

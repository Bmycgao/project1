import { describe, expect, it } from 'vitest';

import { resolveTablePreview } from './designer/template-model';
import { preparePrintTemplate } from './prepare-template';
import { mergeAgreeCustomOptions } from './print-agree-options';
import {
  buildTableHeaderColumns,
  insertLeafTableColumn,
  listLeafTableCells,
  patchLeafTableColumns,
} from './print-element-meta';
import {
  applyHeaderMergesToDom,
  hideConsumedPrintCells,
  installHeaderMergeRuntime,
  listHeaderMerges,
  mergeTableHeaders,
  projectTableHeaders,
  rebuildPrintTableColgroups,
  splitTableHeader,
  syncContinuedTableHeaders,
} from './print-header-merge';

function columns() {
  return buildTableHeaderColumns(
    [
      { title: '序号', field: 'index', width: 40, checked: true },
      { title: '项目名称', field: 'name', width: 100, checked: true },
      {
        title: '新列',
        field: '',
        width: 60,
        checked: true,
        agreeColExpr: 'quantity * 2',
      },
      { title: '计算方式', field: 'calcType', width: 90, checked: true },
      {
        title: '金额',
        field: 'amount',
        width: 80,
        checked: true,
        agreeColFormat: 'moneyDollar',
      },
    ],
    [{ fromLeaf: 1, toLeaf: 3, title: '项目信息' }],
  );
}
function template(cols: unknown) {
  return {
    panels: [
      {
        printElements: [
          {
            printElementType: { type: 'table' },
            options: { field: 'items', columns: cols },
          },
        ],
      },
    ],
  };
}
const ref = { panelIndex: 0, elementIndex: 0 };
function readColumns(tpl: Record<string, any>) {
  return tpl.panels[0].printElements[0].options.columns;
}

describe('header-only horizontal merges', () => {
  it('merges a header without changing leaf fields, formulas, widths or parent groups', () => {
    const original = columns();
    const merged = mergeTableHeaders(original, 1, 2);
    const projected = projectTableHeaders(merged);
    expect(projected[0]?.map((cell) => cell.title)).toEqual([
      '序号',
      '项目信息',
      '金额',
    ]);
    expect(
      projected[1]?.map((cell) => [cell.title, cell.colspan, cell.width]),
    ).toEqual([
      ['项目名称', 2, 160],
      ['计算方式', 1, 90],
    ]);
    expect(listLeafTableCells(merged)).toEqual(listLeafTableCells(original));
    expect(projectTableHeaders(original)[1]).toHaveLength(3);
    const preview = resolveTablePreview({ field: 'items', columns: merged }, {
      items: [{ index: 1, name: '房屋补偿', calcType: '定额', amount: 20 }],
    } as any);
    expect(preview.bodyRows[0]).toHaveLength(5);
    expect(preview.bodyRows[0]?.[1]?.colspan).toBe(1);
    expect(preview.bodyRows[0]?.[4]?.text).toBe('$20.00');
  });

  it('restores the original headers on split, including the unnamed field', () => {
    const merged = mergeTableHeaders(columns(), 1, 2, '自定义标题');
    const id = listHeaderMerges(merged)[0]?.id || '';
    expect(splitTableHeader(merged, id)).toEqual(columns());
  });

  it('rejects different levels, different parents and partial existing merges', () => {
    expect(() => mergeTableHeaders(columns(), 0, 1)).toThrow('同一层');
    expect(() => mergeTableHeaders(columns(), 3, 4)).toThrow('同一层');
    expect(() => mergeTableHeaders(columns(), 1, 1)).toThrow('至少两个');
    expect(() =>
      mergeTableHeaders(mergeTableHeaders(columns(), 1, 2), 2, 3),
    ).toThrow('部分');
    const siblings = buildTableHeaderColumns(
      columns()
        .flat()
        .filter((cell) => cell.field),
      [
        { fromLeaf: 0, toLeaf: 1, title: 'A' },
        { fromLeaf: 2, toLeaf: 3, title: 'B' },
      ],
    );
    expect(() => mergeTableHeaders(siblings, 1, 2)).toThrow('同一上级');
  });

  it('extends only when inserting inside a merged header and preserves it after deleting the first leaf', () => {
    const merged = mergeTableHeaders(columns(), 1, 2);
    const inserted = insertLeafTableColumn(template(merged), ref, 1, {
      title: '插入列',
    });
    expect(listHeaderMerges(readColumns(inserted))[0]).toMatchObject({
      fromLeaf: 1,
      toLeaf: 3,
    });
    const deleted = patchLeafTableColumns(
      inserted,
      ref,
      listLeafTableCells(readColumns(inserted)).filter((_, i) => i !== 1),
    );
    expect(listHeaderMerges(readColumns(deleted))[0]).toMatchObject({
      fromLeaf: 1,
      toLeaf: 2,
      title: '项目名称',
    });
    const outside = insertLeafTableColumn(template(merged), ref, 2, {
      title: '外部列',
    });
    expect(listHeaderMerges(readColumns(outside))[0]).toMatchObject({
      fromLeaf: 1,
      toLeaf: 2,
    });
  });

  it('restores merge metadata after hiprint serialization, including empty fields', () => {
    const memory = template(mergeTableHeaders(columns(), 1, 2));
    const canvas = template(columns());
    const restored = mergeAgreeCustomOptions(canvas, memory);
    expect(listHeaderMerges(readColumns(restored))).toHaveLength(1);
    expect(listLeafTableCells(readColumns(restored))).toHaveLength(5);
  });

  it('merges repeated printed headers exactly once without touching body cells', () => {
    const merged = mergeTableHeaders(columns(), 1, 2);
    const root = document.createElement('div');
    const markup =
      '<table><thead><tr><td rowspan="2">序号</td><td colspan="3">项目信息</td><td rowspan="2">金额</td></tr><tr><td>项目名称</td><td>新列</td><td>计算方式</td></tr></thead><tbody><tr><td>1</td><td>A</td><td>B</td><td>C</td><td>20</td></tr></tbody></table>';
    root.innerHTML = markup + markup;
    const prepared = preparePrintTemplate(template(merged), {
      items: [],
    } as any);
    const instance = {
      printPanels: [{ printElements: [{ printElementType: {} as any }] }],
    };
    installHeaderMergeRuntime(instance, prepared.template);
    instance.printPanels[0]?.printElements[0]?.printElementType.onRendered(
      [root],
      {},
      [],
    );
    applyHeaderMergesToDom(root, listHeaderMerges(merged));
    expect(
      [...root.querySelectorAll('thead tr:last-child')].map(
        (row) => row.children.length,
      ),
    ).toEqual([2, 2]);
    expect(
      root.querySelector('thead tr:last-child td')?.getAttribute('colspan'),
    ).toBe('2');
    expect(root.querySelectorAll('tbody td')).toHaveLength(10);
  });

  it('accounts for hidden columns before a printed merge', () => {
    const source = [
      [{ title: '隐藏', checked: false }, { title: 'A' }, { title: 'B' }],
    ];
    expect(() => mergeTableHeaders(source, 0, 1)).toThrow('只能合并');
    const merged = mergeTableHeaders(source, 1, 2);
    const type = { onRendered: undefined as any };
    const instance = {
      printPanels: [{ printElements: [{ printElementType: type }] }],
    };
    installHeaderMergeRuntime(instance, template(merged));
    const root = document.createElement('div');
    root.innerHTML =
      '<table><thead><tr><td>A</td><td>B</td></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
    type.onRendered([root], {}, []);
    expect(root.querySelectorAll('thead td')).toHaveLength(1);
    expect(root.querySelector('thead td')?.getAttribute('colspan')).toBe('2');
    expect(root.querySelectorAll('tbody td')).toHaveLength(2);
  });

  it('rebuilds colgroup from leaf columns for multi-row headers', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<table class="hiprint-printElement-tableTarget"><colgroup><col width="70pt"><col width="80pt"></colgroup><thead><tr><td>数量</td><td>单价</td></tr></thead></table>';
    rebuildPrintTableColgroups(root, [
      { width: 40 },
      { width: 100 },
      { width: 90 },
    ]);
    const cols = [...root.querySelectorAll('col')];
    expect(cols.map((col) => col.getAttribute('width'))).toEqual([
      '40pt',
      '100pt',
      '90pt',
    ]);
    expect(root.querySelector('table')?.firstElementChild?.tagName).toBe(
      'COLGROUP',
    );
  });

  it('hides tbody cells restored by hiprint paging merge cleanup', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<table><tbody><tr><td rowspan="1">搬迁补助</td><td rowspan="0" colspan="0" style="display:"> </td><td>定额</td></tr></tbody></table>';
    hideConsumedPrintCells(root);
    const extra = root.querySelector('td[rowspan="0"]') as HTMLElement;
    expect(extra.style.display).toBe('none');
  });

  it('copies the first page header onto continuation tables', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<table class="hiprint-printElement-tableTarget"><thead><tr><td>序号</td><td colspan="2">分组标题</td></tr><tr><td>项目名称</td><td>计算方式</td></tr></thead></table>' +
      '<table class="hiprint-printElement-tableTarget"><thead><tr><td>序号</td><td colspan="3">分组标题</td></tr><tr><td>项目名称</td><td></td><td>计算方式</td></tr></thead></table>';
    const cache: { html?: string } = {};
    syncContinuedTableHeaders(root, cache);
    const heads = [...root.querySelectorAll('thead')];
    expect(heads[1]?.innerHTML).toBe(heads[0]?.innerHTML);
    expect(heads[1]?.querySelectorAll('tr:last-child td')).toHaveLength(2);
  });
});

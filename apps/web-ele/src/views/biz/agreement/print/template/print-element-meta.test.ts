import { describe, expect, it } from 'vitest';

import {
  buildTableHeaderColumns,
  extractTableHeaderGroups,
  insertLeafTableColumn,
  listLeafTableCells,
  normalizePrintAlign,
  patchLeafTableColumns,
} from './print-element-meta';

const ref = { elementIndex: 0, panelIndex: 0 };
const leaves = [
  { field: 'index', title: '序号', width: 42 },
  { field: 'quantity', title: '数量', width: 70 },
  { field: 'unitPrice', title: '单价', width: 80 },
  {
    agreeColExpr: 'quantity * unitPrice',
    agreeColFormat: 'money',
    field: 'amount',
    title: '金额',
    width: 80,
  },
  { field: 'remark', title: '备注', width: 58 },
];

function fixture() {
  return {
    panels: [
      {
        printElements: [
          {
            options: {
              columns: buildTableHeaderColumns(leaves, [
                { fromLeaf: 1, title: '计价信息', toLeaf: 3 },
              ]),
            },
          },
        ],
      },
    ],
  };
}

function readColumns(template: Record<string, any>) {
  return template.panels[0].printElements[0].options.columns;
}

describe('column editor structure changes', () => {
  it('does not duplicate leaves when nested groups shrink to the same range', () => {
    const source = fixture();
    const options = source.panels[0]?.printElements[0]?.options;
    if (!options) throw new Error('Missing fixture table');
    options.columns = buildTableHeaderColumns(leaves, [
      { fromLeaf: 1, title: '计价信息', toLeaf: 3 },
      { fromLeaf: 2, title: '金额信息', toLeaf: 3 },
    ]);
    const result = patchLeafTableColumns(
      source,
      ref,
      listLeafTableCells(readColumns(source)).filter((_, i) => i !== 1),
    );
    expect(
      listLeafTableCells(readColumns(result)).map((col) => col.field),
    ).toEqual(['index', 'unitPrice', 'amount', 'remark']);
    expect(extractTableHeaderGroups(readColumns(result))).toEqual([
      { fromLeaf: 1, title: '计价信息', toLeaf: 2 },
    ]);
  });

  it('restores the group range after inserting and deleting its last column', () => {
    const source = fixture();
    const inserted = insertLeafTableColumn(source, ref, 3, { title: '新列' });
    const drafts = listLeafTableCells(readColumns(inserted));
    const result = patchLeafTableColumns(
      inserted,
      ref,
      drafts.filter((_, i) => i !== 4),
    );

    expect(extractTableHeaderGroups(readColumns(result))).toEqual([
      { fromLeaf: 1, title: '计价信息', toLeaf: 3 },
    ]);
    expect(
      listLeafTableCells(readColumns(result)).map((col) => col.field),
    ).toEqual(leaves.map((col) => col.field));
    expect(listLeafTableCells(readColumns(result))[3]).toMatchObject({
      agreeColExpr: 'quantity * unitPrice',
      agreeColFormat: 'money',
    });
    expect(readColumns(source)).toEqual(readColumns(fixture()));
  });

  it('shifts a group left when deleting a preceding column', () => {
    const source = fixture();
    const result = patchLeafTableColumns(
      source,
      ref,
      listLeafTableCells(readColumns(source)).slice(1),
    );
    expect(extractTableHeaderGroups(readColumns(result))).toEqual([
      { fromLeaf: 0, title: '计价信息', toLeaf: 2 },
    ]);
  });

  it('drops a group reduced to one leaf without absorbing the following column', () => {
    const source = fixture();
    const result = patchLeafTableColumns(
      source,
      ref,
      listLeafTableCells(readColumns(source)).filter(
        (_, i) => i !== 1 && i !== 2,
      ),
    );
    expect(extractTableHeaderGroups(readColumns(result))).toEqual([]);
    expect(
      listLeafTableCells(readColumns(result)).map((col) => col.field),
    ).toEqual(['index', 'amount', 'remark']);
  });
});

describe('table cell align defaults', () => {
  it('treats missing align as center and keeps explicit left/right', () => {
    expect(normalizePrintAlign(undefined)).toBe('center');
    expect(normalizePrintAlign('center')).toBe('center');
    expect(normalizePrintAlign('left')).toBe('left');
    expect(normalizePrintAlign('right')).toBe('right');
  });

  it('inserts a new leaf column as center', () => {
    const inserted = insertLeafTableColumn(fixture(), ref, 1, {
      title: '新列',
    });
    expect(listLeafTableCells(readColumns(inserted))[2]?.align).toBe('center');
  });
});

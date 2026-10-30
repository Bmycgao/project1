import { createApp, h, nextTick, ref, shallowRef } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import { toDocumentTemplate } from '../runtime/document-layout';
import {
  AGREE_PRINT_FIELD_DND,
  AGREE_PRINT_TOOLBOX_DND,
} from '../template/print-element-meta';
import DocumentCanvas from './document-canvas.vue';

// These rectangles test hit targets and drag feedback; real pagination is checked in a browser.
vi.mock('../runtime/document-renderer', () => ({
  renderDocument: async (template: any, data: any) => {
    const paper = document.createElement('section');
    paper.dataset.panelIndex = '0';
    paper.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        bottom: 1000,
        right: 600,
        width: 600,
        height: 1000,
      }) as DOMRect;
    const sameRow = template.panels[0].printElements.every(
      (el: any) => el.options.agreeDocument.row === 0,
    );
    const sharedRow = document.createElement('div');
    sharedRow.getBoundingClientRect = () =>
      ({
        left: 20,
        top: 100,
        right: 620,
        bottom: 130,
        width: 600,
        height: 30,
      }) as DOMRect;
    if (sameRow) paper.append(sharedRow);
    for (let i = 0; i < 3; i++) {
      const row = document.createElement('div');
      const cell = document.createElement('div');
      cell.dataset.docKey = `0:${i}`;
      const content = document.createElement('div');
      content.textContent = `内容${i}`;
      if (
        template.panels[0].printElements[i]?.printElementType.type === 'table'
      ) {
        const table = document.createElement('table');
        const body = table.createTBody();
        const options = template.panels[0].printElements[i].options;
        cell.dataset.docField = options.field;
        const records = options.agreeFormGrid ? [1] : [0, 1];
        for (const record of records) {
          const tr = body.insertRow();
          for (let col = 0; col < (options.columns?.[0]?.length || 1); col++) {
            const td = tr.insertCell();
            td.dataset.docRecord = String(record);
            td.dataset.docCol = String(col);
            const rowKey = data[options.field]?.[record]?.__agreeRowKey;
            if (rowKey) td.dataset.docRowKey = rowKey;
            if (options.agreeFormGrid) td.dataset.docTemplateRow = '1';
            td.textContent = '测试单元格';
            td.getBoundingClientRect = () =>
              ({
                left: 20 + col * 150,
                right: 170 + col * 150,
                top: 300 + record * 24,
                bottom: 324 + record * 24,
                width: 150,
                height: 24,
              }) as DOMRect;
          }
        }
        content.append(table);
      }
      content.getBoundingClientRect = () =>
        ({
          top: 100 + i * 100,
          bottom: 130 + i * 100,
          left: 20,
          right: 520,
          width: 500,
          height: 30,
        }) as DOMRect;
      row.getBoundingClientRect = content.getBoundingClientRect;
      cell.append(content);
      cell.getBoundingClientRect = () =>
        ({
          left: 20 + i * 200,
          right: 200 + i * 200,
          top: 100,
          bottom: 130,
          width: 180,
          height: 30,
        }) as DOMRect;
      if (sameRow) sharedRow.append(cell);
      else {
        row.append(cell);
        paper.append(row);
      }
    }
    return paper;
  },
}));

const cleanups: Array<() => void> = [];

// 给挂载及浮层更新一个真实事件循环，避免 Vue 把同一毫秒内的合成点击视为旧事件。
async function userClick(element: HTMLElement) {
  await new Promise((resolve) => setTimeout(resolve, 1));
  element.click();
  await nextTick();
}
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  vi.restoreAllMocks();
});
async function mount(
  sameRow = false,
  tableOptions?: Record<string, any>,
  sampleData?: Record<string, unknown>,
) {
  sampleData ??= {
    houses: [
      { id: 'row-a', address: '甲' },
      { id: 'row-b', address: '乙' },
    ],
  };
  const template = toDocumentTemplate({
    panels: [
      {
        printElements: [0, 1, 2].map((i) => ({
          printElementType: { type: 'text' },
          options: {
            title: `内容${i}`,
            top: 20 + i * 60,
            left: 20,
            width: 300,
            height: 20,
          },
        })),
      },
    ],
  });
  if (tableOptions) {
    template.panels[0].printElements[2].printElementType.type = 'table';
    Object.assign(template.panels[0].printElements[2].options, tableOptions);
  }
  if (sameRow)
    template.panels[0].printElements.forEach((el: any, i: number) => {
      el.options.agreeDocument = { row: 0, left: i * 33, width: 30, gap: 0 };
    });
  const patches: any[] = [];
  const current = shallowRef(template);
  const bodySelection = ref<any>(null);
  const cellActions = { merge: vi.fn(), split: vi.fn(), formula: vi.fn() };
  const toolboxDrops: any[] = [];
  const fieldDrops: any[] = [];
  let canvas: any;
  const selections: string[] = [];
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(DocumentCanvas, {
        ref: (value: any) => {
          canvas = value;
        },
        onToolboxDrop: (value: any) => toolboxDrops.push(value),
        onFieldDrop: (value: any) => fieldDrops.push(value),
        templateJson: current.value,
        sampleData: sampleData as any,
        selectedKey: '0:2',
        bodyCellSelection: bodySelection.value,
        onTableBodySelectionClear: () => {
          bodySelection.value = null;
        },
        onTableBodyCellSelect: (value) => {
          bodySelection.value =
            value.shiftKey && bodySelection.value
              ? {
                  ...bodySelection.value,
                  endRow: value.rowIndex,
                  endCol: value.colIndex,
                }
              : {
                  key: value.key,
                  startRow: value.rowIndex,
                  endRow: value.rowIndex,
                  startCol: value.colIndex,
                  endCol: value.colIndex,
                };
        },
        onBodyMergeRequested: cellActions.merge,
        onBodySplitRequested: cellActions.split,
        onBodyFormulaRequested: cellActions.formula,
        zoom: 100,
        'onUpdate:templateJson': (v) => {
          patches.push(v);
          current.value = v;
        },
        'onUpdate:selectedKey': (v) => selections.push(v),
      }),
  });
  app.mount(host);
  await nextTick();
  await nextTick();
  await nextTick();
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  const button = (text: string) => {
    const result = [...host.querySelectorAll('button')].find((el) =>
      el.textContent?.includes(text),
    );
    if (!result) throw new Error(`Missing button: ${text}`);
    return result;
  };
  const hit = vi.spyOn(document, 'elementFromPoint');
  const pointer = async (el: EventTarget, type: string, y: number, x = 100) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    el.dispatchEvent(event);
    await nextTick();
    return event;
  };
  return {
    host,
    bodySelection,
    cellActions,
    canvas,
    toolboxDrops,
    fieldDrops,
    patches,
    selections,
    button,
    pointer,
    hit,
    paper: requireDefined(host.querySelector('[data-panel-index]')),
  };
}

describe('单元格选中与工具条', () => {
  const columns = [
    [
      { title: '地址', field: 'address' },
      { title: '编号', field: 'id' },
    ],
  ];

  it('单格突出单元格并弱化整表，默认不显示整行高亮和行高面板', async () => {
    const m = await mount(false, { field: 'houses', columns });
    const cell = requireDefined(
      m.host.querySelector<HTMLTableCellElement>(
        'td[data-doc-record="0"][data-doc-col="0"]',
      ),
    );
    await userClick(cell);
    await nextTick();
    expect(cell.classList.contains('document-cell-single')).toBe(true);
    expect(
      cell
        .closest('[data-doc-key]')
        ?.classList.contains('document-cell-active'),
    ).toBe(true);
    expect(m.host.querySelector('.document-row-height-selected')).toBeNull();
    expect(m.host.querySelector('.document-row-height-panel')).toBeNull();
    expect(
      m.host.querySelector('.document-cell-toolbar__label')?.textContent,
    ).toBe('第 1 行 · 第 1 列');
    expect(m.button('合并').disabled).toBe(true);
    expect(m.button('拆分').disabled).toBe(true);
    expect(m.button('计算').disabled).toBe(false);
    await userClick(m.button('合并'));
    expect(m.cellActions.merge).not.toHaveBeenCalled();
    await userClick(m.button('计算'));
    expect(m.cellActions.formula).toHaveBeenCalledOnce();
    await userClick(m.button('更多'));
    await nextTick();
    expect(m.host.querySelector('.document-row-height-panel')).not.toBeNull();
    expect(
      cell.parentElement?.classList.contains('document-row-height-selected'),
    ).toBe(true);
    m.button('更多').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await nextTick();
    expect(m.host.querySelector('.document-row-height-panel')).toBeNull();
    expect(m.host.querySelector('.document-row-height-selected')).toBeNull();
    expect(cell.classList.contains('document-cell-single')).toBe(true);
  });

  it('矩形选区显示统一范围边界，启用合并并禁用单格计算', async () => {
    const m = await mount(false, { field: 'houses', columns });
    await userClick(
      requireDefined(
        m.host.querySelector<HTMLTableCellElement>(
          'td[data-doc-record="0"][data-doc-col="0"]',
        ),
      ),
    );
    requireDefined(
      m.host.querySelector<HTMLTableCellElement>(
        'td[data-doc-record="1"][data-doc-col="1"]',
      ),
    ).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    await nextTick();
    expect(
      m.host.querySelector('.document-cell-toolbar__label')?.textContent,
    ).toBe('已选 2 行 × 2 列');
    expect(m.host.querySelectorAll('.document-cell-range')).toHaveLength(4);
    expect(m.host.querySelectorAll('.document-cell-single')).toHaveLength(0);
    expect(m.host.querySelectorAll('.is-range-top')).toHaveLength(2);
    expect(m.host.querySelectorAll('.is-range-bottom')).toHaveLength(2);
    expect(m.host.querySelectorAll('.is-range-left')).toHaveLength(2);
    expect(m.host.querySelectorAll('.is-range-right')).toHaveLength(2);
    expect(m.button('合并').disabled).toBe(false);
    expect(m.button('计算').disabled).toBe(true);
    await userClick(m.button('合并'));
    expect(m.cellActions.merge).toHaveBeenCalledOnce();
  });

  it('点击表格容器空白时回到整表选择，清除单元格工具条', async () => {
    const m = await mount(false, { field: 'houses', columns });
    const cell = requireDefined(
      m.host.querySelector<HTMLTableCellElement>('td[data-doc-record]'),
    );
    await userClick(cell);
    await nextTick();
    requireDefined(
      requireDefined(cell.closest('[data-doc-key]')).firstElementChild,
    ).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(m.bodySelection.value).toBeNull();
    expect(m.host.querySelector('.document-cell-toolbar')).toBeNull();
    expect(m.host.querySelector('.document-cell-single')).toBeNull();
    expect(m.host.querySelector('.document-cell-active')).toBeNull();
  });

  it.each([
    {
      agreeBodyCellMerges: [
        { startRow: 0, startCol: 0, rowspan: 1, colspan: 2 },
      ],
    },
    { agreeBodyHMerges: [{ rowIndex: 0, spans: [2, 0] }] },
  ])('已手工合并的单格允许拆分', async (rules) => {
    const m = await mount(false, { field: 'houses', columns, ...rules });
    await userClick(
      requireDefined(
        m.host.querySelector<HTMLTableCellElement>(
          'td[data-doc-record="0"][data-doc-col="0"]',
        ),
      ),
    );
    await nextTick();
    expect(m.button('拆分').disabled).toBe(false);
    await userClick(m.button('拆分'));
    expect(m.cellActions.split).toHaveBeenCalledOnce();
  });
});

describe('document drag feedback', () => {
  it('does not save an override for indistinguishable records without a unique id', async () => {
    const m = await mount(
      false,
      { field: 'houses', columns: [[{ title: '地址', field: 'address' }]] },
      { houses: [{ address: '相同' }, { address: '相同' }] },
    );
    await userClick(
      requireDefined(m.host.querySelector<HTMLElement>('td[data-doc-record]')),
    );
    await nextTick();
    await nextTick();
    await userClick(m.button('更多'));
    await nextTick();
    const input = requireDefined(
      m.host.querySelector<HTMLInputElement>(
        'input[aria-label="画布行最小高度"]',
      ),
    );
    expect(input.disabled).toBe(true);
    expect(
      m.host.querySelector('.document-row-height-panel')?.textContent,
    ).toContain('唯一标识');
    input.value = '40';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    expect(m.patches).toHaveLength(0);
  });
  it.each([false, true])(
    'changes the correct row height from a canvas cell (fixed form: %s)',
    async (form) => {
      const grid = {
        version: 1,
        columns: [100],
        rows: [
          { cells: [{ mode: 'text', value: '第一行' }], height: 22 },
          { cells: [{ mode: 'text', value: '第二行' }], height: 24 },
        ],
      };
      const m = await mount(
        false,
        form
          ? { agreeFormGrid: grid }
          : {
              field: 'houses',
              columns: [[{ title: '地址', field: 'address' }]],
              tableBodyRowHeight: 18,
            },
      );
      await userClick(
        requireDefined(
          m.host.querySelector<HTMLElement>('td[data-doc-record]'),
        ),
      );
      await nextTick();
      await nextTick();
      await userClick(m.button('更多'));
      await nextTick();
      const input = requireDefined(
        m.host.querySelector<HTMLInputElement>(
          'input[aria-label="画布行最小高度"]',
        ),
      );
      expect(input).not.toBeNull();
      expect(
        m.host.querySelector('.document-row-height-panel')?.textContent,
      ).toContain('当前行最小高度');
      input.value = '40';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await nextTick();
      expect(m.patches).toHaveLength(1);
      const options = m.patches[0].panels[0].printElements[2].options;
      expect(
        form
          ? {
              heights: options.agreeFormGrid.rows.map((row: any) => row.height),
              original: requireDefined(grid.rows[1]).height,
            }
          : {
              minimum: options.tableBodyRowHeight,
              overrides: Object.values(options.agreeBodyRowHeights),
            },
      ).toEqual(
        form
          ? { heights: [22, 40], original: 24 }
          : { minimum: 18, overrides: [40] },
      );
      if (!form) {
        await nextTick();
        await nextTick();
        await userClick(m.button('恢复默认行高'));
        await nextTick();
      }
      const finalOptions = m.patches.at(-1).panels[0].printElements[2].options;
      expect(
        form
          ? finalOptions.agreeFormGrid.rows.map((row: any) => row.height)
          : finalOptions.agreeBodyRowHeights,
      ).toEqual(form ? [22, 40] : undefined);
      expect(
        form
          ? requireDefined(grid.rows[1]).height
          : finalOptions.tableBodyRowHeight,
      ).toBe(form ? 24 : 18);
    },
  );
  it('changes only the selected record in a repeated form row and can restore the template default', async () => {
    const grid = {
      version: 1,
      columns: [100],
      rows: [
        { cells: [{ mode: 'text', value: '固定行' }], height: 22 },
        {
          source: 'houses',
          height: 24,
          cells: [{ mode: 'field', value: 'row.address' }],
        },
      ],
    };
    const m = await mount(false, { agreeFormGrid: grid });
    await userClick(
      requireDefined(m.host.querySelector<HTMLElement>('td[data-doc-record]')),
    );
    await nextTick();
    await userClick(m.button('更多'));
    await nextTick();
    const input = requireDefined(
      m.host.querySelector<HTMLInputElement>(
        'input[aria-label="画布行最小高度"]',
      ),
    );
    input.value = '48';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    expect(
      m.patches[0].panels[0].printElements[2].options.agreeFormGrid.rows[1]
        .height,
    ).toBe(24);
    expect(
      Object.values(
        m.patches[0].panels[0].printElements[2].options.agreeFormGrid.rows[1]
          .recordHeights,
      ),
    ).toEqual([48]);
    await nextTick();
    await nextTick();
    await userClick(m.button('恢复默认行高'));
    await nextTick();
    expect(
      m.patches.at(-1).panels[0].printElements[2].options.agreeFormGrid.rows[1]
        .recordHeights,
    ).toBeUndefined();
  });
  it('previews a clamped spacing drop, commits only on release and consumes legacy row gap', async () => {
    const m = await mount();
    m.hit.mockReturnValue(m.paper);
    await m.pointer(m.button('调间距'), 'pointerdown', 300);
    await m.pointer(document, 'pointermove', 20);
    expect(m.patches).toHaveLength(0);
    expect(m.host.querySelector('.is-spacing')?.textContent).toContain(
      '已到最小值',
    );
    await m.pointer(document, 'pointerup', 20);
    expect(m.patches).toHaveLength(1);
    expect(
      m.patches[0].panels[0].printElements[2].options.agreeDocument,
    ).toMatchObject({ spaceBefore: 0, gap: 0 });
    expect(m.host.querySelector('.document-drop-guide')).toBeNull();
  });
  it('snaps the order handle to a preceding row from whitespace and shows the insertion line', async () => {
    const m = await mount();
    m.hit.mockReturnValue(m.paper);
    await m.pointer(m.button('排序'), 'pointerdown', 300);
    await m.pointer(document, 'pointermove', 175);
    expect(m.host.querySelector('.is-order')?.textContent).toContain(
      '插入此行之前',
    );
    expect(m.patches).toHaveLength(0);
    await m.pointer(document, 'pointerup', 175);
    expect(
      m.patches[0].panels[0].printElements[2].options.agreeDocument.row,
    ).toBe(1);
    expect(
      m.patches[0].panels[0].printElements[1].options.agreeDocument.row,
    ).toBe(2);
  });
  it('removes the preview on Escape without saving any changes', async () => {
    const m = await mount();
    m.hit.mockReturnValue(m.paper);
    await m.pointer(m.button('调间距'), 'pointerdown', 300);
    await m.pointer(document, 'pointermove', 350);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(m.host.querySelector('.document-drop-guide')).toBeNull();
    expect(m.patches).toHaveLength(0);
  });
});

describe('column controls', () => {
  const pointer = (target: EventTarget, type: string, x: number) =>
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
      }),
    );
  it('previews resize using rendered width and commits once on release with selection intact', async () => {
    const m = await mount(true);
    const divider = requireDefined(m.host.querySelector('[role="separator"]'));
    pointer(divider, 'pointerdown', 200);
    pointer(window, 'pointermove', 230);
    pointer(window, 'pointermove', 260);
    await nextTick();
    expect(m.patches).toHaveLength(0);
    expect(m.host.querySelector('.is-resize')?.textContent).toContain('40.0%');
    pointer(window, 'pointerup', 260);
    expect(m.patches).toHaveLength(1);
    expect(
      m.patches[0].panels[0].printElements[0].options.agreeDocument.width,
    ).toBe(40);
    expect(
      m.patches[0].panels[0].printElements[1].options.agreeDocument.width,
    ).toBe(20);
    expect(m.selections.at(-1)).toBe('0:2');
  });
  it('restores temporary widths and does not commit when Escape is pressed on separator', async () => {
    const m = await mount(true);
    const divider = requireDefined(m.host.querySelector('[role="separator"]'));
    const left = requireDefined(
      m.host.querySelector<HTMLElement>('[data-doc-key="0:0"]'),
    );
    const original = left.style.cssText;
    pointer(divider, 'pointerdown', 200);
    pointer(window, 'pointermove', 260);
    expect(left.style.width).toBe('40%');
    divider.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    pointer(window, 'pointerup', 260);
    expect(left.style.cssText).toBe(original);
    expect(m.patches).toHaveLength(0);
  });
  it('supports keyboard resizing without clearing the selection', async () => {
    const m = await mount(true);
    requireDefined(m.host.querySelector('[role="separator"]')).dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(
      m.patches[0].panels[0].printElements[0].options.agreeDocument.width,
    ).toBe(35);
    expect(m.selections).toEqual(['0:2']);
  });
});

describe('pointer palette drop targets', () => {
  it('accepts new toolbox elements over floating controls using the paper rectangle', async () => {
    const m = await mount();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(m.button('排序'));
    const point = { clientX: 100, clientY: 175 };
    m.canvas.paletteDragOver(point);
    await nextTick();
    expect(m.host.querySelector('.is-order')?.textContent).toContain(
      '插入此行之前',
    );
    expect(m.toolboxDrops).toHaveLength(0);
    m.canvas.paletteDrop(point, {
      kind: AGREE_PRINT_TOOLBOX_DND,
      tid: 'staticTitle',
    });
    expect(m.toolboxDrops).toEqual([
      expect.objectContaining({
        tid: 'staticTitle',
        panelIndex: 0,
        documentTarget: '0:1',
        documentPlacement: 'before',
      }),
    ]);
    expect(m.patches).toHaveLength(0);
  });
  it('adds a bound field into a blank paper and ignores drops outside the canvas', async () => {
    const m = await mount();
    m.paper.replaceChildren();
    const hit = vi.spyOn(document, 'elementFromPoint').mockReturnValue(m.paper);
    const payload = {
      kind: AGREE_PRINT_FIELD_DND,
      item: { field: 'agreementNo', text: '协议编号' },
    };
    m.canvas.paletteDrop({ clientX: 100, clientY: 300 }, payload);
    expect(m.fieldDrops).toEqual([
      expect.objectContaining({
        panelIndex: 0,
        item: payload.item,
        documentTarget: undefined,
      }),
    ]);
    hit.mockReturnValue(document.body);
    m.canvas.paletteDrop({ clientX: 900, clientY: 300 }, payload);
    expect(m.fieldDrops).toHaveLength(1);
  });
});

describe('direct canvas pointer movement', () => {
  it('moves an unselected element without selecting during the gesture or relying on native dragstart', async () => {
    const m = await mount();
    const content = requireDefined(
      m.host.querySelector('[data-doc-key="0:0"] > :first-child'),
    );
    const target = requireDefined(
      m.host.querySelector('[data-doc-key="0:1"] > :first-child'),
    );
    m.hit.mockReturnValue(target);
    await m.pointer(content, 'pointerdown', 110);
    await m.pointer(document, 'pointermove', 225);
    expect(m.selections).toEqual([]);
    expect(m.patches).toHaveLength(0);
    expect(m.host.querySelector('.is-order')).not.toBeNull();
    await m.pointer(document, 'pointerup', 225);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(m.patches).toHaveLength(1);
    expect(m.selections).toEqual(['0:0']);
    expect(
      m.patches[0].panels[0].printElements[0].options.agreeDocument.row,
    ).toBe(1);
  });
});

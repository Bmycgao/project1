import { createApp, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { toDocumentTemplate } from '../runtime/document-layout';
import {
  AGREE_PRINT_FIELD_DND,
  AGREE_PRINT_TOOLBOX_DND,
} from '../template/print-element-meta';
import DocumentCanvas from './document-canvas.vue';

// These rectangles test hit targets and drag feedback; real pagination is checked in a browser.
vi.mock('../runtime/document-renderer', () => ({
  renderDocument: async (template: any) => {
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
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  vi.restoreAllMocks();
});
async function mount(sameRow = false) {
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
  if (sameRow)
    template.panels[0].printElements.forEach((el: any, i: number) => {
      el.options.agreeDocument = { row: 0, left: i * 33, width: 30, gap: 0 };
    });
  const patches: any[] = [];
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
        templateJson: template,
        sampleData: {} as any,
        selectedKey: '0:2',
        zoom: 100,
        'onUpdate:templateJson': (v) => patches.push(v),
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
  const button = (text: string) =>
    [...host.querySelectorAll('button')].find((el) =>
      el.textContent?.includes(text),
    )!;
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
    canvas,
    toolboxDrops,
    fieldDrops,
    patches,
    selections,
    button,
    pointer,
    hit,
    paper: host.querySelector('[data-panel-index]')!,
  };
}

describe('document drag feedback', () => {
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
    const divider = m.host.querySelector('[role="separator"]')!;
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
    const divider = m.host.querySelector('[role="separator"]')!;
    const left = m.host.querySelector<HTMLElement>('[data-doc-key="0:0"]')!;
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
  it('supports keyboard resizing and left swap without clearing the selection', async () => {
    const m = await mount(true);
    m.host.querySelector('[role="separator"]')!.dispatchEvent(
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
    m.button('向左换位').click();
    expect(
      m.patches[1].panels[0].printElements[2].options.agreeDocument.left,
    ).toBe(33);
    expect(m.selections).toEqual(['0:2', '0:2']);
  });
  it('edits millimetre spacing and width through the toolbar', async () => {
    const m = await mount();
    const input = m.host.querySelector<HTMLInputElement>(
      '[aria-label="上方间距毫米"]',
    )!;
    input.value = '25.4';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(
      m.patches[0].panels[0].printElements[2].options.agreeDocument.spaceBefore,
    ).toBe(72);
    const width = m.host.querySelector<HTMLInputElement>(
      '[aria-label="元素宽度百分比"]',
    )!;
    width.value = '40';
    width.dispatchEvent(new Event('change', { bubbles: true }));
    expect(
      m.patches[1].panels[0].printElements[2].options.agreeDocument.width,
    ).toBe(40);
    m.button('清除间距').click();
    expect(
      m.patches[2].panels[0].printElements[2].options.agreeDocument.spaceBefore,
    ).toBe(0);
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
    const content = m.host.querySelector(
      '[data-doc-key="0:0"] > :first-child',
    )!;
    const target = m.host.querySelector('[data-doc-key="0:1"] > :first-child')!;
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

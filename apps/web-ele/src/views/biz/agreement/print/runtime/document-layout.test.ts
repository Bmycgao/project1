import { describe, expect, it } from 'vitest';

import {
  adjustDocumentElementSpacing,
  documentRows,
  MAX_DOCUMENT_SPACE_PT,
  moveDocumentElement,
  placeNewDocumentElement,
  resizeDocumentColumns,
  setDocumentElementWidth,
  shiftDocumentElement,
  splitDocumentPanel,
  toDocumentTemplate,
} from './document-layout';
import { preparePrintTemplate } from './prepare-template';

function element(title: string, top = 20, left = 20, extra = {}) {
  return {
    printElementType: { type: 'text' },
    options: { title, top, left, width: 200, height: 20, ...extra },
  };
}
function fixture() {
  return {
    panels: [
      {
        width: 210,
        height: 297,
        printElements: [
          element('甲'),
          element('乙', 20, 300),
          element('正文', 80),
          element('签章', 160, 300),
        ],
      },
    ],
  };
}
const titles = (template: any, panel = 0) =>
  documentRows(template.panels[panel]).map((row) =>
    row.map((el) => el.options.title),
  );

describe('document layout migration and editing', () => {
  it('consumes legacy row spacing on upward movement without moving peers', () => {
    const original = toDocumentTemplate(fixture());
    const [left, right] = original.panels[0].printElements;
    left.options.agreeDocument.gap = right.options.agreeDocument.gap = 40;
    left.options.agreeDocument.spaceBefore = 15;
    right.options.agreeDocument.spaceBefore = 20;
    const result = adjustDocumentElementSpacing(original, '0:1', -50);
    const [a, b] = result.panels[0].printElements;
    expect(a.options.agreeDocument.gap).toBe(0);
    expect(a.options.agreeDocument.spaceBefore).toBe(55);
    expect(b.options.agreeDocument.spaceBefore).toBe(10);
    expect(
      adjustDocumentElementSpacing(result, '0:1', -30).panels[0]
        .printElements[1].options.agreeDocument.spaceBefore,
    ).toBe(0);
    expect(left.options.agreeDocument.gap).toBe(40);
    expect(toDocumentTemplate(JSON.parse(JSON.stringify(result)))).toEqual(
      result,
    );
  });
  it('moves only the selected element down while preserving its row, width and horizontal placement', () => {
    const original = toDocumentTemplate(fixture());
    const result = adjustDocumentElementSpacing(original, '0:1', 36);
    expect(result.panels[0].printElements[1].options.agreeDocument).toEqual({
      ...original.panels[0].printElements[1].options.agreeDocument,
      spaceBefore: 36,
    });
    expect(result.panels[0].printElements[0]).toEqual(
      original.panels[0].printElements[0],
    );
    expect(
      original.panels[0].printElements[1].options.agreeDocument.spaceBefore,
    ).toBeUndefined();
    expect(toDocumentTemplate(JSON.parse(JSON.stringify(result)))).toEqual(
      result,
    );
    expect(
      adjustDocumentElementSpacing(result, '0:1', -100).panels[0]
        .printElements[1].options.agreeDocument.spaceBefore,
    ).toBe(0);
    expect(
      adjustDocumentElementSpacing(result, '0:1', 1000).panels[0]
        .printElements[1].options.agreeDocument.spaceBefore,
    ).toBe(MAX_DOCUMENT_SPACE_PT);
  });
  it('converts once without mutating the source, preserving row spacing and column placement', () => {
    const source = fixture();
    const before = JSON.stringify(source);
    const converted = toDocumentTemplate(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(titles(converted)).toEqual([['甲', '乙'], ['正文'], ['签章']]);
    expect(converted.panels[0].printElements[2].options.agreeDocument.gap).toBe(
      40,
    );
    expect(toDocumentTemplate(JSON.parse(JSON.stringify(converted)))).toEqual(
      converted,
    );
    const [a, b] = converted.panels[0].printElements;
    expect(
      a.options.agreeDocument.left + a.options.agreeDocument.width,
    ).toBeLessThanOrEqual(b.options.agreeDocument.left);
  });
  it('caps overlapping legacy columns to available width', () => {
    const template = toDocumentTemplate({
      panels: [
        { printElements: [element('wide', 20, 20), element('right', 20, 150)] },
      ],
    });
    const [a, b] = template.panels[0].printElements.map(
      (el: any) => el.options.agreeDocument,
    );
    expect(a.left + a.width).toBeLessThanOrEqual(b.left);
    expect(b.left + b.width).toBeLessThanOrEqual(100);
  });
  it('changes structural order without carrying absolute coordinates into layout', () => {
    const moved = moveDocumentElement(fixture(), '0:3', '0:2', 'before');
    expect(titles(moved)).toEqual([['甲', '乙'], ['签章'], ['正文']]);
    expect(moved.panels[0].printElements[3].options.top).toBe(160);
  });
  it('places alongside in visual order and allows detaching again', () => {
    const beside = moveDocumentElement(fixture(), '0:2', '0:0', 'beside');
    expect(titles(beside)).toEqual([['甲', '正文', '乙'], ['签章']]);
    const boxes = documentRows(beside.panels[0])[0]!.map(
      (el) => el.options.agreeDocument,
    );
    expect(boxes[0].width).toBeCloseTo(94 / 3);
    expect(boxes[2].left + boxes[2].width).toBeCloseTo(100);
    expect(titles(moveDocumentElement(beside, '0:2', '0:0', 'after'))).toEqual([
      ['甲', '乙'],
      ['正文'],
      ['签章'],
    ]);
  });
  it('keeps manual sections separate unless explicitly moved', () => {
    const source = fixture();
    source.panels.push({
      width: 210,
      height: 297,
      printElements: [element('第二节')],
    });
    expect(toDocumentTemplate(source).panels).toHaveLength(2);
    const moved = moveDocumentElement(source, '0:3', '1:0', 'after');
    expect(titles(moved)).toEqual([['甲', '乙'], ['正文']]);
    expect(titles(moved, 1)).toEqual([['第二节'], ['签章']]);
  });
  it('inserts a new element at the drop target', () => {
    const template = toDocumentTemplate(fixture());
    template.panels[0].printElements.push(element('新增'));
    expect(
      titles(placeNewDocumentElement(template, 0, '0:2', 'before')),
    ).toEqual([['甲', '乙'], ['新增'], ['正文'], ['签章']]);
  });
  it('starts a manual section with the complete selected row', () => {
    const result = splitDocumentPanel(fixture(), 0, '0:2');
    expect(result.movedCount).toBe(2);
    expect(titles(result.template)).toEqual([['甲', '乙']]);
    expect(titles(result.template, 1)).toEqual([['正文'], ['签章']]);
    expect(
      result.template.panels[1].printElements[0].options.agreeDocument.gap,
    ).toBe(0);
  });
  it('normalizes fractional rows before another insertion', () => {
    const template = toDocumentTemplate(fixture());
    template.panels[0].printElements[3].options.agreeDocument.row = 0.5;
    expect(
      titles(moveDocumentElement(template, '0:2', '0:0', 'after')),
    ).toEqual([['甲', '乙'], ['正文'], ['签章']]);
  });
});

describe('document flow preparation', () => {
  it('removes hidden content without shifting persisted layout or crossing manual sections', () => {
    const template = toDocumentTemplate({
      panels: [
        {
          printElements: [
            element('隐藏', 20, 20, { agreeVisibleWhen: 'false' }),
            element('保留', 100),
          ],
        },
        { printElements: [element('次页')] },
      ],
    });
    const before = JSON.stringify(template);
    const result = preparePrintTemplate(template, {} as any).template;
    expect(result.panels).toHaveLength(2);
    expect(result.panels[0].printElements).toHaveLength(1);
    expect(
      result.panels[0].printElements[0].options.__documentSourceIndex,
    ).toBe(1);
    expect(result.panels[0].printElements[0].options.top).toBe(100);
    expect(JSON.stringify(template)).toBe(before);
  });
  it('preserves only the selected hidden element placeholder regardless of legacy group', () => {
    const template = toDocumentTemplate({
      panels: [
        {
          printElements: [
            element('保留空位', 20, 20, {
              agreeVisibleWhen: 'false',
              agreeFlowCollapse: false,
              agreeFlowGroup: 'same',
            }),
            element('移除', 60, 20, {
              agreeVisibleWhen: 'false',
              agreeFlowGroup: 'same',
            }),
            element('正文', 100),
          ],
        },
      ],
    });
    const result = preparePrintTemplate(template, {} as any).template;
    expect(
      result.panels[0].printElements.map((el: any) => el.options.title),
    ).toEqual(['保留空位', '正文']);
    expect(result.panels[0].printElements[0].options.__documentHidden).toBe(
      true,
    );
    expect(
      result.panels[0].printElements[1].options.__documentSourceIndex,
    ).toBe(2);
  });
  it('packs remaining same-row fields left without stretching when one is hidden', () => {
    const template = toDocumentTemplate({
      panels: [{ printElements: [element('被征收人'), element('征收人')] }],
    });
    const [left, right] = template.panels[0].printElements;
    left.options.agreeDocument = { row: 0, left: 0, width: 48, gap: 0 };
    right.options.agreeDocument = { row: 0, left: 52, width: 48, gap: 0 };
    left.options.agreeVisibleWhen = 'false';
    const result = preparePrintTemplate(template, {} as any).template;
    expect(result.panels[0].printElements).toHaveLength(1);
    expect(result.panels[0].printElements[0].options.title).toBe('征收人');
    expect(
      result.panels[0].printElements[0].options.agreeDocument,
    ).toMatchObject({ left: 0, width: 48 });
  });
  it('packs three fields after hiding the middle one and keeps original widths', () => {
    const template = toDocumentTemplate({
      panels: [
        {
          printElements: [element('甲'), element('乙'), element('丙')],
        },
      ],
    });
    const [a, b, c] = template.panels[0].printElements;
    a.options.agreeDocument = { row: 0, left: 0, width: 30, gap: 0 };
    b.options.agreeDocument = { row: 0, left: 34, width: 30, gap: 0 };
    c.options.agreeDocument = { row: 0, left: 68, width: 30, gap: 0 };
    b.options.agreeVisibleWhen = 'false';
    const result = preparePrintTemplate(template, {} as any).template;
    const boxes = result.panels[0].printElements.map(
      (el: any) => el.options.agreeDocument,
    );
    expect(
      result.panels[0].printElements.map((el: any) => el.options.title),
    ).toEqual(['甲', '丙']);
    expect(boxes[0]).toMatchObject({ left: 0, width: 30 });
    expect(boxes[1]).toMatchObject({ left: 34, width: 30 });
  });
  it('keeps designed slots when a hidden field is set to 保留空位', () => {
    const template = toDocumentTemplate({
      panels: [{ printElements: [element('被征收人'), element('征收人')] }],
    });
    const [left, right] = template.panels[0].printElements;
    left.options.agreeDocument = { row: 0, left: 0, width: 48, gap: 0 };
    right.options.agreeDocument = { row: 0, left: 52, width: 48, gap: 0 };
    left.options.agreeVisibleWhen = 'false';
    left.options.agreeFlowCollapse = false;
    const result = preparePrintTemplate(template, {} as any).template;
    expect(result.panels[0].printElements[0].options.__documentHidden).toBe(
      true,
    );
    expect(result.panels[0].printElements[1].options.agreeDocument.left).toBe(
      52,
    );
  });
  it('does not steal space from a full-width overlapping title', () => {
    const template = toDocumentTemplate({
      panels: [{ printElements: [element('协议名称'), element('征收人')] }],
    });
    const [title, person] = template.panels[0].printElements;
    title.options.agreeDocument = { row: 0, left: 0, width: 100, gap: 0 };
    person.options.agreeDocument = { row: 0, left: 52, width: 48, gap: 0 };
    person.options.agreeVisibleWhen = 'false';
    const result = preparePrintTemplate(template, {} as any).template;
    expect(
      result.panels[0].printElements[0].options.agreeDocument,
    ).toMatchObject({ left: 0, width: 100 });
  });
});

describe('same-row editing', () => {
  function columns() {
    const template = toDocumentTemplate(fixture());
    const boxes = [
      { row: 0, left: 4, width: 20, gap: 12, spaceBefore: 7 },
      { row: 0, left: 27, width: 30, gap: 12, spaceBefore: 9 },
      { row: 0, left: 60, width: 35, gap: 12, spaceBefore: 0 },
    ];
    boxes.forEach((box, i) => {
      template.panels[0].printElements[i].options.agreeDocument = box;
      template.panels[0].printElements[i].options.field = `field${i}`;
    });
    return toDocumentTemplate(template);
  }
  it('resizes only adjacent columns, clamps widths and survives save/reload', () => {
    const source = columns();
    const saved = JSON.stringify(source);
    const result = resizeDocumentColumns(source, '0:0', '0:1', 10);
    const [a, b, c] = result.panels[0].printElements.map(
      (el: any) => el.options.agreeDocument,
    );
    expect(a).toMatchObject({ left: 4, width: 30, spaceBefore: 7 });
    expect(b).toMatchObject({ left: 37, width: 20, spaceBefore: 9 });
    expect(c).toEqual(source.panels[0].printElements[2].options.agreeDocument);
    expect(b.left - a.left - a.width).toBe(3);
    expect(
      resizeDocumentColumns(source, '0:0', '0:1', 1000).panels[0]
        .printElements[1].options.agreeDocument.width,
    ).toBe(5);
    expect(resizeDocumentColumns(source, '0:0', '0:2', 10)).toEqual(source);
    expect(JSON.stringify(source)).toBe(saved);
    expect(toDocumentTemplate(JSON.parse(JSON.stringify(result)))).toEqual(
      result,
    );
  });
  it('swaps unequal columns while retaining fields, widths, spacing and row boundaries', () => {
    const source = columns();
    const next = shiftDocumentElement(source, '0:1', -1);
    expect(titles(next)[0]).toEqual(['乙', '甲', '正文']);
    expect(next.panels[0].printElements[1].options).toMatchObject({
      field: 'field1',
      agreeDocument: { left: 4, width: 30, spaceBefore: 9 },
    });
    expect(next.panels[0].printElements[0].options.agreeDocument.left).toBe(37);
    expect(next.panels[0].printElements[2]).toEqual(
      source.panels[0].printElements[2],
    );
    expect(shiftDocumentElement(next, '0:1', 1)).toEqual(source);
  });
  it('inserts before or after the target and preserves same-row widths', () => {
    const source = columns();
    const moved = moveDocumentElement(source, '0:2', '0:0', 'beside-before');
    expect(titles(moved)[0]).toEqual(['正文', '甲', '乙']);
    expect(
      moved.panels[0].printElements.map(
        (el: any) => el.options.agreeDocument.width,
      ),
    ).toEqual(
      source.panels[0].printElements.map(
        (el: any) => el.options.agreeDocument.width,
      ),
    );
    expect(
      titles(moveDocumentElement(source, '0:2', '0:0', 'beside'))[0],
    ).toEqual(['甲', '正文', '乙']);
  });
  it('keeps many columns positive and within the paper when setting width', () => {
    const source = toDocumentTemplate({
      panels: [
        {
          printElements: Array.from({ length: 20 }, (_, i) =>
            element(String(i), 20, i * 10 + 20, {
              agreeDocument: { row: 0, left: i * 5, width: 4, gap: 0 },
            }),
          ),
        },
      ],
    });
    const result = setDocumentElementWidth(source, '0:0', 90);
    const boxes = result.panels[0].printElements.map(
      (el: any) => el.options.agreeDocument,
    );
    expect(boxes.every((b: any) => b.width > 0 && b.left >= 0)).toBe(true);
    expect(boxes.at(-1).left + boxes.at(-1).width).toBeCloseTo(100);
  });
});

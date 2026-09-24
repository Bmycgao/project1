import { describe, expect, it } from 'vitest';

import { patchElementOptions } from '../template/print-element-meta';
import { preparePrintTemplate } from './prepare-template';
import { isAutoFlowElement } from './print-flow';

function rowElement(
  field: string,
  left: number,
  extra: Record<string, unknown> = {},
) {
  return {
    options: {
      agreeFlowGroup: 'header',
      field,
      height: 18,
      left,
      top: 100,
      width: 100,
      ...extra,
    },
    printElementType: { type: 'text' },
  };
}

describe('print flow horizontal compaction', () => {
  it('moves later fields left when an earlier field is hidden', () => {
    const result = preparePrintTemplate(
      {
        panels: [
          {
            printElements: [
              rowElement('first', 20, { agreeVisibleWhen: 'showFirst' }),
              rowElement('second', 140),
              rowElement('third', 260),
            ],
          },
        ],
      },
      { showFirst: false } as any,
    );

    const fields = result.template.panels[0].printElements;
    expect(fields).toHaveLength(2);
    expect(fields[0]?.options.left).toBe(20);
    expect(fields[1]?.options.left).toBe(140);
  });

  it('supports right-floating rows without changing element order', () => {
    const result = preparePrintTemplate(
      {
        panels: [
          {
            printElements: [
              rowElement('first', 20, {
                agreeFlowFloat: 'right',
                agreeVisibleWhen: 'showFirst',
              }),
              rowElement('second', 140),
              rowElement('third', 260),
            ],
          },
        ],
      },
      { showFirst: false } as any,
    );

    const fields = result.template.panels[0].printElements;
    expect(fields.map((el: any) => el.options.field)).toEqual([
      'second',
      'third',
    ]);
    expect(fields[0]?.options.left).toBe(140);
    expect(fields[1]?.options.left).toBe(260);
  });

  it('can preserve original horizontal positions explicitly', () => {
    const result = preparePrintTemplate(
      {
        panels: [
          {
            printElements: [
              rowElement('first', 20, {
                agreeFlowFloat: 'none',
                agreeVisibleWhen: 'showFirst',
              }),
              rowElement('second', 140),
              rowElement('third', 260),
            ],
          },
        ],
      },
      { showFirst: false } as any,
    );

    const fields = result.template.panels[0].printElements;
    expect(fields[0]?.options.left).toBe(140);
    expect(fields[1]?.options.left).toBe(260);
  });

  it('preserves a manually separated visible section', () => {
    const result = preparePrintTemplate(
      {
        panels: [
          {
            printElements: [
              {
                options: {
                  agreeFlowGroup: 'rewards',
                  agreeVisibleWhen: 'COUNT(rewardItems) > 0',
                  height: 16,
                  left: 20,
                  title: '三、奖励补贴',
                  top: 438,
                  width: 200,
                },
                printElementType: { type: 'text' },
              },
              {
                options: {
                  agreeFlowGroup: 'rewards',
                  agreeVisibleWhen: 'COUNT(rewardItems) > 0',
                  columns: [[{ field: 'name', title: '奖励项目', width: 180 }]],
                  field: 'rewardItems',
                  height: 96,
                  left: 20,
                  top: 766,
                  width: 550,
                },
                printElementType: { type: 'table' },
              },
            ],
          },
        ],
      },
      { rewardItems: [{ name: '签约奖励' }] } as any,
    );

    const elements = result.template.panels[0].printElements;
    expect(elements[0]?.options.top).toBe(438);
    expect(elements[1]?.options.top).toBe(766);
  });
});

describe('explicit page-scoped flow', () => {
  const element = (
    field: string,
    top: number,
    group = '',
    extra: Record<string, unknown> = {},
  ) => rowElement(field, 20, { top, agreeFlowGroup: group, ...extra });
  const page = (printElements: ReturnType<typeof element>[]) => ({
    printElements,
  });
  const prepare = (panels: ReturnType<typeof page>[]) =>
    preparePrintTemplate({ panels }, {} as any).template;
  const fields = (result: Record<string, any>, index = 0) =>
    result.panels[index].printElements.map((el: any) => el.options);

  it('keeps automatic flow after clearing a group and saving and reloading JSON', () => {
    const original = {
      panels: [
        page([
          element('agreementNo', 100, 'header', { agreeVisibleWhen: 'false' }),
          element('signDate', 130, 'header'),
        ]),
      ],
    };
    const cleared = patchElementOptions(
      original,
      { panelIndex: 0, elementIndex: 0 },
      { agreeFlowGroup: '' },
    );
    const saved = JSON.parse(JSON.stringify(cleared));
    const result = preparePrintTemplate(saved, {} as any).template;
    expect(fields(result)).toMatchObject([{ field: 'signDate', top: 100 }]);
    expect(saved.panels[0].printElements[0].options).not.toHaveProperty(
      'agreeFlowGroup',
    );
  });

  it('does not infer groups from familiar fields or section titles', () => {
    const result = prepare([
      page([
        element('agreementNo', 100),
        element('houses', 180),
        element('', 150, '', { title: '一、房屋明细' }),
      ]),
    ]);
    expect(fields(result).map((el: any) => el.agreeFlowGroup)).toEqual([
      '',
      '',
      '',
    ]);
    expect(fields(result).map((el: any) => el.top)).toEqual([100, 180, 150]);
  });

  it('applies a removed section only once and preserves manual gaps in the next group', () => {
    const result = prepare([
      page([
        element('hidden', 50, 'A', { height: 100, agreeVisibleWhen: 'false' }),
        element('next', 180, 'B'),
        element('last', 260, 'B'),
      ]),
    ]);
    expect(fields(result).map((el: any) => el.top)).toEqual([50, 130]);
  });

  it('keeps same-named groups on separate pages and never produces a negative page coordinate', () => {
    const result = prepare([
      page([element('firstPage', 30, 'B')]),
      page([
        element('hidden', 50, 'A', { height: 100, agreeVisibleWhen: 'false' }),
        element('secondPage', 180, 'B'),
        element('secondPageLast', 260, 'B'),
      ]),
    ]);
    expect(result.panels).toHaveLength(2);
    expect(fields(result)).toMatchObject([{ field: 'firstPage', top: 30 }]);
    expect(fields(result, 1)).toMatchObject([
      { field: 'secondPage', top: 50 },
      { field: 'secondPageLast', top: 130 },
    ]);
  });

  it('leaves explicitly fixed elements in place and prevents following content crossing them', () => {
    const result = prepare([
      page([
        element('hidden', 50, 'A', { height: 100, agreeVisibleWhen: 'false' }),
        element('fixed', 200, '', { agreeFlowMode: 'fixed' }),
        element('following', 260, 'B'),
      ]),
    ]);
    expect(fields(result).map((el: any) => el.top)).toEqual([200, 260]);
  });

  it('preserves all coordinates when adding a group without hiding any member', () => {
    const result = prepare([
      page([
        element('a', 100, 'new'),
        element('b', 125, 'new'),
        element('c', 160, 'new'),
      ]),
    ]);
    expect(fields(result).map((el: any) => el.top)).toEqual([100, 125, 160]);
  });

  it('preserves a hidden group space when configured to keep it', () => {
    const result = prepare([
      page([
        element('hidden', 50, 'A', {
          height: 100,
          agreeVisibleWhen: 'false',
          agreeFlowCollapse: false,
        }),
        element('next', 180, 'B'),
      ]),
    ]);
    expect(fields(result)[0].top).toBe(180);
  });

  it('does not delete space occupied by an interleaved visible element', () => {
    const result = prepare([
      page([
        element('hidden', 50, 'A', { height: 100, agreeVisibleWhen: 'false' }),
        element('overlapping', 80, 'B'),
        element('next', 180, 'C'),
      ]),
    ]);
    expect(fields(result).map((el: any) => el.top)).toEqual([80, 180]);
  });

  it('merges overlapping removed intervals instead of subtracting both heights', () => {
    const result = prepare([
      page([
        element('hiddenA', 50, 'A', { height: 100, agreeVisibleWhen: 'false' }),
        element('hiddenB', 80, 'B', { height: 100, agreeVisibleWhen: 'false' }),
        element('next', 200, 'C'),
      ]),
    ]);
    expect(fields(result)[0].top).toBe(50);
  });

  it('only removes hidden rows and preserves spacing between visible rows', () => {
    const result = prepare([
      page([
        element('a', 100, 'A'),
        element('hidden', 140, 'A', { agreeVisibleWhen: 'false' }),
        element('c', 210, 'A'),
        element('d', 250, 'A'),
      ]),
    ]);
    expect(fields(result).map((el: any) => el.top)).toEqual([100, 140, 180]);
  });

  it('keeps widths by default and stretches only with an explicit setting', () => {
    const source = [
      page([
        rowElement('hidden', 20, { agreeVisibleWhen: 'false' }),
        rowElement('visible', 140),
      ]),
    ];
    const result = prepare(source);
    expect(fields(result)[0]).toMatchObject({ left: 20, width: 100 });
    Object.assign(source[0]!.printElements[0]!.options, {
      agreeFlowStretch: true,
    });
    const stretched = prepare(source);
    expect(fields(stretched)[0]).toMatchObject({ left: 20, width: 220 });
  });

  it('does not mutate saved coordinates or accumulate movement across previews', () => {
    const source = [
      page([
        element('hidden', 50, 'A', { height: 100, agreeVisibleWhen: 'false' }),
        element('next', 180, 'B'),
      ]),
    ];
    expect(prepare(source)).toEqual(prepare(source));
    expect(source[0]!.printElements[1]!.options.top).toBe(180);
  });

  it.each(['ungrouped', 'same', 'separate'])(
    'moves all following body content when a compensation table is hidden (%s groups)',
    (mode) => {
      const group = (name: string) =>
        mode === 'ungrouped' ? '' : mode === 'same' ? 'body' : name;
      const hiddenTable = element('compensation', 100, group('compensation'), {
        height: 100,
        agreeVisibleWhen: 'false',
      });
      hiddenTable.printElementType.type = 'table';
      const result = prepare([
        page([
          element('heading', 50, group('compensation')),
          hiddenTable,
          element('rewardsTitle', 230, group('rewards')),
          element('rewardsContent', 260, group('rewards')),
          element('notes', 310, group('notes')),
          element('signature', 350, group('signature')),
        ]),
      ]);
      expect(fields(result).map((el: any) => el.top)).toEqual([
        50, 100, 130, 180, 220,
      ]);
    },
  );

  it('keeps individual hidden space without sharing its setting with other ungrouped elements', () => {
    const result = prepare([
      page([
        element('reserved', 50, '', {
          agreeVisibleWhen: 'false',
          agreeFlowCollapse: false,
        }),
        element('hidden', 100, '', { agreeVisibleWhen: 'false' }),
        element('next', 180),
      ]),
    ]);
    expect(fields(result)[0].top).toBe(100);
  });

  it('excludes fixed members from group settings and horizontal compaction', () => {
    const result = prepare([
      page([
        rowElement('fixed', 20, {
          agreeFlowMode: 'fixed',
          agreeFlowCollapse: false,
        }),
        rowElement('hidden', 140, { agreeVisibleWhen: 'false' }),
        rowElement('visible', 260),
      ]),
    ]);
    expect(fields(result).map((el: any) => el.left)).toEqual([20, 140]);
  });
});

describe('default body flow modes', () => {
  it.each(['text', 'longText', 'table', 'dynamicText', 'staticTitle'])(
    'automatically flows %s',
    (type) => {
      expect(isAutoFlowElement({ printElementType: { type } })).toBe(true);
      expect(
        isAutoFlowElement({ type, options: { agreeFlowMode: 'fixed' } }),
      ).toBe(false);
    },
  );
  it.each(['image', 'hline', 'vline', 'rect', 'oval'])(
    'keeps %s fixed unless explicitly set to auto',
    (type) => {
      expect(isAutoFlowElement({ printElementType: { type } })).toBe(false);
      expect(
        isAutoFlowElement({ type, options: { agreeFlowMode: 'auto' } }),
      ).toBe(true);
    },
  );
  it.each([{ textType: 'barcode' }, { textType: 'qrcode' }, { fixed: true }])(
    'respects special fixed elements %j',
    (options) => {
      expect(isAutoFlowElement({ type: 'text', options })).toBe(false);
    },
  );
});

import { describe, expect, it } from 'vitest';

import { preparePrintTemplate } from './prepare-template';

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
                  agreeVisibleWhen: 'hasRewards',
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
                  agreeVisibleWhen: 'hasRewards',
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
      { hasRewards: true, rewardItems: [{ name: '签约奖励' }] } as any,
    );

    const elements = result.template.panels[0].printElements;
    expect(elements[0]?.options.top).toBe(438);
    expect(elements[1]?.options.top).toBe(766);
  });
});

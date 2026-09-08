import { describe, expect, it } from 'vitest';

import { insertBlankPanelAfter, splitPanelAtY } from './print-paper';

function templateWithElements() {
  return {
    panels: [
      {
        index: 0,
        name: 1,
        width: 210,
        height: 297,
        paperHeader: 28,
        paperFooter: 800,
        printElements: [
          { options: { title: '上方', top: 50, height: 20 } },
          { options: { title: '压线', top: 190, height: 30 } },
          { options: { title: '下方', top: 260, height: 20 } },
        ],
      },
    ],
  };
}

describe('print paper pages', () => {
  it('inserts a real blank panel without replacing the template root', () => {
    const source = templateWithElements();
    const result = insertBlankPanelAfter(source, 0);

    expect(result.newPanelIndex).toBe(1);
    expect(result.template.panels).toHaveLength(2);
    expect(result.template.panels[0]?.printElements).toHaveLength(3);
    expect(result.template.panels[1]?.printElements).toEqual([]);
    expect(result.template.panels[1]).toMatchObject({ index: 1, name: 2 });
    expect(source.panels).toHaveLength(1);
  });

  it('splits at an arbitrary y and moves crossing/below elements to a new page', () => {
    const source = templateWithElements();
    const result = splitPanelAtY(source, 0, 200);

    expect(result.movedCount).toBe(2);
    expect(result.template.panels).toHaveLength(2);
    expect(result.template.panels[0]?.printElements).toHaveLength(1);
    expect(result.template.panels[1]?.printElements).toHaveLength(2);
    expect(result.template.panels[1]?.printElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          options: expect.objectContaining({ title: '压线', top: 32 }),
        }),
        expect.objectContaining({
          options: expect.objectContaining({ title: '下方', top: 60 }),
        }),
      ]),
    );
    expect(source.panels[0]?.printElements).toHaveLength(3);
  });
});

import { createApp, h, nextTick, shallowRef } from 'vue';

import { describe, expect, it } from 'vitest';

import { documentRows, toDocumentTemplate } from '../runtime/document-layout';
import { listPrintElements } from '../template/print-element-meta';
import DocumentLayoutPanel from './document-layout-panel.vue';

describe('document layout controls', () => {
  it('uses element indices for moving and detaching an inspector selection', async () => {
    const current = shallowRef(
      toDocumentTemplate({
        panels: [
          {
            printElements: [
              {
                printElementType: { type: 'text' },
                options: { title: '左', left: 20, top: 20, width: 200 },
              },
              {
                printElementType: { type: 'text' },
                options: { title: '右', left: 300, top: 20, width: 200 },
              },
              {
                printElementType: { type: 'text' },
                options: { title: '下一段', left: 20, top: 100, width: 500 },
              },
            ],
          },
        ],
      }),
    );
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(DocumentLayoutPanel, {
          template: current.value,
          selected: listPrintElements(current.value)[1]!,
          onChange: (next) => (current.value = next),
        }),
    });
    app.mount(host);
    await nextTick();
    try {
      const item = [...host.querySelectorAll('.el-form-item')].find(
        (el) =>
          el.querySelector('.el-form-item__label')?.textContent?.trim() ===
          '上方间距（pt）',
      );
      const input = item!.querySelector('input')!;
      input.value = '36';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await nextTick();
      expect(
        current.value.panels[0].printElements[1].options.agreeDocument
          .spaceBefore,
      ).toBe(36);
      expect(
        current.value.panels[0].printElements[0].options.agreeDocument
          .spaceBefore,
      ).toBeUndefined();
      const click = async (label: string) => {
        const button = [...host.querySelectorAll('button')].find(
          (button) => button.textContent?.trim() === label,
        );
        expect(button).toBeDefined();
        button!.click();
        await nextTick();
      };
      await click('独占一行');
      expect(
        documentRows(current.value.panels[0]).map((row) =>
          row.map((el) => el.options.title),
        ),
      ).toEqual([['左'], ['右'], ['下一段']]);
      await click('下移');
      expect(
        documentRows(current.value.panels[0]).map((row) =>
          row.map((el) => el.options.title),
        ),
      ).toEqual([['左'], ['下一段'], ['右']]);
    } finally {
      app.unmount();
      host.remove();
    }
  });
});

import { createApp, h, nextTick, shallowRef } from 'vue';

import { expect, it } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import { listPrintElements } from '../template/print-element-meta';
import PrintInspector from './print-inspector.vue';

it('keeps spacing drafts isolated, saves zero and custom gaps and restores the legacy default', async () => {
  const current = shallowRef<Record<string, any>>({
    agreeLayout: 'document-flow',
    panels: [
      {
        printElements: [
          {
            printElementType: { type: 'longText' },
            options: {
              agreeDocument: { row: 0, left: 0, width: 100, gap: 0 },
              fontSize: 12,
              lineHeight: 18,
              agreeTextSections: [
                { content: '甲', when: '' },
                { content: '乙', when: '' },
              ],
            },
          },
        ],
      },
    ],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(PrintInspector, {
        templateJson: current.value,
        selectedKey: requireDefined(listPrintElements(current.value)[0]).key,
        sampleData: {} as any,
        onCanvasPatch: (value: Record<string, any>) => {
          current.value = value;
        },
      }),
  });
  const click = async (text: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    const button = [...document.querySelectorAll('button')].find(
      (el) => el.textContent?.trim() === text,
    );
    expect(button).toBeTruthy();
    requireDefined(button).click();
    await nextTick();
  };
  const fill = async (value: string) => {
    const input = requireDefined(
      document.querySelector<HTMLInputElement>(
        '[aria-label="内容块间距（pt）"]',
      ),
    );
    expect(input).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 1));
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
  };
  const options = () =>
    requireDefined(listPrintElements(current.value)[0]).options;
  try {
    app.mount(host);
    await nextTick();
    await click('编辑正文模板与条件内容');
    await fill('12');
    expect(options().agreeTextSectionGap).toBeUndefined();
    await click('取消');
    await click('编辑正文模板与条件内容');
    expect(
      document.querySelector<HTMLInputElement>(
        '[aria-label="内容块间距（pt）"]',
      )?.value,
    ).toBe('');
    await fill('0');
    await click('应用到画布');
    expect(options().agreeTextSectionGap).toBe(0);
    await click('编辑正文模板与条件内容');
    await fill('6.5');
    expect(
      document
        .querySelector('[aria-label="正文样例预览"]')
        ?.lastElementChild?.getAttribute('style'),
    ).toContain('padding-top: 6.5pt');
    await click('应用到画布');
    expect(options().agreeTextSectionGap).toBe(6.5);
    await click('编辑正文模板与条件内容');
    await fill('');
    expect(document.querySelector('[aria-label="正文样例预览"]')?.tagName).toBe(
      'PRE',
    );
    await fill('12');
    await click('恢复默认间距');
    await click('应用到画布');
    expect(options()).not.toHaveProperty('agreeTextSectionGap');
  } finally {
    app.unmount();
    host.remove();
  }
}, 15_000);

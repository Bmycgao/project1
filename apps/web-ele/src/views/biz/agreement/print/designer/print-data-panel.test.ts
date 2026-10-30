import { createApp, h, nextTick, ref } from 'vue';

import { expect, it, vi } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import PrintDataPanel from './print-data-panel.vue';

it('新增与绑定使用独立操作，切换选择目标后不会改变新增含义', async () => {
  const selectedType = ref('text');
  const pick = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(PrintDataPanel, {
        data: { agreementNo: 'QA-001', compensatee: '测试人员' } as any,
        selectedType: selectedType.value,
        selectedField: 'agreementNo',
        selectedLabel: '协议编号',
        onPick: pick,
      }),
  });
  app.mount(host);
  try {
    await nextTick();
    await nextTick();
    expect(host.textContent).toContain('绑定目标：协议编号');
    requireDefined(
      host.querySelector<HTMLButtonElement>(
        '[aria-label="添加到画布：被征收人"]',
      ),
    ).click();
    expect(pick.mock.calls.at(-1)?.[1]).toBe('add');
    requireDefined(
      host.querySelector<HTMLButtonElement>(
        '[aria-label="将被征收人绑定到当前元素"]',
      ),
    ).click();
    expect(pick.mock.calls.at(-1)?.[1]).toBe('bind');
    expect(
      requireDefined(
        host.querySelector<HTMLButtonElement>(
          '[aria-label="将协议编号绑定到当前元素"]',
        ),
      ).disabled,
    ).toBe(true);
    selectedType.value = 'table';
    await nextTick();
    expect(
      host.querySelector('[aria-label="将被征收人绑定到当前元素"]'),
    ).toBeNull();
    requireDefined(
      host.querySelector<HTMLButtonElement>(
        '[aria-label="添加到画布：被征收人"]',
      ),
    ).click();
    expect(pick.mock.calls.at(-1)?.[1]).toBe('add');
  } finally {
    app.unmount();
    host.remove();
  }
});

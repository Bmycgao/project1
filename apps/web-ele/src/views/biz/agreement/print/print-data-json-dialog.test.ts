import { createApp, h, nextTick, ref } from 'vue';

import { afterEach, expect, it, vi } from 'vitest';

import { requireDefined } from '../../../../../../shared/require-defined';
import { buildDesignerSamplePrintData } from './data/sample-print-data';
import Dialog from './print-data-json-dialog.vue';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

it('默认折叠 JSON，恢复示例只改草稿，取消不提交，应用后明确返回完整样例', async () => {
  const open = ref(false);
  const initial = { ...buildDesignerSamplePrintData(), compensationItems: [] };
  const apply = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(Dialog, {
        modelValue: open.value,
        initialData: initial,
        initialPreset: 'example',
        'onUpdate:modelValue': (value: boolean) => {
          open.value = value;
        },
        onApply: apply,
      }),
  });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  const flush = async () => {
    await nextTick();
    await nextTick();
  };
  const click = async (label: string) => {
    requireDefined(
      [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent?.trim() === label,
      ),
    ).click();
    await flush();
  };
  open.value = true;
  await flush();
  expect(document.querySelector('textarea')).toBeNull();
  expect(document.body.textContent).toContain('补偿 0 条');
  expect(document.body.textContent).not.toContain('填入普通样例');
  await click('恢复示例数据');
  expect(apply).not.toHaveBeenCalled();
  await click('编辑 JSON');
  expect(
    JSON.parse(requireDefined(document.querySelector('textarea')).value),
  ).toEqual(buildDesignerSamplePrintData());
  await click('取消');
  expect(apply).not.toHaveBeenCalled();
  open.value = true;
  await flush();
  await click('编辑 JSON');
  expect(
    JSON.parse(requireDefined(document.querySelector('textarea')).value),
  ).toEqual(initial);
  await click('恢复示例数据');
  await click('应用到预览');
  expect(apply).toHaveBeenCalledWith(buildDesignerSamplePrintData(), 'example');
  expect(open.value).toBe(false);
});

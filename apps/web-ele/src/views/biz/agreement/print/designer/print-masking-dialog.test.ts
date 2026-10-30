import { createApp, h, nextTick, ref } from 'vue';

import { expect, it } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import PrintMaskingDialog from './print-masking-dialog.vue';

it('选择字段和方式可预览，取消不修改模板，保存重开及关闭脱敏正确', async () => {
  const template = ref<Record<string, any>>({
    panels: [{ printElements: [] }],
  });
  const open = ref(false);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(PrintMaskingDialog, {
        modelValue: open.value,
        templateJson: template.value,
        initialField: 'phone',
        sampleData: { phone: '19112340005', amount: 0 },
        'onUpdate:modelValue': (value: boolean) => {
          open.value = value;
        },
        onApply: (value: Record<string, any>) => {
          template.value = value;
        },
      }),
  });
  const flush = async () => {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await nextTick();
  };
  const click = async (label: string) => {
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>('button'),
    ].find((el) => el.textContent?.trim() === label);
    expect(button).toBeTruthy();
    requireDefined(button).click();
    await flush();
  };
  const toggle = async () => {
    requireDefined(
      document.querySelector<HTMLElement>('[role="switch"]'),
    ).click();
    await flush();
  };
  const selectMode = async (label: string) => {
    requireDefined(
      document.querySelector<HTMLElement>('[aria-label="脱敏方式"]'),
    ).click();
    await flush();
    const option = [
      ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((el) => el.textContent?.trim() === label);
    expect(option).toBeTruthy();
    requireDefined(option).click();
    await flush();
  };
  try {
    app.mount(host);
    open.value = true;
    await flush();
    await toggle();
    await selectMode('手机号（前 3 后 4）');
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      '191****0005',
    );
    expect(template.value.agreePrintMaskRules).toBeUndefined();
    await click('取消');
    open.value = true;
    await flush();
    expect(
      document.querySelector('[role="switch"]')?.getAttribute('aria-checked'),
    ).toBe('false');
    await toggle();
    await selectMode('手机号（前 3 后 4）');
    await click('应用到模板');
    expect(template.value.agreePrintMaskRules).toEqual([
      { field: 'phone', mode: 'phone' },
    ]);
    expect(JSON.stringify(template.value)).not.toContain('19112340005');
    open.value = true;
    await flush();
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      '191****0005',
    );
    await selectMode('自定义保留位数');
    const start = requireDefined(
      document.querySelector<HTMLInputElement>('[aria-label="保留开头字符数"]'),
    );
    start.value = '2';
    start.dispatchEvent(new Event('input', { bubbles: true }));
    start.dispatchEvent(new Event('change', { bubbles: true }));
    const end = requireDefined(
      document.querySelector<HTMLInputElement>('[aria-label="保留结尾字符数"]'),
    );
    end.value = '2';
    end.dispatchEvent(new Event('input', { bubbles: true }));
    end.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      '19*******05',
    );
    await click('应用到模板');
    expect(template.value.agreePrintMaskRules).toEqual([
      { field: 'phone', mode: 'custom', keepStart: 2, keepEnd: 2 },
    ]);
    open.value = true;
    await flush();
    await toggle();
    await click('应用到模板');
    expect(template.value.agreePrintMaskRules).toBeUndefined();
  } finally {
    app.unmount();
    host.remove();
  }
}, 15_000);

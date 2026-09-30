import type { App } from 'vue';

import type { AgreeModuleLayoutItem } from '../access/module-access';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it } from 'vitest';

import DetailLayout from './detail-layout.vue';
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = '';
});
const item = (
  key: string,
  region: 'content' | 'tabs',
): AgreeModuleLayoutItem => ({
  key,
  region,
  label: key,
  desc: '',
  authCode: '',
  widgetKind: 'form',
  span: 12,
  order: 10,
});
describe('共用详情布局', () => {
  it('按区域展示，切换标签保留草稿，活动模块隐藏后选择剩余标签', async () => {
    const modules = ref([
      item('houses', 'content'),
      item('basic', 'tabs'),
      item('custom_form_notes', 'tabs'),
    ]);
    const draft = defineComponent({
      setup() {
        const text = ref('');
        return () =>
          h('input', {
            value: text.value,
            onInput: (e: Event) => {
              text.value = (e.target as HTMLInputElement).value;
            },
          });
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    app = createApp({
      render: () =>
        h(
          DetailLayout,
          { modules: modules.value },
          { default: () => h(draft) },
        ),
    });
    app.mount(host);
    await nextTick();
    expect(
      host.querySelector('.detail-content [data-module-key]')?.dataset
        .moduleKey,
    ).toBe('houses');
    expect(
      [...host.querySelectorAll('.detail-tab')].map((el) => el.textContent),
    ).toEqual(['basic', 'custom_form_notes']);
    const input = host.querySelector<HTMLInputElement>(
      '[data-module-key="basic"] input',
    )!;
    input.value = '未保存的修改';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    (host.querySelectorAll('.detail-tab')[1] as HTMLElement).click();
    await nextTick();
    (host.querySelectorAll('.detail-tab')[0] as HTMLElement).click();
    await nextTick();
    expect(
      host.querySelector<HTMLInputElement>('[data-module-key="basic"] input')
        ?.value,
    ).toBe('未保存的修改');
    modules.value = modules.value.filter((m) => m.key !== 'basic');
    await nextTick();
    expect(host.querySelector('.detail-tab.is-active')?.textContent).toBe(
      'custom_form_notes',
    );
    expect(host.querySelector('[data-module-key="basic"]')).toBeNull();
  });
});

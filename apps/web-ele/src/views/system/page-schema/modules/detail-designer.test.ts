/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import type { ModuleLayoutEditRow } from './module-layout-editor.vue';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Designer from './detail-designer.vue';

const state = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock('#/api', () => ({
  getFcSchemaList: state.list,
  getFcSchema: state.get,
  createFcSchema: state.create,
}));
vi.mock('@vben/icons', () => ({
  GripVertical: defineComponent({ render: () => h('span') }),
}));
vi.mock('./detail-preview.vue', () => ({
  default: defineComponent({
    props: ['modules', 'rules', 'fieldRules'],
    setup: (props) => () => h('div', { 'data-preview': JSON.stringify(props) }),
  }),
}));
vi.mock('element-plus', () => {
  const container = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  return {
    ElAlert: defineComponent({
      props: ['title'],
      setup: (props) => () => h('p', props.title),
    }),
    ElButton: defineComponent({
      props: ['disabled', 'loading'],
      setup:
        (props, { slots }) =>
        () =>
          h(
            'button',
            { disabled: props.disabled || props.loading },
            slots.default?.(),
          ),
    }),
    ElInput: defineComponent({
      props: ['modelValue'],
      emits: ['update:modelValue', 'change'],
      setup:
        (props, { emit }) =>
        () =>
          h('input', {
            value: props.modelValue,
            onInput: (event: Event) => {
              const value = (event.target as HTMLInputElement).value;
              emit('update:modelValue', value);
              emit('change', value);
            },
          }),
    }),
    ElSelect: defineComponent({
      props: ['modelValue', 'disabled'],
      emits: ['update:modelValue', 'change'],
      setup:
        (props, { slots, emit }) =>
        () =>
          h(
            'select',
            {
              value: props.modelValue,
              disabled: props.disabled,
              onChange: (event: Event) => {
                const value = (event.target as HTMLSelectElement).value;
                emit('update:modelValue', value);
                emit('change', value);
              },
            },
            slots.default?.(),
          ),
    }),
    ElOption: defineComponent({
      props: ['value', 'label', 'disabled'],
      setup: (props) => () =>
        h(
          'option',
          { value: props.value, disabled: props.disabled },
          props.label,
        ),
    }),
    ElSwitch: defineComponent({
      props: ['modelValue'],
      emits: ['change'],
      setup:
        (props, { emit }) =>
        () =>
          h('input', {
            type: 'checkbox',
            checked: props.modelValue,
            onChange: (event: Event) =>
              emit('change', (event.target as HTMLInputElement).checked),
          }),
    }),
    ElDialog: defineComponent({
      props: ['modelValue'],
      setup:
        (props, { slots }) =>
        () =>
          props.modelValue
            ? h('dialog', { open: true }, [slots.default?.(), slots.footer?.()])
            : null,
    }),
    ElTag: container,
    ElMessage: { error: state.error, warning: state.warning, success: vi.fn() },
  };
});

const baseRule = [
  { type: 'input', field: 'name', title: '被征收人', col: { span: 12 } },
];
const templates = [
  {
    id: 'basic',
    name: '基础模板',
    status: 1,
    kind: 'form',
    usage: 'agreementModule',
    rule: baseRule,
    option: { form: { labelWidth: 90 } },
  },
  {
    id: 'houses',
    name: '房屋明细',
    status: 1,
    kind: 'table',
    rule: [
      {
        type: 'tableForm',
        field: 'rows',
        title: '房屋',
        props: {
          columns: [{ label: '房屋地址', rule: [{ field: 'address' }] }],
        },
      },
    ],
  },
  {
    id: 'extra',
    name: '人口模板',
    status: 1,
    kind: 'form',
    rule: [{ type: 'input', field: 'headName', title: '户主姓名' }],
  },
];
const cleanups: (() => void)[] = [];
async function flush() {
  for (let i = 0; i < 12; i++) await nextTick();
}
function click(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(button).toBeTruthy();
  button!.click();
}
function change(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[aria-label="${label}"]`,
  )!;
  input.value = value;
  input.dispatchEvent(
    new Event(input.tagName === 'SELECT' ? 'change' : 'input', {
      bubbles: true,
    }),
  );
}
async function mount() {
  const layouts = ref<ModuleLayoutEditRow[]>([
    {
      key: 'basic',
      label: '基础信息',
      enabled: true,
      order: 10,
      span: 24,
      region: 'content',
      widgetKind: 'form',
      authCode: '',
    },
    {
      key: 'houses',
      label: '房屋信息',
      enabled: true,
      order: 20,
      span: 24,
      region: 'tabs',
      widgetKind: 'table',
      authCode: '',
    },
    {
      key: 'population',
      label: '家庭人口',
      enabled: false,
      order: 30,
      span: 12,
      region: 'tabs',
      widgetKind: 'form',
      authCode: '',
    },
  ]);
  const bindings = ref({
    basic: 'basic',
    houses: 'houses',
    population: 'extra',
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(Designer, {
          layouts: layouts.value,
          'onUpdate:layouts': (rows) => {
            layouts.value = rows;
          },
          fcBindings: bindings.value,
          'onUpdate:fcBindings': (value) => {
            bindings.value = value as typeof bindings.value;
          },
          basicInner: { sections: [] },
          housesInner: { sections: [] },
          compensationInner: { sections: [] },
          rewardsInner: { sections: [] },
          populationInner: { sections: [] },
          pageTitle: '协议办理详情',
          fieldRules: [{ field: 'name', hidden: true }],
        }),
    }),
  );
  app.component(
    'RouterLink',
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('a', slots.default?.()),
    }),
  );
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await flush();
  return { host, layouts, bindings };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.list.mockReset().mockResolvedValue(structuredClone(templates));
  state.get.mockReset().mockResolvedValue(structuredClone(templates[0]));
  state.create
    .mockReset()
    .mockImplementation(async (input) => ({ ...input, id: 'copy' }));
});
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

describe('三栏详情编排', () => {
  it('显示模板实际字段，切换标签及隐藏恢复不改变模块身份和模板绑定', async () => {
    const { host, layouts, bindings } = await mount();
    expect(
      host.querySelector('[data-canvas-key="basic"]')?.textContent,
    ).toContain('被征收人');
    host
      .querySelector<HTMLButtonElement>('[data-library-key="population"]')!
      .click();
    await flush();
    const toggle = host.querySelector<HTMLInputElement>(
      '[aria-label="显示此模块"]',
    )!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(
      host
        .querySelector('[data-layout-tab="population"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      host.querySelector<HTMLElement>('[data-canvas-key="population"]')?.style
        .display,
    ).not.toBe('none');
    change(host, '模块显示名称', '家庭资料');
    await flush();
    expect(layouts.value[2]).toMatchObject({
      key: 'population',
      label: '家庭资料',
      enabled: true,
    });
    expect(bindings.value.population).toBe('extra');
  });
  it('从左侧拖入隐藏模块后启用并调整区域，标签区域禁用半行设置', async () => {
    const { host, layouts } = await mount();
    host
      .querySelector('[data-library-key="population"]')!
      .dispatchEvent(new Event('dragstart', { bubbles: true }));
    host
      .querySelector('[data-region="content"]')!
      .dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    await flush();
    expect(layouts.value[2]).toMatchObject({
      enabled: true,
      region: 'content',
      span: 12,
    });
    expect(
      host.querySelector<HTMLSelectElement>('[aria-label="模块宽度"]')!
        .disabled,
    ).toBe(false);
    change(host, '显示区域', 'tabs');
    await flush();
    expect(
      host.querySelector<HTMLSelectElement>('[aria-label="模块宽度"]')!
        .disabled,
    ).toBe(true);
    expect(layouts.value[2]?.span).toBe(12);
  });
  it('复制真实模板为独立资源并选中，失败时保留原关联且不修改共用模板', async () => {
    const { host, bindings } = await mount();
    click(host, '查看字段 / 复制');
    await flush();
    change(host, '模板副本名称', '当前页面专用');
    state.create.mockRejectedValueOnce(new Error('写入失败'));
    click(host, '创建副本并选中');
    await flush();
    expect(bindings.value.basic).toBe('basic');
    expect(state.error).toHaveBeenCalledWith('写入失败');
    click(host, '创建副本并选中');
    await flush();
    expect(bindings.value.basic).toBe('copy');
    expect(state.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: '当前页面专用',
        usage: 'agreementModule',
        status: 1,
        rule: baseRule,
        option: templates[0]!.option,
      }),
    );
    state.create.mock.calls[1]![0].rule[0].title = '独立修改';
    expect(templates[0]!.rule[0]!.title).toBe('被征收人');
  });
  it('预览使用未保存布局及本页字段限制，模板停用或加载失败时阻止假预览并保留选择', async () => {
    const { host, bindings } = await mount();
    change(host, '模块显示名称', '草稿模块');
    await flush();
    click(host, '预览详情');
    await flush();
    const data = JSON.parse(
      host.querySelector<HTMLElement>('[data-preview]')!.dataset.preview!,
    );
    expect(data.modules[0].label).toBe('草稿模块');
    expect(data.fieldRules).toEqual([{ field: 'name', hidden: true }]);
    click(host, '返回编排');
    await flush();
    state.list.mockResolvedValueOnce([
      { ...templates[0], status: 0 },
      templates[1],
    ]);
    click(host, '预览详情');
    await flush();
    expect(host.querySelector<HTMLElement>('[data-preview]')).toBeNull();
    expect(state.warning).toHaveBeenCalledWith('请先修复模板关联再预览');
    expect(host.textContent).toContain('去配置');
    expect(bindings.value.basic).toBe('basic');
    state.list.mockRejectedValueOnce(new Error('断网'));
    click(host, '预览详情');
    await flush();
    expect(host.textContent).toContain('模板检查失败');
    expect(bindings.value.basic).toBe('basic');
  });
});

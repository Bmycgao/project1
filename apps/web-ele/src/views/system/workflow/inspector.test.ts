import type { WorkflowOptions } from './model';

/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, describe, expect, it, vi } from 'vitest';

import Inspector from './inspector.vue';
import { createDocument, createNode } from './model';

vi.mock('#/api/system/workflow-button', () => ({
  getWorkflowButtonResources: async () => [],
}));
// Native controls make user changes observable without depending on popper layout in happy-dom.
vi.mock('element-plus', () => {
  const block = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  return {
    ElAlert: defineComponent({
      props: ['title'],
      setup:
        (props, { slots }) =>
        () =>
          h('aside', [props.title, slots.default?.()]),
    }),
    ElForm: block,
    ElFormItem: defineComponent({
      props: ['label'],
      setup:
        (props, { slots }) =>
        () =>
          h('div', { 'data-label': props.label }, slots.default?.()),
    }),
    ElButton: defineComponent({
      props: ['disabled'],
      setup:
        (props, { slots, attrs }) =>
        () =>
          h(
            'button',
            { ...attrs, disabled: props.disabled },
            slots.default?.(),
          ),
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
    ElOptionGroup: block,
    ElInput: block,
    ElInputNumber: block,
    ElDatePicker: block,
    ElCheckbox: block,
    ElCheckboxGroup: block,
    ElSwitch: block,
    ElTag: block,
  };
});

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

async function mountInspector(
  config: {
    optionsError?: boolean;
    optionsLoaded?: boolean;
    readOnly?: boolean;
  } = {},
) {
  const doc = reactive(createDocument());
  const entry = createNode('task', 0, 0, 1);
  entry.supplementFormId = 'source';
  const review = createNode('approve', 0, 0, 2);
  review.supplementFormId = 'summary';
  review.fieldBindings = { summary: 'result' };
  review.moduleAccess = { basic: 'hidden', houses: 'readonly' };
  doc.nodes = [entry, review];
  const node = ref(doc.nodes[1]);
  const focusIssue = ref<{
    message: string;
    nodeId: string;
    sequence: number;
  }>();
  const options: WorkflowOptions = reactive({
    roles: [],
    users: [],
    departments: [],
    defaultDetailFields: [],
    views: [
      {
        id: 'source',
        name: '来源',
        type: 'form',
        fields: [
          {
            key: 'result',
            label: '经办结果',
            type: 'text',
            actionable: true,
            group: '经办',
          },
        ],
      },
      {
        id: 'summary',
        name: '摘要',
        type: 'form',
        fields: [
          {
            key: 'summary',
            label: '审核摘要',
            type: 'text',
            actionable: true,
            group: '审核',
          },
        ],
      },
      {
        id: 'page',
        name: '精简页',
        type: 'page',
        modules: [{ key: 'basic', label: '基础信息' }],
        fields: [],
      },
    ],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(Inspector, {
        document: doc,
        node: node.value,
        options,
        buttons: [],
        optionsError: config.optionsError || false,
        optionsLoaded: config.optionsLoaded ?? true,
        readOnly: config.readOnly || false,
        focusIssue: focusIssue.value,
      }),
  });
  app.use(
    createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
    }),
  );
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await nextTick();
  return { host, doc, node, options, focusIssue };
}
function button(host: HTMLElement, label: string) {
  const found = [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function choose(host: HTMLElement, label: string, value: string) {
  const select = host.querySelector<HTMLSelectElement>(
    `[data-label="${label}"] select`,
  );
  if (!select) throw new Error(`Missing select: ${label}`);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
}

describe('workflow inspector dependency repair', () => {
  it('提供独立新建办理详情与刷新资源入口', async () => {
    const { host, node } = await mountInspector();
    node.value = undefined;
    await nextTick();
    expect(host.querySelector('a[target="_blank"]')?.getAttribute('href')).toBe(
      '/system/page-schema?create=detail',
    );
    expect(button(host, '刷新资源').disabled).toBe(false);
  });
  it('lets the user remove orphaned bindings after clearing the form, even from another tab', async () => {
    const { host, node } = await mountInspector();
    await choose(host, '追加办理信息', '');
    expect(node.value!.fieldBindings).toEqual({ summary: 'result' });
    expect(
      host.querySelector('.configuration-problems')?.textContent,
    ).toContain('目标字段已不在当前节点补充表单');
    button(host, '移除本节点全部失效配置').click();
    await nextTick();
    expect(node.value!.fieldBindings).toEqual({});
    expect(node.value!.moduleAccess).toEqual({
      basic: 'hidden',
      houses: 'readonly',
    });
    expect(host.querySelector('.configuration-problems')).toBeNull();
  });

  it('preserves common restrictions when changing the node page and permits explicit cleanup', async () => {
    const { host, node } = await mountInspector();
    button(host, '高级页面设置').click();
    await nextTick();
    await choose(host, '节点页面模式', 'override');
    await choose(host, '当前节点使用的页面', 'page');
    expect(node.value!.moduleAccess).toEqual({
      basic: 'hidden',
      houses: 'readonly',
    });
    expect(
      host.querySelector('.configuration-problems')?.textContent,
    ).toContain('houses');
    button(host, '移除本节点全部失效配置').click();
    await nextTick();
    expect(node.value!.moduleAccess).toEqual({ basic: 'hidden' });
    expect(node.value!.fieldBindings).toEqual({ summary: 'result' });
  });

  it('changing the workflow default preserves inherited rules and ignores override-node rules', async () => {
    const { host, doc, node } = await mountInspector();
    doc.nodes[0]!.detailMode = 'override';
    doc.nodes[0]!.detailViewId = 'page';
    doc.nodes[0]!.moduleAccess = { basic: 'readonly' };
    node.value = undefined;
    await nextTick();
    await choose(host, '流程默认详情页', 'page');
    expect(doc.nodes[1]!.moduleAccess).toEqual({
      basic: 'hidden',
      houses: 'readonly',
    });
    expect(doc.nodes[0]!.moduleAccess).toEqual({ basic: 'readonly' });
  });

  it('preserves the effective legacy page when migrating an old node to a new supplement', async () => {
    const { host, node } = await mountInspector();
    node.value!.detailMode = 'inherit';
    node.value!.detailViewId = '';
    node.value!.form = { type: 'page', id: 'page' };
    await nextTick();
    await choose(host, '追加办理信息', '');
    expect(node.value!.form.id).toBe('');
    expect(node.value!.detailMode).toBe('override');
    expect(node.value!.detailViewId).toBe('page');
    expect(node.value!.supplementFormId).toBe('');
    expect(node.value!.fieldBindings).toEqual({ summary: 'result' });
  });

  it('removes only the selected stale binding and allows restoring a compatible source', async () => {
    const { host, node, options } = await mountInspector();
    node.value!.fieldBindings!.deleted = 'result';
    node.value!.fieldBindings!.summary = 'missing';
    await nextTick();
    const orphan = [...host.querySelectorAll('.configuration-problem')].find(
      (row) => row.textContent?.includes('deleted'),
    ) as HTMLElement;
    button(orphan, '移除此项').click();
    await nextTick();
    expect(node.value!.fieldBindings).toEqual({ summary: 'missing' });
    const select = host.querySelector<HTMLSelectElement>(
      '.node-module-access .module-access-row select',
    )!;
    select.value = options.views[0]!.fields![0]!.key;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    expect(node.value!.fieldBindings).toEqual({ summary: 'result' });
    expect(host.querySelector('.configuration-problems')).toBeNull();
  });

  it('locates publication binding errors and shows source failures after metadata changes', async () => {
    const { host, node, options, focusIssue } = await mountInspector();
    options.views[0]!.fields = [];
    focusIssue.value = {
      nodeId: node.value!.id,
      message: '科长审核：字段取值来源必须是流程中已定义的其他普通字段',
      sequence: 1,
    };
    await nextTick();
    expect(
      host
        .querySelector('.node-tabs button[aria-pressed="true"]')
        ?.textContent?.trim(),
    ).toBe('办理资料');
    expect(
      host.querySelector('.configuration-problems')?.textContent,
    ).toContain('来源字段已失效');
    expect(host.textContent).toContain('已失效或类型不匹配：result');
  });

  it('opens the data-action section when locating a publication action error', async () => {
    const { host, node, focusIssue } = await mountInspector();
    node.value!.dataActions = [
      { when: 'pass', kind: 'set', field: 'removed', value: '' },
    ];
    focusIssue.value = {
      nodeId: node.value!.id,
      message: '科长审核：数据动作目标字段已失效',
      sequence: 1,
    };
    await nextTick();
    expect(
      host
        .querySelector('.node-tabs button[aria-pressed="true"]')
        ?.textContent?.trim(),
    ).toBe('流转规则');
    const details = [...host.querySelectorAll('details')].find((item) =>
      item.querySelector('summary')?.textContent?.includes('数据动作'),
    );
    expect(details?.open).toBe(true);
  });

  it.each([
    { optionsError: true },
    { optionsLoaded: false },
    { readOnly: true },
  ])(
    'never offers cleanup or changes bindings when resources are unavailable or version is frozen: %j',
    async (config) => {
      const { host, node } = await mountInspector(config);
      node.value!.fieldBindings!.old = 'removed';
      await nextTick();
      expect(host.querySelector('.configuration-problems')).toBeNull();
      await choose(host, '追加办理信息', '');
      expect(node.value!.supplementFormId).toBe('summary');
      expect(node.value!.fieldBindings).toEqual({
        summary: 'result',
        old: 'removed',
      });
    },
  );
});

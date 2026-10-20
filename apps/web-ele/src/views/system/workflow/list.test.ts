import type { WorkflowRecord } from './model';

/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import {
  computed,
  createApp,
  defineComponent,
  h,
  inject,
  nextTick,
  provide,
} from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import List from './list.vue';
import { createDocument } from './model';

const state = vi.hoisted(() => ({
  list: vi.fn(),
  version: vi.fn(),
  push: vi.fn(),
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock('@vben/access', () => ({
  useAccess: () => ({ hasAccessByCodes: () => true }),
  AccessControl: {
    render(this: any) {
      return h('div', this.$slots.default?.());
    },
  },
}));
vi.mock('@vben/common-ui', () => ({
  Page: {
    render(this: any) {
      return h('main', this.$slots.default?.());
    },
  },
}));
vi.mock('#/api/system/workflow', () => ({
  getWorkflowList: state.list,
  createWorkflowVersion: state.version,
  createWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  disableWorkflowVersion: vi.fn(),
}));
vi.mock('./publication-dialog.vue', () => ({
  default: { render: () => null },
}));
vi.mock('element-plus', () => {
  const block = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  const overlay = defineComponent({
    props: ['modelValue', 'title'],
    setup:
      (props, { slots }) =>
      () =>
        props.modelValue
          ? h('section', { 'data-overlay': props.title }, slots.default?.())
          : null,
  });
  return {
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
    ElDrawer: overlay,
    ElDialog: overlay,
    ElForm: block,
    ElFormItem: block,
    ElInput: block,
    ElOption: block,
    ElSelect: block,
    ElTag: block,
    ElEmpty: block,
    ElMessage: { success: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
    ElPagination: defineComponent({
      props: ['total'],
      setup: (props) => () => h('div', { 'data-total': props.total }),
    }),
    ElTable: defineComponent({
      props: ['data'],
      setup(props, { slots }) {
        provide(
          'rows',
          computed(() => props.data),
        );
        return () => h('div', { 'data-table': true }, slots.default?.());
      },
    }),
    ElTableColumn: defineComponent({
      props: ['label', 'prop'],
      setup(props, { slots }) {
        const rows = inject<any>('rows');
        return () =>
          h(
            'div',
            { 'data-column': props.label },
            rows.value.map((row: any) =>
              h(
                'div',
                { 'data-row': row.id },
                slots.default?.({ row }) ||
                  String(
                    (() => {
                      let value = row;
                      for (const key of props.prop?.split('.') || [])
                        value = value?.[key];
                      return value;
                    })() || '',
                  ),
              ),
            ),
          );
      },
    }),
  };
});

function record(
  id: string,
  extra: Partial<WorkflowRecord> = {},
): WorkflowRecord {
  return {
    ...createDocument(),
    id,
    name: '测试流程',
    code: 'REVIEW',
    base: 'TEST',
    status: 'published',
    version: 1,
    revision: 1,
    updatedBy: 'tester',
    updatedAt: '2026-10-16T06:00:00Z',
    ...extra,
  };
}
const cleanups: (() => void)[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
async function flush() {
  for (let i = 0; i < 15; i++) await nextTick();
}
async function mount(records: WorkflowRecord[]) {
  state.list.mockResolvedValue(records);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(List);
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await flush();
  return host;
}
function button(host: HTMLElement, text: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (el) => el.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}

describe('workflow version list interactions', () => {
  it('counts flows, opens all historical versions, and offers continuing an existing draft', async () => {
    const host = await mount([
      record('v1', { status: 'disabled' }),
      record('v2', { familyId: 'v1', version: 2 }),
      record('v3', { familyId: 'v1', version: 3, status: 'draft' }),
    ]);
    expect(host.querySelector<HTMLElement>('[data-total]')?.dataset.total).toBe(
      '1',
    );
    expect(
      host
        .querySelector('[data-column="流程"]')
        ?.textContent?.match(/测试流程/g),
    ).toHaveLength(1);
    expect(host.textContent).not.toContain('新建版本');
    button(host, '版本历史').click();
    await flush();
    const history = host.querySelector<HTMLElement>('[data-overlay]')!;
    expect(history.textContent).toContain('共 3 个版本');
    expect(
      history
        .querySelector('[data-column="版本"]')
        ?.textContent?.replaceAll(/\s/g, ''),
    ).toBe('V3V2V1');
    expect(history.textContent).not.toContain('基于此版创建草稿');
    button(history, '继续编辑草稿').click();
    await flush();
    expect(state.push).toHaveBeenCalledWith('/system/workflow/edit/v3');
    expect(state.version).not.toHaveBeenCalled();
  });

  it('refreshes before creating and opens a draft created by another window', async () => {
    const original = record('v1');
    const host = await mount([original]);
    state.list.mockResolvedValue([
      original,
      record('v2', { familyId: 'v1', status: 'draft', version: 2 }),
    ]);
    button(host, '新建版本').click();
    await flush();
    expect(state.version).not.toHaveBeenCalled();
    expect(state.push).toHaveBeenCalledWith('/system/workflow/edit/v2');
  });

  it('creates from the current publication only when the family has no draft', async () => {
    const host = await mount([
      record('v1', { status: 'disabled' }),
      record('v2', { familyId: 'v1', version: 2 }),
    ]);
    state.version.mockResolvedValue(
      record('v3', { familyId: 'v1', status: 'draft', version: 3 }),
    );
    button(host, '新建版本').click();
    await flush();
    expect(state.version).toHaveBeenCalledExactlyOnceWith('v2');
    expect(state.push).toHaveBeenCalledWith('/system/workflow/edit/v3');
  });
});

/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import List from './list.vue';

const state = vi.hoisted(() => ({
  grid: {} as any,
  drawerData: {} as any,
  data: [] as any[],
  route: {} as any,
  query: vi.fn(),
  open: vi.fn(),
  replace: vi.fn(),
  remove: vi.fn(),
  usage: vi.fn(),
  onAction: undefined as any,
  error: vi.fn(),
}));
vi.mock('vue-router', () => ({
  useRoute: () => state.route,
  useRouter: () => ({ replace: state.replace }),
}));
vi.mock('@vben/icons', () => ({
  Plus: defineComponent({ render: () => null }),
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('main', slots.default?.()),
  }),
  useVbenDrawer: () => {
    const api = {
      setData: (data: any) => {
        state.drawerData = data;
        return api;
      },
      open: state.open,
    };
    return [defineComponent({ render: () => null }), api];
  },
}));
vi.mock('#/adapter/vxe-table', () => ({
  useVbenVxeGrid: (options: any) => {
    state.grid = options.gridOptions;
    state.query.mockImplementation(async () => {
      const awaitedResult1 = await state.grid.proxyConfig.ajax.query({}, {});
      state.data = awaitedResult1.items;
    });
    return [
      defineComponent({
        setup:
          (_, { slots }) =>
          () =>
            h('div', slots['toolbar-tools']?.()),
      }),
      {
        query: state.query,
        setGridOptions: (next: any) => Object.assign(state.grid, next),
      },
    ];
  },
}));
vi.mock('#/api', () => ({
  getPageSchemaList: async () => [
    { id: 'entity', title: '旧列表' },
    { id: 'scene', schemaKind: 'scene' },
    { id: 'detail', schemaKind: 'detail' },
    { id: 'template', schemaKind: 'template' },
  ],
  deletePageSchema: state.remove,
  getPageSchemaUsage: state.usage,
}));
vi.mock('#/api/system/menu', () => ({ getMenuList: async () => [] }));
vi.mock('./data', () => ({
  useGridFormSchema: () => [],
  useColumns: (onAction: any) => {
    state.onAction = onAction;
    return ['title', 'scene', 'buttonCount', 'boundMenus', 'operation'].map(
      (field) => ({ field }),
    );
  },
}));
vi.mock('./modules/form.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('element-plus', () => ({
  ElAlert: defineComponent({ render: () => null }),
  ElButton: defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('button', slots.default?.()),
  }),
  ElTabs: defineComponent({
    emits: ['update:modelValue'],
    setup:
      (_, { slots, emit }) =>
      () =>
        h(
          'nav',
          {
            onClick: (event: MouseEvent) => {
              const name = (event.target as HTMLElement).dataset.tab;
              if (name) emit('update:modelValue', name);
            },
          },
          slots.default?.(),
        ),
  }),
  ElTabPane: defineComponent({
    props: ['label', 'name'],
    setup: (props) => () =>
      h('button', { 'data-tab': props.name }, props.label),
  }),
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: state.error },
  ElMessageBox: { confirm: async () => true },
}));

const cleanups: (() => void)[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  state.route = reactive({ query: {} });
  state.usage.mockResolvedValue({
    references: [],
    liveCount: 0,
    snapshotCount: 0,
  });
});
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
async function settle() {
  for (let i = 0; i < 5; i++) await nextTick();
}
async function mountList() {
  const host = document.createElement('div');
  const app = createApp(List);
  app.mount(host);
  cleanups.push(() => app.unmount());
  await settle();
  return host;
}

describe('页面配置用途入口', () => {
  it('按用途切换列表，新建时带入对应用途，详情列表不展示列表专属列', async () => {
    const host = await mountList();
    await state.query();
    expect(state.data.map((row) => row.id)).toEqual(['entity', 'scene']);
    host.querySelector<HTMLButtonElement>('[data-tab="detail"]')!.click();
    await settle();
    expect(state.data.map((row) => row.id)).toEqual(['detail']);
    expect(state.grid.columns.map((col: any) => col.field)).toEqual([
      'title',
      'operation',
    ]);
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('新建办理详情'))!
      .click();
    expect(state.drawerData).toEqual({ schemaKind: 'detail' });
    host.querySelector<HTMLButtonElement>('[data-tab="template"]')!.click();
    await settle();
    expect(state.data.map((row) => row.id)).toEqual(['template']);
  });
  it('流程的新建链接直接打开办理详情并清除一次性参数', async () => {
    state.route.query.create = 'detail';
    await mountList();
    expect(state.drawerData).toEqual({ schemaKind: 'detail' });
    expect(state.open).toHaveBeenCalledOnce();
    expect(state.replace).toHaveBeenCalledWith({ query: {} });
  });
  it('仍被实时引用时打开使用位置而不删除', async () => {
    await mountList();
    state.usage.mockResolvedValue({
      liveCount: 1,
      snapshotCount: 0,
      references: [],
    });
    state.onAction({ code: 'remove', row: { id: 'detail' } });
    await settle();
    expect(state.drawerData.focusTab).toBe('usage');
    expect(state.remove).not.toHaveBeenCalled();
  });
  it('引用查询失败时明确提示并保留配置', async () => {
    await mountList();
    state.usage.mockRejectedValue(new Error('network'));
    state.onAction({ code: 'remove', row: { id: 'detail' } });
    await settle();
    expect(state.error).toHaveBeenCalledWith(
      expect.stringContaining('无法检查使用位置'),
    );
    expect(state.remove).not.toHaveBeenCalled();
  });
});

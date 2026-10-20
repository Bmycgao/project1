/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Form from './form.vue';

const state = vi.hoisted(() => ({
  values: {} as Record<string, any>,
  data: {} as Record<string, any>,
  formOptions: {} as any,
  drawerOptions: {} as any,
  create: vi.fn(),
  update: vi.fn(),
  warning: vi.fn(),
  close: vi.fn(),
  templates: [] as any[],
  pages: [] as any[],
  separate: vi.fn(),
}));

vi.mock('@vben/common-ui', () => ({
  useVbenDrawer: (options: any) => {
    state.drawerOptions = options;
    return [
      defineComponent({
        setup:
          (_, { slots }) =>
          () =>
            h('div', slots.default?.()),
      }),
      {
        getData: () => state.data,
        close: state.close,
        lock: vi.fn(),
        unlock: vi.fn(),
      },
    ];
  },
}));
vi.mock('#/adapter/form', () => ({
  useVbenForm: (options: any) => {
    state.formOptions = options;
    return [
      defineComponent({ setup: () => () => h('div') }),
      {
        reset: async () => {
          state.values = {};
        },
        updateSchema: vi.fn(),
        setValues: async (values: any) => {
          Object.assign(state.values, values);
          options.handleValuesChange(state.values);
        },
        getValues: async () => state.values,
        validate: async () => ({ valid: true }),
      },
    ];
  },
}));
vi.mock('#/api', () => ({
  DEFAULT_FC_BINDINGS: {
    basic: 'basic',
    houses: 'houses',
    compensation: 'compensation',
    rewards: 'rewards',
    population: 'population',
  },
  getFcSchemaList: async () => state.templates,
  createPageSchema: state.create,
  updatePageSchema: state.update,
  getPageSchema: async (id: string) =>
    state.pages.find((page) => page.id === id) || state.data,
  getPageSchemaList: async () => state.pages,
  separatePageSchemaDetail: state.separate,
  getPageSchemaHistory: async () => [],
  getPageSchemaUsage: async () => ({
    references: [],
    liveCount: 0,
    snapshotCount: 0,
  }),
  getRoleAccessCodes: vi.fn(),
  getRoleList: async () => ({ items: [] }),
  rollbackPageSchema: vi.fn(),
}));
vi.mock('../data', () => ({
  AGREE_LIST_FIELD_OPTIONS: [],
  useFormSchema: () => [],
  getDefaultColumns: () => [{ field: 'name', title: '名称', visible: true }],
  getDefaultQueryFields: () => [],
}));
vi.mock('../../../biz/agreement/actions', () => ({
  groupAgreeActions: () => [],
  resolveToolbarButtons: (codes: string[]) =>
    codes.map((code) => ({ code, label: code })),
}));
vi.mock('../preview-runtime', () => ({ buildSchemaPreview: vi.fn() }));
vi.mock('./usage.vue', () => ({
  default: defineComponent({ setup: () => () => h('div') }),
}));
vi.mock('./detail-designer.vue', () => ({
  default: defineComponent({
    props: ['layouts'],
    emits: ['update:layouts'],
    setup:
      (_, { emit }) =>
      () =>
        h(
          'button',
          {
            'data-clear-modules': '',
            onClick: () => emit('update:layouts', []),
          },
          '清空模块',
        ),
  }),
}));
vi.mock('element-plus', () => {
  const block = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  const empty = defineComponent({ setup: () => () => h('div') });
  return {
    ElTabs: block,
    ElCollapse: block,
    ElCollapseItem: block,
    ElTabPane: defineComponent({
      props: ['label'],
      setup:
        (props, { slots }) =>
        () =>
          h('section', { 'data-tab': props.label }, slots.default?.()),
    }),
    ElAlert: empty,
    ElButton: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('button', slots.default?.()),
    }),
    ElCheckbox: empty,
    ElCheckboxGroup: empty,
    ElInput: empty,
    ElInputNumber: empty,
    ElOption: empty,
    ElSelect: empty,
    ElSwitch: empty,
    ElTable: empty,
    ElTableColumn: empty,
    ElTag: empty,
    ElMessage: { warning: state.warning, error: vi.fn(), success: vi.fn() },
    ElMessageBox: { confirm: async () => true },
  };
});

const cleanups: (() => void)[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  state.pages = [];
  state.data = { schemaKind: 'detail' };
  state.templates = [
    'basic',
    'houses',
    'compensation',
    'rewards',
    'population',
  ].map((id) => ({
    id,
    status: 1,
    usage: 'agreementModule',
    kind: ['compensation', 'houses', 'rewards'].includes(id) ? 'table' : 'form',
    rule: [{ type: 'input', field: 'name', title: '姓名' }],
  }));
});
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
async function open() {
  const host = document.createElement('div');
  document.body.append(host);
  const success = vi.fn();
  const app = createApp(Form, { onSuccess: success });
  app.directive('loading', {});
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await state.drawerOptions.onOpenChange(true);
  Object.assign(state.values, { name: 'detail', title: '独立办理详情' });
  await nextTick();
  return { host, success };
}

describe('办理详情编辑器', () => {
  it('旧场景的拆分按钮调用接口后刷新为关联详情模式', async () => {
    state.data = {
      id: 'legacy',
      schemaKind: 'scene',
      status: 1,
      name: 'legacy',
      title: '旧列表',
      columns: [],
      queryFields: [],
      modules: [{ key: 'basic', enabled: true }],
    };
    const { host, success } = await open();
    state.separate.mockImplementation(async () => {
      state.data = {
        ...state.data,
        detailSchemaId: 'new-detail',
        modules: [],
        moduleInner: {},
        fcBindings: {},
      };
      state.pages = [
        {
          id: 'new-detail',
          schemaKind: 'detail',
          status: 1,
          modules: [{ key: 'basic', enabled: true }],
        },
      ];
    });
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '拆出独立详情并关联')!
      .click();
    for (let i = 0; i < 12; i++) await nextTick();
    expect(state.separate).toHaveBeenCalledWith('legacy');
    expect(success).toHaveBeenCalledWith('scene');
    expect(host.querySelector('[data-tab="详情编排"]')).toBeNull();
    expect(host.textContent).toContain('配置关联详情');
  });
  it('关联独立详情的列表显示关联入口，保存引用并清空内嵌布局', async () => {
    state.data = {
      id: 'list',
      name: 'list',
      title: '列表',
      schemaKind: 'scene',
      status: 1,
      scene: 'entry',
      columnTemplateId: 'cols',
      detailSchemaId: 'shared',
      columns: [{ field: 'agreementNo', title: '编号', visible: true }],
      queryFields: [],
      buttons: [{ code: 'edit' }],
      modules: [],
    };
    state.pages = [
      {
        id: 'shared',
        schemaKind: 'detail',
        status: 1,
        modules: [{ key: 'basic', enabled: true }],
      },
    ];
    const { host } = await open();
    expect(host.querySelector('[data-tab="关联详情"]')).not.toBeNull();
    expect(host.querySelector('[data-tab="详情编排"]')).toBeNull();
    expect(host.querySelector('[data-tab="列表字段"]')).toBeNull();
    await state.drawerOptions.onConfirm();
    expect(state.warning).not.toHaveBeenCalled();
    expect(state.update).toHaveBeenCalledWith(
      'list',
      expect.objectContaining({
        detailSchemaId: 'shared',
        modules: [],
        moduleInner: {},
        fcBindings: {},
      }),
    );
  });

  it('新建列表先要求关联详情，旧内嵌场景仍可编辑并显示拆分入口', async () => {
    state.data = { schemaKind: 'scene' };
    const { host } = await open();
    expect(host.querySelector('[data-tab="详情编排"]')).toBeNull();
    await state.drawerOptions.onConfirm();
    expect(state.warning).toHaveBeenCalledWith('请先关联一份独立办理详情');
    expect(state.create).not.toHaveBeenCalled();
    state.data = {
      id: 'legacy',
      schemaKind: 'scene',
      columns: [],
      queryFields: [],
      modules: [{ key: 'basic', enabled: true }],
    };
    await state.drawerOptions.onOpenChange(true);
    await nextTick();
    expect(host.querySelector('[data-tab="详情编排"]')).not.toBeNull();
    expect(host.textContent).toContain('拆出独立详情并关联');
  });
  it('显示详情编排和使用位置，隐藏列表列与列表操作，并可独立保存', async () => {
    const { host, success } = await open();
    expect(host.querySelector('[data-tab="详情编排"]')).not.toBeNull();
    expect(host.querySelector('[data-tab="使用位置"]')).not.toBeNull();
    expect(host.querySelector('[data-tab="列表操作"]')).toBeNull();
    expect(host.querySelector('[data-tab="列表字段"]')).toBeNull();
    await state.drawerOptions.onConfirm();
    expect(state.warning).not.toHaveBeenCalled();
    expect(state.create).toHaveBeenCalledOnce();
    expect(state.create.mock.calls[0]![0]).toMatchObject({
      schemaKind: 'detail',
      name: 'detail',
      columns: [],
      queryFields: [],
      buttons: [],
      fcBindings: { basic: 'basic' },
    });
    expect(state.create.mock.calls[0]![0].scene).toBeUndefined();
    expect(state.create.mock.calls[0]![0].columnTemplateId).toBeUndefined();
    expect(success).toHaveBeenCalledWith('detail');
    expect(state.close).toHaveBeenCalled();
  });

  it('清空详情模块后阻止保存', async () => {
    const { host } = await open();
    host.querySelector<HTMLButtonElement>('[data-clear-modules]')!.click();
    await nextTick();
    await state.drawerOptions.onConfirm();
    expect(state.warning).toHaveBeenCalledWith('请至少挂载一个详情模块');
    expect(state.create).not.toHaveBeenCalled();
  });

  it('引用模板停用时保留草稿并提示修复', async () => {
    await open();
    state.templates = [];
    await state.drawerOptions.onConfirm();
    expect(state.warning).toHaveBeenCalledWith(
      expect.stringContaining('可用且类型匹配'),
    );
    expect(state.create).not.toHaveBeenCalled();
    expect(state.close).not.toHaveBeenCalled();
  });
});

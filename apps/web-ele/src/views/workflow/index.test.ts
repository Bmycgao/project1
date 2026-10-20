/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Workflow from './index.vue';

const state = vi.hoisted(() => ({
  route: { query: { agreementId: 'agreement-1' }, meta: {} },
  push: vi.fn(),
  agreements: vi.fn(),
  start: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('vue-router', () => ({
  useRoute: () => state.route,
  useRouter: () => ({ push: state.push }),
}));
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
vi.mock('#/api/workflow-runtime', () => ({
  getStartableWorkflows: async () => [
    { id: 'flow-1', name: '测试流程', version: 1, base: 'TEST' },
  ],
  getWorkflowAgreements: state.agreements,
  getWorkflowInstances: async () => [],
  startWorkflow: state.start,
}));
vi.mock('element-plus', () => {
  const block = defineComponent({
    setup(_, { slots }) {
      return () => h('div', [slots.default?.(), slots.footer?.()]);
    },
  });
  return {
    ElAlert: defineComponent({
      props: ['title'],
      setup(props, { slots }) {
        return () => h('aside', [props.title, slots.default?.()]);
      },
    }),
    ElButton: defineComponent({
      props: ['disabled'],
      setup(props, { slots, attrs }) {
        return () =>
          h(
            'button',
            { ...attrs, disabled: props.disabled },
            slots.default?.(),
          );
      },
    }),
    ElDialog: defineComponent({
      props: ['modelValue'],
      setup(props, { slots }) {
        return () =>
          props.modelValue
            ? h('dialog', [slots.default?.(), slots.footer?.()])
            : null;
      },
    }),
    ElInput: defineComponent({
      props: ['modelValue', 'disabled'],
      setup(props) {
        return () =>
          h('input', { value: props.modelValue, disabled: props.disabled });
      },
    }),
    ElEmpty: block,
    ElForm: block,
    ElFormItem: block,
    ElOption: block,
    ElPagination: block,
    ElSelect: block,
    ElTable: block,
    ElTableColumn: { render: () => null },
    ElTabPane: block,
    ElTabs: block,
    ElTag: block,
    ElMessage: { info: vi.fn(), warning: state.warning, success: vi.fn() },
  };
});

const cleanups: (() => void)[] = [];
const issue = {
  field: 'houseAddress',
  module: 'houses',
  message:
    '协议尚未填写房屋地址，请到「房屋信息」中添加或完善首套房屋地址并保存。',
};
function option(ready = false) {
  return {
    id: 'agreement-1',
    agreementNo: 'LL-2026-0001',
    compensatee: '张三',
    houseAddress: ready ? '首套路1号' : '',
    houseCount: ready ? 2 : 0,
    amount: 1000,
    title: '测试协议',
    statusValue: '草稿',
    startIssues: ready ? [] : [issue],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.agreements.mockResolvedValue([option()]);
  state.start.mockResolvedValue({ instance: { id: 'instance-1' } });
});
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
async function flush() {
  for (let count = 0; count < 12; count++) await nextTick();
}
async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(Workflow);
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await flush();
  return host;
}
function button(host: HTMLElement, text: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.trim() === text,
  )!;
}

describe('发起流程资料检查', () => {
  it('缺少房屋地址时显示填写入口并阻止发起', async () => {
    const host = await mount();
    expect(host.textContent).toContain(issue.message);
    expect(button(host, '确认发起').disabled).toBe(true);
    button(host, '确认发起').click();
    expect(state.start).not.toHaveBeenCalled();
    button(host, '前往房屋信息').click();
    await flush();
    expect(state.push).toHaveBeenCalledWith({
      name: 'BizAgreementDetail',
      params: { agreementNo: 'agreement-1' },
      query: { scene: 'entry', module: 'houses', edit: '1' },
    });
  });

  it('重新打开后读取已保存地址，注明多套房屋并允许发起', async () => {
    const host = await mount();
    button(host, '取消').click();
    await flush();
    state.agreements.mockResolvedValue([option(true)]);
    button(host, '＋ 发起流程').click();
    await flush();
    expect(host.textContent).not.toContain(issue.message);
    expect(host.textContent).toContain('多套房屋展示首套地址');
    expect(host.textContent).toContain('当前共 2 套房屋');
    expect(button(host, '确认发起').disabled).toBe(false);
    button(host, '确认发起').click();
    await flush();
    expect(state.start).toHaveBeenCalledWith(
      expect.objectContaining({
        agreementId: 'agreement-1',
        definitionId: 'flow-1',
      }),
    );
    expect(state.push).toHaveBeenCalledWith('/workflow/instances/instance-1');
  });
});

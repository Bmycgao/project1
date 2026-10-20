/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Detail from './index.vue';

const state = vi.hoisted(() => ({
  route: {
    params: { agreementNo: 'NEW-DRAFT' },
    query: { mode: 'edit', edit: '1' } as Record<string, string>,
    meta: {} as Record<string, unknown>,
    path: '/agreement/NEW-DRAFT',
    fullPath: '/agreement/NEW-DRAFT?edit=1',
  },
  getDetail: vi.fn(),
  saveAll: vi.fn(),
  saveModule: vi.fn(),
  submit: vi.fn(),
  validate: vi.fn(),
  focusModule: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  canEdit: true,
  moduleValues: {} as Record<string, Record<string, unknown>>,
}));

vi.mock('vue-router', () => ({
  useRoute: () => state.route,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@vben/common-ui', () => ({
  Page: {
    render(this: any) {
      return h('main', this.$slots.default?.());
    },
  },
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessCodes: ['Agree:*'] }),
}));
vi.mock('element-plus', async (original) => {
  const actual = await original<typeof import('element-plus')>();
  return {
    ...actual,
    ElMessage: { error: state.error, success: state.success, warning: vi.fn() },
  };
});
vi.mock('#/api', () => ({
  getAgreementDetail: state.getDetail,
  saveAgreementAll: state.saveAll,
  saveAgreementModule: state.saveModule,
  submitAgreement: state.submit,
}));
vi.mock('#/api/workflow-runtime', () => ({
  hasWorkflowRuntimeAccess: () => false,
}));
vi.mock('../access/use-field-access', () => ({
  useProvideAgreeFieldRules: () => ({ rules: { value: [] } }),
  useProvideAgreeDetailEditable: vi.fn(),
}));
vi.mock('../actions', () => ({ canOperateAgreeAction: () => state.canEdit }));
vi.mock('../config/resolve-runtime', () => ({
  loadAgreeDetailPageConfig: async () => ({
    modules: [
      { key: 'basic', enabled: true, region: 'content', order: 1, span: 24 },
      { key: 'population', enabled: true, region: 'tabs', order: 2, span: 24 },
    ],
    fcRules: {},
    customInners: {},
  }),
}));
vi.mock('../components/detail-layout.vue', () => ({
  default: defineComponent({
    props: ['modules', 'active'],
    setup(props, { slots, expose }) {
      expose({ focusModule: state.focusModule });
      return () =>
        h(
          'section',
          props.modules.flatMap((item: unknown) => [
            slots.actions?.({ item }),
            slots.default?.({ item }),
          ]),
        );
    },
  }),
}));
vi.mock('../components/detail-module.vue', () => ({
  default: defineComponent({
    props: ['item', 'detail', 'editable'],
    emits: ['dirty'],
    setup(props, { expose, emit }) {
      expose({
        validate: state.validate,
        getValues: () => state.moduleValues[props.item.key] || {},
      });
      return () =>
        h('div', {
          'data-editable': String(props.editable),
          'data-module-key': props.item.key,
          onInput: () => emit('dirty'),
        });
    },
  }),
}));

function draft() {
  return {
    id: 'NEW',
    agreementNoEditable: true,
    entryEditable: true,
    entryReadonlyReason: '',
    agreementNo: 'NEW-DRAFT',
    status: 'draft',
    statusValue: '草稿',
    signType: '',
    isSigned: '未签约',
    basic: {
      agreementNo: 'NEW-DRAFT',
      agreementName: '',
      amount: '',
      signDate: '',
      compensatee: '',
    },
    houses: [],
    rightHolders: [],
    compensationItems: [],
    rewardItems: [],
    compensation: { amount: '' },
    population: { familySize: '' },
    signing: {},
    extraForms: {},
    extraTables: {},
  };
}
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  state.route.query = { mode: 'edit', edit: '1' };
  state.route.params.agreementNo = 'NEW-DRAFT';
  state.getDetail.mockReset().mockImplementation(async () => draft());
  state.saveAll.mockReset().mockImplementation(async (data) => data);
  state.saveModule.mockReset();
  state.submit.mockReset();
  state.validate.mockReset().mockResolvedValue(false);
  state.moduleValues = {};
  state.canEdit = true;
});
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
async function flush() {
  for (let index = 0; index < 12; index += 1) await nextTick();
}
async function mountDetail() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(Detail);
  app.directive('loading', {});
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await flush();
  return host;
}
function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.trim() === label,
  )!;
}

describe('空白协议录入', () => {
  it.each([
    '待复核',
    '待生效',
    '组长已复核',
    '项目经理已审核',
    '签约已确认',
    '自定义演示状态',
  ])('演示状态 %s 不妨碍进入编辑和暂存未填完的资料', async (statusValue) => {
    state.route.query = { mode: 'edit' };
    const current = { ...draft(), statusValue, agreementNoEditable: false };
    state.getDetail.mockResolvedValue(current);
    state.moduleValues.basic = { basic: { ...current.basic, amount: 2000 } };
    const host = await mountDetail();
    button(host, '切换到编辑').click();
    await flush();
    expect(host.querySelector('[data-editable="true"]')).not.toBeNull();
    button(host, '全部保存').click();
    await flush();
    expect(state.saveAll).toHaveBeenCalledWith(
      expect.objectContaining({
        statusValue,
        basic: expect.objectContaining({ amount: 2000 }),
      }),
    );
    expect(state.validate).not.toHaveBeenCalled();
    expect(state.error).not.toHaveBeenCalled();
  });

  it('非草稿状态可分模块暂存，提交复核仍需通过必填校验', async () => {
    const current = {
      ...draft(),
      statusValue: '待复核',
      agreementNoEditable: false,
    };
    state.getDetail.mockResolvedValue(current);
    state.saveModule.mockResolvedValue(current);
    const host = await mountDetail();
    host
      .querySelector('[data-module-key="basic"]')!
      .dispatchEvent(new Event('input'));
    await flush();
    button(host, '保存本模块').click();
    await flush();
    expect(state.saveModule).toHaveBeenCalled();
    expect(state.validate).not.toHaveBeenCalled();
    button(host, '提交复核').click();
    await flush();
    expect(state.validate).toHaveBeenCalled();
    expect(state.submit).not.toHaveBeenCalled();
  });

  it('流程结束后仍是草稿，可重新进入编辑并保存正文，编号保持锁定', async () => {
    state.route.query = { mode: 'edit' };
    state.getDetail.mockResolvedValue({
      ...draft(),
      agreementNoEditable: false,
    });
    state.moduleValues.basic = { basic: { ...draft().basic, amount: 2000 } };
    state.validate.mockResolvedValue(true);
    const host = await mountDetail();
    button(host, '切换到编辑').click();
    await flush();
    expect(host.querySelector('[data-editable="true"]')).not.toBeNull();
    button(host, '保存草稿').click();
    await flush();
    expect(state.saveAll).toHaveBeenCalledWith(
      expect.objectContaining({
        agreementNo: 'NEW-DRAFT',
        agreementNoEditable: false,
        basic: expect.objectContaining({ amount: 2000 }),
      }),
    );
    expect(state.error).not.toHaveBeenCalled();
  });

  it('编辑模式路由参数不能替代角色的编辑权限', async () => {
    state.canEdit = false;
    const host = await mountDetail();
    expect(button(host, '切换到编辑')).toBeUndefined();
    expect(button(host, '保存草稿')).toBeUndefined();
    expect(button(host, '提交复核')).toBeUndefined();
    expect(host.querySelector('[data-editable="true"]')).toBeNull();
  });

  it('已进入流程时，即使带编辑参数也只读且显示原因', async () => {
    state.getDetail.mockResolvedValue({
      ...draft(),
      entryEditable: false,
      entryReadonlyReason: '协议已进入流程，普通详情只读',
    });
    const host = await mountDetail();
    expect(button(host, '切换到编辑')).toBeUndefined();
    expect(button(host, '保存草稿')).toBeUndefined();
    expect(button(host, '提交复核')).toBeUndefined();
    expect(host.querySelector('[data-editable="true"]')).toBeNull();
    expect(host.textContent).toContain('协议已进入流程，普通详情只读');
  });

  it('提交前留下的旧编辑页被拒绝后，更新只读状态且不提示保存成功', async () => {
    const host = await mountDetail();
    state.saveAll.mockRejectedValueOnce(
      new Error('协议已进入流程，普通详情只读'),
    );
    state.getDetail.mockResolvedValue({
      ...draft(),
      entryEditable: false,
      entryReadonlyReason: '协议已进入流程，普通详情只读',
    });
    button(host, '保存草稿').click();
    await flush();
    expect(state.saveAll).toHaveBeenCalledOnce();
    expect(state.error).toHaveBeenCalledWith('协议已进入流程，普通详情只读');
    expect(state.success).not.toHaveBeenCalled();
    expect(button(host, '切换到编辑')).toBeUndefined();
    expect(host.querySelector('[data-editable="true"]')).toBeNull();
  });

  it('从缺资料入口进入时定位对应模块', async () => {
    state.route.query.module = 'population';
    await mountDetail();
    expect(state.focusModule).toHaveBeenCalledWith('population');
  });

  it('旧编号链接含百分号时，不重复解码路由参数', async () => {
    state.route.params.agreementNo = 'LL-100%';
    await mountDetail();
    expect(state.getDetail).toHaveBeenCalledWith('LL-100%', expect.any(Object));
    expect(state.error).not.toHaveBeenCalled();
  });
  it.each(['保存草稿', '提交复核'])(
    '草稿修改编号后，%s保持内部ID并提交新编号和其他编辑',
    async (label) => {
      state.moduleValues.basic = {
        id: 'wrong-id',
        agreementNo: 'CHANGED-NO',
        basic: {
          ...draft().basic,
          agreementNo: 'CHANGED-NO',
          agreementName: '保留的协议名称',
        },
      };
      state.validate.mockResolvedValue(true);
      state.submit.mockResolvedValue(draft());
      const host = await mountDetail();
      button(host, label).click();
      await flush();
      const api = label === '保存草稿' ? state.saveAll : state.submit;
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'NEW',
          agreementNo: 'CHANGED-NO',
          basic: expect.objectContaining({
            agreementNo: 'CHANGED-NO',
            agreementName: '保留的协议名称',
          }),
        }),
      );
      expect(state.error).not.toHaveBeenCalled();
    },
  );

  it('已锁定编号的记录不会因模块返回值被改号', async () => {
    state.getDetail.mockResolvedValue({
      ...draft(),
      agreementNoEditable: false,
    });
    state.moduleValues.basic = {
      agreementNo: 'CHANGED',
      basic: { ...draft().basic, agreementNo: 'CHANGED' },
    };
    const host = await mountDetail();
    button(host, '保存草稿').click();
    await flush();
    expect(state.saveAll).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'NEW',
        agreementNo: 'NEW-DRAFT',
        basic: expect.objectContaining({ agreementNo: 'NEW-DRAFT' }),
      }),
    );
  });

  it('新增后直接编辑，未填写的金额和人口不显示为零', async () => {
    const host = await mountDetail();
    expect(button(host, '保存草稿')).toBeTruthy();
    expect(host.querySelector('[data-editable="true"]')).toBeTruthy();
    expect(host.textContent).toContain('未命名协议');
    expect(host.querySelectorAll('.agree-summary__value')[0]?.textContent).toBe(
      '未填写',
    );
    expect(host.querySelectorAll('.agree-summary__value')[2]?.textContent).toBe(
      '未填写',
    );
    expect(host.textContent).not.toContain('2026-03-15');
  });

  it('正常打开已有记录时保持浏览状态', async () => {
    delete state.route.query.edit;
    const host = await mountDetail();
    expect(button(host, '切换到编辑')).toBeTruthy();
    expect(host.querySelector('[data-editable="true"]')).toBeNull();
  });

  it('允许保存不完整草稿，提交复核仍须通过模块校验', async () => {
    const host = await mountDetail();
    button(host, '保存草稿').click();
    await flush();
    expect(state.saveAll).toHaveBeenCalledOnce();
    expect(state.validate).not.toHaveBeenCalled();
    expect(state.saveAll.mock.calls[0]![0].basic.amount).toBe('');
    button(host, '提交复核').click();
    await flush();
    expect(state.validate).toHaveBeenCalled();
    expect(state.submit).not.toHaveBeenCalled();
  });

  it('加载失败时显示重试入口，不生成演示资料', async () => {
    state.getDetail.mockRejectedValueOnce(new Error('无法读取协议'));
    const host = await mountDetail();
    expect(host.textContent).toContain('无法读取协议');
    expect(host.querySelector('.agree-summary')).toBeNull();
    expect(button(host, '提交复核')).toBeUndefined();
    button(host, '重新加载').click();
    await flush();
    expect(state.getDetail).toHaveBeenCalledTimes(2);
    expect(button(host, '保存草稿')).toBeTruthy();
  });

  it('保存失败时保留编辑状态，不提示草稿已保存', async () => {
    state.saveAll.mockRejectedValueOnce(new Error('保存失败'));
    const host = await mountDetail();
    button(host, '保存草稿').click();
    await flush();
    expect(state.error).toHaveBeenCalledWith('保存失败');
    expect(state.success).not.toHaveBeenCalled();
    expect(button(host, '保存草稿')).toBeTruthy();
  });

  it('提交接口失败时不在本地改成待复核', async () => {
    state.validate.mockResolvedValue(true);
    state.submit.mockRejectedValueOnce(new Error('提交失败'));
    const host = await mountDetail();
    button(host, '提交复核').click();
    await flush();
    expect(state.error).toHaveBeenCalledWith('提交失败');
    expect(state.success).not.toHaveBeenCalled();
    expect(host.querySelector('.el-tag')?.textContent).toContain('草稿');
  });
});

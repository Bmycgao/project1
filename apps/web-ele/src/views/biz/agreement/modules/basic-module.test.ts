/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import type { AgreementDetail } from '../types';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BasicModule from './basic-module.vue';

const fieldAccess = vi.hoisted(() => ({ numberEditable: true }));
beforeEach(() => {
  fieldAccess.numberEditable = true;
});
vi.mock('../access/use-field-access', () => ({
  useAgreeFieldAccess: () => ({
    fieldVisible: () => true,
    fieldEditable: (key: string) =>
      key !== 'agreementNo' || fieldAccess.numberEditable,
    isDetailPageEditable: () => true,
  }),
}));
vi.mock('../components/fc-runtime.vue', () => ({
  default: defineComponent({
    props: ['modelValue', 'rule', 'editable'],
    setup(props, { expose }) {
      expose({
        getValues: () => ({
          ...props.modelValue,
          agreementNo: 'TAMPERED',
          agreementName: '其他资料',
        }),
        validate: async () => true,
      });
      return () => {
        const status = props.rule?.find(
          (item: any) => item.field === 'statusValue',
        );
        const selected = status?.options?.find(
          (item: any) => item.value === props.modelValue?.statusValue,
        );
        return h('div', { class: 'fc-selected-status' }, selected?.label || '');
      };
    },
  }),
}));

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
async function mountBasic(
  fc = false,
  numberEditable = false,
  statusValue = '',
) {
  const detail = {
    agreementNoEditable: numberEditable,
    agreementNo: 'ORIGINAL-NO',
    statusValue,
    basic: { agreementNo: 'OLD-INNER-NO', agreementName: '', statusValue },
  } as AgreementDetail;
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(BasicModule, { detail, editable: true });
  if (fc)
    app.provide(
      'agreeFcRules',
      ref({
        basic: [
          { type: 'input', field: 'agreementNo' },
          {
            type: 'radio',
            field: 'statusValue',
            options: [{ label: '草稿', value: '草稿' }],
          },
        ],
      }),
    );
  const vm = app.mount(host) as unknown as {
    getValues: () => Promise<{
      agreementNo: string;
      basic: Record<string, unknown>;
    }>;
  };
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await nextTick();
  return { host, vm };
}

describe('基础信息协议编号', () => {
  it('草稿编号仍遵守角色字段只读权限', async () => {
    fieldAccess.numberEditable = false;
    const { host } = await mountBasic(false, true);
    const input = [...host.querySelectorAll<HTMLInputElement>('input')].find(
      (item) => item.value === 'ORIGINAL-NO',
    )!;
    expect(input.disabled || input.readOnly).toBe(true);
  });
  it('普通表单将原编号显示为不可编辑，名称仍可正常录入', async () => {
    const { host, vm } = await mountBasic();
    const inputs = [...host.querySelectorAll<HTMLInputElement>('input')];
    const number = inputs.find((input) => input.value === 'ORIGINAL-NO');
    expect(number).toBeTruthy();
    expect(number!.disabled || number!.readOnly).toBe(true);
    const nameItem = [...host.querySelectorAll('.el-form-item')].find((item) =>
      item
        .querySelector('.el-form-item__label')
        ?.textContent?.includes('协议名称'),
    )!;
    const name = nameItem.querySelector<HTMLInputElement>('input')!;
    expect(name.disabled).toBe(false);
    name.value = '正常填写的名称';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(await vm.getValues()).toMatchObject({
      agreementNo: 'ORIGINAL-NO',
      basic: { agreementNo: 'ORIGINAL-NO', agreementName: '正常填写的名称' },
    });
    expect(host.textContent).toContain('协议编号已锁定');
  });
  it('formCreate 返回的改号值不会覆盖原编号，其他资料保留', async () => {
    const { vm } = await mountBasic(true);
    expect(await vm.getValues()).toMatchObject({
      agreementNo: 'ORIGINAL-NO',
      basic: { agreementNo: 'ORIGINAL-NO', agreementName: '其他资料' },
    });
  });
  it('草稿的普通表单可编辑编号，保存时保留输入', async () => {
    const { host, vm } = await mountBasic(false, true);
    const input = [...host.querySelectorAll<HTMLInputElement>('input')].find(
      (item) => item.value === 'ORIGINAL-NO',
    )!;
    expect(input.disabled || input.readOnly).toBe(false);
    input.value = 'LL-2026-0088';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(await vm.getValues()).toMatchObject({
      agreementNo: 'LL-2026-0088',
      basic: { agreementNo: 'LL-2026-0088' },
    });
    expect(host.textContent).toContain('草稿阶段可修改协议编号');
  });
  it('草稿的配置模板可提交新编号', async () => {
    const { vm } = await mountBasic(true, true);
    expect(await vm.getValues()).toMatchObject({
      agreementNo: 'TAMPERED',
      basic: { agreementNo: 'TAMPERED', agreementName: '其他资料' },
    });
  });
});

describe('基础信息历史状态显示', () => {
  it.each(['项目经理已审核', '签约已确认', '旧系统自定义状态'])(
    '备用表单显示并保留当前值 %s',
    async (statusValue) => {
      const { host, vm } = await mountBasic(false, false, statusValue);
      const selected = host.querySelector<HTMLInputElement>(
        'input[type="radio"]:checked',
      );
      expect(selected?.closest('.el-radio')?.textContent).toContain(
        statusValue,
      );
      const awaitedResult1 = await vm.getValues();
      expect(awaitedResult1.basic.statusValue).toBe(statusValue);
    },
  );

  it.each(['项目经理已审核', '签约已确认', '旧系统自定义状态'])(
    '旧 FC 模板也显示并保留当前值 %s',
    async (statusValue) => {
      const { host, vm } = await mountBasic(true, false, statusValue);
      expect(host.querySelector('.fc-selected-status')?.textContent).toBe(
        statusValue,
      );
      const awaitedResult2 = await vm.getValues();
      expect(awaitedResult2.basic.statusValue).toBe(statusValue);
    },
  );
});

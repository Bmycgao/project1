import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveFieldAccess } from '../access/field-access';
import {
  loadAgreeDetailPageConfig,
  loadAgreeListRuntime,
} from './resolve-runtime';

const state = vi.hoisted(() => ({
  pages: {} as Record<string, any>,
  templateStatus: 1,
  templateFails: false,
}));
vi.mock('#/api', () => ({
  getPageSchema: async (id: string) => {
    if (!state.pages[id]) throw new Error('配置加载失败');
    return structuredClone(state.pages[id]);
  },
  DEFAULT_FC_BINDINGS: {},
  getFcSchema: async () => {
    if (state.templateFails) throw new Error('模板加载失败');
    return {
      kind: 'form',
      status: state.templateStatus,
      usage: 'agreementModule',
      rule: [{ type: 'input', field: 'note', title: '说明' }],
    };
  },
}));
vi.mock('../actions', () => ({ resolveToolbarButtons: () => [] }));

beforeEach(() => {
  state.templateStatus = 1;
  state.templateFails = false;
  state.pages = {
    list: {
      id: 'list',
      schemaKind: 'scene',
      status: 1,
      scene: 'entry',
      title: '录入列表',
      detailSchemaId: 'detail',
      columns: [{ field: 'agreementNo', title: '编号', visible: true }],
      fieldRules: [{ field: 'batchGroup', hidden: true }],
      modules: [],
    },
    detail: {
      id: 'detail',
      schemaKind: 'detail',
      status: 1,
      title: '共享详情',
      modules: [
        {
          key: 'custom_form_check',
          label: '核对',
          widgetKind: 'form',
          enabled: true,
          region: 'content',
          span: 12,
        },
      ],
      fcBindings: { custom_form_check: 'form' },
      fieldRules: [{ field: 'phone', hidden: true }],
    },
  };
});

describe('列表与详情运行时分离', () => {
  it('列表继续读取自己的列和规则，打开详情时读取关联页的模块、布局和字段规则', async () => {
    const list = await loadAgreeListRuntime({ schemaId: 'list' });
    expect(list.columns.map((column) => column.field)).toEqual(['agreementNo']);
    expect(list.fieldRules).toEqual([{ field: 'batchGroup', hidden: true }]);
    const detail = await loadAgreeDetailPageConfig({ schemaId: 'list' });
    expect(detail.modules).toEqual(state.pages.detail.modules);
    expect(detail.fcRules.custom_form_check?.[0]?.field).toBe('note');
    expect(detail.fieldRules).toEqual([{ field: 'phone', hidden: true }]);
    state.pages.detail.modules[0].span = 24;
    const awaitedResult1 = await loadAgreeDetailPageConfig({
      schemaId: 'list',
    });
    expect(awaitedResult1.modules[0]?.span).toBe(24);
  });

  it('关联目标缺失、停用、用途错误或加载失败时明确失败，不回退到全部默认模块', async () => {
    state.pages.detail.status = 0;
    await expect(
      loadAgreeDetailPageConfig({ schemaId: 'list' }),
    ).rejects.toThrow('停用');
    state.pages.detail.status = 1;
    state.pages.detail.schemaKind = 'scene';
    await expect(
      loadAgreeDetailPageConfig({ schemaId: 'list' }),
    ).rejects.toThrow('不存在');
    delete state.pages.detail;
    await expect(
      loadAgreeDetailPageConfig({ schemaId: 'list' }),
    ).rejects.toThrow('配置加载失败');
    delete state.pages.list;
    await expect(
      loadAgreeDetailPageConfig({ schemaId: 'list' }),
    ).rejects.toThrow('配置加载失败');
  });

  it('独立详情绑定的模板不可用时，不静默替换成默认字段', async () => {
    state.templateStatus = 0;
    await expect(
      loadAgreeDetailPageConfig({ schemaId: 'list' }),
    ).rejects.toThrow('模板');
    state.templateFails = true;
    await expect(
      loadAgreeDetailPageConfig({ schemaId: 'detail' }),
    ).rejects.toThrow('模板');
  });

  it('旧场景继续读取内嵌详情；拆分复制的同字段多条限制须全部满足', async () => {
    delete state.pages.list.detailSchemaId;
    state.pages.list.modules = state.pages.detail.modules;
    state.pages.list.fcBindings = state.pages.detail.fcBindings;
    const awaitedResult2 = await loadAgreeDetailPageConfig({
      schemaId: 'list',
    });
    expect(awaitedResult2.modules[0]?.key).toBe('custom_form_check');
    const rules = [
      { field: 'phone', visibleCodes: ['role-a'] },
      { field: 'phone', visibleCodes: ['role-b'], editableCodes: ['edit'] },
    ];
    expect(resolveFieldAccess('phone', rules, ['role-a']).visible).toBe(false);
    expect(resolveFieldAccess('phone', rules, ['role-a', 'role-b'])).toEqual({
      visible: true,
      editable: false,
    });
    expect(
      resolveFieldAccess('phone', rules, ['role-a', 'role-b', 'edit']).editable,
    ).toBe(true);
  });
});

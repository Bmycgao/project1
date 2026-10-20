/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { describe, expect, it, vi } from 'vitest';

import {
  createPageSchema,
  findPageSchema,
  listPageSchemaHistory,
  pageSchemaStore,
  rollbackPageSchema,
  separatePageSchemaDetail,
  updatePageSchema,
} from './mock-page-schema';

const state = vi.hoisted(() => ({
  templates: {
    basic: { kind: 'form', status: 1, usage: 'agreementModule' },
    table: { kind: 'table', status: 1, usage: 'agreementModule' },
    supplement: { kind: 'form', status: 1, usage: 'workflowSupplement' },
    disabled: { kind: 'form', status: 0, usage: 'agreementModule' },
  } as Record<string, { kind: string; status: number; usage: string }>,
  write: vi.fn(),
  disk: null as any,
}));
vi.mock('./mock-persist', () => ({
  readPersistJson: () => structuredClone(state.disk),
  writePersistJson: (...args: any[]) => {
    state.write(...args);
    state.disk = structuredClone(args[1]);
  },
}));
vi.mock('./mock-fc-schema', () => ({
  buildDefaultFcBindingsForModules: () => ({}),
  findFcSchema: (id: string) => state.templates[id],
}));

function detail() {
  return {
    schemaKind: 'detail' as const,
    name: 'agreement_detail',
    title: '协议办理详情',
    modules: [{ key: 'basic', enabled: true, widgetKind: 'form' as const }],
    fcBindings: { basic: 'basic' },
  };
}

describe('独立办理详情存储', () => {
  it('可以不带场景、列方案和列表按钮保存，不注入默认列表列和查询条件', () => {
    const saved = createPageSchema(detail());
    expect(saved.columns).toEqual([]);
    expect(saved.queryFields).toEqual([]);
    expect(saved.scene).toBeUndefined();
    expect(saved.buttons).toBeUndefined();
    expect(saved.columnTemplateId).toBeUndefined();
    expect(findPageSchema(saved.id)?.fcBindings).toEqual({ basic: 'basic' });
    expect(state.write).toHaveBeenCalled();
    updatePageSchema(saved.id, { title: '新的办理详情名称' });
    expect(findPageSchema(saved.id)?.title).toBe('新的办理详情名称');
    expect(findPageSchema(saved.id)?.modules).toEqual(detail().modules);
  });

  it('拒绝没有启用模块、失效模板、错误类型和补充表单的详情配置', () => {
    expect(() => createPageSchema({ ...detail(), modules: [] })).toThrow(
      '详情模块',
    );
    for (const id of ['missing', 'disabled', 'table', 'supplement']) {
      expect(() =>
        createPageSchema({ ...detail(), fcBindings: { basic: id } }),
      ).toThrow('类型匹配');
    }
  });

  it('拒绝无效更新且不覆盖原来的可用模板', () => {
    const saved = createPageSchema(detail());
    expect(() =>
      updatePageSchema(saved.id, { fcBindings: { basic: 'disabled' } }),
    ).toThrow(/./);
    expect(findPageSchema(saved.id)?.fcBindings).toEqual({ basic: 'basic' });
  });

  it('保留旧列表默认行为，阻止把已被引用的页面直接改用途', () => {
    const saved = createPageSchema({ name: 'legacy', title: '旧列表' });
    expect(saved.columns.length).toBeGreaterThan(0);
    expect(saved.queryFields.length).toBeGreaterThan(0);
    expect(() => updatePageSchema(saved.id, detail())).toThrow(
      '不能直接更改用途',
    );
    expect(findPageSchema(saved.id)?.schemaKind).toBe('entity');
  });
});

describe('列表关联与旧详情拆分', () => {
  function legacy() {
    return createPageSchema({
      ...detail(),
      schemaKind: 'scene',
      scene: 'entry',
      columnTemplateId: 'PS_AGREE_COLS',
      buttons: [{ code: 'edit', label: '编辑' }],
      columns: [],
      queryFields: [],
      moduleInner: { basic: { sections: [] } },
    });
  }

  it('新列表只保存详情引用，不重复保存模块与模板', () => {
    const target = createPageSchema(detail());
    const source = createPageSchema({
      ...legacy(),
      id: undefined,
      detailSchemaId: target.id,
    });
    expect(source.detailSchemaId).toBe(target.id);
    expect(source.modules).toEqual([]);
    expect(source.fcBindings).toEqual({});
    updatePageSchema(source.id, { title: '改列表名称' });
    expect(findPageSchema(target.id)?.title).toBe('协议办理详情');
    expect(() => updatePageSchema(source.id, { detailSchemaId: '' })).toThrow(
      '必须关联',
    );
  });

  it('拒绝缺失、停用或用途错误的详情，不覆盖已有引用', () => {
    const source = legacy();
    const disabled = createPageSchema({ ...detail(), status: 0 });
    for (const id of ['missing', disabled.id, source.id, 'PS_AGREE_COLS'])
      expect(() => updatePageSchema(source.id, { detailSchemaId: id })).toThrow(
        '办理详情',
      );
    expect(findPageSchema(source.id)?.detailSchemaId).toBeUndefined();
  });

  it('拆分保留列表身份、动作及列方案，历史可回滚，重复调用不新建', () => {
    const source = legacy();
    const before = structuredClone(source);
    const count = pageSchemaStore.length;
    const { list, detail: separated } = separatePageSchemaDetail(source.id);
    expect(list.id).toBe(before.id);
    expect(list.buttons).toEqual(before.buttons);
    expect(list.scene).toBe(before.scene);
    expect(list.columnTemplateId).toBe(before.columnTemplateId);
    expect(list.columnsInherited).toBe(true);
    expect(list.modules).toEqual([]);
    expect(separated.modules).toEqual(before.modules);
    expect(separated.fcBindings).toEqual(before.fcBindings);
    expect(separated.fieldRules).toEqual(
      findPageSchema('PS_AGREE_COLS')?.fieldRules,
    );
    expect(separatePageSchemaDetail(source.id).detail.id).toBe(separated.id);
    expect(pageSchemaStore.length).toBe(count + 1);
    expect(state.write).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      { atomic: true },
    );
    const version = listPageSchemaHistory(source.id)[0]!;
    expect(version.snapshot).toEqual(before);
    expect(rollbackPageSchema(source.id, version.versionId)?.modules).toEqual(
      before.modules,
    );
    expect(findPageSchema(source.id)?.detailSchemaId).toBeUndefined();
  });

  it('模板无效或落盘失败时不留下半份迁移数据', () => {
    const source = legacy();
    const bad = legacy();
    updatePageSchema(bad.id, { fcBindings: { basic: 'disabled' } });
    const count = pageSchemaStore.length;
    expect(() => separatePageSchemaDetail(bad.id)).toThrow('类型匹配');
    expect(pageSchemaStore.length).toBe(count);
    const history = listPageSchemaHistory(source.id);
    state.write.mockImplementationOnce(() => {
      throw new Error('磁盘写入失败');
    });
    expect(() => separatePageSchemaDetail(source.id)).toThrow('磁盘写入失败');
    expect(pageSchemaStore.length).toBe(count);
    expect(findPageSchema(source.id)?.detailSchemaId).toBeUndefined();
    expect(listPageSchemaHistory(source.id)).toEqual(history);
  });

  it('重启补全逻辑不会给已拆分的种子列表重新塞入内嵌模块', async () => {
    updatePageSchema('PS_AGREE_ENTRY', {
      modules: detail().modules,
      fcBindings: { basic: 'basic' },
      moduleInner: {},
    });
    const migrated = separatePageSchemaDetail('PS_AGREE_ENTRY');
    vi.resetModules();
    const reloaded = await import('./mock-page-schema');
    const list = reloaded.findPageSchema('PS_AGREE_ENTRY');
    expect(list?.detailSchemaId).toBe(migrated.detail.id);
    expect(list?.modules).toEqual([]);
    expect(list?.fcBindings).toEqual({});
    expect(list?.moduleInner).toEqual({});
    expect(reloaded.findPageSchema(migrated.detail.id)?.modules).toEqual(
      detail().modules,
    );
  });
});

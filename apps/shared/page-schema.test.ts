import { describe, expect, it } from 'vitest';

import { pageSchemaSaveIssue, pageSchemaSection } from './page-schema';

describe('页面用途与保存条件', () => {
  it('引用独立详情的业务列表无需再保存一份内嵌模块', () => {
    expect(
      pageSchemaSaveIssue({
        schemaKind: 'scene',
        scene: 'entry',
        columnTemplateId: 'cols',
        detailSchemaId: 'detail',
        buttons: ['edit'],
        modules: [],
      }),
    ).toBeUndefined();
  });
  it('独立办理详情只要求启用模块，不要求列表配置', () => {
    expect(
      pageSchemaSaveIssue({
        schemaKind: 'detail',
        modules: [{ enabled: true }],
      }),
    ).toBeUndefined();
    expect(
      pageSchemaSaveIssue({
        schemaKind: 'detail',
        modules: [{ enabled: false }],
      }),
    ).toContain('详情模块');
  });

  it('原有场景继续要求场景码、公共列方案和已实现动作', () => {
    const scene = {
      schemaKind: 'scene' as const,
      modules: [{ enabled: true }],
    };
    expect(pageSchemaSaveIssue(scene)).toContain('场景码');
    expect(pageSchemaSaveIssue({ ...scene, scene: 'entry' })).toContain(
      '公共列方案',
    );
    expect(
      pageSchemaSaveIssue({
        ...scene,
        scene: 'entry',
        columnTemplateId: 'cols',
      }),
    ).toContain('列表动作');
    expect(
      pageSchemaSaveIssue({
        ...scene,
        scene: 'entry',
        columnTemplateId: 'cols',
        buttons: ['create'],
      }),
    ).toBeUndefined();
  });

  it('列表和公共列方案仍然需要可见列', () => {
    for (const schemaKind of ['entity', 'template'] as const) {
      expect(pageSchemaSaveIssue({ schemaKind, columns: [] })).toContain(
        '可见',
      );
      expect(
        pageSchemaSaveIssue({ schemaKind, columns: [{ visible: true }] }),
      ).toBeUndefined();
    }
  });

  it('旧配置默认保留在列表入口，新详情和公共列方案单独展示', () => {
    expect(
      [undefined, 'entity', 'scene'].map((kind) =>
        pageSchemaSection(kind as 'scene' | undefined),
      ),
    ).toEqual(['list', 'list', 'list']);
    expect(pageSchemaSection('detail')).toBe('detail');
    expect(pageSchemaSection('template')).toBe('template');
  });
});

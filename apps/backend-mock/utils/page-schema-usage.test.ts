/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import type { WorkflowRecord } from '../../shared/workflow';

import { describe, expect, it } from 'vitest';

import { createDocument, createNode } from '../../shared/workflow';
import { collectPageSchemaUsage } from './page-schema-usage';

function flow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    ...createDocument(),
    id: 'wf',
    name: '协议办理',
    status: 'draft',
    version: 2,
    revision: 1,
    createdAt: '',
    updatedAt: '',
    createdBy: 'test',
    updatedBy: 'test',
    nodes: [createNode('task', 0, 0, 1)],
    ...overrides,
  } as WorkflowRecord;
}

describe('页面配置使用位置', () => {
  it('把列表对独立详情的实时引用纳入删除保护，并保留冻结快照的来源列表', () => {
    const record = flow({
      status: 'published',
      frozenForms: {
        node: {
          title: '办理',
          fields: [],
          detailView: {
            schemaId: 'detail',
            sourceSchemaId: 'list',
            title: '资料',
            modules: [],
          },
        },
      },
    });
    const usage = collectPageSchemaUsage(
      'detail',
      [
        {
          id: 'list',
          title: '录入列表',
          schemaKind: 'scene',
          detailSchemaId: 'detail',
        },
      ],
      [],
      [record],
    );
    expect(usage.liveCount).toBe(1);
    expect(usage.snapshotCount).toBe(1);
    expect(usage.references[0]?.type).toBe('listDetail');
    expect(collectPageSchemaUsage('list', [], [], [record]).snapshotCount).toBe(
      1,
    );
  });
  it('未挂菜单也能显示流程默认引用与节点覆盖', () => {
    const record = flow({ defaultDetailViewId: 'detail' });
    record.nodes[0]!.detailMode = 'override';
    record.nodes[0]!.detailViewId = 'detail';
    const usage = collectPageSchemaUsage('detail', [], [], [record]);
    expect(usage.liveCount).toBe(2);
    expect(usage.references.map((item) => item.type)).toEqual([
      'workflowDefault',
      'workflowNode',
    ]);
    expect(usage.snapshotCount).toBe(0);
  });

  it('按运行时兼容语义识别旧节点，忽略仅表单模式残留的页面编号', () => {
    const record = flow();
    const legacy = record.nodes[0]!;
    legacy.detailMode = 'inherit';
    legacy.form = { type: 'page', id: 'detail' };
    const formOnly = createNode('approve', 0, 0, 2);
    formOnly.detailMode = 'formOnly';
    formOnly.detailViewId = 'detail';
    record.nodes.push(formOnly);
    const usage = collectPageSchemaUsage('detail', [], [], [record]);
    expect(usage.liveCount).toBe(1);
    expect(usage.references[0]?.nodeId).toBe(legacy.id);
  });

  it('已发布和停用版本只统计实际冻结快照，不使用当前引用字段', () => {
    const records = (['published', 'disabled'] as const).map((status) =>
      flow({
        id: status,
        status,
        defaultDetailViewId: 'current',
        frozenForms: {
          node: {
            title: '办理表单',
            fields: [],
            detailView: { schemaId: 'frozen', title: '冻结页', modules: [] },
          },
        },
      }),
    );
    const usage = collectPageSchemaUsage('frozen', [], [], records);
    expect(usage.snapshotCount).toBe(2);
    expect(usage.liveCount).toBe(0);
    expect(
      collectPageSchemaUsage('current', [], [], records).references,
    ).toEqual([]);
  });

  it('递归查找菜单，并区分引用公共列方案的列表', () => {
    const usage = collectPageSchemaUsage(
      'cols',
      [
        {
          id: 'scene',
          title: '录入列表',
          schemaKind: 'scene',
          columnTemplateId: 'cols',
        },
      ],
      [
        {
          id: 'parent',
          type: 'catalog',
          children: [
            {
              id: 'menu',
              type: 'menu',
              meta: { schemaId: 'cols', title: '协议列表' },
            },
          ],
        },
      ],
      [],
    );
    expect(usage.liveCount).toBe(2);
    expect(usage.references.map((item) => item.type)).toEqual([
      'menu',
      'columnTemplate',
    ]);
    expect(collectPageSchemaUsage('unused', [], [], []).references).toEqual([]);
  });
});

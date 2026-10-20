/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import type { WorkflowOptionField, WorkflowOptions } from './model';

import { describe, expect, it } from 'vitest';

import {
  bindingSources,
  nodeConfigurationIssues,
  removeConfigurationIssues,
} from './configuration';
import { createDocument, createNode } from './model';

function field(
  key: string,
  type: WorkflowOptionField['type'] = 'text',
): WorkflowOptionField {
  return { key, type, label: key, group: '测试', actionable: type !== 'table' };
}
function setup() {
  const doc = createDocument();
  const entry = createNode('task', 0, 0, 1);
  const review = createNode('approve', 1, 0, 2);
  doc.nodes = [entry, review];
  entry.supplementFormId = 'entry';
  review.supplementFormId = 'review';
  const options: WorkflowOptions = {
    roles: [],
    users: [],
    departments: [],
    defaultDetailFields: [field('remark')],
    views: [
      {
        id: 'entry',
        type: 'form',
        name: '经办表单',
        fields: [field('result')],
      },
      {
        id: 'review',
        type: 'form',
        name: '审核表单',
        fields: [field('summary'), field('note')],
      },
      {
        id: 'page',
        type: 'page',
        name: '精简页',
        modules: [{ key: 'basic', label: '基础信息' }],
        fields: [field('remark')],
      },
    ],
  };
  review.fieldBindings = { summary: 'result' };
  return { doc, entry, review, options };
}

describe('workflow configuration dependencies', () => {
  it('exposes orphaned bindings even after the supplement is removed; diagnostics never mutate the draft', () => {
    const { doc, review, options } = setup();
    review.supplementFormId = '';
    const before = JSON.stringify(doc);
    const issues = nodeConfigurationIssues(doc, review, options);
    expect(issues).toEqual([
      expect.objectContaining({
        kind: 'fieldBinding',
        key: 'summary',
        reason: expect.stringContaining('目标字段'),
      }),
    ]);
    expect(JSON.stringify(doc)).toBe(before);
    removeConfigurationIssues(review, issues);
    expect(review.fieldBindings).toEqual({});
    expect(nodeConfigurationIssues(doc, review, options)).toEqual([]);
  });

  it('keeps compatible bindings after switching templates and removes only missing fields', () => {
    const { doc, review, options } = setup();
    review.fieldBindings!.deleted = 'result';
    review.supplementFormId = 'new-review';
    options.views.push({
      id: 'new-review',
      name: '新模板',
      type: 'form',
      fields: [field('summary', 'textarea')],
    });
    const issues = nodeConfigurationIssues(doc, review, options);
    expect(issues.map((issue) => issue.key)).toEqual(['deleted']);
    removeConfigurationIssues(review, issues);
    expect(review.fieldBindings).toEqual({ summary: 'result' });
  });

  it('finds downstream bindings invalidated by an upstream template deletion or type change', () => {
    const { doc, entry, review, options } = setup();
    entry.supplementFormId = '';
    expect(nodeConfigurationIssues(doc, review, options)[0]?.reason).toContain(
      '来源字段已失效',
    );
    entry.supplementFormId = 'entry';
    options.views[0]!.fields![0]!.type = 'number';
    expect(nodeConfigurationIssues(doc, review, options)[0]?.reason).toContain(
      '类型不一致',
    );
  });

  it('does not hide conflicting source definitions through deduplication', () => {
    const { doc, review, options } = setup();
    const another = createNode('task', 2, 0, 3);
    another.supplementFormId = 'conflict';
    doc.nodes.push(another);
    options.views.push({
      id: 'conflict',
      type: 'form',
      name: '不同类型',
      fields: [field('result', 'number')],
    });
    expect(
      bindingSources(doc, options).some((source) => source.key === 'result'),
    ).toBe(false);
    expect(nodeConfigurationIssues(doc, review, options)[0]?.reason).toContain(
      '不同表单中的类型不一致',
    );
  });

  it('preserves common module and field restrictions, surfacing only absent rules after a page switch', () => {
    const { doc, review, options } = setup();
    review.detailMode = 'override';
    review.detailViewId = 'page';
    review.moduleAccess = { basic: 'hidden', houses: 'readonly' };
    review.fieldAccess = {
      remark: 'readonly',
      summary: 'hidden',
      removed: 'readonly',
    };
    const issues = nodeConfigurationIssues(doc, review, options);
    expect(issues.map(({ kind, key }) => [kind, key])).toEqual([
      ['moduleAccess', 'houses'],
      ['fieldAccess', 'removed'],
    ]);
    removeConfigurationIssues(review, issues);
    expect(review.moduleAccess).toEqual({ basic: 'hidden' });
    expect(review.fieldAccess).toEqual({
      remark: 'readonly',
      summary: 'hidden',
    });
    expect(review.fieldBindings).toEqual({ summary: 'result' });
  });

  it('checks independent mode, legacy form bindings, and metadata refreshes', () => {
    const { doc, review, options } = setup();
    review.supplementFormId = '';
    review.detailMode = undefined;
    review.form = { type: 'form', id: 'review' };
    expect(nodeConfigurationIssues(doc, review, options)).toEqual([]);
    options.views = options.views.filter((view) => view.id !== 'review');
    expect(nodeConfigurationIssues(doc, review, options)[0]?.kind).toBe(
      'fieldBinding',
    );
    review.form = { type: 'page', id: '' };
    review.detailMode = 'formOnly';
    review.moduleAccess = { basic: 'hidden' };
    expect(
      nodeConfigurationIssues(doc, review, options).some(
        (issue) => issue.kind === 'moduleAccess',
      ),
    ).toBe(true);
  });

  it('cleans action dependencies without deleting valid actions or changing their order', () => {
    const { doc, review, options } = setup();
    review.dataActions = [
      { when: 'pass', kind: 'set', field: 'note', value: '通过' },
      { when: 'pass', kind: 'copy', field: 'summary', from: 'result' },
      { when: 'reject', kind: 'copy', field: 'note', from: 'deleted' },
      { when: 'arrive', kind: 'copy', field: 'note', from: 'result' },
    ];
    review.buttons = ['pass'];
    const issues = nodeConfigurationIssues(doc, review, options);
    expect(issues.map((issue) => issue.key)).toEqual(['1', '2']);
    expect(issues[1]!.reason).toContain('对应的按钮');
    removeConfigurationIssues(review, issues);
    expect(review.dataActions?.map((action) => action.when)).toEqual([
      'pass',
      'arrive',
    ]);
  });

  it('never clears another node when applying a selected node cleanup', () => {
    const { doc, entry, review, options } = setup();
    entry.fieldAccess = { removed: 'hidden' };
    review.fieldAccess = { removed: 'readonly' };
    removeConfigurationIssues(
      review,
      nodeConfigurationIssues(doc, entry, options),
    );
    expect(review.fieldAccess).toEqual({ removed: 'readonly' });
    expect(entry.fieldAccess).toEqual({ removed: 'hidden' });
  });
});

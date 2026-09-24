import { readdirSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDocument, createNode, newId } from '../../shared/workflow';
import { sampleGraph } from '../../web-ele/src/views/system/workflow/model';
import {
  getOrCreateAgreementDetail,
  saveAgreementDetailAll,
} from './mock-agreement-detail';
import { createAgreeListRow } from './mock-agreement-list';

const state = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = tmpdir();
  return {
    root,
    directory: mkdtempSync(join(root, 'vben-workflow-publication-')),
    forms: {} as Record<string, any>,
    pages: {} as Record<string, any>,
    extraActors: [] as {
      codes: string[];
      id: string;
      name: string;
      roleIds: string[];
    }[],
  };
});
vi.mock('./mock-persist', () => ({ DATA_DIR: state.directory }));
vi.mock('./mock-fc-schema', () => ({
  findFcSchema: (id: string) => state.forms[id],
}));
vi.mock('./mock-page-schema', () => ({
  findPageSchema: (id: string) => state.pages[id],
}));
vi.mock('./rbac-store', () => ({ roleStore: [{ id: 'review', status: 1 }] }));
vi.mock('./workflow-runtime-api', () => ({
  workflowActors: () => [actor, ...state.extraActors],
}));
import {
  actOnInstance,
  startInstance,
  workflowContext,
} from './workflow-engine';
import { freezeWorkflowForms } from './workflow-forms';
import { publicationCheck, publishChecked } from './workflow-publication';
import { getWorkflow, saveWorkflow } from './workflow-store';
const actor = {
  id: 'demo',
  name: '演示用户',
  roleIds: ['review'],
  codes: ['Workflow:Use'],
};
beforeEach(() => {
  state.forms = {};
  state.pages = {};
  state.extraActors.length = 0;
  for (const file of readdirSync(state.directory))
    rmSync(join(state.directory, file));
});
afterAll(() => {
  if (
    !resolve(state.directory).startsWith(
      `${resolve(state.root)}${sep}vben-workflow-publication-`,
    )
  )
    throw new Error('Unexpected test directory');
  rmSync(state.directory, { recursive: true });
});
function seedAgreement(amount = 1_200_000) {
  const row = createAgreeListRow({
    compensatee: '张某',
    houseAddress: '测试路1号',
  });
  const detail = getOrCreateAgreementDetail(row.agreementNo, row);
  saveAgreementDetailAll({
    ...detail,
    basic: { ...detail.basic, compensatee: '张某', amount },
    houses: (detail.houses || []).map((house, index) =>
      index === 0 ? { ...house, address: '测试路1号' } : house,
    ),
    signing: { ...detail.signing, houseAddress: '测试路1号' },
  });
  return row.agreementNo;
}
function document() {
  const doc = {
    ...createDocument(),
    code: 'WF_TEST',
    name: '审核测试',
    base: 'TEST',
    ...sampleGraph(),
  };
  for (const node of doc.nodes.filter((n) => n.type === 'approve'))
    node.assignee = { type: 'role', ids: ['review'], field: '' };
  return doc;
}
function withForm(rule: any[]) {
  const doc = document();
  doc.nodes[1]!.form = { type: 'form', id: 'test' };
  state.forms.test = { status: 1, rule };
  return doc;
}
describe('publication and frozen form validation', () => {
  it('publishes a checked snapshot and completes the high amount route including rejection', () => {
    const doc = document();
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
    const published = publishChecked(saved.id, saved.revision, 'demo');
    let context = startInstance(
      {
        definitionId: published.id,
        agreementNo: seedAgreement(1_200_000),
        title: '审核演示',
        requestId: newId('start'),
      },
      actor,
      [actor],
    );
    const perform = (action: 'pass' | 'reject' | 'submit', extra = {}) => {
      context = actOnInstance(
        context.instance.id,
        {
          taskId: context.task!.id,
          revision: context.instance.revision,
          requestId: newId('action'),
          action,
          ...extra,
        },
        actor,
        [actor],
      );
    };
    perform('submit');
    perform('reject', { opinion: '补充资料', targetNodeId: doc.nodes[1]!.id });
    perform('submit');
    perform('pass');
    expect(context.instance.currentNodeId).toBe(doc.nodes[4]!.id);
    perform('pass');
    perform('submit');
    perform('pass');
    expect(context.instance.status).toBe('completed');
  });
  it('rejects missing expression fields and mismatched actions at publication', () => {
    const doc = document();
    doc.edges.find((e) => e.condition)!.condition = 'missingAmount > 1';
    doc.nodes[1]!.buttons.push('pass');
    const saved = saveWorkflow(doc, 'demo');
    const messages = publicationCheck(saved.id)
      .issues.map((i) => i.message)
      .join(' ');
    expect(messages).toContain('未配置的字段');
    expect(messages).toContain('不匹配的按钮');
    expect(() => publishChecked(saved.id, saved.revision, 'demo')).toThrow(
      '发布检查未通过',
    );
    expect(getWorkflow(saved.id).status).toBe('draft');
  });
  it('freezes numeric and string bounds and validates them on the server', () => {
    const doc = withForm([
      {
        type: 'input',
        field: 'reason',
        title: '说明',
        validate: [{ required: true, type: 'string', min: 3, max: 10 }],
      },
      {
        type: 'inputNumber',
        field: 'quantity',
        validate: [{ type: 'number', min: 1, max: 10 }],
      },
    ]);
    const saved = saveWorkflow(doc, 'demo');
    const published = publishChecked(saved.id, saved.revision, 'demo');
    state.forms.test.rule[0].validate = [];
    expect(
      getWorkflow(saved.id).frozenForms![doc.nodes[1]!.id]!.fields.find(
        (f) => f.key === 'reason',
      )!.minLength,
    ).toBe(3);
    const c = startInstance(
      {
        definitionId: published.id,
        agreementNo: seedAgreement(5),
        title: '校验',
        requestId: 'start',
      },
      actor,
      [actor],
    );
    expect(() =>
      actOnInstance(
        c.instance.id,
        {
          taskId: c.task!.id,
          revision: c.instance.revision,
          requestId: 'bad',
          action: 'submit',
          data: { reason: '短', quantity: 2 },
        },
        actor,
        [actor],
      ),
    ).toThrow('长度');
    expect(workflowContext(c.instance.id, actor).instance.revision).toBe(
      c.instance.revision,
    );
  });
  it('blocks scripts, custom validation and incompatible core field types', () => {
    const doc = withForm([
      {
        type: 'input',
        field: 'BuChangJinE',
        on: { change: 'script' },
        validate: [{ pattern: '^a' }],
      },
    ]);
    const messages = freezeWorkflowForms(doc)
      .issues.map((i) => i.message)
      .join(' ');
    expect(messages).toContain('脚本');
    expect(messages).toContain('自定义校验');
    expect(messages).toContain('控件类型不一致');
  });
  it('preserves core numeric constraints when templates redefine the field', () => {
    const doc = withForm([{ type: 'inputNumber', field: 'BuChangJinE' }]);
    expect(
      freezeWorkflowForms(doc).forms[doc.nodes[1]!.id]!.fields.find(
        (f) => f.key === 'BuChangJinE',
      )!.min,
    ).toBe(0);
  });
  it('combines module, page and inherited permissions rather than replacing them', () => {
    const doc = document();
    doc.nodes[1]!.form = { type: 'page', id: 'page' };
    state.pages.page = {
      status: 1,
      modules: [{ key: 'basic', enabled: true, authCode: 'Module:Read' }],
      fcRules: {
        basic: [{ type: 'input', field: 'secret', value: 'hidden default' }],
      },
      fieldRules: [{ field: 'secret', visibleCodes: ['Field:Read'] }],
      columnTemplateId: 'template',
    };
    state.pages.template = {
      fieldRules: [{ field: 'secret', editableCodes: ['Field:Edit'] }],
    };
    const saved = saveWorkflow(doc, 'demo');
    const published = publishChecked(saved.id, saved.revision, 'demo');
    const c = startInstance(
      {
        definitionId: published.id,
        agreementNo: seedAgreement(5),
        title: '权限',
        requestId: 'start',
      },
      actor,
      [actor],
    );
    expect(JSON.stringify(c)).not.toContain('hidden default');
    expect(c.instance.data).not.toHaveProperty('secret');
    const reader = {
      ...actor,
      codes: [...actor.codes, 'Module:Read', 'Field:Read'],
    };
    expect(
      workflowContext(c.instance.id, reader).form.fields.find(
        (f) => f.key === 'secret',
      )!.readonly,
    ).toBe(true);
  });
  it('blocks page module rules that the normalized renderer cannot preserve', () => {
    const doc = document();
    doc.nodes[1]!.form = { type: 'page', id: 'page' };
    state.pages.page = {
      status: 1,
      modules: [{ key: 'basic', enabled: true }],
      moduleInner: { basic: { sections: [{}] } },
      fcRules: { basic: [{ type: 'input', field: 'reason' }] },
    };
    expect(
      freezeWorkflowForms(doc).issues.some((i) =>
        i.message.includes('独立模块内部配置'),
      ),
    ).toBe(true);
  });
  it('allows recall and countersign settings to pass publication', () => {
    const doc = document();
    doc.nodes.find((n) => n.type === 'task')!.allowRecall = true;
    doc.nodes.find((n) => n.type === 'task')!.allowTransfer = true;
    doc.nodes.find((n) => n.type === 'task')!.transferReturn = true;
    doc.nodes.find((n) => n.name === '科长审核')!.approveMode = 'all';
    expect(publicationCheck(saveWorkflow(doc, 'demo').id).issues).toEqual([]);
    const sequential = document();
    sequential.code = 'WF_TEST_SEQUENTIAL';
    sequential.nodes.find((n) => n.type === 'task')!.allowRecall = true;
    sequential.nodes.find((n) => n.name === '科长审核')!.approveMode =
      'sequential';
    const sequentialSaved = saveWorkflow(sequential, 'demo');
    expect(publicationCheck(sequentialSaved.id).issues).toEqual([]);
    const ratio = document();
    ratio.code = 'WF_TEST_RATIO';
    const chief = ratio.nodes.find((n) => n.name === '科长审核')!;
    chief.approveMode = 'ratio';
    chief.approveRatio = 50;
    expect(publicationCheck(saveWorkflow(ratio, 'demo').id).issues).toEqual([]);
    chief.approveRatio = undefined;
    const missing = saveWorkflow(
      {
        ...ratio,
        code: 'WF_TEST_RATIO_BAD',
        revision: undefined,
      } as typeof ratio,
      'demo',
    );
    expect(
      publicationCheck(missing.id).issues.some((i) =>
        i.message.includes('百分比'),
      ),
    ).toBe(true);
  });
  it('accepts catalog person fields and rejects an unknown assignee field', () => {
    const doc = document();
    doc.code = 'WF_TEST_FIELD';
    doc.nodes.find((n) => n.name === '科长审核')!.assignee = {
      type: 'field',
      ids: [],
      field: 'handlerUserId',
    };
    expect(publicationCheck(saveWorkflow(doc, 'demo').id).issues).toEqual([]);
    const bad = document();
    bad.code = 'WF_TEST_FIELD_BAD';
    bad.nodes.find((n) => n.name === '科长审核')!.assignee = {
      type: 'field',
      ids: [],
      field: 'HandlerUserID',
    };
    expect(
      publicationCheck(saveWorkflow(bad, 'demo').id).issues.some((issue) =>
        issue.message.includes('经办人或协办人'),
      ),
    ).toBe(true);
  });
  it('requires allowTransfer before transfer return can be published', () => {
    const doc = document();
    doc.code = 'WF_TEST_RETURN';
    doc.nodes.find((n) => n.type === 'task')!.transferReturn = true;
    const saved = saveWorkflow(doc, 'demo');
    expect(
      publicationCheck(saved.id).issues.some((i) =>
        i.message.includes('转办转回'),
      ),
    ).toBe(true);
  });
  it('rejects warn hours that are not shorter than the node sla', () => {
    const doc = document();
    doc.nodes.find((n) => n.type === 'task')!.sla = {
      durationHours: 8,
      warnHours: 8,
      overtime: 'remind',
    };
    const saved = saveWorkflow(doc, 'demo');
    expect(
      publicationCheck(saved.id).issues.some((i) =>
        i.message.includes('临期提醒'),
      ),
    ).toBe(true);
  });
  it('freezes catalog extras referenced by fieldAccess without a bound form', () => {
    const doc = document();
    doc.nodes.find((n) => n.name === '科长审核')!.fieldAccess = {
      legalOpinion: 'edit',
    };
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
    const published = publishChecked(saved.id, saved.revision, 'demo');
    const form =
      published.frozenForms![
        published.nodes.find((n) => n.name === '科长审核')!.id
      ];
    expect(form?.fields.some((f) => f.key === 'legalOpinion')).toBe(true);
  });
  it('publishes data actions that assign or copy existing fields', () => {
    const doc = document();
    const fill = doc.nodes.find((n) => n.type === 'task')!;
    fill.dataActions = [
      { when: 'arrive', kind: 'set', field: 'acceptOpinion', value: '待填报' },
      { when: 'submit', kind: 'copy', field: 'remark', from: 'houseAddress' },
    ];
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
  });
  it('blocks data actions that miss fields or use the wrong button timing', () => {
    const missing = document();
    missing.nodes.find((n) => n.type === 'task')!.dataActions = [
      { when: 'arrive', kind: 'set', field: '', value: 'x' },
    ];
    const missingSaved = saveWorkflow(missing, 'demo');
    expect(
      publicationCheck(missingSaved.id)
        .issues.map((i) => i.message)
        .join(' '),
    ).toContain('请填写数据动作目标字段');
    const wrong = document();
    wrong.code = 'WF_TEST_ACTION_SAVE';
    const review = wrong.nodes.find((n) => n.name === '科长审核')!;
    review.dataActions = [
      { when: 'save', kind: 'set', field: 'legalOpinion', value: 'x' },
    ];
    const wrongSaved = saveWorkflow(wrong, 'demo');
    expect(
      publicationCheck(wrongSaved.id)
        .issues.map((i) => i.message)
        .join(' '),
    ).toContain('数据动作时机对应的按钮未配置');
  });
  it('skips freezing cc nodes and still publishes with valid recipients', () => {
    const doc = document();
    const task = doc.nodes.find((n) => n.type === 'task')!;
    const review = doc.nodes.find((n) => n.name === '科长审核')!;
    const cc = createNode('cc', 475, 210, 20);
    cc.name = '抄送法务';
    cc.assignee = { type: 'initiator', ids: [], field: '' };
    const pass = doc.edges.find(
      (e) =>
        e.source === task.id && e.target === review.id && e.type === 'pass',
    )!;
    pass.target = cc.id;
    doc.edges.push({
      id: newId('edge'),
      source: cc.id,
      target: review.id,
      type: 'pass',
      label: '通过',
      condition: '',
      isDefault: false,
    });
    doc.nodes.push(cc);
    expect(freezeWorkflowForms(doc).forms[cc.id]).toBeUndefined();
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
  });
  it('blocks cc nodes that still have action buttons or invalid people', () => {
    const doc = document();
    const task = doc.nodes.find((n) => n.type === 'task')!;
    const review = doc.nodes.find((n) => n.name === '科长审核')!;
    const cc = createNode('cc', 475, 210, 20);
    cc.name = '抄送法务';
    cc.buttons = ['pass'];
    cc.assignee = { type: 'user', ids: ['missing-user'], field: '' };
    const pass = doc.edges.find(
      (e) =>
        e.source === task.id && e.target === review.id && e.type === 'pass',
    )!;
    pass.target = cc.id;
    doc.edges.push({
      id: newId('edge'),
      source: cc.id,
      target: review.id,
      type: 'pass',
      label: '通过',
      condition: '',
      isDefault: false,
    });
    doc.nodes.push(cc);
    const saved = saveWorkflow(doc, 'demo');
    const messages = publicationCheck(saved.id)
      .issues.map((i) => i.message)
      .join(' ');
    expect(messages).toContain('办理按钮');
    expect(messages).toContain('抄送');
  });
  it('publishes a parent that binds a published subflow in the same base', () => {
    const child = document();
    child.code = 'FL_CHILD_PUB';
    child.name = '子流程发布';
    const childSaved = saveWorkflow(child, 'demo');
    expect(publicationCheck(childSaved.id).issues).toEqual([]);
    publishChecked(childSaved.id, childSaved.revision, 'demo');
    const parent = document();
    parent.code = 'FL_PARENT_PUB';
    const task = parent.nodes.find((n) => n.type === 'task')!;
    const review = parent.nodes.find((n) => n.name === '科长审核')!;
    const sub = createNode('subflow', 475, 210, 20);
    sub.name = '调用子流程';
    sub.subflowCode = 'FL_CHILD_PUB';
    const pass = parent.edges.find(
      (e) =>
        e.source === task.id && e.target === review.id && e.type === 'pass',
    )!;
    pass.target = sub.id;
    parent.edges.push({
      id: newId('edge'),
      source: sub.id,
      target: review.id,
      type: 'pass',
      label: '通过',
      condition: '',
      isDefault: false,
    });
    parent.nodes.push(sub);
    const saved = saveWorkflow(parent, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
  });
  it('blocks a subflow that points to an unpublished or same-code flow', () => {
    const doc = document();
    const task = doc.nodes.find((n) => n.type === 'task')!;
    const review = doc.nodes.find((n) => n.name === '科长审核')!;
    const sub = createNode('subflow', 475, 210, 20);
    sub.name = '调用子流程';
    sub.subflowCode = 'MISSING_FLOW';
    const pass = doc.edges.find(
      (e) =>
        e.source === task.id && e.target === review.id && e.type === 'pass',
    )!;
    pass.target = sub.id;
    doc.edges.push({
      id: newId('edge'),
      source: sub.id,
      target: review.id,
      type: 'pass',
      label: '通过',
      condition: '',
      isDefault: false,
    });
    doc.nodes.push(sub);
    const saved = saveWorkflow(doc, 'demo');
    const messages = publicationCheck(saved.id)
      .issues.map((i) => i.message)
      .join(' ');
    expect(messages).toContain('未发布');
  });
  it('publishes department-leader assignees when the org mapping is valid', () => {
    state.extraActors.push({
      id: '3',
      name: '研发负责人',
      roleIds: ['R_ENTRY'],
      codes: ['Workflow:Use'],
    });
    const doc = document();
    const review = doc.nodes.find((n) => n.name === '科长审核')!;
    review.assignee = { type: 'departmentLeader', ids: ['D1002'], field: '' };
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
  });
  it('blocks unknown or disabled departments and leaders without handle permission', () => {
    const unknown = document();
    unknown.code = 'WF_TEST_DEPT_UNKNOWN';
    unknown.nodes.find((n) => n.name === '科长审核')!.assignee = {
      type: 'departmentLeader',
      ids: ['D9999'],
      field: '',
    };
    const unknownSaved = saveWorkflow(unknown, 'demo');
    expect(
      publicationCheck(unknownSaved.id)
        .issues.map((i) => i.message)
        .join(' '),
    ).toContain('指定部门已失效');
    const disabled = document();
    disabled.code = 'WF_TEST_DEPT_DISABLED';
    disabled.nodes.find((n) => n.name === '科长审核')!.assignee = {
      type: 'departmentLeader',
      ids: ['D1010'],
      field: '',
    };
    const disabledSaved = saveWorkflow(disabled, 'demo');
    expect(
      publicationCheck(disabledSaved.id)
        .issues.map((i) => i.message)
        .join(' '),
    ).toContain('指定部门已失效');
    state.extraActors.push({
      id: '3',
      name: '研发负责人',
      roleIds: ['R_ENTRY'],
      codes: [],
    });
    const noPerm = document();
    noPerm.code = 'WF_TEST_DEPT_NOPERM';
    noPerm.nodes.find((n) => n.name === '科长审核')!.assignee = {
      type: 'departmentLeader',
      ids: ['D1002'],
      field: '',
    };
    const noPermSaved = saveWorkflow(noPerm, 'demo');
    expect(
      publicationCheck(noPermSaved.id)
        .issues.map((i) => i.message)
        .join(' '),
    ).toContain('没有具备流程办理权限');
  });
});

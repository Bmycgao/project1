/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
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
import {
  actOnInstance,
  startInstance,
  workflowContext,
} from './workflow-engine';
import { freezeWorkflowForms } from './workflow-forms';
import { publicationCheck, publishChecked } from './workflow-publication';
import { getWorkflow, saveWorkflow } from './workflow-store';

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
  fcSchemaUsage: (schema: { usage?: string }) => schema.usage,
}));
vi.mock('./mock-page-schema', () => ({
  findPageSchema: (id: string) => state.pages[id],
}));
vi.mock('./rbac-store', () => ({ roleStore: [{ id: 'review', status: 1 }] }));
vi.mock('./workflow-runtime-api', () => ({
  workflowActors: () => [actor, ...state.extraActors],
}));

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
    houses: [
      { id: 'test-house', address: '测试路1号', certNo: '', propertyType: '' },
    ],
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
  it('freezes full node rules and round-trips single time and typed transfer keys with server permissions', () => {
    const doc = withForm([
      {
        type: 'timePicker',
        field: 'visitTime',
        title: '上门时间',
        $required: true,
        col: { span: 12 },
      },
      {
        type: 'elTransfer',
        field: 'materials',
        title: '核查材料',
        $required: true,
        props: {
          data: [
            { key: 1, label: '原件' },
            { key: '2', label: '复印件' },
          ],
        },
      },
      {
        type: 'input',
        field: 'secretNote',
        title: '内部备注',
        value: 'secret-default',
        hidden: true,
      },
    ]);
    doc.nodes[2]!.supplementFormId = 'test';
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
    const published = publishChecked(saved.id, saved.revision, 'demo');
    const snapshot = published.frozenForms![doc.nodes[1]!.id]!.supplement!;
    expect(snapshot.rules[0]!.col.span).toBe(12);
    state.forms.test.rule = [];
    let context = startInstance(
      {
        definitionId: published.id,
        agreementNo: seedAgreement(5),
        title: '新控件验收',
        requestId: 'start',
      },
      actor,
      [actor],
    );
    expect(JSON.stringify(context)).not.toContain('secret-default');
    expect(context.form.supplement!.rules.map((rule) => rule.field)).toEqual([
      'visitTime',
      'materials',
    ]);
    expect(context.form.supplement!.rules[0]!.props.valueFormat).toBe(
      'HH:mm:ss',
    );
    function act(
      action: 'pass' | 'save' | 'submit',
      data: Record<string, unknown>,
    ) {
      return actOnInstance(
        context.instance.id,
        {
          taskId: context.task!.id,
          revision: context.instance.revision,
          requestId: newId('action'),
          action,
          data,
        },
        actor,
        [actor],
      );
    }
    // Saving an incomplete draft is allowed; submitting it is not.
    context = act('save', { visitTime: null, materials: [] });
    expect(() =>
      act('submit', { visitTime: '09:30:00', materials: [] }),
    ).toThrow('候选项');
    expect(() => act('save', { visitTime: '25:30:00' })).toThrow('时间格式');
    expect(() => act('save', { materials: ['1'] })).toThrow('候选项');
    expect(() => act('save', { materials: [1, 1] })).toThrow('候选项');
    expect(workflowContext(context.instance.id, actor).instance.revision).toBe(
      context.instance.revision,
    );
    context = act('save', { visitTime: '09:30:00', materials: [1, '2'] });
    context = workflowContext(context.instance.id, actor);
    expect(context.instance.data.visitTime).toBe('09:30:00');
    expect(context.instance.data.materials).toEqual([1, '2']);
    context = act('submit', {});
    expect(context.instance.currentNodeId).toBe(doc.nodes[2]!.id);
    expect(
      context.form.supplement!.rules.every((rule) => rule.props.disabled),
    ).toBe(true);
    expect(() => act('pass', { visitTime: '10:00:00' })).toThrow('不可修改');
    expect(
      getWorkflow(published.id).frozenForms![doc.nodes[1]!.id]!.supplement,
    ).toEqual(snapshot);
  });

  it.each([
    { type: 'timePicker', field: 'time', props: { isRange: true } },
    { type: 'timePicker', field: 'time', value: '2026-10-19T12:00:00.000Z' },
    {
      type: 'elTransfer',
      field: 'items',
      props: { data: [{ key: 1 }, { key: 1 }] },
    },
    {
      type: 'elTransfer',
      field: 'items',
      props: { data: [{ key: 1 }] },
      value: ['1'],
    },
    { type: 'upload', field: 'files' },
    {
      type: 'input',
      field: 'code',
      props: { formatter: '[[FORM-CREATE-PREFIX-function(){}]]' },
    },
  ])(
    'blocks unsupported configurations before publishing: $type $field',
    (rule) => {
      const saved = saveWorkflow(withForm([rule]), 'demo');
      expect(publicationCheck(saved.id).issues.length).toBeGreaterThan(0);
      expect(() => publishChecked(saved.id, saved.revision, 'demo')).toThrow(
        '发布检查未通过',
      );
    },
  );

  it('流程草稿仍引用旧列表时，发布会冻结关联详情并记录来源，后续修改不影响快照', () => {
    const doc = document();
    doc.defaultDetailViewId = 'source-list';
    state.pages['source-list'] = {
      id: 'source-list',
      title: '录入列表',
      schemaKind: 'scene',
      status: 1,
      detailSchemaId: 'linked-detail',
      modules: [],
    };
    state.pages['linked-detail'] = {
      id: 'linked-detail',
      title: '关联详情',
      schemaKind: 'detail',
      status: 1,
      modules: [{ key: 'basic', enabled: true, widgetKind: 'form' }],
      fcRules: {
        basic: [{ type: 'input', field: 'compensatee', title: '姓名' }],
      },
    };
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
    const published = publishChecked(saved.id, saved.revision, 'demo');
    const task = doc.nodes.find((node) => node.type === 'task')!;
    const view = published.frozenForms?.[task.id]?.detailView;
    expect(view?.schemaId).toBe('linked-detail');
    expect(view?.sourceSchemaId).toBe('source-list');
    state.pages['linked-detail'].modules = [];
    expect(
      getWorkflow(published.id).frozenForms?.[task.id]?.detailView,
    ).toEqual(view);
    state.pages['linked-detail'].status = 0;
    const next = {
      ...document(),
      code: 'WF_BAD_LINK',
      defaultDetailViewId: 'source-list',
    };
    const invalid = saveWorkflow(next, 'demo');
    expect(
      publicationCheck(invalid.id).issues.some((issue) =>
        issue.message.includes('不存在或已停用'),
      ),
    ).toBe(true);
  });
  it('独立办理详情可以作为流程默认页发布，并冻结所绑定的表单模板', () => {
    const doc = document();
    doc.defaultDetailViewId = 'standalone-detail';
    state.forms.detailBasic = {
      kind: 'form',
      usage: 'agreementModule',
      status: 1,
      rule: [{ type: 'input', field: 'compensatee', title: '被补偿人' }],
    };
    state.pages['standalone-detail'] = {
      id: 'standalone-detail',
      name: 'standalone',
      title: '独立办理详情',
      schemaKind: 'detail',
      status: 1,
      columns: [],
      queryFields: [],
      modules: [{ key: 'basic', enabled: true, widgetKind: 'form' }],
      fcBindings: { basic: 'detailBasic' },
    };
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
    const published = publishChecked(saved.id, saved.revision, 'demo');
    const task = doc.nodes.find((node) => node.type === 'task')!;
    const frozen = published.frozenForms?.[task.id]?.detailView;
    expect(frozen?.schemaId).toBe('standalone-detail');
    expect(frozen?.modules[0]?.fields[0]?.label).toBe('被补偿人');
    state.pages['standalone-detail'].modules = [];
    state.forms.detailBasic.rule[0].title = '后来修改的字段';
    expect(
      getWorkflow(published.id).frozenForms?.[task.id]?.detailView,
    ).toEqual(frozen);
  });
  it('accepts a custom button resource bound to the required submit action', () => {
    const doc = document();
    doc.buttonCatalog = [
      { code: 'SUBMIT_REVIEW', action: 'submit', label: '提交复核' },
    ];
    const task = doc.nodes.find((node) => node.type === 'task')!;
    task.buttons = task.buttons.map((code) =>
      code === 'submit' ? 'SUBMIT_REVIEW' : code,
    );
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
    const published = publishChecked(saved.id, saved.revision, 'demo');
    expect(published.buttonCatalog?.[0]?.code).toBe('SUBMIT_REVIEW');
  });
  it('rejects button conditions that reference fields outside the published form', () => {
    const doc = document();
    doc.buttonCatalog = [
      {
        action: 'submit',
        label: '提交审核',
        visibleWhen: 'UnknownSecretField == true',
      },
    ];
    const saved = saveWorkflow(doc, 'demo');
    expect(
      publicationCheck(saved.id)
        .issues.map((issue) => issue.message)
        .join(' '),
    ).toContain('条件引用了未配置的字段');
  });
  it('rejects invalid or unusable role policies before publication', () => {
    const doc = document();
    doc.startRoleIds = ['missing'];
    const task = doc.nodes.find((node) => node.type === 'task')!;
    task.handleRoleIds = ['missing'];
    task.buttonDeniedRoleIds = { submit: ['review'] };
    const saved = saveWorkflow(doc, 'demo');
    const messages = publicationCheck(saved.id)
      .issues.map((issue) => issue.message)
      .join(' ');
    expect(messages).toContain('发起权限配置中存在失效角色');
    expect(messages).toContain('办理或按钮限制中存在失效角色');
    expect(messages).toContain('提交或通过按钮没有可操作的有效用户');
  });
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
  it('freezes page modules and applies different module access at each node', () => {
    const doc = document();
    const moduleActor = {
      ...actor,
      codes: [...actor.codes, 'Agree:Module:basic', 'Agree:Module:houses'],
    };
    const task = doc.nodes[1]!;
    const approval = doc.nodes[2]!;
    task.detailMode = 'override';
    task.detailViewId = 'page';
    approval.detailMode = 'override';
    approval.detailViewId = 'page';
    approval.moduleAccess = { basic: 'readonly', houses: 'hidden' };
    state.pages.page = {
      id: 'page',
      title: '协议详情',
      status: 1,
      modules: [
        { key: 'basic', enabled: true, order: 10, region: 'content' },
        { key: 'houses', enabled: true, order: 20, region: 'tabs' },
      ],
      fcRules: {
        basic: [
          { type: 'input', field: 'compensatee', title: '被征收人' },
          { type: 'inputNumber', field: 'amount', title: '协议金额' },
        ],
        houses: [
          {
            type: 'tableForm',
            field: 'houses',
            title: '房屋信息',
            props: {
              columns: [
                {
                  rule: [
                    { type: 'input', field: 'address', title: '房屋地址' },
                  ],
                },
              ],
            },
          },
        ],
      },
    };
    const saved = saveWorkflow(doc, 'demo');
    const published = publishChecked(saved.id, saved.revision, 'demo');
    // 发布后修改共用页面，不得影响已经发布的流程版本。
    state.pages.page.modules = [];
    let context = startInstance(
      {
        definitionId: published.id,
        agreementNo: seedAgreement(),
        title: '节点资料权限',
        requestId: newId('start'),
      },
      moduleActor,
      [moduleActor],
    );
    expect(context.detailView?.modules.map((module) => module.key)).toEqual([
      'basic',
      'houses',
    ]);
    context = actOnInstance(
      context.instance.id,
      {
        taskId: context.task!.id,
        revision: context.instance.revision,
        requestId: newId('action'),
        action: 'submit',
      },
      moduleActor,
      [moduleActor],
    );
    expect(context.viewNodeId).toBe(approval.id);
    expect(context.detailView?.modules.map((module) => module.key)).toEqual([
      'basic',
    ]);
    expect(context.detailView?.modules[0]?.readonly).toBe(true);
    expect(context.agreement).not.toHaveProperty('houses');
    expect(() =>
      actOnInstance(
        context.instance.id,
        {
          taskId: context.task!.id,
          revision: context.instance.revision,
          requestId: newId('action'),
          action: 'pass',
          agreement: { houses: [] },
        },
        moduleActor,
        [moduleActor],
      ),
    ).toThrow('不可编辑');
  });
  it('inherits the workflow detail view and freezes a separate node supplement form', () => {
    const doc = document();
    const task = doc.nodes[1]!;
    doc.defaultDetailViewId = 'page';
    task.supplementFormId = 'supplement';
    state.pages.page = {
      id: 'page',
      title: '流程默认详情',
      status: 1,
      modules: [{ key: 'basic', enabled: true, order: 10 }],
      fcRules: {
        basic: [{ type: 'input', field: 'compensatee', title: '被征收人' }],
      },
    };
    state.forms.supplement = {
      status: 1,
      kind: 'form',
      rule: [{ type: 'textarea', field: 'reviewNote', title: '补充说明' }],
    };
    const frozen = freezeWorkflowForms(doc);
    expect(frozen.issues).toEqual([]);
    expect(frozen.forms[task.id]?.detailView?.schemaId).toBe('page');
    expect(
      frozen.forms[task.id]?.fields.some((field) => field.key === 'reviewNote'),
    ).toBe(true);
    expect(frozen.forms[task.id]?.presentation).toBe('detail');
  });
  it('supports an explicit form-only node without exposing agreement editing', () => {
    const doc = document();
    const task = doc.nodes[1]!;
    task.detailMode = 'formOnly';
    task.supplementFormId = 'standalone';
    state.forms.standalone = {
      status: 1,
      kind: 'form',
      rule: [
        {
          type: 'input',
          field: 'standaloneNote',
          title: '独立办理说明',
          validate: [{ required: true, type: 'string' }],
        },
      ],
    };
    const saved = saveWorkflow(doc, 'demo');
    const published = publishChecked(saved.id, saved.revision, 'demo');
    const agreementNo = seedAgreement(5);
    const context = startInstance(
      {
        definitionId: published.id,
        agreementNo,
        title: '仅表单办理',
        requestId: 'start-form-only',
      },
      actor,
      [actor],
    );
    expect(context.form.presentation).toBe('formOnly');
    expect(context.detailView).toBeUndefined();
    expect(context.agreement).toBeUndefined();
    expect(
      context.form.fields.some((field) => field.key === 'agreementNo'),
    ).toBe(false);
    expect(context.agreementEditable).toBe(false);
    expect(() =>
      actOnInstance(
        context.instance.id,
        {
          taskId: context.task!.id,
          revision: context.instance.revision,
          requestId: 'form-only-agreement-patch',
          action: 'save',
          data: { standaloneNote: '可以保存的节点字段' },
          agreement: { basic: { compensatee: '越权修改' } },
        },
        actor,
        [actor],
      ),
    ).toThrow('仅允许提交独立办理表单');
    const savedContext = actOnInstance(
      context.instance.id,
      {
        taskId: context.task!.id,
        revision: context.instance.revision,
        requestId: 'form-only-save',
        action: 'save',
        data: { standaloneNote: '可以保存的节点字段' },
      },
      actor,
      [actor],
    );
    expect(savedContext.instance.data.standaloneNote).toBe(
      '可以保存的节点字段',
    );
    expect(
      (getOrCreateAgreementDetail(agreementNo).flowFields || {}).standaloneNote,
    ).toBe('可以保存的节点字段');
  });
  it('shows a saved field in a different read-only node form without exposing the source form', () => {
    const doc = document();
    const entry = doc.nodes.find((node) => node.type === 'task')!;
    const review = doc.nodes.find((node) => node.name === '科长审核')!;
    entry.detailMode = 'formOnly';
    entry.supplementFormId = 'entry-result';
    review.detailMode = 'formOnly';
    review.supplementFormId = 'review-result';
    review.fieldBindings = { displayedResult: 'entryResult' };
    review.fieldAccess = { displayedResult: 'edit' };
    state.forms['entry-result'] = {
      status: 1,
      usage: 'workflowSupplement',
      kind: 'form',
      rule: [{ type: 'input', field: 'entryResult', title: '经办结果' }],
    };
    state.forms['review-result'] = {
      status: 1,
      usage: 'workflowSupplement',
      kind: 'form',
      rule: [{ type: 'input', field: 'displayedResult', title: '结果摘要' }],
    };
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
    const published = publishChecked(saved.id, saved.revision, 'demo');
    let context = startInstance(
      {
        definitionId: published.id,
        agreementNo: seedAgreement(5),
        title: '结果交接',
        requestId: newId('start'),
      },
      actor,
      [actor],
    );
    context = actOnInstance(
      context.instance.id,
      {
        taskId: context.task!.id,
        revision: context.instance.revision,
        requestId: newId('action'),
        action: 'submit',
        data: { entryResult: '资料核对通过' },
      },
      actor,
      [actor],
    );
    expect(context.form.presentation).toBe('formOnly');
    expect(context.agreement).toBeUndefined();
    expect(context.instance.data).toEqual({ displayedResult: '资料核对通过' });
    expect(
      context.form.fields.find((field) => field.key === 'displayedResult')
        ?.readonly,
    ).toBe(true);
    expect(() =>
      actOnInstance(
        context.instance.id,
        {
          taskId: context.task!.id,
          revision: context.instance.revision,
          requestId: newId('action'),
          action: 'pass',
          data: { displayedResult: '篡改' },
        },
        actor,
        [actor],
      ),
    ).toThrow('不可修改');
  });
  it('blocks orphaned bindings until explicitly removed, then publishes without changing other node rules', () => {
    const doc = document();
    const entry = doc.nodes.find((node) => node.type === 'task')!;
    const review = doc.nodes.find((node) => node.name === '科长审核')!;
    entry.fieldAccess = { remark: 'readonly' };
    review.fieldBindings = { removedSummary: 'compensatee' };
    review.fieldAccess = { remark: 'hidden' };
    // The form has already been cleared, as in an older saved draft.
    review.supplementFormId = '';
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: review.id,
          message: expect.stringContaining(
            '目标必须是当前节点补充表单的普通字段',
          ),
        }),
      ]),
    );
    expect(() => publishChecked(saved.id, saved.revision, 'demo')).toThrow(/./);
    delete review.fieldBindings.removedSummary;
    const fixed = saveWorkflow(doc, 'demo', saved.id, saved.revision);
    expect(publicationCheck(fixed.id).issues).toEqual([]);
    const published = publishChecked(fixed.id, fixed.revision, 'demo');
    expect(
      published.nodes.find((node) => node.id === entry.id)?.fieldAccess,
    ).toEqual({ remark: 'readonly' });
    expect(
      published.nodes.find((node) => node.id === review.id)?.fieldAccess,
    ).toEqual({ remark: 'hidden' });
  });
  it('rejects bindings to missing or incompatible source fields', () => {
    const doc = document();
    const review = doc.nodes.find((node) => node.name === '科长审核')!;
    review.detailMode = 'formOnly';
    review.supplementFormId = 'review-result';
    review.fieldBindings = { displayedResult: 'missingResult' };
    state.forms['review-result'] = {
      status: 1,
      usage: 'workflowSupplement',
      kind: 'form',
      rule: [{ type: 'input', field: 'displayedResult', title: '结果摘要' }],
    };
    const saved = saveWorkflow(doc, 'demo');
    expect(
      publicationCheck(saved.id)
        .issues.map((issue) => issue.message)
        .join(' '),
    ).toContain('来源必须是流程中已定义的其他普通字段');
    review.fieldBindings = { displayedResult: 'BuChangJinE' };
    const changed = saveWorkflow(doc, 'demo', saved.id, saved.revision);
    expect(
      publicationCheck(changed.id)
        .issues.map((issue) => issue.message)
        .join(' '),
    ).toContain('来源与展示字段的类型不一致');
  });
  it('projects a supported agreement field into an independent node form', () => {
    const doc = document();
    const entry = doc.nodes.find((node) => node.type === 'task')!;
    entry.detailMode = 'formOnly';
    entry.supplementFormId = 'amount-view';
    entry.fieldBindings = { amountSummary: 'BuChangJinE' };
    state.forms['amount-view'] = {
      status: 1,
      usage: 'workflowSupplement',
      kind: 'form',
      rule: [
        { type: 'inputNumber', field: 'amountSummary', title: '协议金额摘要' },
      ],
    };
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
    const published = publishChecked(saved.id, saved.revision, 'demo');
    const context = startInstance(
      {
        definitionId: published.id,
        agreementNo: seedAgreement(720_000),
        requestId: newId('start'),
      },
      actor,
      [actor],
    );
    expect(context.instance.data).toEqual({ amountSummary: 720_000 });
    expect(context.agreement).toBeUndefined();
  });
  it('blocks page module rules that the normalized renderer cannot preserve', () => {
    const doc = document();
    doc.nodes[1]!.form = { type: 'page', id: 'page' };
    state.pages.page = {
      status: 1,
      modules: [{ key: 'basic', enabled: true }],
      moduleInner: {
        basic: {
          sections: [
            {
              key: 'legacy',
              label: '旧版内嵌资料',
              enabled: true,
              order: 10,
              fields: [
                {
                  key: 'legacyField',
                  label: '旧版字段',
                  enabled: true,
                  order: 10,
                  custom: true,
                },
              ],
            },
          ],
        },
      },
      fcRules: { basic: [{ type: 'input', field: 'reason' }] },
    };
    expect(
      freezeWorkflowForms(doc).issues.some((i) =>
        i.message.includes('迁移为独立表格模块'),
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
  it('rejects field permissions for fields missing from the page and supplement form', () => {
    const doc = document();
    doc.nodes.find((n) => n.name === '科长审核')!.fieldAccess = {
      legalOpinion: 'edit',
    };
    const saved = saveWorkflow(doc, 'demo');
    expect(
      publicationCheck(saved.id).issues.some((issue) =>
        issue.message.includes(
          '字段权限引用了当前详情页或节点补充表单中不存在的字段',
        ),
      ),
    ).toBe(true);
  });
  it('accepts field permissions after the field is defined by a workflow supplement', () => {
    const doc = document();
    const review = doc.nodes.find((n) => n.name === '科长审核')!;
    review.supplementFormId = 'legal-review';
    review.fieldAccess = { legalOpinion: 'edit' };
    state.forms['legal-review'] = {
      status: 1,
      usage: 'workflowSupplement',
      rule: [
        {
          type: 'textarea',
          field: 'legalOpinion',
          title: '法务意见',
        },
      ],
    };
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
  });
  it('rejects agreement module templates used as node supplements', () => {
    const doc = document();
    doc.nodes[1]!.supplementFormId = 'rewards';
    state.forms.rewards = {
      status: 1,
      usage: 'agreementModule',
      rule: [{ type: 'tableForm', field: 'rewardItems', title: '奖励补贴' }],
    };
    const saved = saveWorkflow(doc, 'demo');
    expect(
      publicationCheck(saved.id).issues.some((issue) =>
        issue.message.includes('不能使用协议详情模块模板'),
      ),
    ).toBe(true);
  });
  it('publishes data actions that assign or copy existing fields', () => {
    const doc = document();
    const fill = doc.nodes.find((n) => n.type === 'task')!;
    state.forms['accept-supplement'] = {
      id: 'accept-supplement',
      kind: 'form',
      name: '受理补充表单',
      status: 1,
      usage: 'workflowSupplement',
      rule: [
        {
          type: 'textarea',
          field: 'acceptOpinion',
          title: '受理意见',
        },
      ],
    };
    fill.supplementFormId = 'accept-supplement';
    fill.dataActions = [
      { when: 'arrive', kind: 'set', field: 'acceptOpinion', value: '待填报' },
      { when: 'submit', kind: 'copy', field: 'remark', from: 'houseAddress' },
    ];
    const saved = saveWorkflow(doc, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);
  });
  it('allows reject data actions when the node has a reject button', () => {
    const valid = document();
    valid.buttonCatalog = [
      { code: 'REJECT_BACK', action: 'reject', label: '退回补正' },
    ];
    const review = valid.nodes.find((n) => n.name === '科长审核')!;
    review.buttons = review.buttons.map((code) =>
      code === 'reject' ? 'REJECT_BACK' : code,
    );
    review.dataActions = [
      { when: 'reject', kind: 'set', field: 'remark', value: '待补正' },
    ];
    const saved = saveWorkflow(valid, 'demo');
    expect(publicationCheck(saved.id).issues).toEqual([]);

    const withoutButton = document();
    withoutButton.code = 'WF_REJECT_ACTION_NO_BUTTON';
    const withoutButtonReview = withoutButton.nodes.find(
      (n) => n.name === '科长审核',
    )!;
    withoutButtonReview.buttons = withoutButtonReview.buttons.filter(
      (code) => code !== 'reject',
    );
    withoutButtonReview.dataActions = [
      { when: 'reject', kind: 'set', field: 'remark', value: '待补正' },
    ];
    const withoutButtonSaved = saveWorkflow(withoutButton, 'demo');
    expect(
      publicationCheck(withoutButtonSaved.id)
        .issues.map((item) => item.message)
        .join(' '),
    ).toContain('数据动作时机对应的按钮未配置');
  });
  it('rejects data actions that try to create an undeclared field', () => {
    const doc = document();
    doc.nodes.find((n) => n.type === 'task')!.dataActions = [
      { when: 'arrive', kind: 'set', field: 'ghostField', value: 'x' },
    ];
    const saved = saveWorkflow(doc, 'demo');
    expect(
      publicationCheck(saved.id)
        .issues.map((issue) => issue.message)
        .join(' '),
    ).toContain('必须存在于当前节点表单且已接入数据存储');
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

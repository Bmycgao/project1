import type {
  RuntimeActor,
  RuntimeForm,
  WorkflowContext,
} from '../../shared/workflow-runtime';

import { readdirSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDocument, createNode, newId } from '../../shared/workflow';
import { BUSINESS_FIELDS } from '../../shared/workflow-runtime';
import { sampleGraph } from '../../web-ele/src/views/system/workflow/model';
import {
  getOrCreateAgreementDetail,
  saveAgreementDetailAll,
} from './mock-agreement-detail';
import { createAgreeListRow, findAgreeListRow } from './mock-agreement-list';
const { directory, root } = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = tmpdir();
  return { directory: mkdtempSync(join(root, 'vben-workflow-runtime-')), root };
});
vi.mock('./mock-persist', () => ({
  DATA_DIR: directory,
  readPersistJson: () => null,
  writePersistJson: () => undefined,
}));
import {
  actOnInstance,
  interveneInstance,
  listInstances,
  listNotices,
  startInstance,
  workflowContext,
} from './workflow-engine';
import { freezeWorkflowForms } from './workflow-forms';
import {
  disableWorkflow,
  getWorkflow,
  newWorkflowVersion,
  publishWorkflow,
  saveWorkflow,
} from './workflow-store';
const operator: RuntimeActor = {
  id: 'entry',
  name: '经办人',
  roleIds: ['entry'],
  codes: ['Workflow:Use'],
};
const reviewer: RuntimeActor = {
  id: 'reviewer',
  name: '科长',
  roleIds: ['review'],
  codes: ['Workflow:Use'],
};
const leader: RuntimeActor = {
  id: 'leader',
  name: '领导',
  roleIds: ['leader'],
  codes: ['Workflow:Use'],
};
const outsider: RuntimeActor = {
  id: 'outside',
  name: '其他用户',
  roleIds: [],
  codes: ['Workflow:Use'],
};
const actors = [operator, reviewer, leader, outsider];
beforeEach(() => {
  for (const file of readdirSync(directory)) rmSync(join(directory, file));
});
afterAll(() => {
  if (
    !resolve(directory).startsWith(
      `${resolve(root)}${sep}vben-workflow-runtime-`,
    )
  )
    throw new Error('Unexpected test directory');
  rmSync(directory, { recursive: true });
});
function setup() {
  const doc = {
    ...createDocument(),
    code: 'FL_RUNTIME',
    name: '审核签约',
    base: 'JD_TEST',
    ...sampleGraph(),
  };
  doc.nodes.forEach((n) => {
    if (n.type === 'approve') {
      n.assignee.type = 'role';
      n.assignee.ids = [n.name === '分管领导核准' ? 'leader' : 'review'];
      n.rejectMode = 'specified';
    }
  });
  const draft = saveWorkflow(doc, 'admin');
  const forms = Object.fromEntries(
    doc.nodes
      .filter((n) => ['approve', 'task'].includes(n.type))
      .map((n) => [
        n.id,
        { title: '协议资料', fields: structuredClone(BUSINESS_FIELDS) },
      ]),
  ) as Record<string, RuntimeForm>;
  const definition = publishWorkflow(draft.id, draft.revision, forms, 'admin');
  return { definition, forms, doc };
}
/** 在填报与科长之间插入抄送节点后发布 */
function setupWithCc(recipientIds = [outsider.id]) {
  const doc = {
    ...createDocument(),
    code: 'FL_CC',
    name: '抄送签约',
    base: 'JD_TEST',
    ...sampleGraph(),
  };
  doc.nodes.forEach((n) => {
    if (n.type === 'approve') {
      n.assignee.type = 'role';
      n.assignee.ids = [n.name === '分管领导核准' ? 'leader' : 'review'];
      n.rejectMode = 'specified';
    }
  });
  const task = doc.nodes.find((n) => n.name === '经办人填报')!;
  const review = doc.nodes.find((n) => n.name === '科长审核')!;
  const cc = createNode('cc', 475, 210, 20);
  cc.name = '抄送法务';
  cc.assignee = { type: 'user', ids: recipientIds, field: '' };
  const pass = doc.edges.find(
    (e) => e.source === task.id && e.target === review.id && e.type === 'pass',
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
  const draft = saveWorkflow(doc, 'admin');
  const forms = Object.fromEntries(
    doc.nodes
      .filter((n) => ['approve', 'task'].includes(n.type))
      .map((n) => [
        n.id,
        { title: '协议资料', fields: structuredClone(BUSINESS_FIELDS) },
      ]),
  ) as Record<string, RuntimeForm>;
  const definition = publishWorkflow(draft.id, draft.revision, forms, 'admin');
  return { definition, doc, cc, review };
}
function link(
  doc: {
    edges: {
      condition: string;
      id: string;
      isDefault: boolean;
      label: string;
      source: string;
      target: string;
      type: 'pass';
    }[];
  },
  source: string,
  target: string,
) {
  doc.edges.push({
    id: newId('edge'),
    source,
    target,
    type: 'pass',
    label: '通过',
    condition: '',
    isDefault: false,
  });
}
function publishHuman(
  doc: ReturnType<typeof createDocument> & {
    nodes: { id: string; type: string }[];
  },
) {
  const draft = saveWorkflow(doc, 'admin');
  const forms = Object.fromEntries(
    doc.nodes
      .filter((n) => ['approve', 'task'].includes(n.type))
      .map((n) => [
        n.id,
        { title: '协议资料', fields: structuredClone(BUSINESS_FIELDS) },
      ]),
  ) as Record<string, RuntimeForm>;
  return publishWorkflow(draft.id, draft.revision, forms, 'admin');
}
/** 填报后并行两路审批再汇聚 */
function setupParallel() {
  const startN = createNode('start', 80, 200, 1);
  const fill = createNode('task', 280, 200, 2);
  fill.allowRecall = true;
  const fork = createNode('parallel', 480, 200, 3);
  fork.name = '分叉';
  const left = createNode('approve', 700, 80, 4);
  left.name = '交房核查';
  left.assignee = { type: 'role', ids: ['review'], field: '' };
  left.rejectMode = 'specified';
  const right = createNode('approve', 700, 320, 5);
  right.name = '结算复核';
  right.assignee = { type: 'role', ids: ['leader'], field: '' };
  const join = createNode('parallel', 920, 200, 6);
  join.name = '汇聚';
  const endN = createNode('end', 1120, 200, 7);
  const doc = {
    ...createDocument(),
    code: 'FL_PAR',
    name: '并行签约',
    base: 'JD_TEST',
    nodes: [startN, fill, fork, left, right, join, endN],
    edges: [],
  };
  link(doc, startN.id, fill.id);
  link(doc, fill.id, fork.id);
  link(doc, fork.id, left.id);
  link(doc, fork.id, right.id);
  link(doc, left.id, join.id);
  link(doc, right.id, join.id);
  link(doc, join.id, endN.id);
  doc.edges.push({
    id: newId('edge'),
    source: left.id,
    target: fill.id,
    type: 'reject',
    label: '驳回',
    condition: '',
    isDefault: false,
  });
  const definition = publishHuman(doc);
  return { definition, fill, left, right, join };
}
/** 父流程填报后进入已发布子流程，子流程结束再结束父流程 */
function setupSubflow() {
  const cStart = createNode('start', 80, 200, 1);
  const cTask = createNode('task', 300, 200, 2);
  const cEnd = createNode('end', 520, 200, 3);
  const childDoc = {
    ...createDocument(),
    code: 'FL_CHILD',
    name: '子流程填报',
    base: 'JD_TEST',
    nodes: [cStart, cTask, cEnd],
    edges: [],
  };
  link(childDoc, cStart.id, cTask.id);
  link(childDoc, cTask.id, cEnd.id);
  const child = publishHuman(childDoc);
  const pStart = createNode('start', 80, 200, 1);
  const pTask = createNode('task', 300, 200, 2);
  const pSub = createNode('subflow', 520, 200, 3);
  pSub.name = '调用子流程';
  pSub.subflowCode = 'FL_CHILD';
  const pEnd = createNode('end', 740, 200, 4);
  const parentDoc = {
    ...createDocument(),
    code: 'FL_PARENT',
    name: '父流程',
    base: 'JD_TEST',
    nodes: [pStart, pTask, pSub, pEnd],
    edges: [],
  };
  link(parentDoc, pStart.id, pTask.id);
  link(parentDoc, pTask.id, pSub.id);
  link(parentDoc, pSub.id, pEnd.id);
  const parent = publishHuman(parentDoc);
  return { parent, child, pSub };
}
function seedAgreement(amount = 1_200_000, houseAddress = '测试路1号') {
  const row = createAgreeListRow({
    compensatee: '张某',
    houseAddress,
  });
  const detail = getOrCreateAgreementDetail(row.agreementNo, row);
  saveAgreementDetailAll({
    ...detail,
    basic: { ...detail.basic, compensatee: '张某', amount },
    houses: (detail.houses || []).map((house, index) =>
      index === 0 ? { ...house, address: houseAddress } : house,
    ),
    signing: { ...detail.signing, houseAddress },
  });
  return row.agreementNo;
}
function start(
  definitionId: string,
  amount = 1_200_000,
  agreementNo = seedAgreement(amount),
) {
  return startInstance(
    {
      definitionId,
      agreementNo,
      title: '张某协议',
      requestId: newId('start'),
    },
    operator,
    actors,
  );
}
function action(
  context: WorkflowContext,
  actor: RuntimeActor,
  type: 'pass' | 'recall' | 'reject' | 'save' | 'submit' | 'transfer',
  extra = {},
) {
  return actOnInstance(
    context.instance.id,
    {
      taskId: context.task!.id,
      revision: context.instance.revision,
      requestId: newId('action'),
      action: type,
      ...extra,
    },
    actor,
    actors,
  );
}
describe('published workflow runtime', () => {
  it('lets a monitor list every instance while operators stay in their own todo', () => {
    const { definition } = setup();
    const started = start(definition.id);
    const monitor: RuntimeActor = {
      id: 'monitor',
      name: '监控员',
      roleIds: [],
      codes: ['Workflow:Monitor'],
    };
    const rows = listInstances(monitor, 'monitor');
    expect(rows.some((r) => r.id === started.instance.id)).toBe(true);
    expect(rows[0]?.pendingAssigneeNames?.length).toBeGreaterThan(0);
    expect(() => listInstances(operator, 'monitor')).toThrow('监控');
    expect(listInstances(operator, 'todo')).toHaveLength(1);
    expect(workflowContext(started.instance.id, monitor).canAct).toBe(false);
  });
  it('routes 1.2m through leader, supports rejection and resubmission, and completes the instance', () => {
    const { definition, doc } = setup();
    let c = start(definition.id);
    expect(listInstances(operator, 'todo')).toHaveLength(1);
    c = action(c, operator, 'submit');
    expect(c.instance.currentNodeId).toBe(doc.nodes[2]!.id);
    expect(listInstances(reviewer, 'todo')).toHaveLength(1);
    c = workflowContext(c.instance.id, reviewer);
    expect(c.form.fields.every((f) => f.readonly)).toBe(true);
    c = action(c, reviewer, 'reject', {
      targetNodeId: doc.nodes[1]!.id,
      opinion: '请补充资料',
    });
    c = action(c, operator, 'submit', { data: { houseAddress: '修正路2号' } });
    expect(c.instance.currentNodeId).toBe(doc.nodes[2]!.id);
    c = action(c, reviewer, 'pass');
    expect(c.instance.currentNodeId).toBe(doc.nodes[4]!.id);
    c = action(c, leader, 'pass');
    c = action(c, operator, 'submit');
    c = action(c, reviewer, 'pass');
    expect(c.instance.status).toBe('completed');
    expect(c.instance.events.some((e) => e.action === 'reject')).toBe(true);
    expect(c.instance.events.at(-1)?.action).toBe('end');
    expect(listInstances(operator, 'started')).toHaveLength(1);
    expect(listInstances(reviewer, 'done')).toHaveLength(1);
  });
  it('routes smaller amounts along the otherwise branch', () => {
    const { definition, doc } = setup();
    let c = start(definition.id, 500_000);
    c = action(c, operator, 'submit');
    c = action(c, reviewer, 'pass');
    expect(c.instance.currentNodeId).toBe(doc.nodes[5]!.id);
    expect(listInstances(leader, 'todo')).toEqual([]);
  });
  it('enforces instance access, candidate identity and immutable approval fields', () => {
    const { definition } = setup();
    let c = start(definition.id);
    expect(() => workflowContext(c.instance.id, outsider)).toThrow('无权');
    c = action(c, operator, 'submit');
    expect(() => action(c, operator, 'pass')).toThrow('办理人');
    expect(() =>
      action(c, reviewer, 'pass', { data: { BuChangJinE: 1 } }),
    ).toThrow('不可修改');
    expect(() => action(c, reviewer, 'save')).toThrow('不允许');
    expect(workflowContext(c.instance.id, reviewer).instance.revision).toBe(
      c.instance.revision,
    );
  });
  it('requires rejection opinions and previously visited allowed targets', () => {
    const { definition, doc } = setup();
    let c = start(definition.id);
    c = action(c, operator, 'submit');
    expect(() =>
      action(c, reviewer, 'reject', { targetNodeId: doc.nodes[1]!.id }),
    ).toThrow('不能为空');
    expect(() =>
      action(c, reviewer, 'reject', {
        targetNodeId: doc.nodes[5]!.id,
        opinion: '退回',
      }),
    ).toThrow('范围');
  });
  it('uses revision locks and idempotency to prevent duplicate tasks', () => {
    const { definition } = setup();
    const c = start(definition.id);
    const input = {
      taskId: c.task!.id,
      revision: c.instance.revision,
      requestId: 'retry-id',
      action: 'submit' as const,
    };
    const next = actOnInstance(c.instance.id, input, operator, actors);
    expect(actOnInstance(c.instance.id, input, operator, actors)).toEqual(next);
    expect(() =>
      actOnInstance(
        c.instance.id,
        { ...input, requestId: 'other-window' },
        operator,
        actors,
      ),
    ).toThrow('其他用户');
    expect(next.instance.tasks).toHaveLength(2);
  });
  it('rolls back the whole submission if the next task has no candidate', () => {
    const { definition } = setup();
    const c = start(definition.id);
    expect(() =>
      actOnInstance(
        c.instance.id,
        {
          taskId: c.task!.id,
          revision: c.instance.revision,
          requestId: 'failed',
          action: 'submit',
          data: { houseAddress: '不应保存' },
        },
        operator,
        [operator],
      ),
    ).toThrow('没有有效办理人');
    const after = workflowContext(c.instance.id, operator);
    expect(after.instance).toEqual(c.instance);
  });
  it('pins V1 instances while V2 receives new instances and denies starts after disable', () => {
    const { definition, forms } = setup();
    let old = start(definition.id);
    expect(() =>
      saveWorkflow(definition, 'admin', definition.id, definition.revision),
    ).toThrow('不可修改');
    const draft = newWorkflowVersion(definition.id, 'admin');
    const changedForms = structuredClone(forms);
    Object.values(changedForms).forEach((f) => {
      f.fields[1]!.label = 'V2新标签';
    });
    const v2 = publishWorkflow(draft.id, draft.revision, changedForms, 'admin');
    expect(start(v2.id).instance.version).toBe(2);
    expect(
      workflowContext(old.instance.id, operator).form.fields[1]!.label,
    ).toBe('被补偿人');
    expect(() => start(definition.id)).toThrow('停用');
    old = action(old, operator, 'submit');
    expect(old.instance.version).toBe(1);
    disableWorkflow(v2.id, v2.revision);
    expect(() => start(v2.id)).toThrow('停用');
    expect(getWorkflow(definition.id).status).toBe('disabled');
  });
  it('never returns hidden fields and rejects their submission', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    const first = draft.nodes.find((n) => n.type === 'task')!;
    first.fieldAccess = { houseAddress: 'hidden' };
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    const c = start(v2.id);
    expect(c.instance.data).not.toHaveProperty('houseAddress');
    expect(c.form.fields.some((f) => f.key === 'houseAddress')).toBe(false);
    expect(() =>
      action(c, operator, 'save', { data: { houseAddress: '篡改' } }),
    ).toThrow('不可修改');
  });
  it('keeps role restrictions even when a node opens a field for editing', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    const approval = draft.nodes.find((n) => n.type === 'approve')!;
    approval.fieldAccess = { BuChangJinE: 'edit' };
    forms[approval.id]!.fields.find(
      (f) => f.key === 'BuChangJinE',
    )!.editableCodes = ['Amount:Edit'];
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    let c = start(v2.id);
    c = action(c, operator, 'submit');
    expect(
      workflowContext(c.instance.id, reviewer).form.fields.find(
        (f) => f.key === 'BuChangJinE',
      )!.readonly,
    ).toBe(true);
  });
  it('starts from an existing agreement and writes edits back', () => {
    const { definition } = setup();
    const agreementNo = seedAgreement(1_200_000, '原地址1号');
    let c = start(definition.id, 1_200_000, agreementNo);
    expect(c.instance.bizId).toBe(agreementNo);
    expect(c.instance.data.houseAddress).toBe('原地址1号');
    expect(c.instance.data.BuChangJinE).toBe(1_200_000);
    expect(() =>
      startInstance(
        {
          definitionId: definition.id,
          agreementNo: 'NO-SUCH',
          requestId: newId('start'),
        },
        operator,
        actors,
      ),
    ).toThrow('已有的协议');
    expect(() => start(definition.id, 1_200_000, agreementNo)).toThrow('在途');
    c = action(c, operator, 'save', { data: { houseAddress: '回写路8号' } });
    expect(getOrCreateAgreementDetail(agreementNo).houses[0]?.address).toBe(
      '回写路8号',
    );
    expect(findAgreeListRow(agreementNo)?.houseAddress).toBe('回写路8号');
  });
  it('does not write agreement data when routing fails', () => {
    const { definition } = setup();
    const agreementNo = seedAgreement(800_000, '锁定路3号');
    const c = start(definition.id, 800_000, agreementNo);
    expect(() =>
      actOnInstance(
        c.instance.id,
        {
          taskId: c.task!.id,
          revision: c.instance.revision,
          requestId: 'failed-sync',
          action: 'submit',
          data: { houseAddress: '不应保存' },
        },
        operator,
        [operator],
      ),
    ).toThrow('没有有效办理人');
    expect(getOrCreateAgreementDetail(agreementNo).houses[0]?.address).toBe(
      '锁定路3号',
    );
  });
  it('writes the full agreement on task save and ignores approve body patches', () => {
    const { definition } = setup();
    const agreementNo = seedAgreement(1_200_000, '原房屋路');
    let c = start(definition.id, 1_200_000, agreementNo);
    expect(c.agreementEditable).toBe(true);
    expect(
      (c.agreement as { houses?: { address?: string }[] })?.houses?.[0]
        ?.address,
    ).toBe('原房屋路');
    const patched = structuredClone(
      getOrCreateAgreementDetail(agreementNo),
    ) as ReturnType<typeof getOrCreateAgreementDetail>;
    patched.houses[0]!.address = '办理改房屋路';
    patched.houses[0]!.certNo = '证-办理';
    patched.basic.amount = 1_300_000;
    patched.compensationItems = [
      {
        id: 'ci-1',
        name: '搬家费',
        calcType: '定额',
        quantity: 1,
        unitPrice: 2000,
        amount: 2000,
        remark: '',
      },
    ];
    c = action(c, operator, 'save', { agreement: patched });
    const saved = getOrCreateAgreementDetail(agreementNo);
    expect(saved.houses[0]?.address).toBe('办理改房屋路');
    expect(saved.houses[0]?.certNo).toBe('证-办理');
    expect(saved.compensationItems[0]?.name).toBe('搬家费');
    expect(c.instance.data.houseAddress).toBe('办理改房屋路');
    expect(c.instance.data.BuChangJinE).toBe(1_300_000);
    c = action(c, operator, 'submit');
    expect(workflowContext(c.instance.id, reviewer).agreementEditable).toBe(
      false,
    );
    const hijack = structuredClone(getOrCreateAgreementDetail(agreementNo));
    hijack.houses[0]!.address = '审批篡改路';
    hijack.basic.amount = 1;
    c = action(c, reviewer, 'pass', { agreement: hijack });
    const afterApprove = getOrCreateAgreementDetail(agreementNo);
    expect(afterApprove.houses[0]?.address).toBe('办理改房屋路');
    expect(afterApprove.basic.amount).toBe(1_300_000);
  });
  it('lets an approval node edit catalog extras such as legalOpinion', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    const approval = draft.nodes.find((n) => n.name === '科长审核')!;
    approval.fieldAccess = { legalOpinion: 'edit' };
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const frozen = freezeWorkflowForms(saved);
    expect(frozen.issues).toEqual([]);
    const v2 = publishWorkflow(saved.id, saved.revision, frozen.forms, 'admin');
    const agreementNo = seedAgreement(1_200_000, '法务路1号');
    let c = start(v2.id, 1_200_000, agreementNo);
    c = action(c, operator, 'submit');
    const review = workflowContext(c.instance.id, reviewer);
    const legal = review.form.fields.find((f) => f.key === 'legalOpinion');
    expect(legal?.readonly).toBe(false);
    c = action(review, reviewer, 'pass', {
      data: { legalOpinion: '法务同意签约' },
    });
    expect(
      getOrCreateAgreementDetail(agreementNo).flowFields?.legalOpinion,
    ).toBe('法务同意签约');
    expect(getOrCreateAgreementDetail(agreementNo).basic.compensatee).toBe(
      '张某',
    );
    const leaderNode = c.definition.nodes.find(
      (n) => n.name === '分管领导核准',
    )!;
    expect(c.instance.currentNodeId).toBe(leaderNode.id);
    const reviewNode = c.definition.nodes.find((n) => n.name === '科长审核')!;
    c = action(workflowContext(c.instance.id, leader), leader, 'reject', {
      targetNodeId: reviewNode.id,
      opinion: '请法务再核一次',
    });
    const back = workflowContext(c.instance.id, reviewer);
    expect(back.instance.data.legalOpinion).toBe('法务同意签约');
    expect(
      back.form.fields.find((f) => f.key === 'legalOpinion')?.readonly,
    ).toBe(false);
  });
  it('does not persist the agreement body when routing fails', () => {
    const { definition } = setup();
    const agreementNo = seedAgreement(800_000, '锁定路3号');
    const c = start(definition.id, 800_000, agreementNo);
    const patched = structuredClone(getOrCreateAgreementDetail(agreementNo));
    patched.houses[0]!.address = '不应落盘';
    patched.houses[0]!.certNo = '证-失败';
    expect(() =>
      actOnInstance(
        c.instance.id,
        {
          taskId: c.task!.id,
          revision: c.instance.revision,
          requestId: 'failed-body',
          action: 'submit',
          agreement: patched,
          data: { houseAddress: '不应保存' },
        },
        operator,
        [operator],
      ),
    ).toThrow('没有有效办理人');
    const after = getOrCreateAgreementDetail(agreementNo);
    expect(after.houses[0]?.address).toBe('锁定路3号');
    expect(after.houses[0]?.certNo).not.toBe('证-失败');
  });
  it('hides recall when the completed node did not allow it', () => {
    const { definition } = setup();
    let c = start(definition.id);
    c = action(c, operator, 'submit');
    expect(c.buttons.some((b) => b.code === 'recall')).toBe(false);
    expect(() => action(c, operator, 'recall')).toThrow('不能撤回');
  });
  it('lets the previous handler recall before the next node acts', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    const fill = draft.nodes.find((n) => n.type === 'task')!;
    fill.allowRecall = true;
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    let c = start(v2.id);
    const fillId = v2.nodes.find((n) => n.type === 'task')!.id;
    c = action(c, operator, 'submit');
    expect(c.canAct).toBe(false);
    expect(c.buttons.find((b) => b.code === 'recall')?.enabled).toBe(true);
    c = action(c, operator, 'recall');
    expect(c.instance.currentNodeId).toBe(fillId);
    expect(c.canAct).toBe(true);
    expect(c.instance.events.some((e) => e.action === 'recall')).toBe(true);
    expect(c.instance.tasks.some((t) => t.status === 'cancelled')).toBe(true);
    c = action(c, operator, 'submit');
    c = action(c, reviewer, 'pass');
    expect(
      workflowContext(c.instance.id, operator).buttons.find(
        (b) => b.code === 'recall',
      )?.enabled,
    ).toBe(false);
  });
  it('waits for all countersign passes and cancels remaining tasks on reject', () => {
    const { definition, forms } = setup();
    const reviewer2: RuntimeActor = {
      id: 'reviewer2',
      name: '副科长',
      roleIds: ['review'],
      codes: ['Workflow:Use'],
    };
    const people = [...actors, reviewer2];
    const draft = newWorkflowVersion(definition.id, 'admin');
    const chief = draft.nodes.find((n) => n.name === '科长审核')!;
    chief.approveMode = 'all';
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    let c = startInstance(
      {
        definitionId: v2.id,
        agreementNo: seedAgreement(1_200_000, '会签路1号'),
        title: '会签通过',
        requestId: newId('start'),
      },
      operator,
      people,
    );
    c = actOnInstance(
      c.instance.id,
      {
        taskId: c.task!.id,
        revision: c.instance.revision,
        requestId: newId('action'),
        action: 'submit',
      },
      operator,
      people,
    );
    const first = workflowContext(c.instance.id, reviewer);
    const second = workflowContext(c.instance.id, reviewer2);
    expect(first.canAct).toBe(true);
    expect(second.canAct).toBe(true);
    expect(first.task!.id).not.toBe(second.task!.id);
    expect(first.countersign).toMatchObject({ passed: 0, total: 2 });
    c = actOnInstance(
      c.instance.id,
      {
        taskId: first.task!.id,
        revision: first.instance.revision,
        requestId: newId('action'),
        action: 'pass',
      },
      reviewer,
      people,
    );
    expect(c.instance.currentNodeId).toBe(chief.id);
    expect(c.countersign?.passed).toBe(1);
    expect(workflowContext(c.instance.id, reviewer2).canAct).toBe(true);
    c = actOnInstance(
      c.instance.id,
      {
        taskId: workflowContext(c.instance.id, reviewer2).task!.id,
        revision: c.instance.revision,
        requestId: newId('action'),
        action: 'pass',
      },
      reviewer2,
      people,
    );
    expect(c.instance.currentNodeId).not.toBe(chief.id);
    const rejected = startInstance(
      {
        definitionId: v2.id,
        agreementNo: seedAgreement(1_200_000, '会签驳回路'),
        title: '会签驳回',
        requestId: newId('start'),
      },
      operator,
      people,
    );
    let r = actOnInstance(
      rejected.instance.id,
      {
        taskId: rejected.task!.id,
        revision: rejected.instance.revision,
        requestId: newId('action'),
        action: 'submit',
      },
      operator,
      people,
    );
    const a = workflowContext(r.instance.id, reviewer);
    const b = workflowContext(r.instance.id, reviewer2);
    r = actOnInstance(
      r.instance.id,
      {
        taskId: a.task!.id,
        revision: a.instance.revision,
        requestId: newId('action'),
        action: 'reject',
        targetNodeId: v2.nodes.find((n) => n.type === 'task')!.id,
        opinion: '会签驳回',
      },
      reviewer,
      people,
    );
    expect(r.instance.currentNodeId).toBe(
      v2.nodes.find((n) => n.type === 'task')!.id,
    );
    expect(
      r.instance.tasks.some(
        (t) => t.id === b.task!.id && t.status === 'cancelled',
      ),
    ).toBe(true);
  });
  it('advances a ratio countersign once the pass percentage is reached', () => {
    const { definition, forms } = setup();
    const reviewer2: RuntimeActor = {
      id: 'reviewer2',
      name: '副科长',
      roleIds: ['review'],
      codes: ['Workflow:Use'],
    };
    const people = [...actors, reviewer2];
    const draft = newWorkflowVersion(definition.id, 'admin');
    const chief = draft.nodes.find((n) => n.name === '科长审核')!;
    chief.approveMode = 'ratio';
    chief.approveRatio = 50;
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    let c = startInstance(
      {
        definitionId: v2.id,
        agreementNo: seedAgreement(1_200_000, '比例会签路'),
        title: '比例通过',
        requestId: newId('start'),
      },
      operator,
      people,
    );
    c = actOnInstance(
      c.instance.id,
      {
        taskId: c.task!.id,
        revision: c.instance.revision,
        requestId: newId('action'),
        action: 'submit',
      },
      operator,
      people,
    );
    const first = workflowContext(c.instance.id, reviewer);
    const second = workflowContext(c.instance.id, reviewer2);
    expect(first.canAct).toBe(true);
    expect(second.canAct).toBe(true);
    expect(first.countersign).toMatchObject({
      mode: 'ratio',
      passed: 0,
      total: 2,
      required: 1,
      percent: 50,
    });
    c = actOnInstance(
      c.instance.id,
      {
        taskId: first.task!.id,
        revision: first.instance.revision,
        requestId: newId('action'),
        action: 'pass',
      },
      reviewer,
      people,
    );
    expect(c.instance.currentNodeId).not.toBe(chief.id);
    expect(
      c.instance.tasks.some(
        (t) => t.id === second.task!.id && t.status === 'cancelled',
      ),
    ).toBe(true);
    const moved = newWorkflowVersion(definition.id, 'admin');
    const movedChief = moved.nodes.find((n) => n.name === '科长审核')!;
    movedChief.approveMode = 'ratio';
    movedChief.approveRatio = 50;
    movedChief.allowTransfer = true;
    const movedSaved = saveWorkflow(moved, 'admin', moved.id, moved.revision);
    const movedPublished = publishWorkflow(
      movedSaved.id,
      movedSaved.revision,
      forms,
      'admin',
    );
    let transferred = startInstance(
      {
        definitionId: movedPublished.id,
        agreementNo: seedAgreement(1_200_000, '比例转办路'),
        title: '比例转办',
        requestId: newId('start'),
      },
      operator,
      people,
    );
    transferred = actOnInstance(
      transferred.instance.id,
      {
        taskId: transferred.task!.id,
        revision: transferred.instance.revision,
        requestId: newId('action'),
        action: 'submit',
      },
      operator,
      people,
    );
    const holder = workflowContext(transferred.instance.id, reviewer, people);
    transferred = actOnInstance(
      transferred.instance.id,
      {
        taskId: holder.task!.id,
        revision: holder.instance.revision,
        requestId: newId('action'),
        action: 'transfer',
        targetUserId: outsider.id,
      },
      reviewer,
      people,
    );
    const afterMove = workflowContext(
      transferred.instance.id,
      outsider,
      people,
    );
    expect(afterMove.countersign).toMatchObject({
      mode: 'ratio',
      total: 2,
      required: 1,
      passed: 0,
    });
    expect(
      workflowContext(transferred.instance.id, reviewer2, people).canAct,
    ).toBe(true);
    transferred = actOnInstance(
      transferred.instance.id,
      {
        taskId: afterMove.task!.id,
        revision: afterMove.instance.revision,
        requestId: newId('action'),
        action: 'pass',
      },
      outsider,
      people,
    );
    expect(transferred.instance.currentNodeId).not.toBe(movedChief.id);
    const strict = newWorkflowVersion(definition.id, 'admin');
    const strictChief = strict.nodes.find((n) => n.name === '科长审核')!;
    strictChief.approveMode = 'ratio';
    strictChief.approveRatio = 100;
    const strictSaved = saveWorkflow(
      strict,
      'admin',
      strict.id,
      strict.revision,
    );
    const strictPublished = publishWorkflow(
      strictSaved.id,
      strictSaved.revision,
      forms,
      'admin',
    );
    let held = startInstance(
      {
        definitionId: strictPublished.id,
        agreementNo: seedAgreement(1_200_000, '比例满员路'),
        title: '比例满员',
        requestId: newId('start'),
      },
      operator,
      people,
    );
    held = actOnInstance(
      held.instance.id,
      {
        taskId: held.task!.id,
        revision: held.instance.revision,
        requestId: newId('action'),
        action: 'submit',
      },
      operator,
      people,
    );
    const one = workflowContext(held.instance.id, reviewer);
    const other = workflowContext(held.instance.id, reviewer2);
    expect(one.countersign?.required).toBe(2);
    held = actOnInstance(
      held.instance.id,
      {
        taskId: one.task!.id,
        revision: one.instance.revision,
        requestId: newId('action'),
        action: 'pass',
      },
      reviewer,
      people,
    );
    expect(held.instance.currentNodeId).toBe(strictChief.id);
    expect(workflowContext(held.instance.id, reviewer2).canAct).toBe(true);
    held = actOnInstance(
      held.instance.id,
      {
        taskId: other.task!.id,
        revision: held.instance.revision,
        requestId: newId('action'),
        action: 'reject',
        targetNodeId: strictPublished.nodes.find((n) => n.type === 'task')!.id,
        opinion: '比例驳回',
      },
      reviewer2,
      people,
    );
    expect(held.instance.currentNodeId).toBe(
      strictPublished.nodes.find((n) => n.type === 'task')!.id,
    );
  });
  it('hands sequential approval to the next person only after the previous pass', () => {
    const { definition, forms } = setup();
    const reviewer2: RuntimeActor = {
      id: 'reviewer2',
      name: '副科长',
      roleIds: ['review'],
      codes: ['Workflow:Use'],
    };
    const people = [...actors, reviewer2];
    const draft = newWorkflowVersion(definition.id, 'admin');
    const chief = draft.nodes.find((n) => n.name === '科长审核')!;
    chief.approveMode = 'sequential';
    chief.assignee = {
      type: 'user',
      ids: ['reviewer', 'reviewer2'],
      field: '',
    };
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    let c = startInstance(
      {
        definitionId: v2.id,
        agreementNo: seedAgreement(1_200_000, '依次审批路'),
        title: '依次通过',
        requestId: newId('start'),
      },
      operator,
      people,
    );
    c = actOnInstance(
      c.instance.id,
      {
        taskId: c.task!.id,
        revision: c.instance.revision,
        requestId: newId('action'),
        action: 'submit',
      },
      operator,
      people,
    );
    const first = workflowContext(c.instance.id, reviewer, people);
    expect(first.canAct).toBe(true);
    expect(first.countersign).toMatchObject({
      passed: 0,
      total: 2,
      mode: 'sequential',
      pendingNames: ['科长'],
    });
    expect(listInstances(reviewer2, 'todo')).toEqual([]);
    c = actOnInstance(
      c.instance.id,
      {
        taskId: first.task!.id,
        revision: first.instance.revision,
        requestId: newId('action'),
        action: 'pass',
      },
      reviewer,
      people,
    );
    expect(c.instance.currentNodeId).toBe(chief.id);
    expect(c.countersign?.passed).toBe(1);
    expect(workflowContext(c.instance.id, reviewer2, people).canAct).toBe(true);
    expect(listInstances(reviewer, 'todo')).toEqual([]);
    c = actOnInstance(
      c.instance.id,
      {
        taskId: workflowContext(c.instance.id, reviewer2, people).task!.id,
        revision: c.instance.revision,
        requestId: newId('action'),
        action: 'pass',
      },
      reviewer2,
      people,
    );
    expect(c.instance.currentNodeId).not.toBe(chief.id);
    const rejected = startInstance(
      {
        definitionId: v2.id,
        agreementNo: seedAgreement(1_200_000, '依次驳回路'),
        title: '依次驳回',
        requestId: newId('start'),
      },
      operator,
      people,
    );
    let r = actOnInstance(
      rejected.instance.id,
      {
        taskId: rejected.task!.id,
        revision: rejected.instance.revision,
        requestId: newId('action'),
        action: 'submit',
      },
      operator,
      people,
    );
    r = actOnInstance(
      r.instance.id,
      {
        taskId: workflowContext(r.instance.id, reviewer, people).task!.id,
        revision: r.instance.revision,
        requestId: newId('action'),
        action: 'reject',
        targetNodeId: v2.nodes.find((n) => n.type === 'task')!.id,
        opinion: '依次驳回',
      },
      reviewer,
      people,
    );
    expect(r.instance.currentNodeId).toBe(
      v2.nodes.find((n) => n.type === 'task')!.id,
    );
    expect(listInstances(reviewer2, 'todo')).toEqual([]);
  });
  it('notifies cc recipients without pending todos and continues to the next node', () => {
    const { definition, cc, review } = setupWithCc();
    let c = start(definition.id);
    expect(() => workflowContext(c.instance.id, outsider)).toThrow('无权');
    c = action(c, operator, 'submit');
    expect(c.instance.currentNodeId).toBe(review.id);
    expect(
      c.instance.tasks.some((t) => t.nodeId === cc.id && t.status === 'copied'),
    ).toBe(true);
    expect(
      c.instance.tasks
        .filter((t) => t.status === 'pending')
        .every((t) => t.nodeId === review.id),
    ).toBe(true);
    expect(c.instance.events.some((e) => e.action === 'cc')).toBe(true);
    expect(listInstances(outsider, 'todo')).toEqual([]);
    expect(
      listInstances(outsider, 'cc').some((r) => r.id === c.instance.id),
    ).toBe(true);
    expect(listInstances(operator, 'todo')).toEqual([]);
    expect(listInstances(reviewer, 'todo')).toHaveLength(1);
    expect(workflowContext(c.instance.id, outsider).canAct).toBe(false);
  });
  it('rolls back submit when the cc node has no valid recipient', () => {
    const { definition } = setupWithCc(['nobody']);
    const c = start(definition.id);
    expect(() => action(c, operator, 'submit')).toThrow('抄送人');
    const after = workflowContext(c.instance.id, operator);
    expect(after.instance).toEqual(c.instance);
    expect(listInstances(outsider, 'cc')).toEqual([]);
  });
  it('opens two parallel branches and joins before completing', () => {
    const { definition, left, right } = setupParallel();
    let c = start(definition.id);
    c = action(c, operator, 'submit');
    expect(
      c.instance.tasks
        .filter((t) => t.status === 'pending')
        .map((t) => t.nodeId)
        .toSorted(),
    ).toEqual([left.id, right.id].toSorted());
    expect(listInstances(reviewer, 'todo')).toHaveLength(1);
    expect(listInstances(leader, 'todo')).toHaveLength(1);
    expect(listInstances(reviewer, 'todo')[0]?.currentNodeName).toContain(
      '交房核查',
    );
    const leftCtx = workflowContext(c.instance.id, reviewer);
    expect(leftCtx.canAct).toBe(true);
    expect(leftCtx.task?.nodeId).toBe(left.id);
    c = action(leftCtx, reviewer, 'pass');
    expect(c.instance.status).toBe('running');
    expect(
      c.instance.tasks.some(
        (t) => t.nodeId === right.id && t.status === 'pending',
      ),
    ).toBe(true);
    c = action(workflowContext(c.instance.id, leader), leader, 'pass');
    expect(c.instance.status).toBe('completed');
    expect(c.instance.events.some((e) => e.action === 'split')).toBe(true);
    expect(c.instance.events.some((e) => e.action === 'join')).toBe(true);
  });
  it('cancels the sibling branch when one parallel path is rejected', () => {
    const { definition, fill, left } = setupParallel();
    let c = start(definition.id);
    c = action(c, operator, 'submit');
    c = action(workflowContext(c.instance.id, reviewer), reviewer, 'reject', {
      targetNodeId: fill.id,
      opinion: '并行驳回',
    });
    expect(c.instance.currentNodeId).toBe(fill.id);
    expect(c.instance.tasks.some((t) => t.status === 'cancelled')).toBe(true);
    expect(
      c.instance.tasks
        .filter((t) => t.status === 'pending')
        .every((t) => t.nodeId === fill.id),
    ).toBe(true);
    expect(listInstances(leader, 'todo')).toEqual([]);
    expect(left.id).toBeTruthy();
  });
  it('lets the fill node recall both parallel todos', () => {
    const { definition, fill } = setupParallel();
    let c = start(definition.id);
    c = action(c, operator, 'submit');
    const recalled = workflowContext(c.instance.id, operator);
    expect(recalled.buttons.find((b) => b.code === 'recall')?.enabled).toBe(
      true,
    );
    c = action(recalled, operator, 'recall');
    expect(c.instance.currentNodeId).toBe(fill.id);
    expect(
      c.instance.tasks
        .filter((t) => t.status === 'pending')
        .every((t) => t.nodeId === fill.id),
    ).toBe(true);
  });
  it('starts a child instance at the subflow node and resumes the parent when it ends', () => {
    const { parent, pSub } = setupSubflow();
    let c = start(parent.id);
    c = action(c, operator, 'submit');
    expect(c.instance.currentNodeId).toBe(pSub.id);
    expect(c.canAct).toBe(false);
    expect(c.instance.status).toBe('running');
    const childRow = listInstances(operator, 'todo')[0];
    expect(childRow?.id).not.toBe(c.instance.id);
    expect(listInstances(operator, 'started')).toHaveLength(1);
    const child = workflowContext(childRow!.id, operator);
    expect(child.instance.parentInstanceId).toBe(c.instance.id);
    const done = action(child, operator, 'submit');
    expect(done.instance.status).toBe('completed');
    const parentAfter = workflowContext(c.instance.id, operator);
    expect(parentAfter.instance.status).toBe('completed');
    expect(
      parentAfter.instance.events.some((e) => e.action === 'subflowDone'),
    ).toBe(true);
  });
  it('refuses transfer when the node switch is off or the target is invalid', () => {
    const { definition } = setup();
    const visitor: RuntimeActor = {
      id: 'visitor',
      name: '访客',
      roleIds: [],
      codes: [],
    };
    const people = [...actors, visitor];
    let c = start(definition.id);
    expect(c.buttons.some((b) => b.code === 'transfer')).toBe(false);
    expect(() =>
      action(c, operator, 'transfer', { targetUserId: outsider.id }),
    ).toThrow('不允许转办');
    const draft = newWorkflowVersion(definition.id, 'admin');
    draft.nodes.find((n) => n.type === 'task')!.allowTransfer = true;
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const forms = Object.fromEntries(
      saved.nodes
        .filter((n) => ['approve', 'task'].includes(n.type))
        .map((n) => [
          n.id,
          { title: '协议资料', fields: structuredClone(BUSINESS_FIELDS) },
        ]),
    ) as Record<string, RuntimeForm>;
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    c = start(v2.id);
    const view = workflowContext(c.instance.id, operator, people);
    expect(view.buttons.find((b) => b.code === 'transfer')?.enabled).toBe(true);
    expect(view.transferCandidates?.some((a) => a.id === outsider.id)).toBe(
      true,
    );
    expect(view.transferCandidates?.some((a) => a.id === operator.id)).toBe(
      false,
    );
    expect(view.transferCandidates?.some((a) => a.id === visitor.id)).toBe(
      false,
    );
    expect(() =>
      actOnInstance(
        c.instance.id,
        {
          taskId: c.task!.id,
          revision: c.instance.revision,
          requestId: newId('action'),
          action: 'transfer',
          targetUserId: operator.id,
        },
        operator,
        people,
      ),
    ).toThrow('不能转办给自己');
    expect(() =>
      actOnInstance(
        c.instance.id,
        {
          taskId: c.task!.id,
          revision: c.instance.revision,
          requestId: newId('action'),
          action: 'transfer',
          targetUserId: visitor.id,
        },
        operator,
        people,
      ),
    ).toThrow('没有流程办理权限');
  });
  it('moves the pending todo to the recipient and keeps the transferor in done', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    const fill = draft.nodes.find((n) => n.type === 'task')!;
    fill.allowTransfer = true;
    fill.allowRecall = true;
    const review = draft.nodes.find((n) => n.name === '科长审核')!;
    review.allowTransfer = true;
    review.allowRecall = true;
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    const agreementNo = seedAgreement(1_200_000, '转办路1号');
    let c = start(v2.id, 1_200_000, agreementNo);
    const patched = structuredClone(getOrCreateAgreementDetail(agreementNo));
    patched.houses[0]!.address = '不应随转办落盘';
    c = actOnInstance(
      c.instance.id,
      {
        taskId: c.task!.id,
        revision: c.instance.revision,
        requestId: newId('action'),
        action: 'transfer',
        targetUserId: outsider.id,
        opinion: '请代填',
        agreement: patched,
      },
      operator,
      actors,
    );
    expect(c.canAct).toBe(false);
    expect(c.instance.events.some((e) => e.action === 'transfer')).toBe(true);
    expect(
      c.instance.events.find((e) => e.action === 'transfer')?.opinion,
    ).toContain('转办给：其他用户');
    expect(listInstances(operator, 'todo')).toEqual([]);
    expect(
      listInstances(operator, 'done').some((r) => r.id === c.instance.id),
    ).toBe(true);
    expect(
      listInstances(outsider, 'todo').some((r) => r.id === c.instance.id),
    ).toBe(true);
    const recipient = workflowContext(c.instance.id, outsider, actors);
    expect(recipient.canAct).toBe(true);
    expect(recipient.task?.assigneeIds).toEqual([outsider.id]);
    expect(getOrCreateAgreementDetail(agreementNo).houses[0]?.address).toBe(
      '转办路1号',
    );
  });
  it('returns the todo to the transferor after the recipient submits', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    const fill = draft.nodes.find((n) => n.type === 'task')!;
    fill.allowTransfer = true;
    fill.transferReturn = true;
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    const agreementNo = seedAgreement(1_200_000, '转回路1号');
    let c = start(v2.id, 1_200_000, agreementNo);
    const fillId = c.instance.currentNodeId;
    expect(
      workflowContext(c.instance.id, operator, actors).transferWillReturn,
    ).toBe(true);
    c = action(c, operator, 'transfer', {
      targetUserId: outsider.id,
      opinion: '请先看一下',
    });
    expect(c.instance.currentNodeId).toBe(fillId);
    expect(c.instance.events.at(-1)?.opinion).toContain('转回经办人审核');
    const recipient = workflowContext(c.instance.id, outsider, actors);
    expect(recipient.transferReturnName).toBe('经办人');
    expect(recipient.task?.returnToUserId).toBe(operator.id);
    const patched = structuredClone(getOrCreateAgreementDetail(agreementNo));
    patched.houses[0]!.address = '转回后地址';
    c = action(recipient, outsider, 'submit', {
      agreement: patched,
      opinion: '已补充',
    });
    expect(c.instance.currentNodeId).toBe(fillId);
    expect(c.instance.events.at(-1)?.action).toBe('transferReturn');
    expect(listInstances(outsider, 'todo')).toEqual([]);
    expect(
      listInstances(operator, 'todo').some((r) => r.id === c.instance.id),
    ).toBe(true);
    expect(getOrCreateAgreementDetail(agreementNo).houses[0]?.address).toBe(
      '转回后地址',
    );
    const back = workflowContext(c.instance.id, operator, actors);
    expect(back.task?.returnToUserId).toBeUndefined();
    expect(back.canAct).toBe(true);
    c = action(back, operator, 'submit');
    expect(c.instance.currentNodeId).not.toBe(fillId);
    expect(
      c.definition.nodes.find((n) => n.id === c.instance.currentNodeId)?.name,
    ).toBe('科长审核');
  });
  it('keeps the original return target when the recipient transfers again', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    const fill = draft.nodes.find((n) => n.type === 'task')!;
    fill.allowTransfer = true;
    fill.transferReturn = true;
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    let c = start(v2.id);
    c = action(c, operator, 'transfer', { targetUserId: outsider.id });
    const mid = workflowContext(c.instance.id, outsider, actors);
    c = action(mid, outsider, 'transfer', { targetUserId: leader.id });
    const last = workflowContext(c.instance.id, leader, actors);
    expect(last.task?.returnToUserId).toBe(operator.id);
    expect(last.transferReturnName).toBe('经办人');
    c = action(last, leader, 'submit');
    expect(workflowContext(c.instance.id, operator, actors).canAct).toBe(true);
    expect(listInstances(outsider, 'todo')).toEqual([]);
    expect(listInstances(leader, 'todo')).toEqual([]);
  });
  it('advances on one submit when the task is transferred back to the return target', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    const fill = draft.nodes.find((n) => n.type === 'task')!;
    fill.allowTransfer = true;
    fill.transferReturn = true;
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    let c = start(v2.id);
    const fillId = c.instance.currentNodeId;
    c = action(c, operator, 'transfer', { targetUserId: outsider.id });
    const mid = workflowContext(c.instance.id, outsider, actors);
    c = action(mid, outsider, 'transfer', { targetUserId: operator.id });
    const back = workflowContext(c.instance.id, operator, actors);
    expect(back.task?.returnToUserId).toBeUndefined();
    expect(back.transferReturnName).toBeUndefined();
    c = action(back, operator, 'submit');
    expect(c.instance.currentNodeId).not.toBe(fillId);
    expect(c.instance.events.some((e) => e.action === 'transferReturn')).toBe(
      false,
    );
    expect(
      c.definition.nodes.find((n) => n.id === c.instance.currentNodeId)?.name,
    ).toBe('科长审核');
  });
  it('still rejects instead of returning when the recipient rejects', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    const review = draft.nodes.find((n) => n.name === '科长审核')!;
    review.allowTransfer = true;
    review.transferReturn = true;
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    let c = start(v2.id);
    const fillId = c.instance.currentNodeId;
    c = action(c, operator, 'submit');
    c = action(
      workflowContext(c.instance.id, reviewer, actors),
      reviewer,
      'transfer',
      {
        targetUserId: outsider.id,
      },
    );
    const recipient = workflowContext(c.instance.id, outsider, actors);
    c = action(recipient, outsider, 'reject', {
      targetNodeId: fillId,
      opinion: '资料不足',
    });
    expect(c.instance.currentNodeId).toBe(fillId);
    expect(c.instance.events.some((e) => e.action === 'transferReturn')).toBe(
      false,
    );
    expect(c.instance.events.some((e) => e.action === 'reject')).toBe(true);
    expect(
      c.instance.tasks.some(
        (t) => t.status === 'pending' && t.assigneeIds.includes(reviewer.id),
      ),
    ).toBe(false);
    expect(workflowContext(c.instance.id, operator, actors).canAct).toBe(true);
  });
  it('blocks recall after the next node has been transferred', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    draft.nodes.find((n) => n.type === 'task')!.allowRecall = true;
    draft.nodes.find((n) => n.name === '科长审核')!.allowTransfer = true;
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    let c = start(v2.id);
    c = action(c, operator, 'submit');
    expect(
      workflowContext(c.instance.id, operator, actors).buttons.find(
        (b) => b.code === 'recall',
      )?.enabled,
    ).toBe(true);
    c = action(
      workflowContext(c.instance.id, reviewer, actors),
      reviewer,
      'transfer',
      {
        targetUserId: leader.id,
      },
    );
    expect(workflowContext(c.instance.id, leader, actors).canAct).toBe(true);
    expect(listInstances(reviewer, 'todo')).toEqual([]);
    expect(
      listInstances(reviewer, 'done').some((r) => r.id === c.instance.id),
    ).toBe(true);
    expect(
      workflowContext(c.instance.id, operator, actors).buttons.find(
        (b) => b.code === 'recall',
      )?.enabled,
    ).toBe(false);
    expect(() =>
      action(
        workflowContext(c.instance.id, operator, actors),
        operator,
        'recall',
      ),
    ).toThrow('不能撤回');
  });
  it('lets a monitor reassign, urge, suspend, resume and terminate with an audit trail', () => {
    const { definition } = setup();
    const monitor: RuntimeActor = {
      id: 'monitor',
      name: '监控员',
      roleIds: [],
      codes: ['Workflow:Monitor'],
    };
    const people = [...actors, monitor];
    const started = start(definition.id);
    expect(() =>
      interveneInstance(
        started.instance.id,
        {
          requestId: newId('intervene'),
          revision: started.instance.revision,
          action: 'urge',
        },
        operator,
        people,
      ),
    ).toThrow('无流程监控权限');
    let c = workflowContext(started.instance.id, monitor, people);
    expect(c.canIntervene).toBe(true);
    expect(c.canAct).toBe(false);
    c = interveneInstance(
      started.instance.id,
      {
        requestId: newId('intervene'),
        revision: c.instance.revision,
        action: 'urge',
      },
      monitor,
      people,
    );
    expect(c.instance.events.some((e) => e.action === 'urge')).toBe(true);
    expect(
      listInstances(monitor, 'monitor').find(
        (r) => r.id === started.instance.id,
      )?.urged,
    ).toBe(true);
    c = interveneInstance(
      started.instance.id,
      {
        requestId: newId('intervene'),
        revision: c.instance.revision,
        action: 'reassign',
        targetUserId: outsider.id,
      },
      monitor,
      people,
    );
    expect(c.instance.events.some((e) => e.action === 'reassign')).toBe(true);
    expect(listInstances(operator, 'todo')).toEqual([]);
    expect(
      listInstances(outsider, 'todo').some((r) => r.id === started.instance.id),
    ).toBe(true);
    expect(workflowContext(started.instance.id, outsider, people).canAct).toBe(
      true,
    );
    c = interveneInstance(
      started.instance.id,
      {
        requestId: newId('intervene'),
        revision: c.instance.revision,
        action: 'suspend',
      },
      monitor,
      people,
    );
    expect(c.instance.status).toBe('suspended');
    expect(listInstances(outsider, 'todo')).toEqual([]);
    expect(workflowContext(started.instance.id, outsider, people).canAct).toBe(
      false,
    );
    expect(() =>
      action(
        workflowContext(started.instance.id, outsider, people),
        outsider,
        'submit',
      ),
    ).toThrow('刷新');
    c = interveneInstance(
      started.instance.id,
      {
        requestId: newId('intervene'),
        revision: c.instance.revision,
        action: 'resume',
      },
      monitor,
      people,
    );
    expect(c.instance.status).toBe('running');
    expect(workflowContext(started.instance.id, outsider, people).canAct).toBe(
      true,
    );
    expect(() =>
      interveneInstance(
        started.instance.id,
        {
          requestId: newId('intervene'),
          revision: c.instance.revision,
          action: 'terminate',
        },
        monitor,
        people,
      ),
    ).toThrow('终止必须填写原因');
    c = interveneInstance(
      started.instance.id,
      {
        requestId: newId('intervene'),
        revision: c.instance.revision,
        action: 'terminate',
        opinion: '资料作废，终止重提',
      },
      monitor,
      people,
    );
    expect(c.instance.status).toBe('terminated');
    expect(c.canIntervene).toBe(false);
    expect(c.instance.tasks.some((t) => t.status === 'pending')).toBe(false);
    expect(() =>
      interveneInstance(
        started.instance.id,
        {
          requestId: newId('intervene'),
          revision: c.instance.revision,
          action: 'urge',
        },
        monitor,
        people,
      ),
    ).toThrow('已结束');
  });
  it('keeps a suspended instance occupying the agreement until it is terminated', () => {
    const { definition } = setup();
    const monitor: RuntimeActor = {
      id: 'monitor',
      name: '监控员',
      roleIds: [],
      codes: ['Workflow:Monitor'],
    };
    const agreementNo = seedAgreement(1_200_000, '干预路1号');
    const started = start(definition.id, 1_200_000, agreementNo);
    interveneInstance(
      started.instance.id,
      {
        requestId: newId('intervene'),
        revision: started.instance.revision,
        action: 'suspend',
      },
      monitor,
      [...actors, monitor],
    );
    expect(() => start(definition.id, 1_200_000, agreementNo)).toThrow('在途');
    const ended = interveneInstance(
      started.instance.id,
      {
        requestId: newId('intervene'),
        revision: started.instance.revision + 1,
        action: 'terminate',
        opinion: '终止后可重提',
      },
      monitor,
      [...actors, monitor],
    );
    expect(ended.instance.status).toBe('terminated');
    expect(start(definition.id, 1_200_000, agreementNo).instance.status).toBe(
      'running',
    );
  });
  it('computes natural-hour due time, notifies arrival, and ticks dueSoon or overdue', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    try {
      const { definition, forms } = setup();
      const draft = newWorkflowVersion(definition.id, 'admin');
      const fill = draft.nodes.find((n) => n.type === 'task')!;
      fill.sla = { durationHours: 24, warnHours: 2, overtime: 'urge' };
      const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
      const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
      const c = start(v2.id);
      expect(c.task?.dueAt).toBe('2026-01-02T00:00:00.000Z');
      expect(c.sla?.status).toBe('ok');
      expect(listNotices(operator).some((n) => n.type === 'arrive')).toBe(true);
      vi.setSystemTime(new Date('2026-01-01T23:00:00.000Z'));
      expect(listInstances(operator, 'todo')[0]?.slaStatus).toBe('dueSoon');
      expect(listNotices(operator).some((n) => n.type === 'dueSoon')).toBe(
        true,
      );
      vi.setSystemTime(new Date('2026-01-03T00:00:00.000Z'));
      expect(listInstances(operator, 'todo')[0]?.slaStatus).toBe('overdue');
      expect(listNotices(operator).some((n) => n.type === 'overdue')).toBe(
        true,
      );
      expect(listNotices(operator).some((n) => n.type === 'urge')).toBe(true);
      const paused = interveneInstance(
        c.instance.id,
        {
          requestId: newId('intervene'),
          revision: workflowContext(c.instance.id, operator).instance.revision,
          action: 'suspend',
        },
        {
          id: 'monitor',
          name: '监控员',
          roleIds: [],
          codes: ['Workflow:Monitor'],
        },
        [
          ...actors,
          {
            id: 'monitor',
            name: '监控员',
            roleIds: [],
            codes: ['Workflow:Monitor'],
          },
        ],
      );
      expect(paused.instance.status).toBe('suspended');
    } finally {
      vi.useRealTimers();
    }
  });
  it('notifies the initiator when a task is rejected', () => {
    const { definition, doc } = setup();
    let c = start(definition.id);
    c = action(c, operator, 'submit');
    c = action(workflowContext(c.instance.id, reviewer), reviewer, 'reject', {
      targetNodeId: doc.nodes[1]!.id,
      opinion: '请补充',
    });
    expect(listNotices(operator).some((n) => n.type === 'reject')).toBe(true);
  });
  it('assigns the department leader resolved from the org tree', () => {
    const { definition, forms } = setup();
    const deptLeader: RuntimeActor = {
      id: '3',
      name: '研发负责人',
      roleIds: [],
      codes: ['Workflow:Use'],
    };
    const people = [...actors, deptLeader];
    const draft = newWorkflowVersion(definition.id, 'admin');
    const chief = draft.nodes.find((n) => n.name === '科长审核')!;
    // 前端组未配负责人，应上溯到研发中心 leaderUserId=3
    chief.assignee = { type: 'departmentLeader', ids: ['D1003'], field: '' };
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    let c = startInstance(
      {
        definitionId: v2.id,
        agreementNo: seedAgreement(1_200_000, '部门负责人路'),
        title: '部门负责人',
        requestId: newId('start'),
      },
      operator,
      people,
    );
    c = actOnInstance(
      c.instance.id,
      {
        taskId: c.task!.id,
        revision: c.instance.revision,
        requestId: newId('action'),
        action: 'submit',
      },
      operator,
      people,
    );
    expect(workflowContext(c.instance.id, deptLeader, people).canAct).toBe(
      true,
    );
    expect(
      c.instance.tasks.find((t) => t.status === 'pending')?.assigneeIds,
    ).toEqual(['3']);
    c = actOnInstance(
      c.instance.id,
      {
        taskId: workflowContext(c.instance.id, deptLeader, people).task!.id,
        revision: c.instance.revision,
        requestId: newId('action'),
        action: 'pass',
      },
      deptLeader,
      people,
    );
    expect(c.instance.currentNodeId).not.toBe(chief.id);
  });
  it('assigns the approve node from the agreement handler field', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    const chief = draft.nodes.find((n) => n.name === '科长审核')!;
    chief.assignee = { type: 'field', ids: [], field: 'handlerUserId' };
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    const agreementNo = seedAgreement(1_200_000, '字段取人路');
    const detail = getOrCreateAgreementDetail(agreementNo);
    saveAgreementDetailAll({
      ...detail,
      basic: { ...detail.basic, handlerUserId: leader.id },
    });
    let c = start(v2.id, 1_200_000, agreementNo);
    c = action(c, operator, 'submit');
    expect(workflowContext(c.instance.id, leader, actors).canAct).toBe(true);
    expect(listInstances(reviewer, 'todo')).toEqual([]);
    expect(
      c.instance.tasks.find((t) => t.status === 'pending')?.assigneeIds,
    ).toEqual([leader.id]);
  });
  it('rolls back when the person field does not resolve to a handler', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    draft.nodes.find((n) => n.name === '科长审核')!.assignee = {
      type: 'field',
      ids: [],
      field: 'handlerUserId',
    };
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    const visitor: RuntimeActor = {
      id: 'visitor',
      name: '访客',
      roleIds: [],
      codes: [],
    };
    const agreementNo = seedAgreement(1_200_000, '字段取人空');
    const detail = getOrCreateAgreementDetail(agreementNo);
    saveAgreementDetailAll({
      ...detail,
      basic: { ...detail.basic, handlerUserId: visitor.id },
    });
    const c = startInstance(
      {
        definitionId: v2.id,
        agreementNo,
        title: '字段取人空',
        requestId: newId('start'),
      },
      operator,
      [...actors, visitor],
    );
    const nodeId = c.instance.currentNodeId;
    expect(() =>
      actOnInstance(
        c.instance.id,
        {
          taskId: c.task!.id,
          revision: c.instance.revision,
          requestId: newId('action'),
          action: 'submit',
        },
        operator,
        [...actors, visitor],
      ),
    ).toThrow('经办人');
    const again = workflowContext(c.instance.id, operator, actors);
    expect(again.instance.currentNodeId).toBe(nodeId);
    expect(again.canAct).toBe(true);
  });
  it('shares one task across comma-separated assist users', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    draft.nodes.find((n) => n.name === '科长审核')!.assignee = {
      type: 'field',
      ids: [],
      field: 'assistUserId',
    };
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const v2 = publishWorkflow(saved.id, saved.revision, forms, 'admin');
    const agreementNo = seedAgreement(1_200_000, '协办人路');
    const detail = getOrCreateAgreementDetail(agreementNo);
    saveAgreementDetailAll({
      ...detail,
      basic: { ...detail.basic, assistUserId: `${leader.id}、${outsider.id}` },
    });
    let c = start(v2.id, 1_200_000, agreementNo);
    c = action(c, operator, 'submit');
    const pending = c.instance.tasks.filter((t) => t.status === 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.assigneeIds).toEqual([leader.id, outsider.id]);
    expect(workflowContext(c.instance.id, outsider, actors).canAct).toBe(true);
  });
  it('applies arrive and button data actions and rolls back invalid numbers', () => {
    const { definition, forms } = setup();
    const draft = newWorkflowVersion(definition.id, 'admin');
    const fill = draft.nodes.find((n) => n.type === 'task')!;
    const chief = draft.nodes.find((n) => n.name === '科长审核')!;
    fill.dataActions = [
      { when: 'arrive', kind: 'set', field: 'acceptOpinion', value: '待填报' },
      { when: 'submit', kind: 'copy', field: 'remark', from: 'houseAddress' },
    ];
    chief.dataActions = [
      { when: 'arrive', kind: 'set', field: 'legalOpinion', value: '待审核' },
      { when: 'pass', kind: 'set', field: 'legalOpinion', value: '已通过' },
    ];
    const saved = saveWorkflow(draft, 'admin', draft.id, draft.revision);
    const frozen = freezeWorkflowForms(saved);
    expect(frozen.issues).toEqual([]);
    const v2 = publishWorkflow(saved.id, saved.revision, frozen.forms, 'admin');
    let c = start(v2.id);
    expect(c.instance.data.acceptOpinion).toBe('待填报');
    c = action(c, operator, 'submit');
    expect(getOrCreateAgreementDetail(c.instance.bizId!).basic.remark).toBe(
      '测试路1号',
    );
    expect(c.instance.data.legalOpinion).toBe('待审核');
    c = action(c, reviewer, 'pass');
    expect(
      getOrCreateAgreementDetail(c.instance.bizId!).flowFields.legalOpinion,
    ).toBe('已通过');
    const broken = newWorkflowVersion(v2.id, 'admin');
    broken.nodes.find((n) => n.type === 'task')!.dataActions = [
      { when: 'save', kind: 'set', field: 'BuChangJinE', value: '不是数字' },
    ];
    const brokenSaved = saveWorkflow(
      broken,
      'admin',
      broken.id,
      broken.revision,
    );
    const v3 = publishWorkflow(
      brokenSaved.id,
      brokenSaved.revision,
      forms,
      'admin',
    );
    const started = start(v3.id);
    expect(() => action(started, operator, 'save')).toThrow('数字');
    expect(
      workflowContext(started.instance.id, operator).instance.data.BuChangJinE,
    ).toBe(1_200_000);
  });
});

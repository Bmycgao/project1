import { describe, expect, it } from 'vitest';

import { sampleGraph } from '../web-ele/src/views/system/workflow/model';
import {
  applyImportedWorkflow,
  createDocument,
  createNode,
  diffWorkflowConfig,
  diffWorkflowVersions,
  documentOf,
  exportWorkflowJson,
  isWorkflowDocument,
  parseWorkflowJson,
  ratioPassCount,
  validateWorkflow,
} from './workflow';
import {
  applyWorkflowDataActions,
  computeDueAt,
  extraFieldsFromAccess,
  formatRemain,
  hasWorkflowDesignAccess,
  hasWorkflowMonitorAccess,
  hasWorkflowRuntimeAccess,
  slaBucket,
  WORKFLOW_AUTH,
} from './workflow-runtime';

function valid() {
  const doc = {
    ...createDocument(),
    code: 'FL_TEST',
    name: '审核流程',
    base: 'JD_01',
    ...sampleGraph(),
  };
  doc.nodes.forEach((n) => {
    if (n.type === 'approve') n.assignee.ids = ['R_ADMIN'];
  });
  return doc;
}
describe('workflow graph validation', () => {
  it('accepts an eight-node branch with explicit fallback and upstream rejections', () => {
    const doc = valid();
    expect(doc.nodes).toHaveLength(8);
    expect(validateWorkflow(doc)).toEqual([]);
  });
  it('preserves node bindings, layout and edge conditions after JSON roundtrip', () => {
    const doc = valid();
    doc.nodes[1]!.form = { type: 'form', id: 'FC_BASIC' };
    doc.viewport = { x: -30, y: 71, zoom: 0.75 };
    expect(createNode('task', 0, 0, 1).allowTransfer).toBe(false);
    doc.nodes[1]!.sla = { durationHours: 48, warnHours: 4, overtime: 'remind' };
    expect(isWorkflowDocument(JSON.parse(JSON.stringify(doc)))).toBe(true);
    expect(documentOf(doc)).toEqual(doc);
  });
  it('exports and reimports a workflow document while keeping draft identity', () => {
    const doc = valid();
    const text = exportWorkflowJson(doc);
    const parsed = parseWorkflowJson(text);
    expect(parsed).toEqual(documentOf(doc));
    expect(() => parseWorkflowJson('{')).toThrow('JSON');
    expect(() => parseWorkflowJson('{}')).toThrow('流程设计');
    const other = valid();
    other.code = 'FL_OTHER';
    other.name = '另一份';
    other.nodes = [
      createNode('start', 10, 10, 1),
      createNode('end', 80, 10, 2),
    ];
    other.edges = [];
    const applied = applyImportedWorkflow(doc, other, true);
    expect(applied.code).toBe(doc.code);
    expect(applied.name).toBe(doc.name);
    expect(applied.nodes).toHaveLength(2);
    expect(applyImportedWorkflow(doc, other, false).code).toBe('FL_OTHER');
    expect(() => parseWorkflowJson('')).toThrow('请提供');
  });
  it('lists node, edge, assignee and approve-mode changes between versions', () => {
    const before = valid();
    const after = structuredClone(before);
    const chief = after.nodes.find((n) => n.name === '科长审核')!;
    chief.name = '法务复核';
    chief.approveMode = 'ratio';
    chief.approveRatio = 50;
    chief.assignee = { type: 'user', ids: ['U1'], field: '' };
    chief.transferReturn = true;
    const extra = createNode('cc', 40, 40, 9);
    extra.name = '知会财务';
    after.nodes.push(extra);
    after.edges.push({
      id: 'edge_new',
      source: after.nodes[0]!.id,
      target: extra.id,
      type: 'pass',
      condition: '',
      isDefault: false,
      label: '抄送',
    });
    const lines = diffWorkflowVersions(before, after).map((l) => l.message);
    expect(lines.some((m) => m.includes('改名为「法务复核」'))).toBe(true);
    expect(lines.some((m) => m.includes('比例会签 50%'))).toBe(true);
    expect(lines.some((m) => m.includes('指定人员（U1）'))).toBe(true);
    expect(lines.some((m) => m.includes('新增节点「知会财务'))).toBe(true);
    expect(lines.some((m) => m.includes('新增连线'))).toBe(true);
    expect(lines.some((m) => m.includes('转办转回由关闭改为开启'))).toBe(true);
    expect(diffWorkflowVersions(before, structuredClone(before))).toEqual([]);
  });
  it('lists button, time limit, data action and field access changes', () => {
    const before = valid();
    const after = structuredClone(before);
    const chief = after.nodes.find((n) => n.name === '科长审核')!;
    chief.buttons = ['pass'];
    chief.sla = { durationHours: 24, warnHours: 4, overtime: 'urge' };
    chief.dataActions = [
      { when: 'pass', kind: 'set', field: 'legalOpinion', value: '已通过' },
    ];
    chief.fieldAccess = { legalOpinion: 'edit' };
    const lines = diffWorkflowConfig(before, after);
    expect(lines.some((m) => m.includes('按钮由通过、驳回改为通过'))).toBe(
      true,
    );
    expect(
      lines.some((m) => m.includes('时限由不限改为24 小时，超时催办')),
    ).toBe(true);
    expect(
      lines.some((m) =>
        m.includes('数据动作由无改为通过时把法务意见设为「已通过」'),
      ),
    ).toBe(true);
    expect(
      lines.some((m) => m.includes('字段权限由无改为法务意见可编辑')),
    ).toBe(true);
    expect(diffWorkflowConfig(before, structuredClone(before))).toEqual([]);
  });
  it('locates unassigned and unreachable nodes', () => {
    const doc = valid();
    const isolated = createNode('approve', 40, 60, 9);
    doc.nodes.push(isolated);
    const issues = validateWorkflow(doc).filter(
      (i) => i.nodeId === isolated.id,
    );
    expect(issues.some((i) => i.message.includes('办理人'))).toBe(true);
    expect(issues.some((i) => i.message.includes('无法从开始'))).toBe(true);
    expect(issues.some((i) => i.message.includes('结束节点'))).toBe(true);
  });
  it('detects missing and duplicate fallback routes and empty conditions', () => {
    const doc = valid();
    const branch = doc.edges.find(
      (e) => e.type === 'condition' && !e.isDefault,
    )!;
    branch.condition = '';
    expect(
      validateWorkflow(doc).some(
        (i) => i.edgeId === branch.id && i.message.includes('缺少条件'),
      ),
    ).toBe(true);
    branch.isDefault = true;
    expect(
      validateWorkflow(doc).some((i) => i.message.includes('仅配置一条')),
    ).toBe(true);
    doc.edges
      .filter((e) => e.type === 'condition')
      .forEach((e) => {
        e.isDefault = false;
      });
    expect(validateWorkflow(doc).some((i) => i.message.includes('兜底'))).toBe(
      true,
    );
  });
  it('excludes valid rejection paths from cycle detection but rejects forward cycles', () => {
    const doc = valid();
    const rejection = doc.edges.find((e) => e.type === 'reject')!;
    rejection.type = 'pass';
    expect(validateWorkflow(doc).some((i) => i.message.includes('环路'))).toBe(
      true,
    );
  });
  it('rejects downstream rejection targets and condition-node targets', () => {
    const doc = valid();
    const rejection = doc.edges.find((e) => e.type === 'reject')!;
    rejection.target = doc.nodes[5]!.id;
    expect(
      validateWorkflow(doc).some(
        (i) => i.edgeId === rejection.id && i.message.includes('上游'),
      ),
    ).toBe(true);
    rejection.target = doc.nodes[3]!.id;
    expect(
      validateWorkflow(doc).some(
        (i) => i.edgeId === rejection.id && i.message.includes('办理或审批'),
      ),
    ).toBe(true);
  });
  it('reports dangling edges without throwing', () => {
    const doc = valid();
    doc.edges[0]!.target = 'missing';
    expect(
      validateWorkflow(doc).some(
        (i) => i.edgeId === doc.edges[0]!.id && i.message.includes('悬空'),
      ),
    ).toBe(true);
  });
  it('rejects malformed data while allowing unfinished draft graphs', () => {
    expect(isWorkflowDocument(createDocument())).toBe(true);
    const doc = valid();
    doc.nodes.push(doc.nodes[0]!);
    expect(isWorkflowDocument(doc)).toBe(false);
    expect(isWorkflowDocument({ ...valid(), nodes: [null] })).toBe(false);
    expect(
      isWorkflowDocument({ ...valid(), viewport: { x: 0, y: 0, zoom: 0 } }),
    ).toBe(false);
    expect(isWorkflowDocument({ ...valid(), schemaVersion: 99 })).toBe(false);
  });
  it('accepts approveMode any, all or sequential and rejects unknown modes', () => {
    const doc = valid();
    doc.nodes[2]!.approveMode = 'all';
    expect(isWorkflowDocument(doc)).toBe(true);
    doc.nodes[2]!.approveMode = 'sequential';
    expect(isWorkflowDocument(doc)).toBe(true);
    doc.nodes[2]!.approveMode = 'ratio';
    doc.nodes[2]!.approveRatio = 50;
    expect(isWorkflowDocument(doc)).toBe(true);
    expect(ratioPassCount(3, 50)).toBe(2);
    expect(ratioPassCount(2, 50)).toBe(1);
    doc.nodes[2]!.approveRatio = 0;
    expect(isWorkflowDocument(doc)).toBe(false);
    doc.nodes[2]!.approveRatio = 50;
    doc.nodes[2]!.approveMode = 'bad' as 'all';
    expect(isWorkflowDocument(doc)).toBe(false);
  });
  it('accepts a boolean transfer-return flag and rejects other types', () => {
    const doc = valid();
    doc.nodes[1]!.allowTransfer = true;
    doc.nodes[1]!.transferReturn = true;
    expect(isWorkflowDocument(doc)).toBe(true);
    doc.nodes[1]!.transferReturn = 1 as unknown as boolean;
    expect(isWorkflowDocument(doc)).toBe(false);
  });
  it('turns fieldAccess extras into runtime fields for the frozen form', () => {
    const extras = extraFieldsFromAccess({
      legalOpinion: 'edit',
      houseAddress: 'readonly',
    });
    expect(extras.map((f) => f.key)).toEqual(['legalOpinion']);
    expect(extras[0]?.label).toBe('法务意见');
  });
  it('accepts dataActions and rejects malformed ones', () => {
    const doc = valid();
    doc.nodes[1]!.dataActions = [
      { when: 'arrive', kind: 'set', field: 'acceptOpinion', value: '待填报' },
      {
        when: 'submit',
        kind: 'copy',
        field: 'remark',
        from: 'houseAddress',
      },
    ];
    expect(isWorkflowDocument(doc)).toBe(true);
    doc.nodes[1]!.dataActions = [
      { when: 'jump' as 'arrive', kind: 'set', field: 'acceptOpinion' },
    ];
    expect(isWorkflowDocument(doc)).toBe(false);
  });
});

describe('workflow access codes', () => {
  it('lets Manage act as umbrella for design and runtime', () => {
    expect(
      hasWorkflowDesignAccess([WORKFLOW_AUTH.manage], WORKFLOW_AUTH.publish),
    ).toBe(true);
    expect(hasWorkflowRuntimeAccess([WORKFLOW_AUTH.manage], 'start')).toBe(
      true,
    );
  });
  it('requires Start to create instances and Use to handle', () => {
    expect(hasWorkflowRuntimeAccess([WORKFLOW_AUTH.use], 'start')).toBe(false);
    expect(hasWorkflowRuntimeAccess([WORKFLOW_AUTH.start], 'start')).toBe(true);
    expect(hasWorkflowRuntimeAccess([WORKFLOW_AUTH.start], 'handle')).toBe(
      true,
    );
    expect(hasWorkflowRuntimeAccess([WORKFLOW_AUTH.use], 'handle')).toBe(true);
    expect(
      hasWorkflowDesignAccess([WORKFLOW_AUTH.create], WORKFLOW_AUTH.publish),
    ).toBe(false);
    expect(
      hasWorkflowDesignAccess([WORKFLOW_AUTH.create], WORKFLOW_AUTH.create),
    ).toBe(true);
  });
  it('lets Monitor inspect runtime without granting start', () => {
    expect(hasWorkflowMonitorAccess([WORKFLOW_AUTH.monitor])).toBe(true);
    expect(hasWorkflowRuntimeAccess([WORKFLOW_AUTH.monitor], 'handle')).toBe(
      true,
    );
    expect(hasWorkflowRuntimeAccess([WORKFLOW_AUTH.monitor], 'start')).toBe(
      false,
    );
    expect(hasWorkflowMonitorAccess([WORKFLOW_AUTH.use])).toBe(false);
  });
});

describe('cc notify nodes', () => {
  it('requires cc recipients and a pass edge', () => {
    const doc = valid();
    const cc = createNode('cc', 400, 400, 20);
    doc.nodes.push(cc);
    const issues = validateWorkflow(doc).filter((i) => i.nodeId === cc.id);
    expect(issues.some((i) => i.message.includes('抄送人'))).toBe(true);
    expect(issues.some((i) => i.message.includes('无法从开始'))).toBe(true);
  });
  it('accepts a cc node on the forward path without buttons', () => {
    const doc = valid();
    const task = doc.nodes[1]!;
    const review = doc.nodes[2]!;
    const cc = createNode('cc', 475, 210, 20);
    cc.assignee = { type: 'initiator', ids: [], field: '' };
    const pass = doc.edges.find(
      (e) =>
        e.source === task.id && e.target === review.id && e.type === 'pass',
    )!;
    pass.target = cc.id;
    doc.edges.push({
      id: 'e_cc',
      source: cc.id,
      target: review.id,
      type: 'pass',
      label: '通过',
      condition: '',
      isDefault: false,
    });
    doc.nodes.push(cc);
    expect(cc.buttons).toEqual([]);
    expect(validateWorkflow(doc)).toEqual([]);
    expect(isWorkflowDocument(doc)).toBe(true);
  });
});

describe('parallel and subflow graph validation', () => {
  it('accepts a fork-join pair with two human branches', () => {
    const doc = {
      ...createDocument(),
      code: 'FL_PAR',
      name: '并行',
      base: 'JD_01',
    };
    const start = createNode('start', 80, 200, 1);
    const fill = createNode('task', 280, 200, 2);
    const fork = createNode('parallel', 480, 200, 3);
    const left = createNode('approve', 700, 80, 4);
    const right = createNode('approve', 700, 320, 5);
    const join = createNode('parallel', 920, 200, 6);
    const end = createNode('end', 1120, 200, 7);
    left.assignee.ids = ['R_ADMIN'];
    right.assignee.ids = ['R_ADMIN'];
    left.buttons = ['pass'];
    right.buttons = ['pass'];
    fork.name = '分叉';
    join.name = '汇聚';
    doc.nodes = [start, fill, fork, left, right, join, end];
    const link = (source: string, target: string, id: string) =>
      doc.edges.push({
        id,
        source,
        target,
        type: 'pass',
        label: '通过',
        condition: '',
        isDefault: false,
      });
    link(start.id, fill.id, 'e1');
    link(fill.id, fork.id, 'e2');
    link(fork.id, left.id, 'e3');
    link(fork.id, right.id, 'e4');
    link(left.id, join.id, 'e5');
    link(right.id, join.id, 'e6');
    link(join.id, end.id, 'e7');
    expect(validateWorkflow(doc)).toEqual([]);
    expect(isWorkflowDocument(doc)).toBe(true);
  });
  it('rejects a parallel node that is both split and join', () => {
    const doc = valid();
    const gate = createNode('parallel', 40, 40, 20);
    doc.nodes.push(gate);
    expect(
      validateWorkflow(doc).some((i) =>
        i.message.includes('分叉出口或两个汇入'),
      ),
    ).toBe(true);
  });
  it('requires a subflow binding and pass edge', () => {
    const doc = valid();
    const sub = createNode('subflow', 40, 40, 21);
    doc.nodes.push(sub);
    const issues = validateWorkflow(doc).filter((i) => i.nodeId === sub.id);
    expect(issues.some((i) => i.message.includes('子流程'))).toBe(true);
  });
});

describe('sla helpers', () => {
  it('computes due time and remaining text', () => {
    expect(computeDueAt('2026-01-01T00:00:00.000Z', 24)).toBe(
      '2026-01-02T00:00:00.000Z',
    );
    expect(computeDueAt('2026-01-01T00:00:00.000Z', 0)).toBeUndefined();
    const due = '2026-01-02T00:00:00.000Z';
    expect(slaBucket(due, 2, Date.parse('2026-01-01T00:00:00.000Z'))).toBe(
      'ok',
    );
    expect(slaBucket(due, 2, Date.parse('2026-01-01T23:00:00.000Z'))).toBe(
      'dueSoon',
    );
    expect(slaBucket(due, 2, Date.parse('2026-01-03T00:00:00.000Z'))).toBe(
      'overdue',
    );
    expect(formatRemain(due, Date.parse('2026-01-01T00:00:00.000Z'))).toContain(
      '剩余',
    );
    expect(formatRemain(due, Date.parse('2026-01-03T00:00:00.000Z'))).toContain(
      '已超时',
    );
  });
});

describe('workflow data actions', () => {
  it('sets a literal and copies another field', () => {
    const fields = [
      {
        key: 'acceptOpinion',
        label: '受理意见',
        type: 'textarea' as const,
        required: false,
        readonly: false,
        hidden: false,
      },
      {
        key: 'houseAddress',
        label: '房屋坐落',
        type: 'text' as const,
        required: false,
        readonly: false,
        hidden: false,
      },
      {
        key: 'remark',
        label: '协议备注',
        type: 'textarea' as const,
        required: false,
        readonly: false,
        hidden: false,
      },
    ];
    const arrived = applyWorkflowDataActions(
      { houseAddress: '测试路1号' },
      [
        {
          when: 'arrive',
          kind: 'set',
          field: 'acceptOpinion',
          value: '待填报',
        },
        { when: 'submit', kind: 'copy', field: 'remark', from: 'houseAddress' },
      ],
      'arrive',
      fields,
    );
    expect(arrived.data.acceptOpinion).toBe('待填报');
    expect(arrived.written).toEqual(['acceptOpinion']);
    const submitted = applyWorkflowDataActions(
      arrived.data,
      [
        {
          when: 'arrive',
          kind: 'set',
          field: 'acceptOpinion',
          value: '待填报',
        },
        { when: 'submit', kind: 'copy', field: 'remark', from: 'houseAddress' },
      ],
      'submit',
      fields,
    );
    expect(submitted.data.remark).toBe('测试路1号');
  });
  it('coerces numbers and rejects invalid literals', () => {
    const fields = [
      {
        key: 'BuChangJinE',
        label: '补偿金额',
        type: 'number' as const,
        required: true,
        readonly: false,
        hidden: false,
        min: 0,
      },
    ];
    expect(
      applyWorkflowDataActions(
        {},
        [{ when: 'save', kind: 'set', field: 'BuChangJinE', value: '12' }],
        'save',
        fields,
      ).data.BuChangJinE,
    ).toBe(12);
    expect(() =>
      applyWorkflowDataActions(
        {},
        [{ when: 'save', kind: 'set', field: 'BuChangJinE', value: 'x' }],
        'save',
        fields,
      ),
    ).toThrow('数字');
  });
});

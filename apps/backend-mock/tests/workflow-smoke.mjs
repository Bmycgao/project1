/** Run against the local mock API. Creates and removes only uniquely named test drafts. */
import assert from 'node:assert/strict';

const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:5320/api';
const response = await fetch(`${origin}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: process.env.WORKFLOW_TEST_USER || 'admin',
    password: process.env.WORKFLOW_TEST_PASSWORD || '123456',
  }),
});
const login = await response.json();
assert.equal(login.code, 0, 'Mock login must succeed');
const headers = {
  Authorization: `Bearer ${login.data.accessToken}`,
  'Content-Type': 'application/json',
};
async function request(path, method = 'GET', body) {
  const result = await fetch(`${origin}/system/workflow${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: result.status, ...(await result.json()) };
}
const ids = [];
try {
  const anonymous = await fetch(`${origin}/system/workflow/list`);
  assert.equal(anonymous.status, 401);
  const choices = await request('/options');
  assert.equal(choices.code, 0);
  assert.ok(choices.data.views.length);
  assert.ok(choices.data.departments.some((d) => d.id === 'D1002'));
  const document = {
    schemaVersion: 1,
    code: `FL_SMOKE_${Date.now()}`,
    name: '流程接口自动验证',
    base: 'JD_SMOKE',
    category: '协议',
    businessTable: 'XieYi',
    description: 'Temporary API smoke test',
    nodes: [
      {
        id: 'n_start',
        code: 'N_1',
        name: '开始',
        type: 'start',
        x: 100,
        y: 120,
      },
      { id: 'n_task', code: 'N_2', name: '填报', type: 'task', x: 380, y: 120 },
      { id: 'n_end', code: 'N_3', name: '结束', type: 'end', x: 660, y: 120 },
    ].map((n) => ({
      ...n,
      description: '',
      assignee: { type: 'initiator', ids: [], field: '' },
      form: { type: choices.data.views[0].type, id: choices.data.views[0].id },
      buttons: n.type === 'task' ? ['save', 'submit'] : [],
      rejectMode: 'previous',
      resubmitMode: 'return',
      allowRecall: false,
    })),
    edges: [
      {
        id: 'e_1',
        source: 'n_start',
        target: 'n_task',
        type: 'pass',
        label: '发起',
        condition: '',
        isDefault: false,
      },
      {
        id: 'e_2',
        source: 'n_task',
        target: 'n_end',
        type: 'pass',
        label: '提交',
        condition: '',
        isDefault: false,
      },
    ],
    viewport: { x: 30, y: 50, zoom: 0.85 },
  };
  const created = await request('', 'POST', document);
  assert.equal(created.code, 0);
  ids.push(created.data.id);
  const duplicate = await request('', 'POST', document);
  assert.equal(duplicate.status, 400);
  const changed = {
    ...created.data,
    name: '修改后的流程',
    nodes: created.data.nodes.map((n) => ({ ...n, x: n.x + 40 })),
  };
  const saved = await request(`/${created.data.id}`, 'PUT', changed);
  assert.equal(saved.code, 0);
  assert.equal(saved.data.revision, 2);
  const stale = await request(`/${created.data.id}`, 'PUT', created.data);
  assert.equal(stale.status, 400);
  const loaded = await request(`/${created.data.id}`);
  assert.deepEqual(loaded.data, saved.data);
  const malformed = await request(`/${created.data.id}`, 'PUT', {
    ...saved.data,
    nodes: [null],
  });
  assert.equal(malformed.status, 400);
  const copied = await request('', 'POST', {
    ...saved.data,
    code: `${document.code}_COPY`,
  });
  assert.equal(copied.code, 0);
  ids.push(copied.data.id);
  assert.notEqual(copied.data.id, created.data.id);
  assert.deepEqual(copied.data.nodes, saved.data.nodes);
  assert.deepEqual(copied.data.edges, saved.data.edges);
  assert.ok((await request('/list')).data.some((d) => d.id === copied.data.id));
  const check = await request(`/${created.data.id}/check`);
  assert.equal(check.code, 0);
  assert.ok(Array.isArray(check.data.issues));
  assert.equal(check.data.revision, saved.data.revision);
  const leaderDoc = {
    ...document,
    code: `FL_SMOKE_DEPT_${Date.now()}`,
    name: '部门负责人自动验证',
    nodes: [
      {
        id: 'n_start',
        code: 'N_1',
        name: '开始',
        type: 'start',
        x: 100,
        y: 120,
      },
      { id: 'n_task', code: 'N_2', name: '填报', type: 'task', x: 380, y: 120 },
      {
        id: 'n_review',
        code: 'N_3',
        name: '部门审核',
        type: 'approve',
        x: 660,
        y: 120,
      },
      { id: 'n_end', code: 'N_4', name: '结束', type: 'end', x: 940, y: 120 },
    ].map((n) => ({
      ...n,
      description: '',
      assignee:
        n.type === 'approve'
          ? { type: 'departmentLeader', ids: ['D1002'], field: '' }
          : { type: 'initiator', ids: [], field: '' },
      form: { type: 'page', id: '' },
      buttons:
        n.type === 'task'
          ? ['save', 'submit']
          : n.type === 'approve'
            ? ['pass']
            : [],
      rejectMode: 'previous',
      resubmitMode: 'return',
      allowRecall: false,
      approveMode: n.type === 'approve' ? 'sequential' : 'any',
      dataActions:
        n.type === 'task'
          ? [
              {
                when: 'arrive',
                kind: 'set',
                field: 'acceptOpinion',
                value: '待填报',
              },
            ]
          : n.type === 'approve'
            ? [
                {
                  when: 'pass',
                  kind: 'set',
                  field: 'legalOpinion',
                  value: '已通过',
                },
              ]
            : undefined,
    })),
    edges: [
      {
        id: 'e_1',
        source: 'n_start',
        target: 'n_task',
        type: 'pass',
        label: '发起',
        condition: '',
        isDefault: false,
      },
      {
        id: 'e_2',
        source: 'n_task',
        target: 'n_review',
        type: 'pass',
        label: '提交',
        condition: '',
        isDefault: false,
      },
      {
        id: 'e_3',
        source: 'n_review',
        target: 'n_end',
        type: 'pass',
        label: '通过',
        condition: '',
        isDefault: false,
      },
    ],
    viewport: { x: 30, y: 50, zoom: 0.85 },
  };
  const leaderCreated = await request('', 'POST', leaderDoc);
  assert.equal(leaderCreated.code, 0);
  ids.push(leaderCreated.data.id);
  const leaderCheck = await request(`/${leaderCreated.data.id}/check`);
  assert.equal(leaderCheck.code, 0);
  const leaderMessages = leaderCheck.data.issues
    .map((i) => i.message)
    .join(' ');
  assert.ok(!leaderMessages.includes('组织数据尚未配置部门负责人'));
  assert.ok(!leaderMessages.includes('指定部门已失效'));
  assert.ok(!leaderMessages.includes('所选部门没有配置负责人'));
  assert.ok(!leaderMessages.includes('没有具备流程办理权限'));
  for (const path of [
    '/workflow/definitions',
    '/workflow/agreements',
    '/workflow/instances?tab=todo',
    '/workflow/instances?tab=done',
    '/workflow/instances?tab=started',
    '/workflow/instances?tab=cc',
  ]) {
    const anonymousRuntime = await fetch(`${origin}${path}`);
    assert.equal(anonymousRuntime.status, 401);
    const runtime = await fetch(`${origin}${path}`, { headers });
    assert.equal(runtime.status, 200);
    const data = await runtime.json();
    assert.equal(data.code, 0);
    assert.ok(Array.isArray(data.data));
  }
  console.log(
    'PASS: authentication, options, draft CRUD, revision conflict, publication check, runtime definitions and task lists',
  );
} finally {
  for (const id of ids) {
    const removed = await request(`/${id}`, 'DELETE');
    assert.equal(removed.code, 0);
  }
  console.log(`Cleaned up ${ids.length} test drafts`);
}

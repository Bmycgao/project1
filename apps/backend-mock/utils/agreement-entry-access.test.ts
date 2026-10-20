/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import approve from '../api/biz/agreement/approve.post';
import batchSubmit from '../api/biz/agreement/batch-submit.post';
import remove from '../api/biz/agreement/delete.post';
import save from '../api/biz/agreement/detail.put';
import saveModule from '../api/biz/agreement/module/[module].put';
import reject from '../api/biz/agreement/reject.post';
import submit from '../api/biz/agreement/submit.post';
import {
  assertAgreementEntryWrite,
  assertAgreementLegacyReview,
} from './agreement-entry-access';
import { AGREEMENT_DATA_FILE } from './agreement-store';
import {
  getOrCreateAgreementDetail,
  rejectAgreementByNos,
  saveAgreementDetailAll,
  submitAgreementDetail,
} from './mock-agreement-detail';
import {
  agreementStore,
  createAgreeListRow,
  lockAgreementNumber,
} from './mock-agreement-list';

const state = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = tmpdir();
  return {
    root,
    directory: mkdtempSync(join(root, 'vben-entry-access-')),
    actionAuth: vi.fn(),
    moduleAuth: vi.fn(),
  };
});
vi.mock('./mock-persist', () => ({ DATA_DIR: state.directory }));
vi.mock('./mock-page-schema', () => ({ pageSchemaStore: [] }));
vi.mock('h3', () => ({
  eventHandler: (handler: unknown) => handler,
  readBody: async (event: any) => event.body,
  getRouterParam: (event: any, key: string) => event.params?.[key],
  setResponseStatus: vi.fn(),
}));
vi.mock('~/utils/agree-api-auth', () => ({
  AGREE_MODULE_AUTH: {
    basic: 'Agree:Module:basic',
    houses: 'Agree:Module:houses',
  },
  assertAgreeAction: state.actionAuth,
  assertAgreeAccess: state.moduleAuth,
}));
vi.mock('~/utils/agreement-module-resources', () => ({
  listCustomAgreementModuleResources: () => [],
}));

const workflowFile = join(state.directory, 'workflow-instances.json');
beforeEach(() => {
  rmSync(workflowFile, { force: true });
  state.actionAuth
    .mockReset()
    .mockReturnValue({ ok: true, codes: ['Agree:*'] });
  state.moduleAuth
    .mockReset()
    .mockReturnValue({ ok: true, codes: ['Agree:*'] });
});
afterAll(() => {
  if (
    !resolve(state.directory).startsWith(
      `${resolve(state.root)}${sep}vben-entry-access-`,
    )
  )
    throw new Error('Unexpected test directory');
  rmSync(state.directory, { recursive: true, force: true });
});
function draft() {
  const row = createAgreeListRow();
  const detail = getOrCreateAgreementDetail(row.id);
  return saveAgreementDetailAll({
    ...detail,
    basic: { ...detail.basic, compensatee: '测试人', amount: 1000 },
  });
}
function bind(reference: string, status = 'running') {
  writeFileSync(
    workflowFile,
    JSON.stringify({ instances: [{ bizId: reference, status }] }),
  );
}
const call = (handler: any, body: unknown, module = 'basic') =>
  handler({ body, params: { module } });

describe('普通协议入口不能绕过流程写入', () => {
  it.each(['running', 'suspended', 'unknown'])(
    '真实流程为 %s 时，即使协议仍叫草稿也只读',
    (status) => {
      const current = draft();
      bind(current.id, status);
      expect(getOrCreateAgreementDetail(current.id)).toMatchObject({
        statusValue: '草稿',
        entryEditable: false,
      });
      expect(() => assertAgreementEntryWrite(current.id)).toThrow('只读');
      expect(() => assertAgreementLegacyReview(current.id)).toThrow('只读');
    },
  );

  it.each(['待复核', '待生效', '已签约', '自定义演示状态'])(
    '演示状态 %s 也不能覆盖运行中的流程限制',
    async (statusValue) => {
      const current = draft();
      agreementStore.update((snapshot) => {
        snapshot.rows.find((row) => row.id === current.id)!.statusValue =
          statusValue;
      });
      bind(current.id);
      const editable = getOrCreateAgreementDetail(current.id);
      expect(editable.entryEditable).toBe(false);
      expect(
        await call(save, {
          ...editable,
          basic: { ...editable.basic, amount: 2000 },
        }),
      ).toMatchObject({
        code: -1,
        message: expect.stringContaining('普通详情只读'),
      });
      expect(getOrCreateAgreementDetail(current.id).basic.amount).toBe(1000);
    },
  );

  it.each(['completed', 'terminated'])(
    '历史流程为 %s 的草稿可整页和分模块保存，仍保留编号及删除保护',
    async (status) => {
      const current = draft();
      lockAgreementNumber(current.id);
      bind(current.id, status);
      expect(getOrCreateAgreementDetail(current.id)).toMatchObject({
        entryEditable: true,
        entryReadonlyReason: '',
        agreementNoEditable: false,
      });
      expect(
        await call(save, {
          ...current,
          basic: { ...current.basic, amount: 2000 },
        }),
      ).toMatchObject({ code: 0 });
      expect(
        await call(saveModule, {
          id: current.id,
          data: { basic: { ...current.basic, amount: 3000 } },
        }),
      ).toMatchObject({ code: 0 });
      expect(getOrCreateAgreementDetail(current.id).basic.amount).toBe(3000);
      expect(await call(remove, { agreementIds: [current.id] })).toMatchObject({
        code: -1,
        message: expect.stringContaining('流程历史'),
      });
    },
  );

  it('旧编号关联的已完成流程允许改正文，但不能改协议编号', async () => {
    const current = draft();
    const changed = saveAgreementDetailAll({
      ...current,
      agreementNo: 'HISTORY-ALIAS',
    });
    bind(current.agreementNo, 'completed');
    expect(getOrCreateAgreementDetail(changed.id)).toMatchObject({
      entryEditable: true,
      agreementNoEditable: false,
    });
    expect(
      await call(save, { ...changed, agreementNo: 'NEW-NUMBER' }),
    ).toMatchObject({
      code: -1,
      message: expect.stringContaining('编号'),
    });
  });

  it('告知单关联 20 个已完成及 10 个已终止流程，仍可编辑并保留编号锁', () => {
    const current = draft();
    submitAgreementDetail(current);
    rejectAgreementByNos([current.id]);
    writeFileSync(
      workflowFile,
      JSON.stringify({
        instances: [
          ...Array.from({ length: 20 }, () => ({
            bizId: current.id,
            status: 'completed',
          })),
          ...Array.from({ length: 10 }, () => ({
            businessNo: current.agreementNo,
            status: 'terminated',
          })),
        ],
      }),
    );
    expect(getOrCreateAgreementDetail(current.id)).toMatchObject({
      entryEditable: true,
      statusValue: '告知单',
      agreementNoEditable: false,
    });
  });

  it.each(['running', 'suspended', 'unknown'])(
    '存在完成和终止历史，但另一流程为 %s 时仍只读',
    (status) => {
      const current = draft();
      writeFileSync(
        workflowFile,
        JSON.stringify({
          instances: [
            { bizId: current.id, status: 'completed' },
            { bizId: current.id, status },
            { businessNo: current.agreementNo, status: 'terminated' },
          ],
        }),
      );
      expect(() => assertAgreementEntryWrite(current.id)).toThrow('只读');
    },
  );

  it.each(
    ['none', 'completed', 'terminated'].flatMap((flowStatus) =>
      [
        'signed',
        'approved',
        'review',
        'submitted',
        'finalized-row',
        'custom',
      ].map((status) => ({ flowStatus, status })),
    ),
  )(
    '流程 $flowStatus 且演示状态为 $status 时，正文可保存且保留原状态',
    async ({ flowStatus, status }) => {
      const current = draft();
      if (flowStatus !== 'none') bind(current.id, flowStatus);
      agreementStore.update((snapshot) => {
        const row = snapshot.rows.find((item) => item.id === current.id)!;
        if (status === 'signed') row.isSigned = '已签约';
        else if (status === 'finalized-row') row.statusValue = '签约已确认';
        else if (status === 'custom') row.statusValue = '自定义演示状态';
        else {
          row.statusValue = status === 'review' ? '待复核' : '待生效';
          Object.assign(snapshot.details[current.id]!, { status });
        }
      });
      const editable = getOrCreateAgreementDetail(current.id);
      expect(editable.entryEditable).toBe(true);
      expect(
        await call(save, {
          ...editable,
          basic: { ...editable.basic, amount: 2000 },
        }),
      ).toMatchObject({ code: 0 });
      expect(
        await call(saveModule, {
          id: current.id,
          data: { basic: { ...editable.basic, amount: 3000 } },
        }),
      ).toMatchObject({ code: 0 });
      expect(getOrCreateAgreementDetail(current.id)).toMatchObject({
        entryEditable: true,
        status: editable.status,
        statusValue: editable.statusValue,
        isSigned: editable.isSigned,
        basic: { amount: 3000 },
      });
    },
  );

  it.each([
    '整页保存',
    '基础模块保存',
    '房屋模块保存',
    '详情提交',
    '批量提交',
    '列表通过',
    '列表驳回',
    '删除',
  ])('%s拒绝流程外写入，包括旧页面、伪造状态和混合批量', async (operation) => {
    const unlocked = draft();
    const current = draft(); // 模拟提交前已打开的编辑页资料。
    bind(current.id);
    const before = readFileSync(AGREEMENT_DATA_FILE, 'utf8');
    const flowBefore = readFileSync(workflowFile, 'utf8');
    const forged = {
      ...current,
      entryEditable: true,
      entryReadonlyReason: '',
      status: 'draft',
      statusValue: '草稿',
      basic: { ...current.basic, amount: 2000 },
    };
    const mixed = { agreementIds: [unlocked.id, current.id] };
    let result;
    if (operation === '整页保存') result = await call(save, forged);
    else if (operation === '基础模块保存')
      result = await call(saveModule, {
        id: current.id,
        data: { basic: forged.basic },
      });
    else if (operation === '房屋模块保存')
      result = await call(
        saveModule,
        { id: current.id, data: { houses: [] } },
        'houses',
      );
    else if (operation === '详情提交') result = await call(submit, forged);
    else if (operation === '批量提交') result = await call(batchSubmit, mixed);
    else if (operation === '列表通过') result = await call(approve, mixed);
    else if (operation === '列表驳回') result = await call(reject, mixed);
    else result = await call(remove, mixed);
    expect(result).toMatchObject({
      code: -1,
      message: expect.stringContaining('普通详情只读'),
    });
    expect(readFileSync(AGREEMENT_DATA_FILE, 'utf8')).toBe(before);
    expect(readFileSync(workflowFile, 'utf8')).toBe(flowBefore);
  });

  it('未进入配置流程时，旧版复核的演示状态不锁正文；编号仍锁定', async () => {
    const current = draft();
    expect(
      await call(save, {
        ...current,
        basic: { ...current.basic, amount: 2000 },
      }),
    ).toMatchObject({ code: 0 });
    expect(
      await call(
        saveModule,
        {
          id: current.id,
          data: {
            houses: [
              { id: 'h1', address: '保存路1号', certNo: '', propertyType: '' },
            ],
          },
        },
        'houses',
      ),
    ).toMatchObject({ code: 0 });
    expect(getOrCreateAgreementDetail(current.id).basic.amount).toBe(2000);
    submitAgreementDetail(getOrCreateAgreementDetail(current.id));
    expect(() => assertAgreementEntryWrite(current.id)).not.toThrow(/./);
    expect(getOrCreateAgreementDetail(current.id)).toMatchObject({
      statusValue: '待复核',
      entryEditable: true,
      agreementNoEditable: false,
    });
    expect(() => assertAgreementLegacyReview(current.id)).not.toThrow(/./);
    rejectAgreementByNos([current.id]);
    expect(getOrCreateAgreementDetail(current.id)).toMatchObject({
      entryEditable: true,
      agreementNoEditable: false,
    });
    expect(() => assertAgreementEntryWrite(current.id)).not.toThrow(/./);
  });

  it.each(['整页', '模块'])(
    '%s保存仍需编辑权限，模块可见不能替代',
    async (mode) => {
      const current = draft();
      state.actionAuth.mockReturnValue({
        ok: false,
        response: { code: -1, error: '无编辑权限' },
      });
      expect(
        await call(mode === '整页' ? save : saveModule, {
          id: current.id,
          data: { basic: current.basic },
        }),
      ).toMatchObject({ error: '无编辑权限' });
      expect(state.actionAuth).toHaveBeenCalledWith(expect.anything(), 'edit');
      expect(state.moduleAuth).not.toHaveBeenCalled();
    },
  );

  it('旧编号流程关联仍受保护；实例文件缺失后流程接管标记继续生效', () => {
    const current = draft();
    bind(current.agreementNo);
    expect(() => assertAgreementEntryWrite(current.id)).toThrow('只读');
    lockAgreementNumber(current.id);
    rmSync(workflowFile);
    expect(() => assertAgreementEntryWrite(current.id)).toThrow('已由流程接管');
  });

  it('流程文件损坏时不放开普通编辑权限', () => {
    const current = draft();
    writeFileSync(workflowFile, '{broken');
    expect(() => assertAgreementEntryWrite(current.id)).toThrow(/./);
  });
});

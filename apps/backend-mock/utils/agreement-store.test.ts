/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = tmpdir();
  const directory = mkdtempSync(join(root, 'vben-agreement-store-'));
  return { directory, persistDirectory: directory, root };
});
vi.mock('./mock-persist', () => ({
  get DATA_DIR() {
    return storage.persistDirectory;
  },
}));
vi.mock('./mock-page-schema', () => ({ pageSchemaStore: [] }));
const file = join(storage.directory, 'agreements.json');
async function restart() {
  vi.resetModules();
  return {
    list: await import('./mock-agreement-list'),
    detail: await import('./mock-agreement-detail'),
    workflow: await import('./workflow-agreement'),
  };
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv('VBEN_AGREEMENT_DATA_DIR', '');
  storage.persistDirectory = storage.directory;
  rmSync(file, { force: true });
  rmSync(join(storage.directory, 'workflow-instances.json'), { force: true });
  rmSync(join(storage.directory, 'agreements.v1.backup.json'), { force: true });
});
afterAll(() => {
  vi.unstubAllEnvs();
  if (
    !resolve(storage.directory).startsWith(
      `${resolve(storage.root)}${sep}vben-agreement-store-`,
    )
  )
    throw new Error('Unexpected test directory');
  rmSync(storage.directory, { recursive: true, force: true });
});

describe('协议持久化与重启恢复', () => {
  it.each(['completed', 'terminated'])(
    '流程 %s 后草稿跨重启恢复编辑，保留编号锁和修改后的资料',
    async (status) => {
      let current = await restart();
      const row = current.list.createAgreeListRow();
      current.list.lockAgreementNumber(row.id);
      writeFileSync(
        join(storage.directory, 'workflow-instances.json'),
        JSON.stringify({
          instances: [{ bizId: row.id, status }],
        }),
      );
      current = await restart();
      const detail = current.detail.getOrCreateAgreementDetail(row.id);
      expect(detail).toMatchObject({
        entryEditable: true,
        agreementNoEditable: false,
      });
      current.detail.saveAgreementDetailAll({
        ...detail,
        basic: { ...detail.basic, amount: 2000 },
      });
      current = await restart();
      expect(current.detail.getOrCreateAgreementDetail(row.id)).toMatchObject({
        entryEditable: true,
        agreementNoEditable: false,
        basic: { amount: 2000 },
      });
    },
  );

  it('流程接管的正文锁跨重启保留，与普通复核编号锁分开', async () => {
    let current = await restart();
    const row = current.list.createAgreeListRow();
    expect(
      current.detail.getOrCreateAgreementDetail(row.id).entryEditable,
    ).toBe(true);
    const rollback = current.list.lockAgreementNumber(row.id);
    expect(
      current.detail.getOrCreateAgreementDetail(row.id).entryEditable,
    ).toBe(false);
    rollback();
    expect(
      current.detail.getOrCreateAgreementDetail(row.id).entryEditable,
    ).toBe(true);
    current.list.lockAgreementNumber(row.id);
    current = await restart();
    expect(current.detail.getOrCreateAgreementDetail(row.id)).toMatchObject({
      entryEditable: false,
      agreementNoEditable: false,
    });
  });

  it('草稿改号保持内部 ID，重复编号和无效 ID 不会覆盖其他协议', async () => {
    const current = await restart();
    const first = current.list.createAgreeListRow();
    const second = current.list.createAgreeListRow();
    const detail = current.detail.getOrCreateAgreementDetail(first.agreementNo);
    const changed = current.detail.saveAgreementDetailAll({
      ...detail,
      agreementNo: 'CHANGED-NO',
    });
    expect(changed).toMatchObject({
      id: first.id,
      agreementNo: 'CHANGED-NO',
      basic: { agreementNo: 'CHANGED-NO' },
    });
    expect(current.list.findAgreeListRow(first.agreementNo)?.id).toBe(first.id);
    const snapshot = readFileSync(file, 'utf8');
    expect(() =>
      current.detail.saveAgreementDetailAll({
        ...changed,
        agreementNo: second.agreementNo,
      }),
    ).toThrow('协议编号已存在');
    expect(() =>
      current.detail.saveAgreementDetailAll({
        ...changed,
        id: 'INVALID-ID',
        agreementNo: second.agreementNo,
      }),
    ).toThrow('协议不存在');
    expect(readFileSync(file, 'utf8')).toBe(snapshot);
    const saved = current.detail.saveAgreementDetailAll({
      ...detail,
      basic: {
        ...detail.basic,
        agreementNo: 'CHANGED-NO',
        agreementName: '名称正常保存',
      },
    });
    expect(saved.basic.agreementNo).toBe('CHANGED-NO');
    expect(saved.basic.agreementName).toBe('名称正常保存');
  });

  it('仅新增的空白草稿也能恢复，且不会套用演示资料', async () => {
    const first = await restart();
    const row = first.list.createAgreeListRow();
    const blank = first.detail.getOrCreateAgreementDetail(row.agreementNo);
    const restored = await restart();
    expect(restored.list.findAgreeListRow(row.agreementNo)).toEqual(row);
    expect(restored.detail.getOrCreateAgreementDetail(row.agreementNo)).toEqual(
      blank,
    );
    expect(blank.basic.amount).toBe('');
    expect(blank.houses).toEqual([]);
  });

  it.each(['', '   ', 'X'.repeat(65), '编号\n换行'])(
    '编号校验失败不修改存档：%s',
    async (number) => {
      const current = await restart();
      const row = current.list.createAgreeListRow();
      const detail = current.detail.getOrCreateAgreementDetail(row.id);
      const snapshot = readFileSync(file, 'utf8');
      expect(() =>
        current.detail.saveAgreementDetailAll({
          ...detail,
          basic: { ...detail.basic, agreementNo: number },
        }),
      ).toThrow('协议编号必填');
      expect(readFileSync(file, 'utf8')).toBe(snapshot);
    },
  );

  it('全量保存后恢复列表、全部明细、扩展字段和流程绑定资料', async () => {
    const first = await restart();
    const row = first.list.createAgreeListRow();
    const draft = first.detail.getOrCreateAgreementDetail(row.agreementNo);
    const saved = first.detail.saveAgreementDetailAll({
      ...draft,
      basic: {
        ...draft.basic,
        compensatee: '持久化测试',
        agreementName: '测试协议',
        amount: 0,
        remark: '已保存',
      },
      signing: { ...draft.signing, houseAddress: '重启路8号', signDate: '' },
      houses: [
        {
          id: 'house-1',
          address: '重启路8号',
          certNo: '证号1',
          propertyType: '住宅',
          buildArea: 120,
        },
      ],
      rightHolders: [
        {
          id: 'holder-1',
          agreementNo: row.agreementNo,
          name: '持久化测试',
          idNo: 'test-id',
          phone: '123',
        },
      ],
      basicTables: { members: [{ id: 'member-1', name: '成员甲' }] },
      compensation: { ...draft.compensation, amount: 0, remark: '补偿备注' },
      population: { ...draft.population, familySize: 0 },
      signMaterials: [
        {
          id: 'material-1',
          category: '身份证明',
          required: '是',
          fileName: 'test.pdf',
          remark: '附件记录',
        },
      ],
      extraForms: { custom: { note: '自定义值', empty: '' } },
      extraTables: { customRows: [{ amount: 0 }] },
      flowFields: { customAmount: 0, auditNote: '已核对' },
    });
    const restored = await restart();
    expect(restored.detail.getOrCreateAgreementDetail(row.agreementNo)).toEqual(
      saved,
    );
    expect(
      restored.list.queryAgreeListByScene({
        scene: 'entry',
        keyword: '持久化测试',
      }),
    ).toEqual([
      expect.objectContaining({
        agreementNo: row.agreementNo,
        compensatee: '持久化测试',
        houseAddress: '重启路8号',
      }),
    ]);
    expect(
      restored.workflow.requireExistingAgreement(row.agreementNo),
    ).toBeTruthy();
    expect(
      restored.workflow.workflowDataFromAgreement(row.agreementNo),
    ).toMatchObject({ compensatee: '持久化测试', BuChangJinE: 0 });
  });

  it('分模块保存同步列表，流程回写和审核状态也能跨重启保留', async () => {
    let current = await restart();
    const row = current.list.createAgreeListRow();
    const blank = current.detail.getOrCreateAgreementDetail(row.agreementNo);
    current.detail.saveAgreementDetailModule(row.agreementNo, 'basic', {
      basic: {
        ...blank.basic,
        agreementNo: '模块新编号',
        compensatee: '模块保存人',
      },
    });
    current = await restart();
    expect(current.list.findAgreeListRow(row.agreementNo)?.compensatee).toBe(
      '模块保存人',
    );
    expect(
      current.detail.getOrCreateAgreementDetail(row.agreementNo).basic
        .agreementNo,
    ).toBe('模块新编号');
    current.workflow.syncAgreementFromWorkflow(row.agreementNo, {
      houseAddress: '流程回写路',
      BuChangJinE: 3200,
    });
    current.detail.submitAgreementByNos([row.agreementNo]);
    current = await restart();
    expect(current.list.findAgreeListRow(row.agreementNo)?.statusValue).toBe(
      '待复核',
    );
    expect(
      current.detail.getOrCreateAgreementDetail(row.agreementNo),
    ).toMatchObject({
      statusValue: '待复核',
      entryEditable: true,
      agreementNoEditable: false,
      basic: { amount: 3200, statusValue: '待复核' },
      signing: { houseAddress: '流程回写路' },
    });
    current.detail.rejectAgreementByNos([row.agreementNo], '补资料');
    current = await restart();
    expect(
      current.detail.getOrCreateAgreementDetail(row.agreementNo).compensation
        .remark,
    ).toBe('驳回：补资料');
    current.detail.approveAgreementByNos([row.agreementNo]);
    current = await restart();
    expect(current.list.findAgreeListRow(row.agreementNo)?.statusValue).toBe(
      '项目经理已审核',
    );
  });

  it('删除后重启不会复活；清空全部协议不会重新灌入演示数据', async () => {
    let current = await restart();
    const row = current.list.createAgreeListRow();
    current.detail.saveAgreementDetailAll(
      current.detail.getOrCreateAgreementDetail(row.agreementNo),
    );
    current.detail.deleteAgreementByNos([row.agreementNo, 'LL-4-015']);
    current = await restart();
    expect(current.list.findAgreeListRow(row.agreementNo)).toBeUndefined();
    expect(current.list.findAgreeListRow('LL-4-015')).toBeUndefined();
    expect(
      JSON.parse(readFileSync(file, 'utf8')).details[row.id],
    ).toBeUndefined();
    expect(() =>
      current.detail.saveAgreementDetailAll({ agreementNo: row.agreementNo }),
    ).toThrow('已删除');
    current.detail.deleteAgreementByNos(
      current.list.AGREE_ALL_ROWS.map((item) => item.agreementNo),
    );
    current = await restart();
    expect(current.list.AGREE_ALL_ROWS).toEqual([]);
  });

  it('同一时间删除再重启新增也不复用标识或流水号', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(123_456);
    let current = await restart();
    const first = current.list.createAgreeListRow();
    current.detail.deleteAgreementByNos([first.agreementNo]);
    current = await restart();
    const second = current.list.createAgreeListRow();
    expect(second.id).not.toBe(first.id);
    expect(second.agreementNo).not.toBe(first.agreementNo);
    expect(JSON.parse(readFileSync(file, 'utf8')).sequence).toBe(2);
  });

  it('磁盘写入失败时保存、新增和删除均报错，内存与原存档都不改变', async () => {
    const current = await restart();
    const row = current.list.createAgreeListRow({ compensatee: '旧资料' });
    const blank = current.detail.getOrCreateAgreementDetail(row.agreementNo);
    current.detail.saveAgreementDetailAll(blank);
    const snapshot = readFileSync(file, 'utf8');
    mkdirSync(`${file}.tmp`);
    try {
      expect(() =>
        current.detail.saveAgreementDetailAll({
          ...blank,
          basic: { ...blank.basic, compensatee: '未保存' },
        }),
      ).toThrow('未写入磁盘');
      expect(() => current.list.createAgreeListRow()).toThrow('未写入磁盘');
      expect(() =>
        current.detail.saveAgreementDetailAll({
          ...blank,
          basic: { ...blank.basic, agreementNo: 'FAILED-RENAME' },
        }),
      ).toThrow('未写入磁盘');
      expect(current.list.findAgreeListRow('FAILED-RENAME')).toBeUndefined();
      expect(() =>
        current.list.patchAgreeListRow(row.agreementNo, { isSigned: '已签约' }),
      ).toThrow('未写入磁盘');
      expect(() =>
        current.detail.deleteAgreementByNos([row.agreementNo]),
      ).toThrow('未写入磁盘');
      expect(
        current.detail.getOrCreateAgreementDetail(row.agreementNo),
      ).toEqual(blank);
      expect(current.list.findAgreeListRow(row.agreementNo)).toEqual(row);
      expect(readFileSync(file, 'utf8')).toBe(snapshot);
    } finally {
      rmdirSync(`${file}.tmp`);
    }
    current.detail.saveAgreementDetailAll({
      ...blank,
      basic: { ...blank.basic, compensatee: '重试成功' },
    });
    const restored = await restart();
    expect(restored.list.findAgreeListRow(row.agreementNo)?.compensatee).toBe(
      '重试成功',
    );
  });

  it.each([
    '{broken',
    '{"version":1,"sequence":0,"rows":[],"details":{"orphan":{}}}',
  ])('损坏存档报错并保留原文件：%s', async (raw) => {
    writeFileSync(file, raw, 'utf8');
    await expect(restart()).rejects.toThrow('无法读取协议数据');
    expect(readFileSync(file, 'utf8')).toBe(raw);
  });

  it('正常保存通过替换文件提交，不遗留临时存档', async () => {
    const current = await restart();
    current.list.createAgreeListRow();
    expect(existsSync(file)).toBe(true);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it('生成短年度流水号，跳过手工号和历史号，跨年重新计数且旧年不复用', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 5, 1));
      let current = await restart();
      const first = current.list.createAgreeListRow();
      expect(first.agreementNo).toBe('LL-2026-0001');
      const detail = current.detail.getOrCreateAgreementDetail(first.id);
      current.detail.saveAgreementDetailAll({
        ...detail,
        basic: { ...detail.basic, agreementNo: 'LL-2026-0002' },
      });
      expect(current.list.createAgreeListRow().agreementNo).toBe(
        'LL-2026-0003',
      );
      current.detail.deleteAgreementByNos([first.id]);
      current = await restart();
      const next = current.list.createAgreeListRow();
      expect(next.agreementNo).toBe('LL-2026-0004');
      const nextDetail = current.detail.getOrCreateAgreementDetail(next.id);
      expect(() =>
        current.detail.saveAgreementDetailAll({
          ...nextDetail,
          basic: { ...nextDetail.basic, agreementNo: 'LL-2026-0001' },
        }),
      ).toThrow('曾被其他协议使用');
      expect(() =>
        current.detail.saveAgreementDetailAll({
          ...nextDetail,
          basic: { ...nextDetail.basic, agreementNo: 'LL-2026-0002' },
        }),
      ).toThrow('曾被其他协议使用');
      vi.setSystemTime(new Date(2027, 5, 1));
      expect(current.list.createAgreeListRow().agreementNo).toBe(
        'LL-2027-0001',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('草稿改号的明细和旧链接跨重启保留，打印读取同一份新编号资料', async () => {
    let current = await restart();
    const row = current.list.createAgreeListRow();
    const detail = current.detail.getOrCreateAgreementDetail(row.id);
    const saved = current.detail.saveAgreementDetailAll({
      ...detail,
      basic: { ...detail.basic, agreementNo: '手工-2026-0088', amount: 100 },
      houses: [
        { id: 'h1', address: '同一处房屋', certNo: '', propertyType: '' },
      ],
      rightHolders: [
        {
          id: 'r1',
          agreementNo: row.agreementNo,
          name: '测试人',
          idNo: '',
          phone: '',
        },
      ],
      extraForms: { custom: { note: '完整保留' } },
      flowFields: { agreementNo: row.agreementNo, note: '流程资料' },
    });
    current = await restart();
    for (const ref of [row.id, row.agreementNo, '手工-2026-0088'])
      expect(current.detail.getOrCreateAgreementDetail(ref)).toEqual(saved);
    expect(saved.rightHolders[0]!.agreementNo).toBe('手工-2026-0088');
    expect(saved.flowFields!.agreementNo).toBe('手工-2026-0088');
    const snapshot = JSON.parse(readFileSync(file, 'utf8'));
    expect(snapshot.details[row.id].houses[0].address).toBe('同一处房屋');
    expect(snapshot.numberChanges[0]).toMatchObject({
      agreementId: row.id,
      from: row.agreementNo,
      to: '手工-2026-0088',
    });
    expect(
      current.workflow
        .listWorkflowAgreements()
        .find((item) => item.id === row.id)?.agreementNo,
    ).toBe('手工-2026-0088');
  });

  it('提交时可同时保存草稿新编号；提交后和驳回后均不能改号或伪造解锁', async () => {
    let current = await restart();
    const row = current.list.createAgreeListRow();
    const detail = current.detail.getOrCreateAgreementDetail(row.id);
    const submitted = current.detail.submitAgreementDetail({
      ...detail,
      basic: { ...detail.basic, agreementNo: '提交编号' },
    });
    expect(submitted.agreementNoEditable).toBe(false);
    current.detail.rejectAgreementByNos([row.id]);
    current = await restart();
    const rejected = current.detail.getOrCreateAgreementDetail(row.id);
    expect(() =>
      current.detail.saveAgreementDetailAll({
        ...rejected,
        status: 'draft',
        statusValue: '草稿',
        agreementNoEditable: true,
        basic: { ...rejected.basic, agreementNo: '伪造新号' },
      }),
    ).toThrow('不能修改编号');
    const statusOnly = current.detail.saveAgreementDetailAll({
      ...rejected,
      status: 'draft',
      statusValue: '草稿',
    });
    expect(statusOnly.agreementNoEditable).toBe(false);
    expect(() =>
      current.detail.saveAgreementDetailModule(row.id, 'basic', {
        basic: { ...statusOnly.basic, agreementNo: '模块绕过' },
      }),
    ).toThrow('不能修改编号');
    expect(current.detail.getOrCreateAgreementDetail(row.id).agreementNo).toBe(
      '提交编号',
    );
  });

  it('旧版编号键存档无损迁移为 ID 键，首次写入保留原文件备份', async () => {
    let current = await restart();
    const row = current.list.createAgreeListRow();
    const detail = current.detail.getOrCreateAgreementDetail(row.id);
    const raw = JSON.stringify({
      version: 1,
      sequence: 3,
      rows: [{ ...row, agreementNo: 'LL-NEW-legacy-long-number' }],
      details: {
        'LL-NEW-legacy-long-number': {
          ...detail,
          agreementNo: 'LL-NEW-legacy-long-number',
          basic: {
            ...detail.basic,
            agreementNo: 'LL-NEW-legacy-long-number',
            remark: '旧资料',
          },
        },
      },
    });
    writeFileSync(file, raw, 'utf8');
    current = await restart();
    const old = current.detail.getOrCreateAgreementDetail(row.id);
    expect(old.basic.remark).toBe('旧资料');
    expect(old.agreementNo).toBe('LL-NEW-legacy-long-number');
    current.detail.saveAgreementDetailAll({
      ...old,
      basic: { ...old.basic, agreementNo: '迁移后的短号' },
    });
    expect(
      readFileSync(
        join(storage.directory, 'agreements.v1.backup.json'),
        'utf8',
      ),
    ).toBe(raw);
    const snapshot = JSON.parse(readFileSync(file, 'utf8'));
    expect(snapshot.version).toBe(2);
    expect(snapshot.details[row.id].basic.remark).toBe('旧资料');
    current = await restart();
    expect(
      current.detail.getOrCreateAgreementDetail('LL-NEW-legacy-long-number').id,
    ).toBe(row.id);
  });

  it('旧版流程仍引用编号时也会阻止草稿改号', async () => {
    const current = await restart();
    const row = current.list.createAgreeListRow();
    writeFileSync(
      join(storage.directory, 'workflow-instances.json'),
      JSON.stringify({
        instances: [{ bizId: row.agreementNo, businessNo: row.agreementNo }],
      }),
    );
    const detail = current.detail.getOrCreateAgreementDetail(row.id);
    expect(detail.agreementNoEditable).toBe(false);
    expect(() =>
      current.detail.saveAgreementDetailAll({
        ...detail,
        basic: { ...detail.basic, agreementNo: '新号' },
      }),
    ).toThrow('不能修改编号');
  });

  it.each(['', '.nitro', '.output'])(
    '存档路径在构建目录之外：%s',
    async (runtime) => {
      storage.persistDirectory = join(storage.directory, runtime, 'data');
      vi.resetModules();
      const { AGREEMENT_DATA_FILE } = await import('./agreement-store');
      expect(AGREEMENT_DATA_FILE).toBe(
        join(storage.directory, 'data', 'agreements.json'),
      );
    },
  );
});

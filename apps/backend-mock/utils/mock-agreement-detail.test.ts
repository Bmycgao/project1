/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDefaultAgreementDetail,
  deleteAgreementByNos,
  getOrCreateAgreementDetail,
  saveAgreementDetailAll,
} from './mock-agreement-detail';
import { createAgreeListRow, findAgreeListRow } from './mock-agreement-list';

const storage = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = tmpdir();
  return { directory: mkdtempSync(join(root, 'vben-agreement-detail-')), root };
});
vi.mock('./mock-persist', () => ({ DATA_DIR: storage.directory }));
afterAll(() => {
  if (
    !resolve(storage.directory).startsWith(
      `${resolve(storage.root)}${sep}vben-agreement-detail-`,
    )
  )
    throw new Error('Unexpected test directory');
  rmSync(storage.directory, { recursive: true, force: true });
});

vi.mock('./mock-page-schema', () => ({ pageSchemaStore: [] }));

const created: string[] = [];
function newDraft(input = {}) {
  const row = createAgreeListRow(input);
  created.push(row.agreementNo);
  return { row, detail: getOrCreateAgreementDetail(row.agreementNo, row) };
}
afterEach(() => deleteAgreementByNos(created.splice(0)));

describe('新建协议空白草稿', () => {
  it('只生成系统标识，不把提示文字写成业务资料', () => {
    const { row, detail } = newDraft();
    expect(row).toMatchObject({
      compensatee: '',
      houseAddress: '',
      signType: '',
      batchGroup: '',
      statusValue: '草稿',
      isSigned: '未签约',
    });
    expect(detail).toMatchObject({
      agreementNo: row.agreementNo,
      status: 'draft',
      statusValue: '草稿',
      basic: {
        agreementNo: row.agreementNo,
        agreementName: '',
        compensatee: '',
        department: '',
        acquirer: '',
        amount: '',
        signDate: '',
        statusValue: '草稿',
      },
      signing: { houseAddress: '', debtAmount: '', signDate: '' },
      population: {
        headName: '',
        idNo: '',
        phone: '',
        familySize: '',
        hukouAddress: '',
      },
      compensation: { amount: '', settleType: '' },
    });
    for (const key of [
      'rightHolders',
      'houses',
      'compensationItems',
      'rewardItems',
      'signMaterials',
      'certifyMaterials',
    ] as const)
      expect(detail[key]).toEqual([]);
  });

  it('仅带入明确提供的姓名和地址，不伪造权利人或房屋明细', () => {
    const { detail } = newDraft({
      compensatee: '真实录入人',
      houseAddress: '实际地址',
    });
    expect(detail.basic.compensatee).toBe('真实录入人');
    expect(detail.signing.houseAddress).toBe('实际地址');
    expect(detail.basic.amount).toBe('');
    expect(detail.houses).toEqual([]);
    expect(detail.rightHolders).toEqual([]);
    expect(detail.population.familySize).toBe('');
  });

  it('部分保存、重新读取和清空资料后不会补回演示数据', () => {
    const { row, detail } = newDraft();
    saveAgreementDetailAll({
      ...detail,
      basic: { ...detail.basic, agreementName: '待完善的草稿', amount: 0 },
    });
    const saved = getOrCreateAgreementDetail(row.agreementNo);
    expect(saved.basic.agreementName).toBe('待完善的草稿');
    expect(saved.basic.amount).toBe(0);
    expect(saved.basic.signDate).toBe('');
    expect(saved.houses).toEqual([]);
    expect(saved.compensationItems).toEqual([]);
    expect(saved.rewardItems).toEqual([]);
    expect(saved.population.familySize).toBe('');
    expect(findAgreeListRow(row.agreementNo)?.compensatee).toBe('');
  });

  it('不同草稿互不共享明细和扩展对象', () => {
    const first = newDraft();
    const second = newDraft();
    first.detail.extraForms!.notes = { text: '仅第一份' };
    saveAgreementDetailAll(first.detail);
    expect(
      getOrCreateAgreementDetail(second.row.agreementNo).extraForms,
    ).toEqual({});
  });

  it('不存在的编号默认也不生成示例资料', () => {
    const detail = createDefaultAgreementDetail('UNKNOWN-DRAFT');
    expect(detail.basic.compensatee).toBe('');
    expect(detail.basic.amount).toBe('');
    expect(detail.houses).toEqual([]);
  });

  it('内置演示记录仍保留样例，清空明细后不会再次填入', () => {
    const sample = getOrCreateAgreementDetail('LL-4-015');
    expect(sample.basic.amount).toBe(5_880_000);
    expect(sample.houses).toHaveLength(1);
    const cleared = saveAgreementDetailAll({
      ...sample,
      compensationItems: [],
      rewardItems: [],
    });
    expect(
      getOrCreateAgreementDetail(sample.agreementNo).compensationItems,
    ).toEqual([]);
    expect(cleared.rewardItems).toEqual([]);
    saveAgreementDetailAll(sample);
  });
});

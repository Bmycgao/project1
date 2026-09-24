import { describe, expect, it, vi } from 'vitest';
vi.mock('./mock-page-schema', () => ({ pageSchemaStore: [] }));
import {
  getOrCreateAgreementDetail,
  saveAgreementDetailAll,
} from './mock-agreement-detail';
import { createAgreeListRow } from './mock-agreement-list';
import {
  applyAgreementPatch,
  applyUnlockedFlowFields,
  listWorkflowAgreements,
  persistWorkflowAgreement,
  requireExistingAgreement,
  syncAgreementFromWorkflow,
  workflowDataFromAgreement,
} from './workflow-agreement';

describe('workflow agreement binding', () => {
  it('projects list agreements into start options', () => {
    const row = createAgreeListRow({
      compensatee: '绑定测试人',
      houseAddress: '绑定路1号',
    });
    const detail = getOrCreateAgreementDetail(row.agreementNo, row);
    saveAgreementDetailAll({
      ...detail,
      basic: { ...detail.basic, compensatee: '绑定测试人', amount: 210_000 },
    });
    const option = listWorkflowAgreements().find(
      (item) => item.agreementNo === row.agreementNo,
    );
    expect(option).toMatchObject({
      compensatee: '绑定测试人',
      amount: 210_000,
    });
    expect(workflowDataFromAgreement(row.agreementNo).BuChangJinE).toBe(
      210_000,
    );
  });
  it('rejects unknown agreements and writes bound fields back', () => {
    expect(() => requireExistingAgreement('NO-SUCH')).toThrow('已有的协议');
    const row = createAgreeListRow({
      compensatee: '回写测试人',
      houseAddress: '旧地址',
    });
    getOrCreateAgreementDetail(row.agreementNo, row);
    syncAgreementFromWorkflow(row.agreementNo, {
      compensatee: '新被补偿人',
      houseAddress: '新地址',
      BuChangJinE: 990_000,
    });
    const detail = getOrCreateAgreementDetail(row.agreementNo);
    expect(detail.basic.compensatee).toBe('新被补偿人');
    expect(detail.houses[0]?.address).toBe('新地址');
    expect(detail.basic.amount).toBe(990_000);
  });
  it('merges task-node houses and compensation, but ignores approve patches', () => {
    const row = createAgreeListRow({
      compensatee: '整单人',
      houseAddress: '整单旧路',
    });
    const current = getOrCreateAgreementDetail(row.agreementNo, row);
    const incoming = structuredClone(current);
    incoming.houses[0]!.address = '整单新路';
    incoming.houses[0]!.certNo = '证-新';
    incoming.compensationItems = [
      {
        id: 'ci-wf',
        name: '搬家费',
        calcType: '定额',
        quantity: 1,
        unitPrice: 2000,
        amount: 2000,
        remark: '',
      },
    ];
    incoming.basic.amount = 321_000;
    incoming.basic.compensatee = '应被还原';
    const merged = applyAgreementPatch(current, incoming, {
      canAct: true,
      nodeType: 'task',
      fieldAccess: { compensatee: 'readonly' },
    });
    expect(merged.houses[0]?.address).toBe('整单新路');
    expect(merged.houses[0]?.certNo).toBe('证-新');
    expect(merged.compensationItems[0]?.name).toBe('搬家费');
    expect(merged.basic.amount).toBe(321_000);
    expect(merged.basic.compensatee).toBe('整单人');
    persistWorkflowAgreement(merged);
    expect(getOrCreateAgreementDetail(row.agreementNo).houses[0]?.address).toBe(
      '整单新路',
    );
    const approve = applyAgreementPatch(
      merged,
      { ...incoming, houses: [{ ...incoming.houses[0]!, address: '审批改' }] },
      { canAct: true, nodeType: 'approve' },
    );
    expect(approve.houses[0]?.address).toBe('整单新路');
  });
  it('writes catalog extras to flowFields only when the node may edit them', () => {
    const row = createAgreeListRow({
      compensatee: '法务人',
      houseAddress: '法务路',
    });
    const current = getOrCreateAgreementDetail(row.agreementNo, row);
    const approved = applyUnlockedFlowFields(
      current,
      { legalOpinion: '同意签约', compensatee: '篡改人' },
      { nodeType: 'approve', fieldAccess: { legalOpinion: 'edit' } },
    );
    expect(approved.flowFields?.legalOpinion).toBe('同意签约');
    expect(approved.basic.compensatee).toBe('法务人');
    const blocked = applyUnlockedFlowFields(
      approved,
      { legalOpinion: '应被忽略' },
      { nodeType: 'approve', fieldAccess: {} },
    );
    expect(blocked.flowFields?.legalOpinion).toBe('同意签约');
    const remarked = applyUnlockedFlowFields(
      current,
      { remark: '填报备注' },
      { nodeType: 'task' },
    );
    expect(remarked.basic.remark).toBe('填报备注');
  });
  it('restores locked houseAddress even if the body tries to rewrite houses', () => {
    const row = createAgreeListRow({
      compensatee: '锁地址人',
      houseAddress: '锁定坐落',
    });
    const current = getOrCreateAgreementDetail(row.agreementNo, row);
    const incoming = structuredClone(current);
    incoming.houses[0]!.address = '篡改坐落';
    incoming.houses.push({
      id: 'hs-extra',
      address: '多出来的房',
      certNo: '',
      propertyType: '',
    });
    const merged = applyAgreementPatch(current, incoming, {
      canAct: true,
      nodeType: 'task',
      fieldAccess: { houseAddress: 'hidden' },
    });
    expect(merged.houses).toHaveLength(current.houses.length);
    expect(merged.houses[0]?.address).toBe('锁定坐落');
  });
});

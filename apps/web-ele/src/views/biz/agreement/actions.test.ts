import type { AgreeActionContext } from './actions';

/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { describe, expect, it, vi } from 'vitest';

import { AGREE_ACTION_REGISTRY } from './actions';

const { createAgreement } = vi.hoisted(() => ({ createAgreement: vi.fn() }));
vi.mock('#/api/biz/agreement', () => ({
  createAgreement,
  approveAgreements: vi.fn(),
  deleteAgreements: vi.fn(),
  rejectAgreements: vi.fn(),
  submitAgreementBatch: vi.fn(),
}));
vi.mock('#/api/request', () => ({ requestClient: {} }));
vi.mock('#/api/system/print-template', () => ({
  DEFAULT_PRINT_TEMPLATE_BY_ACTION: {},
}));
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn() },
  ElMessageBox: {},
}));

describe('新增协议入口', () => {
  it('新建成功后明确要求编辑，普通查看操作不带此标记', async () => {
    const row = { id: 'NEW', agreementNo: 'NEW-DRAFT' };
    createAgreement.mockResolvedValue(row);
    const openDetail = vi.fn();
    const reload = vi.fn();
    const context = {
      openDetail,
      reload,
      selected: [row],
    } as unknown as AgreeActionContext;
    await AGREE_ACTION_REGISTRY.add!.handler(context);
    expect(openDetail).toHaveBeenLastCalledWith(row, { edit: true });
    expect(reload).toHaveBeenCalledOnce();
    await AGREE_ACTION_REGISTRY.edit!.handler(context);
    expect(openDetail).toHaveBeenLastCalledWith(row);
  });
});

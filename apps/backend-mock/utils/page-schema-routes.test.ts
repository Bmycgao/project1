import { beforeEach, describe, expect, it, vi } from 'vitest';

import deleteHandler from '../api/system/page-schema/[id].delete';
import separateHandler from '../api/system/page-schema/[id]/separate-detail.post';
import usageHandler from '../api/system/page-schema/[id]/usage.get';

const state = vi.hoisted(() => ({
  usage: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
  separate: vi.fn(),
  status: 200,
  auth: { ok: true, response: undefined } as {
    ok: boolean;
    response?: unknown;
  },
}));
vi.mock('h3', () => ({
  eventHandler: (handler: unknown) => handler,
  getRouterParam: () => 'detail',
  setResponseStatus: (_event: unknown, status: number) => {
    state.status = status;
  },
}));
vi.mock('~/utils/system-api-auth', () => ({
  SYSTEM_AUTH: { pageSchemaList: 'list' },
  assertSystemAccess: () => state.auth,
}));
vi.mock('~/utils/page-schema-references', () => ({
  getPageSchemaUsage: state.usage,
}));
vi.mock('~/utils/agreement-module-resources', () => ({
  listCustomAgreementModuleResources: vi.fn(),
}));
vi.mock('~/utils/mock-page-schema', () => ({
  findPageSchema: () => ({ id: 'detail' }),
  removePageSchema: state.remove,
  invalidateDynamicData: state.invalidate,
  separatePageSchemaDetail: state.separate,
}));
vi.mock('~/utils/response', () => ({
  useResponseError: (message: string) => ({ code: -1, message }),
  useResponseSuccess: (data: unknown) => ({ code: 0, data }),
}));

const remove = deleteHandler as unknown as (event: object) => Promise<any>;
const usage = usageHandler as unknown as (event: object) => any;
const separate = separateHandler as unknown as (event: object) => any;

beforeEach(() => {
  vi.clearAllMocks();
  state.status = 200;
  state.auth = { ok: true };
  state.usage
    .mockReset()
    .mockReturnValue({ references: [], liveCount: 0, snapshotCount: 0 });
  state.remove.mockReturnValue(true);
  state.separate.mockReset().mockReturnValue({
    list: { id: 'detail', detailSchemaId: 'new-detail' },
    detail: { id: 'new-detail' },
  });
});

describe('页面引用接口与删除保护', () => {
  it('拆分成功返回关联结果，失败明确报错且不刷新缓存', () => {
    expect(separate({}).data.list.detailSchemaId).toBe('new-detail');
    expect(state.separate).toHaveBeenCalledWith('detail');
    state.invalidate.mockClear();
    state.separate.mockImplementation(() => {
      throw new Error('模板不可用');
    });
    expect(separate({}).message).toBe('模板不可用');
    expect(state.status).toBe(400);
    expect(state.invalidate).not.toHaveBeenCalled();
  });
  it('被实时引用时即使直接调用删除接口也不会删除', async () => {
    state.usage.mockReturnValue({
      references: [],
      liveCount: 1,
      snapshotCount: 2,
    });
    const awaitedResult1 = await remove({});
    expect(awaitedResult1.message).toContain('解除引用');
    expect(state.status).toBe(409);
    expect(state.remove).not.toHaveBeenCalled();
  });
  it('无法检查引用时拒绝删除，查询接口明确报错', async () => {
    state.usage.mockImplementation(() => {
      throw new Error('损坏的流程存储');
    });
    const awaitedResult2 = await remove({});
    expect(awaitedResult2.code).toBe(-1);
    expect(state.status).toBe(500);
    expect(state.remove).not.toHaveBeenCalled();
    expect(usage({}).message).toContain('使用位置加载失败');
  });
  it('仅剩历史冻结快照时允许删除源配置', async () => {
    state.usage.mockReturnValue({
      references: [],
      liveCount: 0,
      snapshotCount: 2,
    });
    const awaitedResult3 = await remove({});
    expect(awaitedResult3.code).toBe(0);
    expect(state.remove).toHaveBeenCalledWith('detail');
    expect(state.invalidate).toHaveBeenCalledWith('detail');
  });
  it('没有页面配置权限时不暴露引用或执行删除', async () => {
    state.auth = { ok: false, response: { code: -1, message: 'Forbidden' } };
    const awaitedResult4 = await remove({});
    expect(awaitedResult4.message).toBe('Forbidden');
    expect(usage({}).message).toBe('Forbidden');
    expect(separate({}).message).toBe('Forbidden');
    expect(state.usage).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.separate).not.toHaveBeenCalled();
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import removeForm from '../api/system/fc-schema/[id].delete';
import updateForm from '../api/system/fc-schema/[id].put';
import removePrint from '../api/system/print-template/[id].delete';
import updatePrint from '../api/system/print-template/[id].put';
import createPrint from '../api/system/print-template/index.post';

const state = vi.hoisted(() => ({
  updateForm: vi.fn(),
  removeForm: vi.fn(),
  updatePrint: vi.fn(),
  removePrint: vi.fn(),
  createPrint: vi.fn(),
  status: 200,
  auth: { ok: true, response: undefined } as {
    ok: boolean;
    response?: unknown;
  },
}));

vi.mock('h3', () => ({
  eventHandler: (handler: unknown) => handler,
  getRouterParam: () => 'template-id',
  readBody: async () => ({ title: '测试模板' }),
  setResponseStatus: (_event: unknown, status: number) => {
    state.status = status;
  },
}));
vi.mock('~/utils/system-api-auth', () => ({
  SYSTEM_AUTH: { fcSchemaList: 'forms', printTemplateList: 'prints' },
  assertSystemAccess: () => state.auth,
}));
vi.mock('~/utils/mock-fc-schema', () => ({
  updateFcSchema: state.updateForm,
  removeFcSchema: state.removeForm,
}));
vi.mock('~/utils/mock-print-template', () => ({
  updatePrintTemplate: state.updatePrint,
  removePrintTemplate: state.removePrint,
  createPrintTemplate: state.createPrint,
}));

const routes = [
  {
    name: '更新表单',
    handler: updateForm,
    write: state.updateForm,
    status: 404,
    message: '模板不存在',
  },
  {
    name: '删除表单',
    handler: removeForm,
    write: state.removeForm,
    status: 400,
    message: '模板不存在或为内置模板不可删',
  },
  {
    name: '更新打印模板',
    handler: updatePrint,
    write: state.updatePrint,
    status: 404,
    message: '打印模板不存在',
  },
  {
    name: '删除打印模板',
    handler: removePrint,
    write: state.removePrint,
    status: 400,
    message: '模板不存在或为内置模板不可删',
  },
];
type Invoke = (event: object) => unknown;

beforeEach(() => {
  vi.resetAllMocks();
  state.status = 200;
  state.auth = { ok: true };
});

describe('模板接口的错误状态与响应', () => {
  it.each(routes)(
    '$name 失败返回可读消息与正确 HTTP 状态',
    async ({ handler, status, message }) => {
      const response = await (handler as unknown as Invoke)({});
      expect(state.status).toBe(status);
      expect(response).toEqual({ code: -1, data: null, error: null, message });
    },
  );

  it.each([
    { name: '创建', handler: createPrint, write: state.createPrint },
    { name: '更新', handler: updatePrint, write: state.updatePrint },
  ])('打印模板$name 校验失败保留原错误消息', async ({ handler, write }) => {
    write.mockImplementation(() => {
      throw new Error('模板内容无效');
    });
    expect(await (handler as unknown as Invoke)({})).toMatchObject({
      code: -1,
      message: '模板内容无效',
    });
    expect(state.status).toBe(400);
  });

  it('成功更新仍使用原成功响应', async () => {
    state.updateForm.mockReturnValue({ id: 'template-id', title: '测试模板' });
    expect(await (updateForm as unknown as Invoke)({})).toMatchObject({
      code: 0,
      data: { id: 'template-id' },
    });
    expect(state.updateForm).toHaveBeenCalledWith('template-id', {
      title: '测试模板',
    });
    expect(state.status).toBe(200);
  });

  it('无权限时直接返回鉴权结果，不读写模板', async () => {
    state.auth = { ok: false, response: { code: -1, message: 'Forbidden' } };
    for (const handler of [
      ...routes.map((route) => route.handler),
      createPrint,
    ]) {
      expect(await (handler as unknown as Invoke)({})).toEqual(
        state.auth.response,
      );
    }
    for (const write of [
      ...routes.map((route) => route.write),
      state.createPrint,
    ]) {
      expect(write).not.toHaveBeenCalled();
    }
  });
});

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { createApp, createRouter, toNodeListener } from 'h3';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { requireDefined } from '../../shared/require-defined';
import handler from '../api/miniapp/dashboard/signing.get';
import { miniappStore } from './miniapp-auth';
import { miniappSigningDemo } from './miniapp-signing-demo';

// @vitest-environment node

// 只使用本测试创建的临时账户文件，不读写项目真实账户。
vi.mock('./mock-persist', () => ({
  DATA_DIR: join(tmpdir(), 'signing-test-unused'),
}));

const appid = 'wx0123456789abcdef';
const directory = mkdtempSync(join(tmpdir(), 'miniapp-signing-'));
const server = createServer();
let address = '';
let counter = 0;
let token = '';
let id = '';
let accountFile = '';
async function call(bearer?: string, query = '') {
  const response = await fetch(`${address}/signing${query}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: (await response.json()) as any,
  };
}
beforeAll(async () => {
  server.on(
    'request',
    toNodeListener(createApp().use(createRouter().get('/signing', handler))),
  );
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  address = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(() => {
  const folder = join(directory, String(++counter));
  vi.stubEnv('MINIAPP_AUTH_DATA_DIR', folder);
  vi.stubEnv('WECHAT_APP_ID', appid);
  vi.stubEnv('WECHAT_APP_SECRET', 'd'.repeat(32));
  const login = miniappStore().login({ appid, openid: 'private-test-openid' });
  token = login.accessToken;
  id = login.user.id;
  accountFile = join(folder, 'miniapp-auth.json');
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  if (
    dirname(resolve(directory)) === resolve(tmpdir()) &&
    basename(directory).startsWith('miniapp-signing-')
  )
    rmSync(directory, { recursive: true, force: true });
});
describe('小程序签约统计演示接口', () => {
  it('匿名、伪造和 PC 凭证无法访问；过期会话返回 401', async () => {
    for (const bearer of [
      undefined,
      `miniapp_${'a'.repeat(43)}`,
      'pc-jwt-token',
    ]) {
      const responseValue1 = await call(bearer);
      expect(responseValue1.status).toBe(401);
    }
    const snapshot = JSON.parse(readFileSync(accountFile, 'utf8'));
    snapshot.sessions[0].expiresAt = Date.now() - 1;
    writeFileSync(accountFile, JSON.stringify(snapshot));
    const responseValue2 = await call(token);
    expect(responseValue2.status).toBe(401);
  });
  it('三种角色读取同一份明确标记的演示数据，不采信客户端身份和范围', async () => {
    for (const [revision, role] of [
      'resident',
      'operator',
      'miniapp_admin',
    ].entries()) {
      const before = miniappStore().profile(token, appid);
      miniappStore().setRole(id, role, before.roleRevision);
      const result = await call(
        token,
        '?roleCode=miniapp_admin&userId=other&scope=all',
      );
      expect(result.status).toBe(200);
      expect(result.cache).toContain('no-store');
      const data = result.body.data;
      expect(data).toMatchObject({
        dataSource: 'demo',
        unit: '户',
        viewer: { id, roleCode: role, roleRevision: revision },
      });
      expect(Number.isFinite(Date.parse(data.updatedAt))).toBe(true);
      expect(data.groups).toHaveLength(8);
      expect(
        data.groups.reduce(
          (sum: number, item: { total: number }) => sum + item.total,
          0,
        ),
      ).toBe(1600);
      expect(
        data.groups.reduce(
          (sum: number, item: { signed: number }) => sum + item.signed,
          0,
        ),
      ).toBe(1464);
      expect(JSON.stringify(data)).not.toMatch(
        /openid|accessToken|session_key|tokenHash/,
      );
    }
  });
  it('演示样本每次独立生成，调用方修改不会污染下一次结果', () => {
    const viewer = { id, roleCode: 'resident', roleRevision: 0 };
    requireDefined(miniappSigningDemo(viewer).groups[0]).signed = 0;
    expect(requireDefined(miniappSigningDemo(viewer).groups[0]).signed).toBe(
      145,
    );
  });
});

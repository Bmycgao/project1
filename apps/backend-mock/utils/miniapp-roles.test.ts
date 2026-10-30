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

import {
  defaultNavigation,
  demoRoleNavigation,
  navigationRemovalReason,
  validateNavigation,
  visibleNavigationItems,
} from '../../shared/miniapp-navigation';
import { requireDefined } from '../../shared/require-defined';
import navHandler from '../api/miniapp/navigation.get';
import roleHandler from '../api/system/miniapp-users/[id].put';
import listHandler from '../api/system/miniapp-users/index.get';
import { generateAccessToken } from './jwt-utils';
import { miniappStore } from './miniapp-auth';
import { navigationStore } from './miniapp-navigation-store';
import { createMiniappStore } from './miniapp-store';
import {
  findRbacUserByUsername,
  roleStore,
  toAuthUserInfo,
} from './rbac-store';

// @vitest-environment node

// 权限测试使用内存菜单/角色存档，账户测试使用独立临时目录。
vi.mock('./mock-persist', () => {
  const memory = new Map<string, unknown>();
  return {
    DATA_DIR: join(tmpdir(), 'miniapp-role-unused'),
    readPersistJson: (file: string) =>
      structuredClone(memory.get(file) ?? null),
    writePersistJson: (file: string, data: unknown) =>
      memory.set(file, structuredClone(data)),
  };
});

const APP_ID = 'wx3458e655d7c30765';
const directory = mkdtempSync(join(tmpdir(), 'vben-miniapp-roles-'));
let caseId = 0;
let base: string;
let token: string;
let userId: string;
let accountFile: string;
const server = createServer();
const pcToken = (name = 'admin') =>
  generateAccessToken(
    toAuthUserInfo(requireDefined(findRbacUserByUsername(name))),
  );
async function call(path: string, bearer?: string, body?: unknown) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as any };
}
beforeAll(async () => {
  const router = createRouter()
    .get('/navigation', navHandler)
    .get('/users', listHandler)
    .put('/users/:id', roleHandler);
  const app = createApp().use(router);
  server.on('request', toNodeListener(app));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(() => {
  const folder = join(directory, String(++caseId));
  vi.stubEnv('MINIAPP_AUTH_DATA_DIR', folder);
  vi.stubEnv('WECHAT_APP_ID', APP_ID);
  vi.stubEnv('WECHAT_APP_SECRET', 'c'.repeat(32));
  const login = miniappStore().login({
    appid: APP_ID,
    openid: 'test-private-openid',
  });
  token = login.accessToken;
  userId = login.user.id;
  accountFile = join(folder, 'miniapp-auth.json');
  navigationStore().publish(demoRoleNavigation());
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  // 仅递归清理本测试创建且已确认位于临时目录内的目录。
  if (
    dirname(resolve(directory)) === resolve(tmpdir()) &&
    basename(directory).startsWith('vben-miniapp-roles-')
  )
    rmSync(directory, { recursive: true, force: true });
});

describe('三角色导航与用户授权 HTTP 契约', () => {
  it('匿名、伪造会话和 PC token 不可读取个性化导航', async () => {
    for (const bearer of [undefined, `miniapp_${'a'.repeat(43)}`, pcToken()]) {
      const responseValue1 = await call('/navigation', bearer);
      expect(responseValue1.status).toBe(401);
    }
  });
  it('同一微信 token 随角色变更返回不同导航，不接受 query 自报角色', async () => {
    for (const [role, targets] of [
      ['resident', ['home', 'services', 'account']],
      ['operator', ['home', 'test', 'account']],
      ['miniapp_admin', ['home', 'services', 'test', 'account']],
    ] as const) {
      const before = requireDefined(miniappStore().listUsers()[0]);
      const changed = await call(`/users/${userId}`, pcToken(), {
        roleCode: role,
        roleRevision: before.roleRevision,
      });
      expect(changed.status).toBe(200);
      const result = await call('/navigation?roleCode=miniapp_admin', token);
      expect(result.status).toBe(200);
      expect(result.body.data.viewer.roleCode).toBe(role);
      expect(
        result.body.data.items.map((item: { target: string }) => item.target),
      ).toEqual(targets);
      expect(JSON.stringify(result.body)).not.toMatch(
        /test-private-openid|tokenHash|accessToken/,
      );
    }
  });
  it('小程序管理员也不能修改用户角色，普通 PC 账号没有分配权限', async () => {
    miniappStore().setRole(userId, 'miniapp_admin', 0);
    const responseValue2 = await call('/users', token);
    expect(responseValue2.status).toBe(401);
    const responseValue3 = await call(`/users/${userId}`, token, {
      roleCode: 'miniapp_admin',
      roleRevision: 1,
    });
    expect(responseValue3.status).toBe(401);
    const responseValue4 = await call('/users', pcToken('jack'));
    expect(responseValue4.status).toBe(403);
    const responseValue5 = await call(`/users/${userId}`, pcToken('jack'), {
      roleCode: 'resident',
      roleRevision: 1,
    });
    expect(responseValue5.status).toBe(403);
  });
  it('管理员用户列表只包含安全展示字段，非法角色和旧版本被拒绝', async () => {
    const list = await call('/users', pcToken());
    expect(list.status).toBe(200);
    expect(list.body.data.items[0].roleCode).toBe('resident');
    expect(JSON.stringify(list.body)).not.toMatch(/openid|tokenHash|expiresAt/);
    const responseValue6 = await call(`/users/${userId}`, pcToken(), {
      roleCode: 'super',
      roleRevision: 0,
    });
    expect(responseValue6.status).toBe(400);
    const responseValue7 = await call(`/users/${userId}`, pcToken(), {
      roleCode: 'operator',
      roleRevision: 0,
    });
    expect(responseValue7.status).toBe(200);
    const responseValue8 = await call(`/users/${userId}`, pcToken(), {
      roleCode: 'miniapp_admin',
      roleRevision: 0,
    });
    expect(responseValue8.status).toBe(409);
    const responseValue9 = await call('/users/missing', pcToken(), {
      roleCode: 'operator',
      roleRevision: 0,
    });
    expect(responseValue9.status).toBe(404);
    expect(miniappStore().profile(token, APP_ID).roleCode).toBe('operator');
  });
  it('pC 分配权限被撤销后，原管理员 token 不能继续分配', async () => {
    const bearer = pcToken();
    const role = requireDefined(
      roleStore.find((item) => item.id === 'R_ADMIN'),
    );
    const saved = [...role.permissions];
    role.permissions = role.permissions.filter((id) => String(id) !== '21101');
    try {
      const responseValue10 = await call('/users', bearer);
      expect(responseValue10.status).toBe(200);
      const responseValue11 = await call(`/users/${userId}`, bearer, {
        roleCode: 'operator',
        roleRevision: 0,
      });
      expect(responseValue11.status).toBe(403);
    } finally {
      role.permissions = saved;
    }
  });
  it('旧账户缺角色时无损迁移为居民；重建 store 后角色分配保持且旧 token 可识别新角色', () => {
    const snapshot = JSON.parse(readFileSync(accountFile, 'utf8'));
    delete snapshot.users[0].roleCode;
    delete snapshot.users[0].roleRevision;
    const original = JSON.stringify(snapshot);
    writeFileSync(accountFile, original);
    const store = createMiniappStore(accountFile);
    expect(store.profile(token, APP_ID).roleCode).toBe('resident');
    expect(readFileSync(accountFile, 'utf8')).toBe(original);
    store.setRole(userId, 'operator', 0);
    expect(
      createMiniappStore(accountFile).profile(token, APP_ID),
    ).toMatchObject({ roleCode: 'operator', roleRevision: 1 });
  });
  it('每个角色须有账户和至少两项，非法角色不回退为所有角色；删除不能破坏其他角色', () => {
    const draft = demoRoleNavigation();
    expect(validateNavigation(draft).items).toHaveLength(4);
    const twoForOperator = defaultNavigation();
    requireDefined(twoForOperator.items[1]).visibleRoles = ['resident'];
    expect(navigationRemovalReason(twoForOperator, 'home')).toContain('至少');
    const emptyRoles = defaultNavigation();
    requireDefined(emptyRoles.items[0]).visibleRoles = [];
    expect(visibleNavigationItems(emptyRoles, 'resident')).toHaveLength(2);
    for (const invalid of [[], ['super'], ['resident', 'resident']]) {
      const bad = defaultNavigation();
      requireDefined(bad.items[0]).visibleRoles = invalid as never;
      // 草稿取消所有勾选时预览仍可渲染，发布则必须拒绝。
      expect(() => validateNavigation(bad)).toThrow(/./);
    }
    const missingAccount = demoRoleNavigation();
    requireDefined(
      missingAccount.items.find((item) => item.target === 'account'),
    ).visibleRoles = ['resident'];
    expect(() => validateNavigation(missingAccount)).toThrow('账户');
  });
});

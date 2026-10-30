import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { createApp, createRouter, toNodeListener } from 'h3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  addNavigationItem,
  availableNavigationPages,
  bindNavigationTarget,
  defaultNavigation,
  MINIAPP_NAV_AUTH,
  navigationRemovalReason,
  removeNavigationItem,
  validateNavigation,
} from '../../shared/miniapp-navigation';
import { requireDefined } from '../../shared/require-defined';
import publicHandler from '../api/miniapp/navigation.get';
import readHandler from '../api/system/miniapp-navigation/index.get';
import publishHandler from '../api/system/miniapp-navigation/index.put';
import { generateAccessToken } from './jwt-utils';
import { miniappStore } from './miniapp-auth';
import { createNavigationStore } from './miniapp-navigation-store';
import {
  findRbacUserByUsername,
  resolveAccessCodes,
  roleStore,
  toAuthUserInfo,
} from './rbac-store';

// @vitest-environment node

// 不读取或改动用户现有菜单 / 角色数据。
vi.mock('./mock-persist', () => {
  const memory = new Map<string, unknown>();
  return {
    DATA_DIR: join(tmpdir(), 'miniapp-navigation-unused'),
    readPersistJson: (file: string) =>
      structuredClone(memory.get(file) ?? null),
    writePersistJson: (file: string, data: unknown) =>
      memory.set(file, structuredClone(data)),
  };
});

const directory = mkdtempSync(join(tmpdir(), 'vben-navigation-test-'));
afterAll(() => {
  vi.unstubAllEnvs();
  if (
    dirname(resolve(directory)) === resolve(tmpdir()) &&
    basename(directory).startsWith('vben-navigation-test-')
  )
    rmSync(directory, { recursive: true, force: true });
});
describe('导航存档与校验', () => {
  it('旧存档补齐目标并把账户排末尾，保留业务顺序、名称、时间、版本，不在读取时重写文件', () => {
    const file = join(directory, 'legacy.json');
    const legacy = {
      ...defaultNavigation(),
      revision: 7,
      updatedAt: '2026-01-01T00:00:00Z',
    };
    legacy.items.reverse();
    requireDefined(legacy.items[0]).text = '个人中心';
    const data = {
      ...legacy,
      items: legacy.items.map(({ target: _target, ...item }) => item),
    };
    const original = JSON.stringify(data);
    writeFileSync(file, original);
    const store = createNavigationStore(file);
    expect(store.read()).toEqual({
      ...legacy,
      items: [legacy.items[1], legacy.items[2], legacy.items[0]],
    });
    expect(readFileSync(file, 'utf8')).toBe(original);
    expect(store.publish(store.read()).revision).toBe(8);
    expect(
      requireDefined(createNavigationStore(file).read().items.at(-1)).target,
    ).toBe('account');
  });
  it('选择占用目标明确报错，不交换或修改其他入口；空闲目标只修改当前入口', () => {
    const draft = defaultNavigation();
    const before = structuredClone(draft);
    expect(() => bindNavigationTarget(draft, 'home', 'account')).toThrow(
      '已由',
    );
    expect(draft).toEqual(before);
    const two = removeNavigationItem(draft, 'services');
    const bound = bindNavigationTarget(two, 'home', 'services');
    expect(bound.items[0]).toMatchObject({
      id: 'home',
      text: '首页',
      target: 'services',
    });
    expect(bound.items[1]).toEqual(two.items[1]);
    expect(validateNavigation(bound)).toEqual(bound);
    expect(() => bindNavigationTarget(two, 'mine', 'services')).toThrow('账户');
  });
  it('新增删除只更新草稿：释放目标、使用新编号，至少两项且账户不可删', () => {
    const draft = defaultNavigation();
    expect(availableNavigationPages(draft).map((page) => page.id)).toEqual([
      'test',
      'favorites',
    ]);
    const four = addNavigationItem(draft, 'nav-test');
    expect(four.items[2]).toMatchObject({
      target: 'test',
      text: '测试页面',
      icon: 'file',
    });
    expect(validateNavigation(four)).toEqual(four);
    const five = addNavigationItem(four, 'nav-favorites');
    expect(five.items[3]).toMatchObject({ target: 'favorites', icon: 'star' });
    expect(validateNavigation(five).items).toHaveLength(5);
    expect(() => addNavigationItem(five, 'nav-full')).toThrow('暂无可用');
    expect(removeNavigationItem(four, 'nav-test')).toEqual(draft);
    expect(navigationRemovalReason(draft, 'mine')).toContain('账户');
    expect(() => removeNavigationItem(draft, 'mine')).toThrow('账户');
    const two = removeNavigationItem(draft, 'services');
    expect(validateNavigation(two).items).toHaveLength(2);
    expect(availableNavigationPages(two).map((page) => page.id)).toEqual([
      'services',
      'test',
      'favorites',
    ]);
    expect(() => removeNavigationItem(two, 'home')).toThrow('至少');
    const three = addNavigationItem(two, 'nav-123456');
    expect(three.items[1]).toMatchObject({
      id: 'nav-123456',
      target: 'services',
      enabled: true,
    });
    expect(validateNavigation(three)).toEqual(three);
    expect(draft.items).toHaveLength(3);
    expect(two.items).toHaveLength(2);
    expect(() => addNavigationItem(two, 'home')).toThrow('编号');
    expect(() => addNavigationItem(two, '../route')).toThrow('编号');
    const hidden = defaultNavigation();
    requireDefined(hidden.items[1]).enabled = false;
    expect(availableNavigationPages(hidden).map((page) => page.id)).toEqual([
      'test',
      'favorites',
    ]);
    expect(removeNavigationItem(hidden, 'services').items).toHaveLength(2);
  });
  it('校验两项配置的账户可达性、新编号必须带目标，并保留重绑定后的旧编号', () => {
    const missingAccount = {
      ...defaultNavigation(),
      items: defaultNavigation().items.slice(0, 2),
    };
    expect(() => validateNavigation(missingAccount)).toThrow('账户');
    const two = removeNavigationItem(defaultNavigation(), 'services');
    const bad = {
      ...two,
      items: two.items.map((item) => ({
        ...item,
        id: `nav-${item.id}`,
        target: undefined,
      })),
    };
    expect(() => validateNavigation(bad)).toThrow('目标');
    const moved = defaultNavigation();
    requireDefined(moved.items[0]).target = 'account';
    requireDefined(moved.items[2]).target = 'home';
    expect(validateNavigation(moved)).toEqual({
      ...moved,
      items: [moved.items[1], moved.items[2], moved.items[0]],
    });
    expect(() => removeNavigationItem(moved, 'home')).toThrow('账户');
  });
  it('拒绝重复或未实现的目标，不把任意路径交给客户端', () => {
    const draft = defaultNavigation();
    requireDefined(draft.items[0]).target = 'account';
    expect(() => validateNavigation(draft)).toThrow('重复');
    for (const target of [
      '/pages/legal/index',
      'javascript:alert(1)',
      'https://example.com',
      null,
      '',
    ]) {
      const bad = defaultNavigation();
      requireDefined(bad.items[0]).target = target as never;
      expect(() => validateNavigation(bad)).toThrow('目标');
    }
  });
  it('首次默认、发布、重新创建 store 后恢复，不信任客户端时间或多余字段', () => {
    const file = join(directory, 'persistent.json');
    const store = createNavigationStore(file);
    expect(store.read()).toEqual(defaultNavigation());
    const draft = {
      ...defaultNavigation(),
      title: '我的空间',
      updatedAt: 'forged-time',
      secret: 'must-not-store',
    };
    draft.items.reverse();
    const published = store.publish(draft);
    expect(published.revision).toBe(1);
    expect(published.updatedAt).not.toBe('forged-time');
    expect(createNavigationStore(file).read()).toEqual(published);
    expect(readFileSync(file, 'utf8')).not.toContain('must-not-store');
  });
  it('过期版本不能覆盖其他人的发布，非法配置不改变已发布内容', () => {
    const store = createNavigationStore(join(directory, 'conflict.json'));
    const current = store.publish(defaultNavigation());
    expect(() => store.publish(defaultNavigation())).toThrow('其他人更新');
    const bad = structuredClone(current);
    requireDefined(bad.items[0]).id = '../external-route';
    expect(() => store.publish(bad)).toThrow('入口无效');
    expect(store.read()).toEqual(current);
  });
  it('禁止重复入口、非法颜色/图标、隐藏我的、空名称或显示少于两项', () => {
    const badValues = [
      { ...defaultNavigation(), color: 'url(javascript:1)' },
      { ...defaultNavigation(), title: ' ' },
      {
        ...defaultNavigation(),
        items: defaultNavigation().items.map((item) => ({
          ...item,
          id: 'mine',
        })),
      },
      {
        ...defaultNavigation(),
        items: defaultNavigation().items.map((item) => ({
          ...item,
          enabled: item.id !== 'mine',
        })),
      },
      {
        ...defaultNavigation(),
        items: defaultNavigation().items.map((item) => ({
          ...item,
          enabled: item.id === 'mine',
        })),
      },
      {
        ...defaultNavigation(),
        items: defaultNavigation().items.map((item) => ({
          ...item,
          icon: '../evil.svg',
        })),
      },
    ];
    for (const value of badValues)
      expect(() => validateNavigation(value)).toThrow(/./);
  });
  it('损坏存档不重置或覆盖，磁盘写入失败不返回发布成功', () => {
    const file = join(directory, 'corrupt.json');
    writeFileSync(file, '{broken');
    const store = createNavigationStore(file);
    expect(() => store.read()).toThrow('存档不可用');
    expect(() => store.publish(defaultNavigation())).toThrow(/./);
    expect(readFileSync(file, 'utf8')).toBe('{broken');
    const notDir = join(directory, 'not-directory');
    writeFileSync(notDir, 'file');
    expect(() =>
      createNavigationStore(join(notDir, 'nav.json')).publish(
        defaultNavigation(),
      ),
    ).toThrow('保存失败');
  });
});

describe('实际 HTTP 路由与角色权限', () => {
  const server = createServer();
  let base: string;
  let miniappToken: string;
  const token = (username: string) =>
    generateAccessToken(
      toAuthUserInfo(requireDefined(findRbacUserByUsername(username))),
    );
  async function call(
    path: string,
    method = 'GET',
    body?: unknown,
    bearer?: string,
  ) {
    if (path === '/public' && bearer === undefined) bearer = miniappToken;
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = (await response.json()) as {
      code: number;
      data: ReturnType<typeof defaultNavigation> & { viewer?: unknown };
      message: string;
    };
    if (path === '/public' && payload.data) {
      const { viewer: _viewer, ...config } = payload.data;
      payload.data = config;
    }
    return {
      status: response.status,
      cache: response.headers.get('cache-control'),
      reply: payload as {
        code: number;
        data: ReturnType<typeof defaultNavigation>;
        message: string;
      },
    };
  }
  beforeAll(async () => {
    vi.stubEnv('MINIAPP_AUTH_DATA_DIR', join(directory, 'http'));
    vi.stubEnv('WECHAT_APP_ID', 'wx3458e655d7c30765');
    vi.stubEnv('WECHAT_APP_SECRET', 'c'.repeat(32));
    miniappToken = miniappStore().login({
      appid: 'wx3458e655d7c30765',
      openid: 'navigation-test',
    }).accessToken;
    const app = createApp();
    const router = createRouter();
    router
      .get('/public', publicHandler)
      .get('/admin', readHandler)
      .put('/admin', publishHandler);
    app.use(router);
    server.on('request', toNodeListener(app));
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  });
  it('有效小程序会话可读角色导航，匿名和小程序凭证不能进入管理接口', async () => {
    const result = await call('/public');
    expect(result.status).toBe(200);
    expect(result.reply.code).toBe(0);
    expect(result.cache).toBe('no-store');
    for (const bearer of [undefined, `miniapp_${'a'.repeat(43)}`]) {
      const denied = await call('/admin', 'PUT', defaultNavigation(), bearer);
      expect(denied.status).toBe(401);
      expect(denied.reply.code).toBe(-1);
    }
  });
  it('普通 PC 用户无权限；默认管理员拥有新页面与发布码', async () => {
    const responseValue1 = await call(
      '/admin',
      'GET',
      undefined,
      token('jack'),
    );
    expect(responseValue1.status).toBe(403);
    const admin = requireDefined(findRbacUserByUsername('admin'));
    expect(resolveAccessCodes(admin)).toContain(MINIAPP_NAV_AUTH.read);
    expect(resolveAccessCodes(admin)).toContain(MINIAPP_NAV_AUTH.edit);
    const result = await call('/admin', 'GET', undefined, token('admin'));
    expect(result.status).toBe(200);
    expect(result.reply.code).toBe(0);
  });
  it('管理员发布后角色导航接口立即读到新配置；冲突或非法输入返回真实错误码', async () => {
    const draft = defaultNavigation();
    draft.title = '联调空间';
    draft.items.reverse();
    const result = await call('/admin', 'PUT', draft, token('admin'));
    expect(result.status).toBe(200);
    expect(result.reply.data.revision).toBe(1);
    expect(
      result.reply.data.items.find((item) => item.id === 'home')?.target,
    ).toBe('home');
    const responseValue2 = await call('/public');
    expect(responseValue2.reply.data).toEqual(result.reply.data);
    const responseValue3 = await call('/admin', 'PUT', draft, token('admin'));
    expect(responseValue3.status).toBe(409);
    const responseValue4 = await call(
      '/admin',
      'PUT',
      { ...result.reply.data, activeColor: 'red' },
      token('admin'),
    );
    expect(responseValue4.status).toBe(400);
    const duplicate = structuredClone(result.reply.data);
    requireDefined(duplicate.items[0]).target = requireDefined(
      duplicate.items[1],
    ).target;
    const responseValue5 = await call(
      '/admin',
      'PUT',
      duplicate,
      token('admin'),
    );
    expect(responseValue5.status).toBe(400);
    const responseValue6 = await call('/public');
    expect(responseValue6.reply.data).toEqual(result.reply.data);
  });
  it('管理接口可发布删除后的两项配置，再发布新编号入口；缺账户和重复编号不覆盖存档', async () => {
    const responseValue7 = await call(
      '/admin',
      'GET',
      undefined,
      token('admin'),
    );
    const current = responseValue7.reply.data;
    const removed = removeNavigationItem(current, 'services');
    const deleted = await call('/admin', 'PUT', removed, token('admin'));
    expect(deleted.status).toBe(200);
    expect(deleted.reply.data.items).toHaveLength(2);
    const responseValue8 = await call('/public');
    expect(responseValue8.reply.data).toEqual(deleted.reply.data);
    const added = addNavigationItem(deleted.reply.data, 'nav-new-service');
    const published = await call('/admin', 'PUT', added, token('admin'));
    expect(published.status).toBe(200);
    expect(
      published.reply.data.items.find((item) => item.id === 'nav-new-service')
        ?.target,
    ).toBe('services');
    const missing = {
      ...published.reply.data,
      items: published.reply.data.items.filter(
        (item) => item.target !== 'account',
      ),
    };
    const missingResult = await call('/admin', 'PUT', missing, token('admin'));
    expect(missingResult.status).toBe(400);
    expect(missingResult.reply.message).toContain('账户');
    const duplicateId = structuredClone(published.reply.data);
    requireDefined(duplicateId.items[0]).id = requireDefined(
      duplicateId.items[1],
    ).id;
    const responseValue9 = await call(
      '/admin',
      'PUT',
      duplicateId,
      token('admin'),
    );
    expect(responseValue9.status).toBe(400);
    const responseValue10 = await call('/public');
    expect(responseValue10.reply.data).toEqual(published.reply.data);
  });
  it('保留三个原入口直接新增测试页，发布后公开可读，删除后可重新新增', async () => {
    const responseValue11 = await call('/public');
    const current = responseValue11.reply.data;
    const added = addNavigationItem(current, 'nav-test-page');
    const result = await call('/admin', 'PUT', added, token('admin'));
    expect(result.status).toBe(200);
    expect(result.reply.data.items).toHaveLength(4);
    expect(
      result.reply.data.items.filter(
        (item: { id: string }) => item.id !== 'nav-test-page',
      ),
    ).toEqual(current.items);
    expect(requireDefined(result.reply.data.items.at(-1)).target).toBe(
      'account',
    );
    const responseValue12 = await call('/public');
    expect(responseValue12.reply.data).toEqual(result.reply.data);
    const removed = removeNavigationItem(result.reply.data, 'nav-test-page');
    const deleted = await call('/admin', 'PUT', removed, token('admin'));
    expect(deleted.status).toBe(200);
    expect(deleted.reply.data.items).toEqual(current.items);
    expect(
      availableNavigationPages(deleted.reply.data).map((page) => page.id),
    ).toContain('test');
    const responseValue13 = await call('/public');
    expect(responseValue13.reply.data).toEqual(deleted.reply.data);
  });
  it('角色撤销发布权限后，已签发 token 也不能再发布', async () => {
    const bearer = token('admin');
    const role = requireDefined(
      roleStore.find((item) => item.id === 'R_ADMIN'),
    );
    const saved = [...role.permissions];
    role.permissions = role.permissions.filter((id) => String(id) !== '21001');
    try {
      const responseValue14 = await call('/admin', 'GET', undefined, bearer);
      expect(responseValue14.status).toBe(200);
      const denied = await call('/admin', 'PUT', defaultNavigation(), bearer);
      expect(denied.status).toBe(403);
      expect(denied.reply.code).toBe(-1);
    } finally {
      role.permissions = saved;
    }
  });
});

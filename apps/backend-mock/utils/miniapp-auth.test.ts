import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { createApp, createRouter, toNodeListener } from 'h3';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { requireDefined } from '../../shared/require-defined';
import logoutHandler from '../api/miniapp/auth/logout.post';
import loginHandler from '../api/miniapp/auth/wechat.post';
import infoHandler from '../api/miniapp/user/info.get';
import { verifyAccessToken } from './jwt-utils';
import { createMiniappStore } from './miniapp-store';
import { exchangeWechatCode, getWechatConfig } from './miniapp-wechat';

// @vitest-environment node

const APP_ID = 'wx3458e655d7c30765';
const SECRET = 'c'.repeat(32); // 仅测试用假值。
const realFetch = globalThis.fetch;
async function readReply<T = unknown>(response: Response) {
  return (await response.json()) as {
    code: number;
    data: T;
    error: null | string;
  };
}
let directory: string;
let upstream: ReturnType<typeof vi.fn>;
const directories: string[] = [];

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'vben-miniapp-test-'));
  directories.push(directory);
  vi.stubEnv('MINIAPP_AUTH_DATA_DIR', directory);
  vi.stubEnv('WECHAT_APP_ID', APP_ID);
  vi.stubEnv('WECHAT_APP_SECRET', SECRET);
  upstream = vi.fn(
    async (_input: Request | string | URL, _init?: RequestInit) =>
      Response.json({ openid: 'test-openid', session_key: 'test-session-key' }),
  );
  vi.stubGlobal('fetch', upstream);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(() => {
  for (const dir of directories) {
    // 仅清理由本测试创建、位于临时目录中的文件夹。
    if (
      dirname(resolve(dir)) === resolve(tmpdir()) &&
      basename(dir).startsWith('vben-miniapp-test-')
    ) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('微信 code 交换', () => {
  it('只请求微信官方地址，发送配套配置，并丢弃 session_key', async () => {
    const identity = await exchangeWechatCode('real-test-code');
    expect(identity).toEqual({ appid: APP_ID, openid: 'test-openid' });
    const url = new URL(
      requireDefined(upstream.mock.calls[0])[0] as unknown as string,
    );
    expect(url.origin + url.pathname).toBe(
      'https://api.weixin.qq.com/sns/jscode2session',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      appid: APP_ID,
      secret: SECRET,
      js_code: 'real-test-code',
      grant_type: 'authorization_code',
    });
  });
  it('未配置密钥时明确拒绝，不发送微信请求', async () => {
    vi.stubEnv('WECHAT_APP_SECRET', '');
    expect(() => getWechatConfig()).toThrow('尚未配置');
    await expect(exchangeWechatCode('valid-code')).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(upstream).not.toHaveBeenCalled();
  });
  it('拒绝微信过期 code，且不透传包含敏感内容的上游错误', async () => {
    upstream.mockResolvedValue(
      Response.json({ errcode: 40_163, errmsg: SECRET }),
    );
    await expect(exchangeWechatCode('used-code')).rejects.toMatchObject({
      statusCode: 400,
      message: '微信登录凭证无效或已过期，请重新登录',
    });
  });
  it('网络、非 JSON、缺失 openid 或微信繁忙均不能签发账号', async () => {
    upstream.mockRejectedValueOnce(
      new Error(`network URL contained ${SECRET}`),
    );
    await expect(exchangeWechatCode('code-1')).rejects.toMatchObject({
      statusCode: 502,
    });
    upstream.mockResolvedValueOnce(new Response('not-json'));
    await expect(exchangeWechatCode('code-2')).rejects.toMatchObject({
      statusCode: 502,
    });
    upstream.mockResolvedValueOnce(Response.json({ session_key: 'key' }));
    await expect(exchangeWechatCode('code-3')).rejects.toMatchObject({
      statusCode: 502,
    });
    upstream.mockResolvedValueOnce(Response.json({ errcode: -1 }));
    await expect(exchangeWechatCode('code-4')).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});

describe('独立小程序账户与会话存档', () => {
  it('重复登录保持用户 ID，只存 token 哈希，重建服务仍可验证与撤销', () => {
    const file = join(directory, 'miniapp-auth.json');
    const store = createMiniappStore(file);
    const first = store.login({ appid: APP_ID, openid: 'user-1' });
    const second = store.login({ appid: APP_ID, openid: 'user-1' });
    expect(first.user.id).toBe(second.user.id);
    expect(first.accessToken).not.toBe(second.accessToken);
    expect(first.user).toEqual({
      id: first.user.id,
      nickname: '微信用户',
      roleName: '居民',
      roleCode: 'resident',
      roleRevision: 0,
    });
    expect(readFileSync(file, 'utf8')).not.toContain(first.accessToken);
    expect(readFileSync(file, 'utf8')).not.toContain('session_key');
    const restored = createMiniappStore(file);
    expect(restored.profile(first.accessToken, APP_ID)).toEqual(first.user);
    restored.logout(first.accessToken, APP_ID);
    expect(() =>
      createMiniappStore(file).profile(first.accessToken, APP_ID),
    ).toThrow('已失效');
    expect(restored.profile(second.accessToken, APP_ID)).toEqual(second.user);
  });
  it('过期 token、伪造 token 和不同 AppID 不可访问；不同 AppID 的相同 openid 分离', () => {
    let time = Date.now();
    const store = createMiniappStore(
      join(directory, 'miniapp-auth.json'),
      () => time,
    );
    const first = store.login({ appid: APP_ID, openid: 'same-openid' });
    const second = store.login({
      appid: 'wx0000000000000000',
      openid: 'same-openid',
    });
    expect(first.user.id).not.toBe(second.user.id);
    expect(() =>
      store.profile(first.accessToken, 'wx0000000000000000'),
    ).toThrow('已失效');
    expect(() => store.profile('admin-jwt', APP_ID)).toThrow('已失效');
    time += first.expiresIn * 1000;
    expect(() => store.profile(first.accessToken, APP_ID)).toThrow('已失效');
  });
  it('损坏存档不覆盖，磁盘写入失败不签发有效登录', () => {
    const file = join(directory, 'miniapp-auth.json');
    writeFileSync(file, '{broken');
    expect(() =>
      createMiniappStore(file).login({ appid: APP_ID, openid: 'new' }),
    ).toThrow('账户存储');
    expect(readFileSync(file, 'utf8')).toBe('{broken');
    const notDirectory = join(directory, 'not-a-directory');
    writeFileSync(notDirectory, 'keep');
    expect(() =>
      createMiniappStore(join(notDirectory, 'auth.json')).login({
        appid: APP_ID,
        openid: 'new',
      }),
    ).toThrow('保存失败');
    expect(readFileSync(notDirectory, 'utf8')).toBe('keep');
  });
});

describe('三个真实路由的 HTTP 契约', () => {
  const app = createApp();
  const router = createRouter();
  router.post('/api/miniapp/auth/wechat', loginHandler);
  router.get('/api/miniapp/user/info', infoHandler);
  router.post('/api/miniapp/auth/logout', logoutHandler);
  app.use(router);
  const server = createServer(toNodeListener(app));
  let baseURL: string;
  beforeAll(async () => {
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('no test server');
    baseURL = `http://127.0.0.1:${address.port}/api/miniapp`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  });
  const post = (path: string, body: unknown) =>
    realFetch(`${baseURL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('登录→Authorization 读取资料→退出→原 token 返回 401；不兼容 PC 管理员 token', async () => {
    const response = await post('/auth/wechat', {
      code: 'valid-code',
      openid: 'client-forged-openid',
      role: 'super',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body =
      await readReply<
        ReturnType<ReturnType<typeof createMiniappStore>['login']>
      >(response);
    expect(body.code).toBe(0);
    const { accessToken, user } = body.data;
    expect(user.roleName).toBe('居民');
    expect(JSON.stringify(body)).not.toMatch(/session_key|test-openid/);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const profile = await realFetch(`${baseURL}/user/info`, { headers });
    expect(profile.status).toBe(200);
    expect(profile.headers.get('cache-control')).toBe('no-store');
    expect(profile.headers.get('pragma')).toBe('no-cache');
    const responseValue1 = await readReply(profile);
    expect(responseValue1.data).toEqual(user);
    // PC 的 JWT 校验器不能识别小程序随机凭证。
    expect(
      verifyAccessToken({
        node: { req: { headers: { authorization: headers.Authorization } } },
      } as never),
    ).toBeNull();
    const logout = await realFetch(`${baseURL}/auth/logout`, {
      method: 'POST',
      headers,
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('cache-control')).toBe('no-store');
    expect(logout.headers.get('pragma')).toBe('no-cache');
    const responseValue2 = await readReply(logout);
    expect(responseValue2.data).toBeNull();
    const responseValue3 = await realFetch(`${baseURL}/user/info`, { headers });
    expect(responseValue3.status).toBe(401);
    const responseValue4 = await realFetch(`${baseURL}/user/info`, {
      headers: { Authorization: 'Bearer pc-admin-token' },
    });
    expect(responseValue4.status).toBe(401);
  });
  it('无 Header、前端假 code、缺失 code、坏 JSON 均有明确状态码', async () => {
    for (const [path, method] of [
      ['/user/info', 'GET'],
      ['/auth/logout', 'POST'],
    ]) {
      const denied = await realFetch(`${baseURL}${path}`, { method });
      expect(denied.status).toBe(401);
      expect(denied.headers.get('cache-control')).toBe('no-store');
      expect(denied.headers.get('pragma')).toBe('no-cache');
      expect(await readReply(denied)).toMatchObject({
        code: -1,
        data: null,
        error: 'MINIAPP_AUTH_ERROR',
      });
    }
    const responseValue5 = await post('/auth/wechat', {});
    expect(responseValue5.status).toBe(400);
    const responseValue6 = await post('/auth/wechat', {
      code: 'development-experience-code',
    });
    expect(responseValue6.status).toBe(400);
    const invalid = await realFetch(`${baseURL}/auth/wechat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{broken',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get('cache-control')).toBe('no-store');
    expect(await invalid.json()).toMatchObject({
      code: -1,
      data: null,
      message: '登录请求格式不正确',
    });
    expect(upstream).not.toHaveBeenCalled();
  });
  it('缺密钥返回安全的配置错误，微信异常无原始报错或 stack', async () => {
    vi.stubEnv('WECHAT_APP_SECRET', '');
    const configResponse = await post('/auth/wechat', { code: 'valid-code' });
    expect(configResponse.status).toBe(503);
    const responseValue7 = await readReply(configResponse);
    expect(responseValue7.error).toBe('MINIAPP_CONFIG_REQUIRED');
    vi.stubEnv('WECHAT_APP_SECRET', SECRET);
    upstream.mockRejectedValue(new Error(SECRET));
    const response = await post('/auth/wechat', { code: 'valid-code' });
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain('stack');
  });
  it('登录频率达到限制后返回 429，伪造转发 IP 不能绕过', async () => {
    let limited: Response | undefined;
    for (let index = 0; index < 25; index += 1) {
      const response = await realFetch(`${baseURL}/auth/wechat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `192.0.2.${index}`,
        },
        body: '{}',
      });
      if (response.status === 429) {
        limited = response;
        break;
      }
    }
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

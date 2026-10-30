// @vitest-environment node
import type { Plugin, ViteDevServer } from 'vite';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { viteNitroMockPlugin } from './nitro-mock';

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  close: vi.fn(),
  createNitro: vi.fn(),
  fetch: vi.fn(),
  getPackage: vi.fn(),
  getPort: vi.fn(),
  listen: vi.fn(),
  prepare: vi.fn(),
}));

vi.mock('@vben/node-utils', () => ({
  colors: {
    bold: (text: string) => text,
    cyan: (text: string) => text,
    green: (text: string) => text,
  },
  consola: { info: vi.fn(), log: vi.fn(), success: vi.fn() },
  getPackage: mocks.getPackage,
}));
vi.mock('get-port', () => ({ default: mocks.getPort }));
vi.mock('nitropack', () => ({
  build: mocks.build,
  createDevServer: () => ({ listen: mocks.listen }),
  createNitro: mocks.createNitro,
  prepare: mocks.prepare,
}));

function fixture() {
  const plugin = viteNitroMockPlugin() as Plugin;
  const server = { printUrls: vi.fn() } as unknown as ViteDevServer;
  const configure = plugin.configureServer;
  const close = plugin.closeBundle;
  if (typeof configure !== 'function' || typeof close !== 'function') {
    throw new TypeError('Expected callable Vite lifecycle hooks');
  }
  return {
    close: () => close.call({} as never),
    start: async () => configure.call({} as never, server),
  };
}

function healthy() {
  return {
    json: async () => ({ service: '@vben/backend-mock', status: 'ok' }),
    ok: true,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.getPort.mockResolvedValue(5320);
  mocks.getPackage.mockResolvedValue({ dir: '/mock-backend' });
  mocks.createNitro.mockResolvedValue({
    close: mocks.close,
    hooks: { hookOnce: vi.fn() },
    options: { _c12: {} },
  });
  mocks.fetch.mockResolvedValue(healthy());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('nitro mock automatic startup', () => {
  it('checks and listens on IPv4 loopback and waits for compilation', async () => {
    const building = Promise.withResolvers<undefined>();
    mocks.build.mockReturnValue(building.promise);
    const plugin = fixture();
    let ready = false;
    const starting = plugin.start().then(() => {
      ready = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(ready).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.getPort).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 5320,
    });
    expect(mocks.listen).toHaveBeenCalledWith(5320, {
      hostname: '127.0.0.1',
      port: { alternativePortRange: [5320, 5320], port: 5320, random: false },
      showURL: false,
    });
    building.resolve(undefined);
    await starting;
    expect(ready).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:5320/api/health',
      expect.objectContaining({ redirect: 'error' }),
    );
    await plugin.close();
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it('reuses an independently started healthy backend without owning its shutdown', async () => {
    mocks.getPort.mockResolvedValue(6000);
    const plugin = fixture();
    await plugin.start();
    expect(mocks.createNitro).not.toHaveBeenCalled();
    await plugin.close();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it('waits for a listening backend to finish compiling before reuse', async () => {
    mocks.getPort.mockResolvedValue(6000);
    mocks.fetch.mockResolvedValueOnce({ ok: false });
    const starting = fixture().start();
    await vi.advanceTimersByTimeAsync(150);
    await starting;
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.createNitro).not.toHaveBeenCalled();
  });

  it('reports a port conflict instead of accepting another HTTP service', async () => {
    mocks.getPort.mockResolvedValue(6000);
    mocks.fetch.mockResolvedValue({
      json: async () => ({ status: 'ok' }),
      ok: true,
    });
    const failure = fixture()
      .start()
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_100);
    expect(await failure).toMatchObject({
      message: expect.stringContaining('端口 127.0.0.1:5320 已被占用'),
    });
    expect(mocks.createNitro).not.toHaveBeenCalled();
  });

  it('reports missing backend dependencies', async () => {
    mocks.getPackage.mockResolvedValue(undefined);
    await expect(fixture().start()).rejects.toThrow('找不到 Mock 后端包');
  });

  it('propagates compilation errors and closes its partially started backend', async () => {
    mocks.build.mockRejectedValue(new Error('Invalid backend configuration'));
    await expect(fixture().start()).rejects.toThrow(
      'Mock 后端启动失败（http://127.0.0.1:5320/api）：Invalid backend configuration',
    );
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it('fails startup and releases its listener if the backend never becomes ready', async () => {
    mocks.fetch.mockRejectedValue(new Error('Connection refused'));
    const failure = fixture()
      .start()
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_100);
    expect(await failure).toMatchObject({
      message: expect.stringContaining('后端健康检查超时'),
    });
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});

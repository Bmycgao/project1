import type { PluginOption } from 'vite';

import type { NitroMockPluginOptions } from '../typing';

import { setTimeout as delay } from 'node:timers/promises';

import { colors, consola, getPackage } from '@vben/node-utils';

import getPort from 'get-port';
import { build, createDevServer, createNitro, prepare } from 'nitropack';

const hmrKeyRe = /^runtimeConfig\.|routeRules\./;
const mockHost = '127.0.0.1';

async function waitForMockServer(url: string, timeout: number) {
  const deadline = Date.now() + timeout;
  do {
    try {
      const response = await fetch(`${url}/health`, {
        redirect: 'error',
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        const health = await response.json();
        if (
          health &&
          typeof health === 'object' &&
          'service' in health &&
          'status' in health &&
          health.service === '@vben/backend-mock' &&
          health.status === 'ok'
        ) {
          return true;
        }
      }
    } catch {
      // A listening Nitro server may still be compiling its routes.
    }
    await delay(150);
  } while (Date.now() < deadline);
  return false;
}

export const viteNitroMockPlugin = ({
  mockServerPackage = '@vben/backend-mock',
  port = 5320,
  verbose = true,
}: NitroMockPluginOptions = {}): PluginOption => {
  let closeMock: (() => Promise<void>) | undefined;
  return {
    apply: 'serve',
    async closeBundle() {
      await closeMock?.();
      closeMock = undefined;
    },
    async configureServer(server) {
      const url = `http://${mockHost}:${port}/api`;
      const availablePort = await getPort({ host: mockHost, port });
      if (availablePort === port) {
        const pkg = await getPackage(mockServerPackage);
        if (!pkg) {
          throw new Error(
            `找不到 Mock 后端包 ${mockServerPackage}，请安装工作区依赖后重新启动。`,
          );
        }
        try {
          closeMock = await runNitroServer(pkg.dir, port, verbose, url);
        } catch (error) {
          throw new Error(
            `Mock 后端启动失败（${url}）：${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      } else {
        if (!(await waitForMockServer(url, 10_000))) {
          throw new Error(
            `Mock 后端端口 ${mockHost}:${port} 已被占用，且健康检查未通过。请关闭占用该端口的程序，或检查已启动的后端日志。`,
          );
        }
        consola.info(`Reusing Nitro Mock Server: ${url}`);
      }

      const _printUrls = server.printUrls;
      server.printUrls = () => {
        _printUrls();

        consola.log(
          `  ${colors.green('➜')}  ${colors.bold('Nitro Mock Server')}: ${colors.cyan(url)}`,
        );
      };
    },
    enforce: 'pre',
    name: 'vite:mock-server',
  };
};

async function runNitroServer(
  rootDir: string,
  port: number,
  verbose: boolean,
  url: string,
) {
  let nitro: any;
  let closed = false;
  const close = async () => {
    closed = true;
    await nitro?.close();
    nitro = undefined;
  };
  const reload = async () => {
    if (closed) return;
    if (nitro) {
      consola.info('Restarting dev server...');
      if ('unwatch' in nitro.options._c12) {
        await nitro.options._c12.unwatch();
      }
      await nitro.close();
    }
    nitro = await createNitro(
      {
        dev: true,
        preset: 'nitro-dev',
        rootDir,
      },
      {
        c12: {
          async onUpdate({ getDiff, newConfig }) {
            const diff = getDiff();
            if (diff.length === 0) {
              return;
            }
            verbose &&
              consola.info(
                `Nitro config updated:\n${diff
                  .map((entry) => `  ${entry.toString()}`)
                  .join('\n')}`,
              );
            await (diff.every((e) => hmrKeyRe.test(e.key))
              ? nitro.updateConfig(newConfig.config)
              : reload());
          },
        },
        watch: true,
      },
    );
    nitro.hooks.hookOnce('restart', reload);

    const server = createDevServer(nitro);
    await server.listen(port, {
      hostname: mockHost,
      port: { alternativePortRange: [port, port], port, random: false },
      showURL: false,
    });
    await prepare(nitro);
    await build(nitro);
    if (!(await waitForMockServer(url, 15_000))) {
      throw new Error('后端健康检查超时，请检查上方 Nitro 编译日志。');
    }

    if (verbose) {
      console.log('');
      consola.success(colors.bold(colors.green('Nitro Mock Server started.')));
    }
  };
  try {
    await reload();
    return close;
  } catch (error) {
    await close();
    throw error;
  }
}

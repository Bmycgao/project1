import { fileURLToPath } from 'node:url';

import { build, createDevServer, createNitro, prepare } from 'nitropack';

// 与 Vben 集成使用同一份 Nitro 配置，也可以只启动后端供小程序联调。
const nitro = await createNitro({
  rootDir: fileURLToPath(new URL('..', import.meta.url)),
  dev: true,
  preset: 'nitro-dev',
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await nitro.close();
}
process.once('SIGINT', () => {
  void close().finally(() => process.exit(0));
});
process.once('SIGTERM', () => {
  void close().finally(() => process.exit(0));
});
try {
  const port = Number(process.env.MINIAPP_DEV_PORT || 5320);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error('MINIAPP_DEV_PORT 必须是有效端口');
  const server = createDevServer(nitro);
  await server.listen(port, {
    hostname: process.env.MINIAPP_DEV_HOST || '127.0.0.1',
    port: { port, alternativePortRange: [port, port], random: false },
  });
  await prepare(nitro);
  await build(nitro);
  process.stdout.write('小程序后端已启动；修改 .env.local 后需要重启。\n');
} catch (error) {
  await close();
  console.error(error instanceof Error ? error.message : '后端启动失败');
  process.exitCode = 1;
}

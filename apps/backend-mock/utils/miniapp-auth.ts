import type { H3Event } from 'h3';

import { basename, dirname, join, resolve } from 'node:path';

import { getHeader, getRequestIP, setHeader, setResponseStatus } from 'h3';

import { requireDefined } from '../../shared/require-defined';
import { createMiniappStore } from './miniapp-store';
import { MiniappAuthError } from './miniapp-wechat';
import { DATA_DIR } from './mock-persist';
import { useResponseError, useResponseSuccess } from './response';

export function miniappDataDirectory() {
  const runtimeRoot = dirname(DATA_DIR);
  let directory;
  if (process.env.MINIAPP_AUTH_DATA_DIR) {
    directory = resolve(process.env.MINIAPP_AUTH_DATA_DIR);
  } else {
    directory = ['.nitro', '.output'].includes(basename(runtimeRoot))
      ? join(dirname(runtimeRoot), 'data')
      : DATA_DIR;
  }
  return directory;
}

export function miniappStore() {
  return createMiniappStore(join(miniappDataDirectory(), 'miniapp-auth.json'));
}

export function miniappBearer(event: H3Event) {
  const match = getHeader(event, 'authorization')?.match(
    /^Bearer (miniapp_[\w-]{43})$/i,
  );
  if (!match) throw new MiniappAuthError(401, '请先登录后再继续');
  return requireDefined(match[1]);
}

// 单实例登录限流，不信任客户端传入的 X-Forwarded-For。
const attempts = new Map<string, { count: number; until: number }>();
export function limitMiniappLogin(event: H3Event) {
  const now = Date.now();
  for (const [key, entry] of attempts)
    if (entry.until <= now) attempts.delete(key);
  const ip = getRequestIP(event) || 'unknown';
  const entry = attempts.get(ip) || { count: 0, until: now + 60_000 };
  if (entry.count >= 20 || (attempts.size >= 10_000 && !attempts.has(ip))) {
    setHeader(
      event,
      'Retry-After',
      Math.max(1, Math.ceil((entry.until - now) / 1000)),
    );
    throw new MiniappAuthError(429, '登录过于频繁，请稍后重试');
  }
  entry.count += 1;
  attempts.set(ip, entry);
}

export async function miniappResponse(event: H3Event, action: () => unknown) {
  setHeader(event, 'Cache-Control', 'no-store');
  setHeader(event, 'Pragma', 'no-cache');
  try {
    return useResponseSuccess(await action());
  } catch (error) {
    // 不走全局会输出 stack 的演示错误处理器，也不回传微信原始错误。
    const safe =
      error instanceof MiniappAuthError
        ? error
        : new MiniappAuthError(503, '登录服务暂时不可用，请稍后重试');
    setResponseStatus(event, safe.statusCode);
    return useResponseError(safe.message, safe.errorCode);
  }
}

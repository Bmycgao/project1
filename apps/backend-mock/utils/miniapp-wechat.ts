export class MiniappAuthError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errorCode = 'MINIAPP_AUTH_ERROR',
  ) {
    super(message);
  }
}

export function validateWechatCode(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 512 ||
    value !== value.trim() ||
    value === 'development-experience-code'
  )
    throw new MiniappAuthError(400, '请提供有效的微信登录凭证');
  return value;
}

export function getWechatConfig() {
  const appid = process.env.WECHAT_APP_ID?.trim() || '';
  const secret = process.env.WECHAT_APP_SECRET?.trim() || '';
  if (!/^wx[\da-f]{16}$/i.test(appid) || !/^[\da-z]{32}$/i.test(secret)) {
    throw new MiniappAuthError(
      503,
      '微信登录尚未配置，请联系管理员',
      'MINIAPP_CONFIG_REQUIRED',
    );
  }
  return { appid, secret };
}

/** 仅服务端调用微信；不记录请求 URL、code、密钥或微信的原始错误。 */
export async function exchangeWechatCode(
  code: string,
  config = getWechatConfig(),
  fetcher: typeof fetch = fetch,
) {
  validateWechatCode(code);
  const query = new URLSearchParams({
    appid: config.appid,
    secret: config.secret,
    js_code: code,
    grant_type: 'authorization_code',
  });
  let result: Record<string, unknown>;
  try {
    const response = await fetcher(
      `https://api.weixin.qq.com/sns/jscode2session?${query}`,
      {
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw new Error('upstream error');
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new Error('invalid response');
    result = payload as Record<string, unknown>;
  } catch {
    throw new MiniappAuthError(502, '暂时无法连接微信登录服务，请稍后重试');
  }
  const codeNumber = Number(result.errcode || 0);
  if ([40_029, 40_163, 40_226].includes(codeNumber)) {
    throw new MiniappAuthError(400, '微信登录凭证无效或已过期，请重新登录');
  }
  if ([45_009, 45_011].includes(codeNumber)) {
    throw new MiniappAuthError(429, '微信登录过于频繁，请稍后重试');
  }
  if ([40_001, 40_013, 40_125].includes(codeNumber)) {
    throw new MiniappAuthError(503, '微信登录配置异常，请联系管理员');
  }
  if (
    codeNumber !== 0 ||
    typeof result.openid !== 'string' ||
    !result.openid ||
    typeof result.session_key !== 'string' ||
    !result.session_key
  ) {
    throw new MiniappAuthError(502, '微信登录服务暂时不可用，请稍后重试');
  }
  // 当前只需要确认身份；session_key 不下发、不落盘，后续需要解密业务时再设计保存方式。
  return { appid: config.appid, openid: result.openid };
}

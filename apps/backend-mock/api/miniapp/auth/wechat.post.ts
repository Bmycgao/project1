import { defineEventHandler, readBody, setHeader, setResponseStatus } from 'h3';

import { limitMiniappLogin, miniappStore } from '../../../utils/miniapp-auth';
import {
  exchangeWechatCode,
  MiniappAuthError,
  validateWechatCode,
} from '../../../utils/miniapp-wechat';

// POST /api/miniapp/auth/wechat
// 前端提交：{ code: uni.login 返回的临时凭证 }，这个接口不需要 token。
// defineEventHandler 是 h3 库提供的函数，不是 Vben 或本项目自定义的封装。
// Nitro 根据 api 目录及 wechat.post.ts 文件名注册路径和 POST 方法。
// async (event) => { ... } 是传入的请求处理函数，每次请求都会执行；event 是本次请求/响应上下文。
// export default 导出处理器供 Nitro 使用；return 普通对象时由 H3 发送 JSON 响应。
export default defineEventHandler(async (event) => {
  // event 代表当前 HTTP 请求；登录响应中有 token，禁止缓存。
  setHeader(event, 'Cache-Control', 'no-store');
  setHeader(event, 'Pragma', 'no-cache');

  try {
    // 1. 检查同一个 IP 的登录请求是否过于频繁。
    limitMiniappLogin(event);

    // 2. 读取前端传来的 JSON。坏 JSON 直接返回参数错误。
    let body: null | { code?: unknown };
    try {
      body = await readBody(event);
    } catch {
      throw new MiniappAuthError(400, '登录请求格式不正确');
    }

    // 3. 检查 code 是否是有效格式的字符串。
    const code = validateWechatCode(body?.code);

    // 4. 服务端携带 AppID、AppSecret 和 code 请求微信。
    // 返回 { appid, openid }，只交给下一步使用，不直接返回前端。
    const wechatIdentity = await exchangeWechatCode(code);

    // 5. 查找或创建用户，生成两小时有效的业务 token，并保存会话。
    // 这里的 accountStore 是后端文件存储，不是前端 Pinia。
    const accountStore = miniappStore();
    const loginResult = accountStore.login(wechatIdentity);

    // 6. 前端拿到 data：{ accessToken, expiresIn, user }。
    return {
      code: 0,
      data: loginResult,
      error: null,
      message: 'ok',
    };
  } catch (error) {
    // 上面任意一步抛错都会到这里。已知错误保留状态和安全提示。
    let failure = new MiniappAuthError(503, '登录服务暂时不可用，请稍后重试');
    if (error instanceof MiniappAuthError) {
      failure = error;
    }

    // HTTP 状态与 JSON 中的 code 是两项不同的约定。
    setResponseStatus(event, failure.statusCode);
    return {
      code: -1,
      data: null,
      error: failure.errorCode,
      message: failure.message,
    };
  }
});

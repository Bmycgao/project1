import { defineEventHandler, setHeader, setResponseStatus } from 'h3';

import { miniappBearer, miniappStore } from '../../../utils/miniapp-auth';
import {
  getWechatConfig,
  MiniappAuthError,
} from '../../../utils/miniapp-wechat';

// GET /api/miniapp/user/info
// 前端必须携带 Header：Authorization: Bearer 登录返回的 accessToken。
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store');
  setHeader(event, 'Pragma', 'no-cache');

  try {
    // 1. 从请求 Header 中取出业务 token；缺失或格式错误会抛出 401。
    const accessToken = miniappBearer(event);

    // 2. 读取当前小程序配置，只用 appid 限定账户所属的小程序。
    const wechatConfig = getWechatConfig();

    // 3. 校验会话是否有效、是否过期，然后读取用户展示资料。
    const accountStore = miniappStore();
    const user = accountStore.profile(accessToken, wechatConfig.appid);

    // 4. 返回用户资料；不返回 openid、session_key 或 AppSecret。
    return {
      code: 0,
      data: user,
      error: null,
      message: 'ok',
    };
  } catch (error) {
    let failure = new MiniappAuthError(503, '登录服务暂时不可用，请稍后重试');
    if (error instanceof MiniappAuthError) {
      failure = error;
    }

    setResponseStatus(event, failure.statusCode);
    return {
      code: -1,
      data: null,
      error: failure.errorCode,
      message: failure.message,
    };
  }
});

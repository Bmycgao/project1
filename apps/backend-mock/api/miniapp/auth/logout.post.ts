import { defineEventHandler, setHeader, setResponseStatus } from 'h3';

import { miniappBearer, miniappStore } from '../../../utils/miniapp-auth';
import {
  getWechatConfig,
  MiniappAuthError,
} from '../../../utils/miniapp-wechat';

// POST /api/miniapp/auth/logout
// 前端必须携带 Header：Authorization: Bearer 登录返回的 accessToken。
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store');
  setHeader(event, 'Pragma', 'no-cache');

  try {
    // 1. 从请求 Header 中取出当前需要退出的业务 token。
    const accessToken = miniappBearer(event);

    // 2. 读取当前小程序配置。
    const wechatConfig = getWechatConfig();

    // 3. 删除这个 token 对应的服务端会话，不删除用户和其他设备的会话。
    const accountStore = miniappStore();
    accountStore.logout(accessToken, wechatConfig.appid);

    // 4. 退出成功没有额外数据，所以 data 是 null。
    return {
      code: 0,
      data: null,
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

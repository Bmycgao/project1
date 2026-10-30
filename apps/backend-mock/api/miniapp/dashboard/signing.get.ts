import { defineEventHandler } from 'h3';

import {
  miniappBearer,
  miniappResponse,
  miniappStore,
} from '../../../utils/miniapp-auth';
import { miniappSigningDemo } from '../../../utils/miniapp-signing-demo';
import { getWechatConfig } from '../../../utils/miniapp-wechat';

// GET /api/miniapp/dashboard/signing
// 1. 验证小程序业务 token；2. 从服务端读当前用户；3. 返回明确标记的演示数字。
// 当前没有真实业务数据权限，不把导航角色自行解释为“本人 / 本组 / 全部”的数据范围。
export default defineEventHandler((event) => {
  return miniappResponse(event, () => {
    const token = miniappBearer(event);
    const user = miniappStore().profile(token, getWechatConfig().appid);
    return miniappSigningDemo(user);
  });
});

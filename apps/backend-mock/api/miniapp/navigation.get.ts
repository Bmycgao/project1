import { defineEventHandler } from 'h3';

import { navigationForRole } from '../../../shared/miniapp-navigation';
import {
  miniappBearer,
  miniappResponse,
  miniappStore,
} from '../../utils/miniapp-auth';
import { navigationStore } from '../../utils/miniapp-navigation-store';
import { getWechatConfig } from '../../utils/miniapp-wechat';

// 返回当前用户可见导航；角色只从后端账户读取，不接受客户端自报角色。
export default defineEventHandler((event) =>
  miniappResponse(event, () => {
    const user = miniappStore().profile(
      miniappBearer(event),
      getWechatConfig().appid,
    );
    const config = navigationForRole(navigationStore().read(), user.roleCode);
    // 与导航一起返回最新角色，避免分两次请求造成角色与导航不同步。
    return { ...config, viewer: user };
  }),
);

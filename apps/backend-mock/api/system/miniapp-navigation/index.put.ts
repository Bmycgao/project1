import { defineEventHandler, readBody } from 'h3';

import { MINIAPP_NAV_AUTH } from '../../../../shared/miniapp-navigation';
import { miniappResponse } from '../../../utils/miniapp-auth';
import { navigationStore } from '../../../utils/miniapp-navigation-store';
import { MiniappAuthError } from '../../../utils/miniapp-wechat';
import { assertSystemAccess } from '../../../utils/system-api-auth';

// PUT /api/system/miniapp-navigation：Nitro 按目录和 .put.ts 后缀注册接口。
// defineEventHandler 来自 H3；每次请求都会调用下面这个函数，event 表示本次 HTTP 上下文。
export default defineEventHandler((event) => {
  // 第一步：校验 PC 管理员 token 与编辑权限。前端按钮禁用不能代替后端鉴权。
  const auth = assertSystemAccess(event, MINIAPP_NAV_AUTH.edit);
  if (!auth.ok) return auth.response;
  // 第二步：执行保存业务。miniappResponse 是本项目封装，负责禁用缓存、统一成功格式和安全错误响应。
  // 传入 async 函数是让它在 try/catch 中执行实际业务，并等待业务完成。
  return miniappResponse(event, async () => {
    let body: unknown;
    try {
      body = await readBody(event);
    } catch {
      throw new MiniappAuthError(400, '请求格式无效');
    }
    // 第三步：store 校验内容与 revision，再写本地存档；返回新版本配置给前端。
    // 读 JSON 成功不等于内容合法；业务校验仍在 store / shared 模块中完成。
    return navigationStore().publish(body);
  });
});

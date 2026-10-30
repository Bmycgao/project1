import type { NavigationConfig } from '../../../../shared/miniapp-navigation';

import { requestClient } from '#/api/request';

// 前端请求声明，不是后端实现。requestClient 负责地址前缀、凭证和响应处理。
// NavigationConfig 是编译期类型提示；页面仍用 validateNavigation 校验实际返回的数据。
// 对应后端：apps/backend-mock/api/system/miniapp-navigation/index.get.ts。
export const getMiniappNavigation = () =>
  requestClient.get<NavigationConfig>('/system/miniapp-navigation');
// 对应 index.put.ts；提交整份草稿，后端保存成功后返回新 revision 和发布时间。
export const publishMiniappNavigation = (data: NavigationConfig) =>
  requestClient.put<NavigationConfig>('/system/miniapp-navigation', data);

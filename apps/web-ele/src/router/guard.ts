import type { Router } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';
import { startProgress, stopProgress } from '@vben/utils';

import { accessRoutes, coreRouteNames } from '#/router/routes';
import { useAuthStore } from '#/store';
import { getAgreeListPathByScene } from '#/views/biz/agreement/scene-paths';

import { generateAccess } from './access';

/**
 * 是否协议详情路由（隐藏菜单，需动态 activePath）
 * @param to 目标路由
 */
function isAgreeDetailRoute(to: { name?: unknown; path: string }) {
  if (to.name === 'BizAgreementDetail') return true;
  // 兼容 path 匹配（后端菜单可能改 name）
  return /\/e-agree\/detail(?:\/|$)/.test(to.path);
}

/**
 * 进入详情前按来源列表改写侧栏高亮路径
 * （须在守卫里改 to.meta / matched.meta；页面内改无响应式）
 * @param to 目标路由
 */
function applyAgreeDetailActivePath(to: {
  name?: unknown;
  path: string;
  meta: Record<string, any>;
  query: Record<string, unknown>;
  matched?: { name?: unknown; path: string; meta: Record<string, any> }[];
}) {
  if (!isAgreeDetailRoute(to)) return;

  const rawActive = to.query.activePath;
  const fromQuery = String(
    Array.isArray(rawActive) ? rawActive[0] : rawActive || '',
  ).trim();

  const rawScene = to.query.scene;
  const scene = String(
    Array.isArray(rawScene) ? rawScene[0] : rawScene || '',
  ).trim();

  const activePath = fromQuery || getAgreeListPathByScene(scene || 'entry');

  to.meta.activePath = activePath;
  // 同步写到匹配记录，避免布局读到种子里写死的 /e-agree/entry
  to.matched?.forEach((record) => {
    if (
      record.name === 'BizAgreementDetail' ||
      /\/e-agree\/detail/.test(record.path)
    ) {
      record.meta.activePath = activePath;
    }
  });
}

/**
 * 通用守卫配置
 * @param router
 */
function setupCommonGuard(router: Router) {
  // 记录已经加载的页面
  const loadedPaths = new Set<string>();

  router.beforeEach((to) => {
    to.meta.loaded = loadedPaths.has(to.path);

    // 协议详情：按来源菜单高亮侧栏
    applyAgreeDetailActivePath(to);

    // 页面加载进度条
    if (!to.meta.loaded && preferences.transition.progress) {
      startProgress();
    }
    return true;
  });

  router.afterEach((to) => {
    // 记录页面是否加载,如果已经加载，后续的页面切换动画等效果不在重复执行

    loadedPaths.add(to.path);

    // 关闭页面加载进度条
    if (preferences.transition.progress) {
      stopProgress();
    }
  });
}

/**
 * 权限访问守卫配置
 * @param router
 */
function setupAccessGuard(router: Router) {
  router.beforeEach(async (to, from) => {
    const accessStore = useAccessStore();
    const userStore = useUserStore();
    const authStore = useAuthStore();

    // 基本路由，这些路由不需要进入权限拦截
    if (coreRouteNames.includes(to.name as string)) {
      if (to.path === LOGIN_PATH && accessStore.accessToken) {
        return decodeURIComponent(
          (to.query?.redirect as string) ||
            userStore.userInfo?.homePath ||
            preferences.app.defaultHomePath,
        );
      }
      return true;
    }

    // accessToken 检查
    if (!accessStore.accessToken) {
      // 明确声明忽略权限访问权限，则可以访问
      if (to.meta.ignoreAccess) {
        return true;
      }

      // 没有访问权限，跳转登录页面
      if (to.fullPath !== LOGIN_PATH) {
        return {
          path: LOGIN_PATH,
          // 如不需要，直接删除 query
          query:
            to.fullPath === preferences.app.defaultHomePath
              ? {}
              : { redirect: encodeURIComponent(to.fullPath) },
          // 携带当前跳转的页面，登录后重新跳转该页面
          replace: true,
        };
      }
      return to;
    }

    // 是否已经生成过动态路由
    if (accessStore.isAccessChecked) {
      // 动态路由已就绪时再补一次（避免首屏竞态）
      applyAgreeDetailActivePath(to);
      return true;
    }

    // 刷新页 / 首次进入：重新拉用户信息与权限码（文档 3.3：无需重登）
    // accessCodes 虽会持久化，但此处以服务端最新结果覆盖，避免改角色后仍用旧码
    const userInfo = await authStore.refreshAccessSession();
    const userRoles = userInfo.roles ?? [];

    // 生成菜单和路由（/menu/all 按最新角色权限过滤）
    const { accessibleMenus, accessibleRoutes } = await generateAccess({
      roles: userRoles,
      router,
      // 则会在菜单中显示，但是访问会被重定向到403
      routes: accessRoutes,
    });

    // 保存菜单信息和路由信息
    accessStore.setAccessMenus(accessibleMenus);
    accessStore.setAccessRoutes(accessibleRoutes);
    accessStore.setIsAccessChecked(true);
    const redirectPath = (from.query.redirect ??
      (to.path === preferences.app.defaultHomePath
        ? userInfo.homePath || preferences.app.defaultHomePath
        : to.fullPath)) as string;

    return {
      ...router.resolve(decodeURIComponent(redirectPath)),
      replace: true,
    };
  });
}

/**
 * 项目守卫配置
 * @param router
 */
function createRouterGuard(router: Router) {
  /** 通用 */
  setupCommonGuard(router);
  /** 权限访问 */
  setupAccessGuard(router);
}

export { createRouterGuard };

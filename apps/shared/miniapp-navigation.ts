import type { MiniappRoleCode } from './miniapp-roles';

import {
  isMiniappRole,
  MINIAPP_ROLE_CODES,
  MINIAPP_ROLES,
} from './miniapp-roles';
import { requireDefined } from './require-defined';

/** 只配置已编译的入口，不接收任意路由、脚本或业务权限。 */
export const MINIAPP_NAV_AUTH = {
  read: 'System:MiniappNavigation:List',
  edit: 'System:MiniappNavigation:Edit',
} as const;
export const NAV_PAGES = [
  {
    id: 'home',
    label: '首页',
    path: '/pages/index/index',
    description: '服务概览与使用提示',
  },
  {
    id: 'services',
    label: '服务中心',
    path: '/pages/services/index',
    description: '流程、协议服务入口',
  },
  {
    id: 'account',
    label: '我的账户',
    path: '/pages/account/index',
    description: '账户、协议与退出登录',
  },
  {
    id: 'test',
    label: '测试页面',
    path: '/pages/test/index',
    description: '测试导航新增、删除与页面切换',
  },
  {
    id: 'favorites',
    label: '房源收藏',
    path: '/pages/favorites/index',
    description: '查询房源、我的收藏与房源详情',
  },
] as const;
// 入口编号与页面目标分离；新入口不局限于原来的 home/services/mine。
export function isNavigationEntryId(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value)
  );
}
const LEGACY_TARGETS = {
  home: 'home',
  services: 'services',
  mine: 'account',
} as const;
export const NAV_ICONS = [
  { value: 'home', label: '房屋' },
  { value: 'grid', label: '服务' },
  { value: 'user', label: '用户' },
  { value: 'file', label: '文档' },
  { value: 'star', label: '星标' },
] as const;
export type NavPageId = (typeof NAV_PAGES)[number]['id'];
export type NavEntryId = string;
export interface NavigationItem {
  id: NavEntryId;
  target: NavPageId;
  text: string;
  icon: (typeof NAV_ICONS)[number]['value'];
  enabled: boolean;
  /** 未声明的旧配置按全部角色可见迁移。 */
  visibleRoles?: MiniappRoleCode[];
}
export interface NavigationConfig {
  revision: number;
  updatedAt: null | string;
  title: string;
  color: string;
  activeColor: string;
  backgroundColor: string;
  items: NavigationItem[];
}
export function defaultNavigation(): NavigationConfig {
  return {
    revision: 0,
    updatedAt: null,
    title: '签约助手',
    color: '#869184',
    activeColor: '#246b55',
    backgroundColor: '#ffffff',
    items: [
      {
        id: 'home',
        text: '首页',
        target: 'home',
        icon: 'home',
        enabled: true,
        visibleRoles: [...MINIAPP_ROLE_CODES],
      },
      {
        id: 'services',
        text: '服务',
        target: 'services',
        icon: 'grid',
        enabled: true,
        visibleRoles: [...MINIAPP_ROLE_CODES],
      },
      {
        id: 'mine',
        text: '我的',
        target: 'account',
        icon: 'user',
        enabled: true,
        visibleRoles: [...MINIAPP_ROLE_CODES],
      },
    ],
  };
}
/** 账户目标固定在末尾，其余入口保持原相对顺序；不修改传入数组。 */
export function orderNavigationItems(
  items: NavigationItem[],
): NavigationItem[] {
  return [
    ...items.filter((item) => item.target !== 'account'),
    ...items.filter((item) => item.target === 'account'),
  ];
}
/** 只允许业务入口之间相邻排序，不能跨过固定的账户入口。 */
export function canMoveNavigationItem(
  config: NavigationConfig,
  id: NavEntryId,
  offset: number,
) {
  const index = config.items.findIndex((item) => item.id === id);
  const next = index + offset;
  return (
    (offset === -1 || offset === 1) &&
    index !== -1 &&
    next >= 0 &&
    next < config.items.length &&
    requireDefined(config.items[index]).target !== 'account' &&
    requireDefined(config.items[next]).target !== 'account'
  );
}
export function moveNavigationItem(
  config: NavigationConfig,
  id: NavEntryId,
  offset: number,
): NavigationConfig {
  if (!canMoveNavigationItem(config, id, offset)) return config;
  const index = config.items.findIndex((item) => item.id === id);
  const items = [...config.items];
  [items[index], items[index + offset]] = [
    requireDefined(items[index + offset]),
    requireDefined(items[index]),
  ];
  return { ...config, items };
}
export class NavigationValidationError extends Error {}
export function validateNavigation(value: unknown): NavigationConfig {
  const data = value as NavigationConfig;
  const fail = (message: string): never => {
    throw new NavigationValidationError(message);
  };
  if (!data || typeof data !== 'object') fail('请提交完整的导航配置');
  if (!Number.isSafeInteger(data.revision) || data.revision < 0)
    fail('配置版本无效，请重新加载');
  if (
    typeof data.title !== 'string' ||
    !data.title.trim() ||
    [...data.title.trim()].length > 16
  )
    fail('应用名称应为 1～16 个字符');
  for (const name of ['color', 'activeColor', 'backgroundColor'] as const)
    if (typeof data[name] !== 'string' || !/^#[\da-f]{6}$/i.test(data[name]))
      fail('颜色应为六位十六进制色值，如 #246b55');
  if (
    !Array.isArray(data.items) ||
    data.items.length < 2 ||
    data.items.length > NAV_PAGES.length
  )
    fail(`请保留 2～${NAV_PAGES.length} 个入口，每个目标页面最多绑定一次`);
  const ids = new Set<string>();
  const targets = new Set<string>();
  const items = data.items.map((item) => {
    if (!item || !isNavigationEntryId(item.id) || ids.has(item.id))
      fail('入口无效或重复');
    ids.add(item.id);
    if (
      typeof item.text !== 'string' ||
      !item.text.trim() ||
      [...item.text.trim()].length > 6
    )
      fail('导航名称应为 1～6 个字符');
    if (!NAV_ICONS.some((icon) => icon.value === item.icon))
      fail('请选择已有图标');
    if (typeof item.enabled !== 'boolean') fail('显示状态无效');
    // 旧存档没有 target 时按原来的对应关系补齐；不重置版本和外观。
    const legacyTarget = Object.hasOwn(LEGACY_TARGETS, item.id)
      ? LEGACY_TARGETS[item.id as keyof typeof LEGACY_TARGETS]
      : undefined;
    const target = item.target === undefined ? legacyTarget : item.target;
    if (
      typeof target !== 'string' ||
      !NAV_PAGES.some((page) => page.id === target) ||
      targets.has(target)
    )
      fail('目标页面无效或重复，请选择不同的已有页面');
    // 经过白名单校验之后，才把外部输入当作已支持的目标。
    const pageTarget = target as NavPageId;
    targets.add(pageTarget);
    if (target === 'account' && !item.enabled)
      fail('“我的账户”目标必须保留，方便查看账户与退出');
    return {
      id: item.id,
      target: pageTarget,
      text: item.text.trim(),
      icon: item.icon,
      enabled: item.enabled,
      visibleRoles: readVisibleRoles(item.visibleRoles),
    };
  });
  if (items.filter((item) => item.enabled).length < 2)
    fail('至少显示两个导航入口');
  if (!items.some((item) => item.target === 'account' && item.enabled))
    fail('必须保留可见的“我的账户”入口，方便查看账户与退出');
  // 发布整份配置前，分别检查三个角色，避免某个身份只剩一个入口或无法退出。
  for (const role of MINIAPP_ROLES) {
    const visible = visibleNavigationItems({ items }, role.code);
    if (visible.length < 2) fail(`${role.name}至少需要两个可见入口`);
    if (!visible.some((item) => item.target === 'account'))
      fail(`${role.name}必须保留我的账户入口`);
  }
  return {
    revision: data.revision,
    updatedAt:
      data.updatedAt === null || typeof data.updatedAt === 'string'
        ? data.updatedAt
        : null,
    title: data.title.trim(),
    color: data.color,
    activeColor: data.activeColor,
    backgroundColor: data.backgroundColor,
    items: orderNavigationItems(items),
  };
}

/** 只修改选中的入口。冲突时明确报错，不修改其他入口。 */
export function bindNavigationTarget(
  config: NavigationConfig,
  id: NavEntryId,
  target: NavPageId,
) {
  if (!NAV_PAGES.some((page) => page.id === target))
    throw new NavigationValidationError('请选择已有的目标页面');
  const current = config.items.find((item) => item.id === id);
  if (!current) throw new NavigationValidationError('导航入口不存在');
  const other = config.items.find(
    (item) => item.id !== id && item.target === target,
  );
  if (other)
    throw new NavigationValidationError(
      `该目标已由“${other.text}”使用，请选择未占用的页面`,
    );
  if (current.target === 'account' && target !== 'account')
    throw new NavigationValidationError(
      '账户入口必须保留，不能更换它的目标页面',
    );
  const items = config.items.map((item) =>
    item.id === id ? { ...item, target } : { ...item },
  );
  return { ...config, items };
}

// 隐藏的入口仍保留绑定；删除入口后才释放目标。
export function availableNavigationPages(config: NavigationConfig) {
  return NAV_PAGES.filter(
    (page) => !config.items.some((item) => item.target === page.id),
  );
}

export function addNavigationItem(
  config: NavigationConfig,
  id: NavEntryId,
): NavigationConfig {
  if (!isNavigationEntryId(id) || config.items.some((item) => item.id === id))
    throw new NavigationValidationError('新入口编号无效或重复，请重试');
  const page = availableNavigationPages(config)[0];
  if (!page)
    throw new NavigationValidationError('暂无可用目标页面，已有页面均已绑定');
  const item: NavigationItem = {
    id,
    target: page.id,
    text: page.label,
    icon:
      (
        {
          home: 'home',
          account: 'user',
          favorites: 'star',
          test: 'file',
        } as Record<string, NavigationItem['icon']>
      )[page.id] || 'grid',
    enabled: true,
    visibleRoles: [...MINIAPP_ROLE_CODES],
  };
  // 新增业务入口排在账户之前，不改变已存在业务入口的顺序。
  return { ...config, items: orderNavigationItems([...config.items, item]) };
}

export function navigationRemovalReason(
  config: NavigationConfig,
  id: NavEntryId,
) {
  const item = config.items.find((entry) => entry.id === id);
  if (!item) return '导航入口不存在';
  if (item.target === 'account') return '账户入口必须保留，不能删除';
  if (
    config.items.filter((entry) => entry.id !== id && entry.enabled).length < 2
  )
    return '至少保留两个显示中的入口，不能继续删除';
  try {
    validateNavigation({
      ...config,
      items: config.items.filter((entry) => entry.id !== id),
    });
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

export function removeNavigationItem(
  config: NavigationConfig,
  id: NavEntryId,
): NavigationConfig {
  const reason = navigationRemovalReason(config, id);
  if (reason) throw new NavigationValidationError(reason);
  return { ...config, items: config.items.filter((item) => item.id !== id) };
}

/** 旧存档缺少字段时迁移；显式传入的非法角色不能悄悄变成“全部”。 */
export function readVisibleRoles(value: unknown): MiniappRoleCode[] {
  if (value === undefined) return [...MINIAPP_ROLE_CODES];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((code) => !isMiniappRole(code)) ||
    new Set(value).size !== value.length
  )
    throw new NavigationValidationError('请选择有效且不重复的可见角色');
  return MINIAPP_ROLE_CODES.filter((code) => value.includes(code));
}
export function visibleNavigationItems(
  config: Pick<NavigationConfig, 'items'>,
  role: MiniappRoleCode,
) {
  // 编辑中的草稿可能暂时取消所有角色：预览显示为空，发布时再由严格校验提示。
  return orderNavigationItems(config.items).filter((item) => {
    const roles =
      item.visibleRoles === undefined ? MINIAPP_ROLE_CODES : item.visibleRoles;
    return item.enabled && Array.isArray(roles) && roles.includes(role);
  });
}
export function navigationForRole(
  config: NavigationConfig,
  role: MiniappRoleCode,
): NavigationConfig {
  return { ...config, items: visibleNavigationItems(config, role) };
}
/** 演示方案只生成草稿，由管理员确认后发布，不覆盖已有配置。 */
export function demoRoleNavigation(): NavigationConfig {
  const config = defaultNavigation();
  requireDefined(config.items[1]).visibleRoles = ['resident', 'miniapp_admin'];
  config.items.splice(2, 0, {
    id: 'demo-test',
    target: 'test',
    text: '测试',
    icon: 'file',
    enabled: true,
    visibleRoles: ['operator', 'miniapp_admin'],
  });
  return config;
}

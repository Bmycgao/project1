import { requireDefined } from './require-defined';

/** 小程序导航角色，与 PC 后台的登录角色、菜单权限分别管理。 */
export const MINIAPP_ROLES = [
  { code: 'resident', name: '居民' },
  { code: 'operator', name: '操作员' },
  { code: 'miniapp_admin', name: '小程序管理员' },
] as const;
export type MiniappRoleCode = (typeof MINIAPP_ROLES)[number]['code'];
export const MINIAPP_ROLE_CODES = MINIAPP_ROLES.map((role) => role.code);
export function isMiniappRole(value: unknown): value is MiniappRoleCode {
  return MINIAPP_ROLES.some((role) => role.code === value);
}
export function miniappRoleName(code: MiniappRoleCode) {
  return requireDefined(MINIAPP_ROLES.find((role) => role.code === code)).name;
}
// 能修改导航，不等于能给用户分配角色；两项 PC 权限可分别授予。
export const MINIAPP_USER_AUTH = {
  read: 'System:MiniappUser:List',
  edit: 'System:MiniappUser:EditRole',
} as const;

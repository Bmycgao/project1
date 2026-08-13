/**
 * 系统管理接口鉴权：登录 + accessCodes（与菜单 authCode / 前端 AccessControl 对齐）
 */
import type { EventHandlerRequest, H3Event } from 'h3';

import { verifyAccessToken } from './jwt-utils';
import {
  findRbacUserByUsername,
  resolveAccessCodes,
} from './rbac-store';
import { forbiddenResponse, unAuthorizedResponse } from './response';

/** 系统权限码常量（与 mock-data 菜单 button.authCode 一致） */
export const SYSTEM_AUTH = {
  userCreate: 'System:User:Create',
  userEdit: 'System:User:Edit',
  userDelete: 'System:User:Delete',
  userList: 'System:User:List',
  roleCreate: 'System:Role:Create',
  roleEdit: 'System:Role:Edit',
  roleList: 'System:Role:List',
  menuCreate: 'System:Menu:Create',
  menuEdit: 'System:Menu:Edit',
  menuDelete: 'System:Menu:Delete',
  menuList: 'System:Menu:List',
  deptCreate: 'System:Dept:Create',
  deptEdit: 'System:Dept:Edit',
  deptDelete: 'System:Dept:Delete',
  deptList: 'System:Dept:List',
  pageSchemaList: 'System:PageSchema:List',
} as const;

/**
 * 是否命中系统权限码（支持 System:* 通配）
 * @param accessCodes 用户权限码
 * @param need 所需码（任一即可）
 */
export function matchSystemAccessCodes(
  accessCodes: string[] | undefined,
  need: string[] | string,
) {
  const needList = Array.isArray(need) ? need : [need];
  if (!needList.length) return true;
  const set = new Set(accessCodes || []);
  if (set.has('System:*')) return true;
  // 超管协议通配不直接放行系统写操作；超管实际会拥有全部 System: 码
  return needList.some((c) => set.has(c));
}

/**
 * 校验登录并要求具备指定系统权限码
 * @param event h3 事件
 * @param need 所需权限码
 */
export function assertSystemAccess(
  event: H3Event<EventHandlerRequest>,
  need: string[] | string,
) {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return { ok: false as const, response: unAuthorizedResponse(event) };
  }

  const user = findRbacUserByUsername(userinfo.username);
  const codes = user ? resolveAccessCodes(user) : [];
  if (!matchSystemAccessCodes(codes, need)) {
    const needText = Array.isArray(need) ? need.join(' / ') : need;
    return {
      ok: false as const,
      response: forbiddenResponse(
        event,
        `无权限执行系统操作（需要：${needText}）`,
      ),
      userinfo,
      codes,
    };
  }

  return { ok: true as const, userinfo, codes };
}

/**
 * 页面配置「业务读」鉴权：管理端 List 码 或 任一协议权限均可
 * （协议列表/详情按 schemaId 拉配置，不能要求 System:PageSchema:List）
 * @param event h3 事件
 */
export function assertPageSchemaReadAccess(
  event: H3Event<EventHandlerRequest>,
) {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return { ok: false as const, response: unAuthorizedResponse(event) };
  }

  const user = findRbacUserByUsername(userinfo.username);
  const codes = user ? resolveAccessCodes(user) : [];
  const canManage = matchSystemAccessCodes(codes, SYSTEM_AUTH.pageSchemaList);
  const canBizRead = codes.some(
    (c) => c === 'Agree:*' || String(c).startsWith('Agree:'),
  );
  if (!canManage && !canBizRead) {
    return {
      ok: false as const,
      response: forbiddenResponse(
        event,
        `无权限读取页面配置（需要：${SYSTEM_AUTH.pageSchemaList} 或协议相关权限）`,
      ),
      userinfo,
      codes,
    };
  }

  return { ok: true as const, userinfo, codes };
}

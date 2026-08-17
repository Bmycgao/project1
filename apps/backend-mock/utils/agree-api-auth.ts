/**
 * 协议业务接口鉴权：登录 + accessCodes（与前端 Agree:xxx 对齐）
 */
import type { EventHandlerRequest, H3Event } from 'h3';

import { verifyAccessToken } from './jwt-utils';
import {
  findRbacUserByUsername,
  resolveAccessCodes,
} from './rbac-store';
import { forbiddenResponse, unAuthorizedResponse } from './response';

/** 动作码 → 权限码（与前端 getAgreeActionAuthCode 一致） */
export const AGREE_ACTION_AUTH: Record<string, string> = {
  add: 'Agree:add',
  delete: 'Agree:delete',
  edit: 'Agree:edit',
  submitReview: 'Agree:submitReview',
  approve: 'Agree:approve',
  reject: 'Agree:reject',
  export: 'Agree:export',
};

/** 详情区域 → 权限码 */
export const AGREE_MODULE_AUTH: Record<string, string> = {
  basic: 'Agree:Module:basic',
  houses: 'Agree:Module:houses',
  compensation: 'Agree:Module:compensation',
  rewards: 'Agree:Module:rewards',
  population: 'Agree:Module:population',
};

/**
 * 是否命中所需权限码（支持 Agree:* / Agree:Module:* / Agree:Field:*）
 * @param accessCodes 用户权限码
 * @param need 需要的码（任一即可）
 */
export function matchAgreeAccessCodes(
  accessCodes: string[] | undefined,
  need: string[] | string,
) {
  const needList = Array.isArray(need) ? need : [need];
  if (!needList.length) return true;
  const set = new Set(accessCodes || []);
  if (set.has('Agree:*')) return true;
  if (
    needList.some((c) => c.startsWith('Agree:Module:')) &&
    set.has('Agree:Module:*')
  ) {
    return true;
  }
  if (
    needList.some((c) => c.startsWith('Agree:Field:')) &&
    set.has('Agree:Field:*')
  ) {
    return true;
  }
  return needList.some((c) => set.has(c));
}

/**
 * 校验登录并要求具备指定权限码
 * @param event h3 事件
 * @param need 所需权限码（任一即可）
 * @returns null 表示通过；否则返回 401/403 响应体
 */
export function assertAgreeAccess(
  event: H3Event<EventHandlerRequest>,
  need: string[] | string,
) {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return { ok: false as const, response: unAuthorizedResponse(event) };
  }

  const user = findRbacUserByUsername(userinfo.username);
  const codes = user ? resolveAccessCodes(user) : [];
  if (!matchAgreeAccessCodes(codes, need)) {
    const needText = Array.isArray(need) ? need.join(' / ') : need;
    return {
      ok: false as const,
      response: forbiddenResponse(event, `无权限执行操作（需要：${needText}）`),
      userinfo,
      codes,
    };
  }

  return { ok: true as const, userinfo, codes };
}

/**
 * 按动作名断言权限（Agree:add 等）
 * @param event h3 事件
 * @param action 动作码
 */
export function assertAgreeAction(
  event: H3Event<EventHandlerRequest>,
  action: keyof typeof AGREE_ACTION_AUTH,
) {
  const code = AGREE_ACTION_AUTH[action];
  return assertAgreeAccess(event, code);
}

/**
 * 读接口：只要具备任一 Agree: 相关权限（含菜单）即可
 * @param event h3 事件
 */
export function assertAnyAgreeAccess(event: H3Event<EventHandlerRequest>) {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return { ok: false as const, response: unAuthorizedResponse(event) };
  }
  const user = findRbacUserByUsername(userinfo.username);
  const codes = user ? resolveAccessCodes(user) : [];
  const ok = codes.some(
    (c) => c === 'Agree:*' || String(c).startsWith('Agree:'),
  );
  if (!ok) {
    return {
      ok: false as const,
      response: forbiddenResponse(event, '无协议相关权限'),
      userinfo,
      codes,
    };
  }
  return { ok: true as const, userinfo, codes };
}

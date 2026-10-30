import type { MiniappRoleCode } from '../../../../shared/miniapp-roles';

import { requestClient } from '#/api/request';

export interface MiniappUserRow {
  id: string;
  nickname: string;
  roleCode: MiniappRoleCode;
  roleName: string;
  roleRevision: number;
  appid: string;
  createdAt: number;
}
export const getMiniappUsers = () =>
  requestClient.get<{ items: MiniappUserRow[] }>('/system/miniapp-users');
export const updateMiniappUserRole = (
  user: MiniappUserRow,
  roleCode: MiniappRoleCode,
) =>
  requestClient.put<MiniappUserRow>(
    `/system/miniapp-users/${encodeURIComponent(user.id)}`,
    {
      roleCode,
      roleRevision: user.roleRevision,
    },
  );

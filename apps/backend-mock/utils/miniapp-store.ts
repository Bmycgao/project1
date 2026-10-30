import type { MiniappRoleCode } from '../../shared/miniapp-roles';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

import { isMiniappRole, miniappRoleName } from '../../shared/miniapp-roles';
import { MiniappAuthError } from './miniapp-wechat';

interface MiniappUser {
  id: string;
  appid: string;
  openid: string;
  createdAt: number;
  roleCode: MiniappRoleCode;
  roleRevision: number;
}
interface MiniappSession {
  tokenHash: string;
  userId: string;
  appid: string;
  expiresAt: number;
}
interface Snapshot {
  version: 1;
  users: MiniappUser[];
  sessions: MiniappSession[];
}
const TOKEN_PATTERN = /^miniapp_[\w-]{43}$/;
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const publicUser = (user: MiniappUser) => ({
  id: user.id,
  nickname: '微信用户',
  roleCode: user.roleCode,
  roleRevision: user.roleRevision,
  roleName: miniappRoleName(user.roleCode),
});
const unauthorized = () => new MiniappAuthError(401, '登录已失效，请重新登录');

function validateSnapshot(value: unknown): asserts value is Snapshot {
  const data = value as Snapshot;
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.users) ||
    !Array.isArray(data.sessions)
  )
    throw new Error('invalid snapshot');
  const users = new Map<string, MiniappUser>();
  const identities = new Set<string>();
  for (const user of data.users) {
    if (
      !user ||
      typeof user.id !== 'string' ||
      !user.id ||
      typeof user.appid !== 'string' ||
      !user.appid ||
      typeof user.openid !== 'string' ||
      !user.openid ||
      !Number.isFinite(user.createdAt) ||
      users.has(user.id) ||
      identities.has(`${user.appid}:${user.openid}`)
    )
      throw new Error('invalid user');
    // 兼容旧账号：没有角色字段时按居民迁移；非法角色拒绝读取，不扩大权限。
    if (user.roleCode === undefined) user.roleCode = 'resident';
    if (user.roleRevision === undefined) user.roleRevision = 0;
    if (
      !isMiniappRole(user.roleCode) ||
      !Number.isSafeInteger(user.roleRevision) ||
      user.roleRevision < 0
    )
      throw new Error('invalid user role');
    users.set(user.id, user);
    identities.add(`${user.appid}:${user.openid}`);
  }
  const hashes = new Set<string>();
  for (const session of data.sessions) {
    if (
      !session ||
      typeof session.tokenHash !== 'string' ||
      !/^[\da-f]{64}$/.test(session.tokenHash) ||
      !Number.isFinite(session.expiresAt) ||
      hashes.has(session.tokenHash) ||
      !users.has(session.userId) ||
      users.get(session.userId)?.appid !== session.appid
    )
      throw new Error('invalid session');
    hashes.add(session.tokenHash);
  }
}

/** 单进程开发服务的文件存储；同步原子替换，写入成功后才返回 token。 */
export function createMiniappStore(file: string, now: () => number = Date.now) {
  function read(): Snapshot {
    try {
      if (!existsSync(file)) return { version: 1, users: [], sessions: [] };
      const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
      validateSnapshot(data);
      return data;
    } catch {
      // 存档损坏时不重置、不覆盖，避免丢失账号和撤销记录。
      throw new MiniappAuthError(
        503,
        '账户存储暂时不可用，请联系管理员',
        'MINIAPP_STORE_UNAVAILABLE',
      );
    }
  }
  function write(data: Snapshot) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, {
        mode: 0o600,
      });
      renameSync(temporary, file);
    } catch {
      throw new MiniappAuthError(
        503,
        '账户保存失败，请稍后重试',
        'MINIAPP_STORE_UNAVAILABLE',
      );
    } finally {
      if (existsSync(temporary)) {
        try {
          unlinkSync(temporary);
        } catch {
          /* 保留主存档，清理失败不掩盖原错误。 */
        }
      }
    }
  }
  return {
    login(identity: { appid: string; openid: string }) {
      const data = read();
      let user = data.users.find(
        (item) =>
          item.appid === identity.appid && item.openid === identity.openid,
      );
      if (!user) {
        user = {
          id: `mp_${randomUUID()}`,
          ...identity,
          createdAt: now(),
          roleCode: 'resident',
          roleRevision: 0,
        };
        data.users.push(user);
      }
      const expiresIn = 7200;
      const accessToken = `miniapp_${randomBytes(32).toString('base64url')}`;
      data.sessions = data.sessions.filter((item) => item.expiresAt > now());
      data.sessions.push({
        tokenHash: hashToken(accessToken),
        userId: user.id,
        appid: identity.appid,
        expiresAt: now() + expiresIn * 1000,
      });
      write(data);
      return { accessToken, expiresIn, user: publicUser(user) };
    },
    // 管理端仅返回公开字段，不暴露 openid、token 或 tokenHash。
    listUsers() {
      return read()
        .users.map((user) => ({
          ...publicUser(user),
          appid: user.appid,
          createdAt: user.createdAt,
        }))
        .toSorted((a, b) => b.createdAt - a.createdAt);
    },
    setRole(userId: string, roleCode: unknown, expectedRevision: unknown) {
      if (!isMiniappRole(roleCode))
        throw new MiniappAuthError(400, '请选择有效的小程序角色');
      if (
        !Number.isSafeInteger(expectedRevision) ||
        Number(expectedRevision) < 0
      )
        throw new MiniappAuthError(400, '角色版本无效，请刷新用户列表');
      const data = read();
      const user = data.users.find((item) => item.id === userId);
      if (!user) throw new MiniappAuthError(404, '小程序用户不存在');
      if (user.roleRevision !== expectedRevision)
        throw new MiniappAuthError(409, '角色已被其他人修改，请刷新后重试');
      if (user.roleCode !== roleCode) {
        user.roleCode = roleCode;
        user.roleRevision += 1;
        write(data);
      }
      return {
        ...publicUser(user),
        appid: user.appid,
        createdAt: user.createdAt,
      };
    },
    profile(token: string, appid: string) {
      if (!TOKEN_PATTERN.test(token)) throw unauthorized();
      const data = read();
      const session = data.sessions.find(
        (item) =>
          item.tokenHash === hashToken(token) &&
          item.appid === appid &&
          item.expiresAt > now(),
      );
      const user =
        session &&
        data.users.find(
          (item) => item.id === session.userId && item.appid === appid,
        );
      if (!user) throw unauthorized();
      return publicUser(user);
    },
    logout(token: string, appid: string) {
      if (!TOKEN_PATTERN.test(token)) throw unauthorized();
      const data = read();
      const digest = hashToken(token);
      if (
        !data.sessions.some(
          (item) =>
            item.tokenHash === digest &&
            item.appid === appid &&
            item.expiresAt > now(),
        )
      )
        throw unauthorized();
      data.sessions = data.sessions.filter(
        (item) =>
          item.expiresAt > now() &&
          !(item.tokenHash === digest && item.appid === appid),
      );
      write(data);
    },
  };
}

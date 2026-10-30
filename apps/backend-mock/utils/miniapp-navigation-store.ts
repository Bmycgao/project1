import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import {
  defaultNavigation,
  NavigationValidationError,
  validateNavigation,
} from '../../shared/miniapp-navigation';
import { miniappDataDirectory } from './miniapp-auth';
import { MiniappAuthError } from './miniapp-wechat';

export function createNavigationStore(file: string) {
  function read() {
    try {
      if (!existsSync(file)) return defaultNavigation();
      return validateNavigation(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      throw new MiniappAuthError(
        503,
        '导航存档不可用，请联系管理员',
        'NAVIGATION_STORAGE_ERROR',
      );
    }
  }
  return {
    read,
    publish(input: unknown) {
      let data;
      try {
        data = validateNavigation(input);
      } catch (error) {
        if (error instanceof NavigationValidationError)
          throw new MiniappAuthError(400, error.message, 'NAVIGATION_INVALID');
        throw error;
      }
      const current = read();
      if (data.revision !== current.revision)
        throw new MiniappAuthError(
          409,
          '配置已被其他人更新，请重新加载后再编辑',
          'NAVIGATION_CONFLICT',
        );
      const next = {
        ...data,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, {
          mode: 0o600,
        });
        renameSync(temporary, file);
      } catch {
        try {
          if (existsSync(temporary)) unlinkSync(temporary);
        } catch {
          /* 保留原错误。 */
        }
        throw new MiniappAuthError(
          503,
          '导航保存失败，请稍后重试',
          'NAVIGATION_STORAGE_ERROR',
        );
      }
      return next;
    },
  };
}
export const navigationStore = () =>
  createNavigationStore(
    join(miniappDataDirectory(), 'miniapp-navigation.json'),
  );

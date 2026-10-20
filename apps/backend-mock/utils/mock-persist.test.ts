/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
// @vitest-environment node
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DATA_DIR, readPersistJson, writePersistJson } from './mock-persist';

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  failRename: false,
}));
vi.mock('node:fs', () => {
  const fs = {
    existsSync: (path: string) => state.files.has(path),
    mkdirSync: vi.fn(),
    readFileSync: (path: string) => state.files.get(path),
    writeFileSync: (path: string, content: string) =>
      state.files.set(path, content),
    unlinkSync: (path: string) => state.files.delete(path),
    renameSync: (from: string, to: string) => {
      if (state.failRename) throw new Error('文件替换失败');
      state.files.set(to, state.files.get(from)!);
      state.files.delete(from);
    },
  };
  return { ...fs, default: fs };
});

beforeEach(() => {
  state.files.clear();
  state.failRename = false;
});

describe('配置迁移原子持久化', () => {
  it('先写临时文件再替换，完成后只保留最终文件', () => {
    writePersistJson(
      'page-schema.json',
      { schemas: ['list', 'detail'] },
      { atomic: true },
    );
    expect(readPersistJson('page-schema.json')).toEqual({
      schemas: ['list', 'detail'],
    });
    expect([...state.files.keys()]).toEqual([
      join(DATA_DIR, 'page-schema.json'),
    ]);
  });
  it('文件替换失败时向调用方报错，保留原配置并清理临时文件', () => {
    writePersistJson('page-schema.json', { schemas: ['old'] });
    state.failRename = true;
    expect(() =>
      writePersistJson(
        'page-schema.json',
        { schemas: ['list', 'detail'] },
        { atomic: true },
      ),
    ).toThrow('文件替换失败');
    expect(readPersistJson('page-schema.json')).toEqual({ schemas: ['old'] });
    expect(state.files.size).toBe(1);
  });
});

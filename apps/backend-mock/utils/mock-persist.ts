/**
 * mock 本地落盘：配置台改动能跨重启保留（目录已在 .gitignore）
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** backend-mock/data 目录 */
const DATA_DIR = join(fileURLToPath(new URL('..', import.meta.url)), 'data');

/**
 * 确保 data 目录存在
 */
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * 读 JSON 文件；不存在或解析失败返回 null
 * @param fileName 文件名，如 page-schema.json
 */
export function readPersistJson<T>(fileName: string): null | T {
  try {
    const full = join(DATA_DIR, fileName);
    if (!existsSync(full)) return null;
    const raw = readFileSync(full, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * 写 JSON 文件
 * @param fileName 文件名
 * @param data 数据
 */
export function writePersistJson(
  fileName: string,
  data: unknown,
  options: { atomic?: boolean } = {},
) {
  let temporary = '';
  try {
    ensureDataDir();
    const full = join(DATA_DIR, fileName);
    const content = `${JSON.stringify(data, null, 2)}\n`;
    if (options.atomic) {
      temporary = `${full}.${process.pid}-${Date.now()}.tmp`;
      writeFileSync(temporary, content, 'utf8');
      renameSync(temporary, full);
    } else writeFileSync(full, content, 'utf8');
  } catch (error) {
    if (temporary && existsSync(temporary)) {
      try {
        unlinkSync(temporary);
      } catch {
        /* 原始错误优先。 */
      }
    }
    if (options.atomic) throw error;
    console.warn('[mock-persist] 写入失败', fileName, error);
  }
}

export { DATA_DIR };

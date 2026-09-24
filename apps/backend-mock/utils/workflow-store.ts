import type {
  WorkflowChangeEntry,
  WorkflowDocument,
  WorkflowRecord,
} from '../../shared/workflow';
import type { RuntimeForm } from '../../shared/workflow-runtime';

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  diffWorkflowConfig,
  documentOf,
  isWorkflowDocument,
  newId,
} from '../../shared/workflow';
import { DATA_DIR } from './mock-persist';

const FILE = 'workflow.json';
const CHANGE_LOG_LIMIT = 40;

/**
 * 把本次按钮、时限、数据动作、字段权限差异追加到版本日志
 * @param current 该版本已有日志
 * @param before 对比基准
 * @param after 保存或发布后的设计
 * @param by 操作人
 * @param action save 保存草稿；publish 发布
 * @param at ISO 时间
 */
function appendConfigLog(
  current: undefined | WorkflowChangeEntry[],
  before: undefined | WorkflowDocument,
  after: WorkflowDocument,
  by: string,
  action: WorkflowChangeEntry['action'],
  at: string,
): undefined | WorkflowChangeEntry[] {
  const lines = before
    ? diffWorkflowConfig(before, after).slice(0, CHANGE_LOG_LIMIT)
    : [];
  const next = [...(current || [])];
  if (lines.length > 0) next.push({ at, by, action, lines });
  return next.length > 0 ? next.slice(-CHANGE_LOG_LIMIT) : undefined;
}
function readStore(): WorkflowRecord[] {
  if (!existsSync(join(DATA_DIR, FILE))) return [];
  const saved: WorkflowRecord[] = JSON.parse(
    readFileSync(join(DATA_DIR, FILE), 'utf8'),
  );
  if (
    !Array.isArray(saved) ||
    !saved.every(
      (d) =>
        isWorkflowDocument(d) &&
        typeof d.id === 'string' &&
        Number.isInteger(d.revision),
    )
  )
    throw new Error('流程存储格式异常，请检查 workflow.json');
  return saved;
}
function writeStore(records: WorkflowRecord[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  const temporary = join(DATA_DIR, `${FILE}.tmp`);
  // Do not swallow disk failures: only a successful atomic replacement counts as saved.
  writeFileSync(temporary, JSON.stringify(records, null, 2), 'utf8');
  renameSync(temporary, join(DATA_DIR, FILE));
}
export function listWorkflows() {
  return readStore().toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function getWorkflow(id: string) {
  const record = readStore().find((d) => d.id === id);
  if (!record) throw new Error('流程不存在或已删除');
  return record;
}
export function saveWorkflow(
  input: unknown,
  username: string,
  id?: string,
  revision?: number,
) {
  if (!isWorkflowDocument(input))
    throw new Error('流程数据格式不正确或超过节点数量限制');
  const document = documentOf(input);
  document.name = document.name.trim();
  document.code = document.code.trim();
  document.base = document.base.trim();
  if (
    !document.name ||
    !document.base ||
    !/^[A-Za-z][\w-]*$/.test(document.code)
  )
    throw new Error('请填写流程名称、基地及合法的流程编码');
  const records = readStore();
  const previous = id ? records.find((d) => d.id === id) : undefined;
  if (id && !previous) throw new Error('流程不存在或已删除');
  if (previous && previous.status !== 'draft')
    throw new Error('已发布的流程不可修改，请新建版本');
  if (
    previous?.familyId &&
    (previous.code !== document.code || previous.base !== document.base)
  )
    throw new Error('新版本不能修改流程编码或基地，请复制为独立流程');
  if (previous && previous.revision !== revision)
    throw new Error(
      '流程已被其他窗口修改，请重新加载后再保存；当前编辑内容尚未保存',
    );
  if (
    records.some(
      (d) =>
        d.id !== id &&
        (!previous ||
          (d.familyId || d.id) !== (previous.familyId || previous.id)) &&
        d.base === document.base &&
        d.code.toLowerCase() === document.code.toLowerCase(),
    )
  )
    throw new Error('同一基地内流程编码不能重复');
  const updatedAt = new Date().toISOString();
  const changeLog = appendConfigLog(
    previous?.changeLog,
    previous,
    document,
    username,
    'save',
    updatedAt,
  );
  const next: WorkflowRecord = {
    ...document,
    id: id || newId('flow'),
    status: 'draft',
    revision: (previous?.revision || 0) + 1,
    updatedAt,
    updatedBy: username,
    ...(previous?.familyId
      ? { familyId: previous.familyId, version: previous.version }
      : {}),
    ...(changeLog ? { changeLog } : {}),
  };
  writeStore([...records.filter((d) => d.id !== id), next]);
  return next;
}
export function deleteWorkflow(id: string) {
  const records = readStore();
  const record = records.find((d) => d.id === id);
  if (!record) throw new Error('流程不存在或已删除');
  if (record.status !== 'draft')
    throw new Error('已发布的版本不能删除，只能停用');
  writeStore(records.filter((d) => d.id !== id));
  return true;
}

export function publishWorkflow(
  id: string,
  revision: number,
  forms: Record<string, RuntimeForm>,
  username: string,
) {
  const records = readStore();
  const record = records.find((r) => r.id === id);
  if (!record || record.status !== 'draft' || record.revision !== revision)
    throw new Error('草稿已变化或已发布，请刷新后重新检查');
  const familyId = record.familyId || record.id;
  const previousPublished = records.find(
    (item) =>
      item.id !== id &&
      (item.familyId || item.id) === familyId &&
      item.status === 'published',
  );
  const publishedAt = new Date().toISOString();
  const changeLog = appendConfigLog(
    record.changeLog,
    previousPublished,
    record,
    username,
    'publish',
    publishedAt,
  );
  const next = {
    ...record,
    familyId,
    version: record.version || 1,
    status: 'published' as const,
    publishedAt,
    publishedBy: username,
    frozenForms: forms,
    revision: record.revision + 1,
    ...(changeLog ? { changeLog } : {}),
  };
  // All metadata updates commit together. Existing instances keep their definition IDs.
  writeStore(
    records.map((r) =>
      r.id === id
        ? next
        : (r.familyId || r.id) === familyId && r.status === 'published'
          ? { ...r, status: 'disabled', revision: r.revision + 1 }
          : r,
    ),
  );
  return next;
}
export function newWorkflowVersion(id: string, username: string) {
  const records = readStore();
  const source = records.find((r) => r.id === id);
  if (!source || source.status === 'draft')
    throw new Error('请从已发布或已停用版本创建新版本');
  const familyId = source.familyId || source.id;
  const siblings = records.filter((r) => (r.familyId || r.id) === familyId);
  if (siblings.some((r) => r.status === 'draft'))
    throw new Error('此流程已有待发布草稿，请先编辑该草稿');
  const next: WorkflowRecord = {
    ...documentOf(source),
    id: newId('flow'),
    familyId,
    version: Math.max(...siblings.map((r) => r.version || 1)) + 1,
    status: 'draft',
    revision: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: username,
  };
  writeStore([...records, next]);
  return next;
}
export function disableWorkflow(id: string, revision: number) {
  const records = readStore();
  const source = records.find((r) => r.id === id);
  if (!source || source.status !== 'published' || source.revision !== revision)
    throw new Error('版本已变化，请刷新后重试');
  source.status = 'disabled';
  source.revision++;
  writeStore(records);
  return source;
}

/**
 * 按编码取同基地当前已发布版本（供子流程节点绑定）
 * @param code 流程编码
 * @param base 基地编码
 */
export function findPublishedWorkflow(code: string, base: string) {
  return listWorkflows().find(
    (d) => d.status === 'published' && d.code === code && d.base === base,
  );
}

import type { AgreementDetail } from './agreement-detail-types';
import type { AgreeListRow } from './mock-agreement-list';

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { DATA_DIR } from './mock-persist';

interface AgreementSnapshot {
  version: 2;
  sequence: number;
  yearSequences: Record<string, number>;
  rows: AgreeListRow[];
  details: Record<string, AgreementDetail>;
  aliases: Record<string, string>;
  lockedIds: string[];
  /** 流程接管历史；资料缺失时保护正文，与永久编号锁分别保存。 */
  workflowLockedIds?: string[];
  numberChanges: {
    agreementId: string;
    at: string;
    from: string;
    to: string;
  }[];
}

// Nitro bundles change import.meta.url to .nitro/dev or .output/server.
// Business data must live outside those disposable build directories.
const runtimeRoot = dirname(DATA_DIR);
const directory = process.env.VBEN_AGREEMENT_DATA_DIR
  ? resolve(process.env.VBEN_AGREEMENT_DATA_DIR)
  : ['.nitro', '.output'].includes(basename(runtimeRoot))
    ? join(dirname(runtimeRoot), 'data')
    : DATA_DIR;
export const AGREEMENT_DATA_FILE = join(directory, 'agreements.json');

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validate(value: unknown): asserts value is AgreementSnapshot {
  if (
    !isObject(value) ||
    value.version !== 2 ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 0 ||
    !Array.isArray(value.rows) ||
    !isObject(value.details) ||
    !isObject(value.aliases) ||
    !Object.values(value.aliases).every(
      (id) => typeof id === 'string' && !!id,
    ) ||
    !isObject(value.yearSequences) ||
    !Object.values(value.yearSequences).every(
      (seq) => Number.isSafeInteger(seq) && (seq as number) >= 0,
    ) ||
    !Array.isArray(value.lockedIds) ||
    !value.lockedIds.every((id) => typeof id === 'string') ||
    (value.workflowLockedIds !== undefined &&
      (!Array.isArray(value.workflowLockedIds) ||
        !value.workflowLockedIds.every((id) => typeof id === 'string'))) ||
    !Array.isArray(value.numberChanges)
  )
    throw new Error('协议存储格式异常');

  const numbers = new Map<string, string>();
  const ids = new Set<string>();
  for (const row of value.rows) {
    if (
      !isObject(row) ||
      ![
        'id',
        'agreementNo',
        'compensatee',
        'houseAddress',
        'statusValue',
        'signType',
        'isSigned',
        'batchGroup',
      ].every((key) => typeof row[key] === 'string') ||
      !row.id ||
      !row.agreementNo ||
      numbers.has(row.agreementNo as string) ||
      ids.has(row.id as string)
    )
      throw new Error('协议列表存储格式异常或编号重复');
    numbers.set(row.agreementNo as string, row.id as string);
    ids.add(row.id as string);
  }
  for (const [number, id] of Object.entries(value.aliases)) {
    if (numbers.has(number) && numbers.get(number) !== id)
      throw new Error('协议历史编号与现有编号冲突');
    if (ids.has(number) && number !== id)
      throw new Error('协议历史编号与内部标识冲突');
  }
  for (const [number, id] of numbers) {
    if (ids.has(number) && number !== id)
      throw new Error('协议编号与内部标识冲突');
  }
  if (
    !value.numberChanges.every(
      (entry) =>
        isObject(entry) &&
        ['agreementId', 'from', 'to', 'at'].every(
          (key) => typeof entry[key] === 'string',
        ),
    )
  )
    throw new Error('协议改号记录格式异常');
  for (const [id, detail] of Object.entries(value.details)) {
    if (
      !ids.has(id) ||
      !isObject(detail) ||
      detail.id !== id ||
      numbers.get(String(detail.agreementNo)) !== id ||
      !['basic', 'signing', 'contact', 'compensation', 'population'].every(
        (key) => isObject(detail[key]),
      ) ||
      ![
        'rightHolders',
        'houses',
        'signMaterials',
        'certifyMaterials',
        'compensationItems',
        'rewardItems',
      ].every((key) => Array.isArray(detail[key]))
    )
      throw new Error(`协议详情存储格式异常：${id}`);
  }
}

function restore(value: unknown): AgreementSnapshot {
  if (isObject(value) && value.version === 1) {
    if (!Array.isArray(value.rows) || !isObject(value.details))
      throw new Error('旧协议存储格式异常');
    const details: Record<string, AgreementDetail> = {};
    for (const [no, detail] of Object.entries(value.details)) {
      const row = value.rows.find(
        (item) => isObject(item) && item.agreementNo === no,
      );
      if (!row || !isObject(detail) || detail.agreementNo !== no)
        throw new Error(`旧协议详情无法关联：${no}`);
      details[row.id] = { ...detail, id: row.id } as AgreementDetail;
    }
    value = {
      ...value,
      version: 2,
      details,
      yearSequences: {},
      aliases: {},
      numberChanges: [],
      lockedIds: value.rows
        .filter(
          (row) => row.statusValue !== '草稿' || row.isSigned === '已签约',
        )
        .map((row) => row.id),
    };
  }
  validate(value);
  return value;
}

/** One snapshot keeps list rows, details and numbering in the same commit. */
export class AgreementStore {
  readonly rows: AgreeListRow[];
  private legacySource?: string;
  private snapshot: AgreementSnapshot;

  constructor(seeds: AgreeListRow[]) {
    let snapshot: AgreementSnapshot = {
      version: 2,
      sequence: 0,
      yearSequences: {},
      rows: structuredClone(seeds),
      details: {},
      aliases: {},
      lockedIds: seeds
        .filter(
          (row) => row.statusValue !== '草稿' || row.isSigned === '已签约',
        )
        .map((row) => row.id),
      numberChanges: [],
    };
    if (existsSync(AGREEMENT_DATA_FILE)) {
      try {
        const raw = readFileSync(AGREEMENT_DATA_FILE, 'utf8');
        const saved: unknown = JSON.parse(raw);
        if (isObject(saved) && saved.version === 1) this.legacySource = raw;
        snapshot = restore(saved);
      } catch (error) {
        // Never replace damaged user data with demo seeds and overwrite it.
        throw new Error(
          `无法读取协议数据 ${AGREEMENT_DATA_FILE}：${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
    this.snapshot = snapshot;
    this.rows = snapshot.rows;
  }

  detail(reference: string) {
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- This repository lookup accepts a record reference, not a callback.
    const row = this.find(reference);
    const detail = row ? this.snapshot.details[row.id] : undefined;
    return detail ? structuredClone(detail) : undefined;
  }

  entryWriteAccess(reference: string) {
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- This repository lookup accepts a record reference, not a callback.
    const row = this.find(reference);
    if (!row) throw new Error('协议不存在或已删除，请刷新列表');
    // 状态文案、status 和 isSigned 都是演示业务值，不推导未确认的锁定规则。
    // 账号及模块编辑权限由写接口独立检查；这里只返回流程占用限制。
    const reason = this.workflowReadonlyReason(row.id);
    return { editable: !reason, reason };
  }

  find(reference: string) {
    const ref = String(reference);
    return (
      this.rows.find((row) => row.id === ref) ||
      this.rows.find((row) => row.agreementNo === ref) ||
      this.rows.find((row) => row.id === this.snapshot.aliases[ref])
    );
  }

  hasWorkflowHistory(reference: string): boolean {
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- This repository lookup accepts a record reference, not a callback.
    const row = this.find(reference);
    if (!row) throw new Error('协议不存在或已删除，请刷新列表');
    return (
      this.relatedWorkflows(row.id).length > 0 ||
      !!this.snapshot.workflowLockedIds?.includes(row.id)
    );
  }

  numberEditable(reference: string) {
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- This repository lookup accepts a record reference, not a callback.
    const row = this.find(reference);
    if (
      !row ||
      row.statusValue !== '草稿' ||
      row.isSigned === '已签约' ||
      this.snapshot.lockedIds.includes(row.id)
    )
      return false;
    return !this.hasWorkflowHistory(row.id);
  }

  update<T>(change: (draft: AgreementSnapshot) => T): T {
    const draft = structuredClone(this.snapshot);
    const result = change(draft);
    const serialized = `${JSON.stringify(draft, null, 2)}\n`;
    // Publish exactly the JSON-compatible values that can be restored later.
    const persisted: unknown = JSON.parse(serialized);
    validate(persisted);
    const temporary = `${AGREEMENT_DATA_FILE}.tmp`;
    try {
      mkdirSync(directory, { recursive: true });
      const backup = join(directory, 'agreements.v1.backup.json');
      if (this.legacySource && !existsSync(backup))
        writeFileSync(backup, this.legacySource, {
          encoding: 'utf8',
          flag: 'wx',
        });
      writeFileSync(temporary, serialized, 'utf8');
      renameSync(temporary, AGREEMENT_DATA_FILE);
    } catch (error) {
      try {
        rmSync(temporary, { force: true });
      } catch {
        /* Preserve original error. */
      }
      throw new Error(
        `协议保存失败，数据未写入磁盘：${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    // Keep the exported array identity, and only mutate memory after disk succeeds.
    this.rows.splice(0, this.rows.length, ...persisted.rows);
    this.snapshot = { ...persisted, rows: this.rows };
    this.legacySource = undefined;
    return structuredClone(result);
  }

  workflowReadonlyReason(reference: string): string {
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- This repository lookup accepts a record reference, not a callback.
    const row = this.find(reference);
    if (!row) throw new Error('协议不存在或已删除，请刷新列表');
    const related = this.relatedWorkflows(row.id);
    if (related.some((item) => ['running', 'suspended'].includes(item.status)))
      return '协议已进入流程，普通详情只读；请由当前办理人在流程办理页按节点权限修改，驳回后也在流程中修改重提。';
    if (
      related.some((item) => !['completed', 'terminated'].includes(item.status))
    )
      return '关联流程状态异常，协议详情暂时只读；请联系管理员检查流程资料。';
    // 完成、终止均释放流程占用；模拟业务状态不作为正文编辑限制。
    // 保留历史标记：仅在实例资料缺失时作为保护依据，不永久锁住草稿。
    if (related.length > 0) return '';
    if (this.snapshot.workflowLockedIds?.includes(row.id))
      return '协议已由流程接管，普通详情只读；请在流程办理页处理，流程资料缺失时请联系管理员。';
    return '';
  }

  /** 只读文件检查，不导入流程引擎，兼容旧编号关联和历史实例。 */
  private relatedWorkflows(reference: string): { status: string }[] {
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- This repository lookup accepts a record reference, not a callback.
    const row = this.find(reference);
    if (!row) throw new Error('协议不存在或已删除，请刷新列表');
    const workflowFile = join(DATA_DIR, 'workflow-instances.json');
    if (existsSync(workflowFile)) {
      const state = JSON.parse(readFileSync(workflowFile, 'utf8'));
      if (!Array.isArray(state.instances))
        throw new Error('流程实例存储格式异常');
      return state.instances.filter(
        (instance: { bizId?: string; businessNo?: string }) =>
          // oxlint-disable-next-line unicorn/no-array-callback-reference -- This repository lookup accepts a record reference, not a callback.
          this.find(instance.bizId || instance.businessNo || '')?.id === row.id,
      ) as { status: string }[];
    }
    return [];
  }
}

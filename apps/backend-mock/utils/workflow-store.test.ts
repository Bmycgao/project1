import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDocument, createNode } from '../../shared/workflow';

const { directory, tempRoot } = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const tempRoot = tmpdir();
  return {
    directory: mkdtempSync(join(tempRoot, 'vben-workflow-test-')),
    tempRoot,
  };
});
vi.mock('./mock-persist', () => ({ DATA_DIR: directory }));
import {
  deleteWorkflow,
  getWorkflow,
  listWorkflows,
  newWorkflowVersion,
  publishWorkflow,
  saveWorkflow,
} from './workflow-store';

const file = join(directory, 'workflow.json');
beforeEach(() => {
  if (existsSync(file)) rmSync(file);
});
afterAll(() => {
  if (
    !resolve(directory).startsWith(
      `${resolve(tempRoot)}${process.platform === 'win32' ? '\\' : '/'}vben-workflow-test-`,
    )
  )
    throw new Error('Unexpected test directory');
  rmSync(directory, { recursive: true });
});
function draft() {
  return {
    ...createDocument(),
    name: '测试草稿',
    code: 'FL_TEST',
    base: 'JD_TEST',
  };
}
describe('workflow persistent draft store', () => {
  it('saves incomplete drafts to disk and reloads without in-memory state', () => {
    const saved = saveWorkflow(draft(), 'tester');
    expect(saved.revision).toBe(1);
    expect(saved.nodes).toEqual([]);
    expect(JSON.parse(readFileSync(file, 'utf8'))[0]).toEqual(saved);
    expect(getWorkflow(saved.id)).toEqual(saved);
  });
  it('enforces unique codes per base while allowing different bases', () => {
    saveWorkflow(draft(), 'tester');
    expect(() =>
      saveWorkflow({ ...draft(), code: 'fl_test' }, 'tester'),
    ).toThrow('不能重复');
    saveWorkflow({ ...draft(), base: 'JD_OTHER' }, 'tester');
    expect(listWorkflows()).toHaveLength(2);
  });
  it('rejects stale updates and does not lose newer changes', () => {
    const first = saveWorkflow(draft(), 'tester');
    const second = saveWorkflow(
      { ...first, name: '最新配置' },
      'other',
      first.id,
      first.revision,
    );
    expect(() =>
      saveWorkflow(first, 'tester', first.id, first.revision),
    ).toThrow('其他窗口');
    expect(getWorkflow(first.id)).toEqual(second);
  });
  it('rejects malformed payloads without changing the saved document', () => {
    const saved = saveWorkflow(draft(), 'tester');
    expect(() =>
      saveWorkflow({ ...saved, nodes: [null] }, 'tester', saved.id, 1),
    ).toThrow('格式');
    expect(getWorkflow(saved.id)).toEqual(saved);
  });
  it('refuses to overwrite a corrupt existing file', () => {
    writeFileSync(file, '{broken', 'utf8');
    expect(() => saveWorkflow(draft(), 'tester')).toThrow();
    expect(readFileSync(file, 'utf8')).toBe('{broken');
  });
  it('copies all configuration through create and deletes only the selected draft', () => {
    const first = saveWorkflow(draft(), 'tester');
    const copy = saveWorkflow({ ...first, code: 'FL_COPY' }, 'tester');
    expect(copy.id).not.toBe(first.id);
    deleteWorkflow(copy.id);
    expect(listWorkflows()).toEqual([first]);
  });
  it('logs who changed buttons, time limits, data actions and field access', () => {
    const node = createNode('approve', 10, 10, 1);
    node.name = '科长审核';
    const first = saveWorkflow({ ...draft(), nodes: [node] }, 'alice');
    expect(first.changeLog).toBeUndefined();
    const edited = structuredClone(first);
    const target = edited.nodes[0]!;
    target.buttons = ['pass'];
    target.sla = { durationHours: 24, warnHours: 4, overtime: 'urge' };
    target.dataActions = [
      { when: 'pass', kind: 'set', field: 'legalOpinion', value: '已通过' },
    ];
    target.fieldAccess = { legalOpinion: 'edit' };
    const second = saveWorkflow(edited, 'bob', first.id, first.revision);
    expect(second.changeLog).toHaveLength(1);
    expect(second.changeLog?.[0]?.by).toBe('bob');
    expect(second.changeLog?.[0]?.action).toBe('save');
    const text = second.changeLog?.[0]?.lines.join('\n') || '';
    expect(text).toContain('按钮');
    expect(text).toContain('时限');
    expect(text).toContain('数据动作');
    expect(text).toContain('字段权限');
    const quiet = saveWorkflow(
      { ...second, name: '只改名称' },
      'carol',
      second.id,
      second.revision,
    );
    expect(quiet.changeLog).toEqual(second.changeLog);
    const published = publishWorkflow(quiet.id, quiet.revision, {}, 'alice');
    expect(
      published.changeLog?.some((entry) => entry.action === 'publish'),
    ).toBe(false);
    const nextDraft = newWorkflowVersion(published.id, 'alice');
    expect(nextDraft.changeLog).toBeUndefined();
    const changed = structuredClone(nextDraft);
    changed.nodes[0]!.buttons = ['pass', 'reject'];
    const savedNext = saveWorkflow(
      changed,
      'dave',
      nextDraft.id,
      nextDraft.revision,
    );
    const released = publishWorkflow(
      savedNext.id,
      savedNext.revision,
      {},
      'erin',
    );
    const publishEntry = released.changeLog?.find(
      (entry) => entry.action === 'publish',
    );
    expect(publishEntry?.by).toBe('erin');
    expect(publishEntry?.lines.join('\n')).toContain('按钮');
    expect(getWorkflow(published.id).status).toBe('disabled');
  });
});

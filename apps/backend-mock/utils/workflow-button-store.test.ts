import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';

import { afterAll, expect, it, vi } from 'vitest';

import {
  deleteWorkflowButtonResource,
  listWorkflowButtonResources,
  saveWorkflowButtonResource,
} from './workflow-button-store';

const state = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  return { directory: mkdtempSync(join(tmpdir(), 'vben-workflow-buttons-')) };
});
vi.mock('./mock-persist', () => ({ DATA_DIR: state.directory }));

afterAll(() => {
  if (
    !resolve(state.directory).startsWith(
      `${resolve(tmpdir())}${sep}vben-workflow-buttons-`,
    )
  )
    throw new Error('Unexpected test directory');
  rmSync(state.directory, { recursive: true });
});

it('seeds built-ins and persists reusable buttons with distinct codes for one action', () => {
  expect(listWorkflowButtonResources().map((button) => button.code)).toEqual(
    expect.arrayContaining([
      'save',
      'submit',
      'pass',
      'reject',
      'transfer',
      'recall',
    ]),
  );
  saveWorkflowButtonResource({
    code: 'SUBMIT_REVIEW',
    action: 'submit',
    label: '提交复核',
    status: 1,
  });
  saveWorkflowButtonResource({
    code: 'SUBMIT_SIGN',
    action: 'submit',
    label: '提交签约',
    status: 1,
  });
  expect(
    listWorkflowButtonResources().filter(
      (button) => button.action === 'submit',
    ),
  ).toHaveLength(3);
  expect(() =>
    saveWorkflowButtonResource({
      code: 'submit_review',
      action: 'submit',
      label: '重复',
      status: 1,
    }),
  ).toThrow('按钮编码已存在');
  const updated = saveWorkflowButtonResource(
    {
      code: 'SUBMIT_REVIEW',
      action: 'submit',
      label: '提交复核资料',
      status: 1,
      enabledWhen: 'BuChangJinE >= 1000000',
    },
    'SUBMIT_REVIEW',
  );
  expect(updated.label).toBe('提交复核资料');
  expect(() => deleteWorkflowButtonResource('submit')).toThrow(
    '内置按钮不可删除',
  );
  expect(() =>
    saveWorkflowButtonResource(
      { code: 'submit', action: 'submit', label: '提交', status: 0 },
      'submit',
    ),
  ).toThrow('内置按钮不能停用');
  deleteWorkflowButtonResource('SUBMIT_SIGN');
  expect(
    listWorkflowButtonResources().some(
      (button) => button.code === 'SUBMIT_SIGN',
    ),
  ).toBe(false);
});

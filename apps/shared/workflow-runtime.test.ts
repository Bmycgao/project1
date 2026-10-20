import { expect, it } from 'vitest';

import { createDocument } from './workflow';
import {
  applyWorkflowDataActions,
  startableWorkflowDefinition,
  workflowStartIssues,
} from './workflow-runtime';

it('keeps time data actions canonical and excludes transfer arrays from scalar actions', () => {
  const field = {
    key: 'time',
    label: '时间',
    type: 'time' as const,
    required: false,
    readonly: false,
    hidden: false,
  };
  const actions = [
    {
      kind: 'copy' as const,
      when: 'save' as const,
      field: 'time',
      from: 'source',
    },
  ];
  expect(
    applyWorkflowDataActions({ source: '09:30:00' }, actions, 'save', [field])
      .data.time,
  ).toBe('09:30:00');
  expect(() =>
    applyWorkflowDataActions({ source: '09:30' }, actions, 'save', [field]),
  ).toThrow('HH:mm:ss');
  expect(() =>
    applyWorkflowDataActions({ source: [1] }, actions, 'save', [
      { ...field, type: 'choiceList' },
    ]),
  ).toThrow('多选字段');
});

it('checks blank workflow start fields while accepting zero compensation', () => {
  expect(
    workflowStartIssues({
      agreementNo: 'LL-2026-0001',
      compensatee: '张三',
      houseAddress: '  ',
      BuChangJinE: 0,
    }),
  ).toEqual([
    expect.objectContaining({ field: 'houseAddress', module: 'houses' }),
  ]);
  expect(
    workflowStartIssues({
      agreementNo: 'LL-2026-0001',
      compensatee: '张三',
      houseAddress: '测试路1号',
      BuChangJinE: 0,
    }),
  ).toEqual([]);
});

it('preserves the family ID when a later published version is listed for starting', () => {
  const option = startableWorkflowDefinition({
    ...createDocument(),
    code: 'FL_PARA',
    name: '并行演示',
    id: 'version-v3',
    familyId: 'flow-family',
    version: 3,
    status: 'published',
    revision: 8,
    updatedAt: '',
    updatedBy: '',
  });
  expect(option).toMatchObject({
    id: 'version-v3',
    familyId: 'flow-family',
    version: 3,
  });
});

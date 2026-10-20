import type { WorkflowRecord } from './model';

/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { describe, expect, it } from 'vitest';

import { createDocument } from './model';
import { filterWorkflowFamilies, groupWorkflowVersions } from './version-list';

function version(
  id: string,
  overrides: Partial<WorkflowRecord> = {},
): WorkflowRecord {
  return {
    ...createDocument(),
    id,
    name: '审核流程',
    code: 'REVIEW',
    base: 'BASE_A',
    status: 'draft',
    revision: 1,
    updatedAt: '2026-10-16T06:00:00Z',
    updatedBy: 'tester',
    ...overrides,
  };
}

describe('workflow family list', () => {
  it('groups an original version and renamed successors while showing draft and publication separately', () => {
    const first = version('original', { status: 'disabled', version: 1 });
    const published = version('v2', {
      familyId: 'original',
      version: 2,
      status: 'published',
    });
    const draft = version('v3', {
      familyId: 'original',
      version: 3,
      name: '新的名称',
    });
    const input = [first, draft, published];
    const family = groupWorkflowVersions(input)[0]!;
    expect(family.versions.map((row) => row.id)).toEqual([
      'v3',
      'v2',
      'original',
    ]);
    expect(family.draft).toBe(draft);
    expect(family.published).toBe(published);
    expect(family.representative).toBe(draft);
    expect(input).toEqual([first, draft, published]);
  });

  it('keeps same-name flows and same-code flows from different bases separate', () => {
    expect(
      groupWorkflowVersions([
        version('a'),
        version('b', { base: 'BASE_B' }),
        version('c', { code: 'OTHER' }),
      ]),
    ).toHaveLength(3);
  });

  it('supports legacy unversioned drafts and flows with only disabled versions', () => {
    const legacy = version('legacy');
    const disabled = version('old', { status: 'disabled', version: 2 });
    const families = groupWorkflowVersions([legacy, disabled]);
    expect(families.find((row) => row.id === 'legacy')?.draft).toBe(legacy);
    const stopped = families.find((row) => row.id === 'old')!;
    expect(stopped.representative).toBe(disabled);
    expect(stopped.published).toBeUndefined();
    expect(stopped.draft).toBeUndefined();
  });

  it('sorts families by the latest update even when an older version was just disabled', () => {
    const families = groupWorkflowVersions([
      version('a', { status: 'disabled', updatedAt: '2026-10-16T08:00:00Z' }),
      version('a2', { familyId: 'a', version: 2 }),
      version('b', { updatedAt: '2026-10-16T07:00:00Z' }),
    ]);
    expect(families.map((family) => family.id)).toEqual(['a', 'b']);
    expect(families[0]?.representative.id).toBe('a2');
    expect(families[0]?.updatedAt).toBe('2026-10-16T08:00:00Z');
  });

  it('finds historical names without splitting the family and filters on current classification/base', () => {
    const families = groupWorkflowVersions([
      version('a', { name: '旧名称', status: 'disabled' }),
      version('a2', {
        familyId: 'a',
        version: 2,
        category: '协议',
        name: '当前名称',
      }),
      version('b', { base: 'BASE_B' }),
    ]);
    expect(
      filterWorkflowFamilies(families, {
        keyword: ' 旧名称 ',
        category: '协议',
        base: 'BASE_A',
      }).map((f) => f.id),
    ).toEqual(['a']);
    expect(
      filterWorkflowFamilies(families, {
        keyword: 'review',
        category: '',
        base: '',
      }),
    ).toHaveLength(2);
    expect(
      filterWorkflowFamilies(families, {
        keyword: '',
        category: '',
        base: 'BASE_B',
      }).map((f) => f.id),
    ).toEqual(['b']);
  });
});

import type { WorkflowRecord } from './model';

export interface WorkflowFamily {
  id: string;
  representative: WorkflowRecord;
  latest: WorkflowRecord;
  draft?: WorkflowRecord;
  published?: WorkflowRecord;
  versions: WorkflowRecord[];
  updatedAt: string;
}

/** Use the same stable identity as version creation; names may change between versions. */
export function workflowFamilyId(record: WorkflowRecord) {
  return record.familyId || record.id;
}

export function groupWorkflowVersions(
  records: WorkflowRecord[],
): WorkflowFamily[] {
  const groups = new Map<string, WorkflowRecord[]>();
  for (const record of records) {
    const key = workflowFamilyId(record);
    const versions = groups.get(key) || [];
    versions.push(record);
    groups.set(key, versions);
  }
  return [...groups.entries()]
    .map(([id, records]) => {
      const versions = [...records].toSorted(
        (a, b) =>
          (b.version || 1) - (a.version || 1) ||
          b.updatedAt.localeCompare(a.updatedAt) ||
          a.id.localeCompare(b.id),
      );
      const latest = versions[0];
      if (!latest) throw new Error('流程版本列表不能为空');
      const draft = versions.find((record) => record.status === 'draft');
      const published = versions.find(
        (record) => record.status === 'published',
      );
      return {
        id,
        versions,
        latest,
        draft,
        published,
        representative: draft || published || latest,
        updatedAt:
          records
            .map((record) => record.updatedAt)
            .toSorted((a, b) => b.localeCompare(a))[0] || '',
      };
    })
    .toSorted(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
}

export function filterWorkflowFamilies(
  families: WorkflowFamily[],
  filters: { base: string; category: string; keyword: string },
) {
  const keyword = filters.keyword.trim().toLowerCase();
  return families.filter((family) => {
    const row = family.representative;
    return (
      (!filters.category || row.category === filters.category) &&
      (!filters.base || row.base === filters.base) &&
      family.versions.some((version) =>
        `${version.name} ${version.code}`.toLowerCase().includes(keyword),
      )
    );
  });
}

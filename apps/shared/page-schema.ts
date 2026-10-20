/** Page purposes share storage during the first-stage UI migration. */
export type PageSchemaKind = 'detail' | 'entity' | 'scene' | 'template';
export type PageSchemaSection = 'detail' | 'list' | 'template';

export function pageSchemaSection(kind?: PageSchemaKind): PageSchemaSection {
  if (kind === 'detail' || kind === 'template') return kind;
  return 'list';
}

export interface PageSchemaReference {
  type:
    | 'columnTemplate'
    | 'listDetail'
    | 'menu'
    | 'workflowDefault'
    | 'workflowNode';
  id: string;
  title: string;
  description: string;
  mode: 'live' | 'snapshot';
  nodeId?: string;
}

export interface PageSchemaUsage {
  references: PageSchemaReference[];
  liveCount: number;
  snapshotCount: number;
}

/** A detail page needs modules, never list fields, scene codes or list actions. */
export function pageSchemaSaveIssue(input: {
  buttons?: unknown[];
  columns?: { visible: boolean }[];
  columnTemplateId?: string;
  detailSchemaId?: string;
  modules?: { enabled: boolean }[];
  scene?: string;
  schemaKind?: PageSchemaKind;
}): string | undefined {
  const kind = input.schemaKind || 'entity';
  if (kind === 'scene') {
    if (!input.scene?.trim()) return '业务列表场景必须填写场景码';
    if (!input.columnTemplateId) return '请选择公共列方案';
    if (!input.buttons?.length) return '请至少勾选一个已实现的列表动作';
  }
  if (
    (kind === 'detail' || (kind === 'scene' && !input.detailSchemaId)) &&
    !input.modules?.some((module) => module.enabled)
  )
    return '请至少挂载一个详情模块';
  if (
    kind !== 'detail' &&
    (kind !== 'scene' || input.columns?.length) &&
    !input.columns?.some((column) => column.visible)
  )
    return '至少保留一列可见的列表字段';
}

import type {
  RuntimeField,
  WorkflowDetailView,
} from '../../shared/workflow-runtime';

import {
  moduleDataPath,
  projectWorkflowAgreement,
  readPath,
  writePath,
} from '../../shared/workflow-detail';

/** 对资料按字段白名单做补丁合并，隐藏模块及未展示列始终保留数据库原值。 */
export function applyDetailPatch(
  current: Record<string, any>,
  incoming: unknown,
  view: WorkflowDetailView,
  validate?: (field: RuntimeField, value: unknown) => void,
): Record<string, any> {
  if (
    !incoming ||
    typeof incoming !== 'object' ||
    Array.isArray(incoming) ||
    JSON.stringify(incoming).length > 500_000
  )
    throw new Error('协议资料格式不正确');
  const allowed = projectWorkflowAgreement(incoming, view, true);
  function check(value: any, permit: any, original: any) {
    if (!value || typeof value !== 'object') return;
    for (const [key, part] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new Error('资料字段不合法');
      if (!Object.hasOwn(permit || {}, key)) {
        if (JSON.stringify(part) !== JSON.stringify(original?.[key]))
          throw new Error('提交包含本节点不可编辑的资料');
      } else if (part && typeof part === 'object')
        check(part, permit[key], original?.[key]);
    }
  }
  check(incoming, allowed, current);
  const next = structuredClone(current);
  for (const module of view.modules) {
    const path = moduleDataPath(module);
    const patch = readPath(allowed, path);
    if (patch === undefined || module.readonly) continue;
    const stored = readPath(current, path);
    if (module.widgetKind === 'table') {
      if (!Array.isArray(readPath(incoming, path)))
        throw new Error(`「${module.label}」必须是表格数据`);
      const rows = Array.isArray(stored) ? stored : [];
      const ids = new Set<string>();
      const rules = module.rules.flatMap((r) =>
        r.field ? [r] : r.children || [],
      );
      const table = rules.find((r) => r.type === 'tableForm');
      const merged = patch.map((row: Record<string, any>) => {
        const id = row.id;
        if (typeof id !== 'string' || !id || ids.has(id))
          throw new Error(`「${module.label}」的行标识缺失或重复`);
        ids.add(id);
        const previous = rows.find((r: any) => r.id === id);
        if (!previous && table?.props?.addable === false)
          throw new Error(`「${module.label}」不允许新增行`);
        return { ...previous, ...row };
      });
      if (
        table?.props?.deletable === false &&
        rows.some((r: any) => !ids.has(r.id))
      )
        throw new Error(`「${module.label}」不允许删除行`);
      writePath(next, path, merged);
    } else {
      if (typeof patch !== 'object' || Array.isArray(readPath(incoming, path)))
        throw new Error(`「${module.label}」必须是表单数据`);
      writePath(next, path, { ...stored, ...patch });
    }
  }
  if (validate)
    for (const module of view.modules) {
      if (module.readonly) continue;
      const value = readPath(next, moduleDataPath(module));
      for (const field of module.fields) {
        if (field.hidden || field.readonly) continue;
        validate(
          field,
          module.widgetKind === 'table' ? value : value?.[field.key],
        );
      }
    }
  return next;
}

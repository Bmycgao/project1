import type { AgreeModuleMount } from '../../biz/agreement/access/module-access';

import type { FcBindingsMap, FcSchemaApi } from '#/api';

import {
  AGREE_DETAIL_MODULES,
  inferCustomWidgetKind,
} from '../../biz/agreement/access/module-access';

export function detailModuleKind(module: AgreeModuleMount) {
  return (
    module.widgetKind ||
    AGREE_DETAIL_MODULES.find((item) => item.key === module.key)?.widgetKind ||
    inferCustomWidgetKind(module.key)
  );
}

/** Used by the canvas, preview and save so they agree on unavailable templates. */
export function detailTemplateIssue(
  module: AgreeModuleMount,
  bindings: FcBindingsMap,
  templates: FcSchemaApi.FcSchema[],
): string | undefined {
  const template = templates.find((item) => item.id === bindings[module.key]);
  if (
    !template ||
    template.status !== 1 ||
    template.usage === 'workflowSupplement' ||
    template.kind !== detailModuleKind(module) ||
    !Array.isArray(template.rule) ||
    template.rule.length === 0
  )
    return `请为「${module.label || module.key}」选择可用且类型匹配、包含字段的模板`;
}

export interface TemplateFieldSketch {
  key: string;
  title: string;
  type: string;
  span: number;
  required: boolean;
  placeholder: string;
  columns?: string[];
}

/** Read metadata only; the editing canvas never evaluates template scripts or requests. */
export function templateFieldSketches(
  rules: unknown,
  prefix = '',
): TemplateFieldSketch[] {
  if (!Array.isArray(rules)) return [];
  const fields: TemplateFieldSketch[] = [];
  for (const [index, rule] of rules.entries()) {
    if (
      !rule ||
      typeof rule !== 'object' ||
      rule.hidden === true ||
      rule.display === false
    )
      continue;
    const key = `${prefix}${rule.field || index}`;
    if (rule.field) {
      const labels: Record<string, string> = {
        input: '文本',
        textarea: '多行文本',
        inputNumber: '数字',
        number: '数字',
        select: '下拉选择',
        radio: '单选',
        switch: '开关',
        datePicker: '日期',
        tableForm: '明细表',
      };
      const span = Number(rule.col?.span ?? 12);
      fields.push({
        key,
        title: String(rule.title || rule.label || rule.field),
        type: labels[rule.type] || '字段',
        span: Number.isFinite(span) ? Math.max(1, Math.min(24, span)) : 12,
        required:
          !!rule.$required ||
          (Array.isArray(rule.validate) &&
            rule.validate.some((item: any) => item?.required)),
        placeholder: String(rule.props?.placeholder || '待填写'),
        columns:
          rule.type === 'tableForm' && Array.isArray(rule.props?.columns)
            ? rule.props.columns.map((column: any) =>
                String(
                  column.label ||
                    column.rule?.[0]?.title ||
                    column.rule?.[0]?.field ||
                    '明细字段',
                ),
              )
            : undefined,
      });
    }
    if (Array.isArray(rule.children))
      fields.push(...templateFieldSketches(rule.children, `${key}.`));
  }
  return fields;
}

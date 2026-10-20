import type { RuntimeField } from './workflow-runtime';

/** One capability catalog for the designer, publication and runtime. */
export const WORKFLOW_FORM_TYPES: Record<string, RuntimeField['type']> = {
  input: 'text',
  textarea: 'textarea',
  inputNumber: 'number',
  number: 'number',
  datePicker: 'date',
  select: 'select',
  radio: 'select',
  switch: 'boolean',
  tableForm: 'table',
  timePicker: 'time',
  elTransfer: 'choiceList',
};
export const WORKFLOW_FORM_LAYOUTS = new Set([
  'col',
  'div',
  'elCard',
  'elCol',
  'elRow',
  'fcRow',
  'row',
]);

/** Dynamic execution is deliberately excluded from published node forms. */
export function workflowFormExecutionIssue(value: unknown): boolean {
  if (typeof value === 'string')
    return /\[\[.*(?:FORM-CREATE|FC-PREFIX)|javascript:/i.test(value);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) =>
    [
      'component',
      'control',
      'directives',
      'effect',
      'emit',
      'fetch',
      'inject',
      'nativeOn',
      'on',
      'remote',
      'template',
    ].includes(key)
      ? item !== undefined &&
        item !== null &&
        (!Array.isArray(item) || item.length > 0)
      : workflowFormExecutionIssue(item),
  );
}

/** Early editing hints; publication additionally checks bindings, roles and validators. */
export function workflowFormCapabilityIssues(
  rules: Record<string, any>[],
): string[] {
  const issues: string[] = [];
  if (workflowFormExecutionIssue(rules))
    issues.push('动态脚本、联动和远程请求暂不支持');
  function visit(nodes: Record<string, any>[]) {
    for (const rule of nodes) {
      if (!rule || typeof rule !== 'object') continue;
      const type = WORKFLOW_FORM_TYPES[String(rule.type)];
      const name = String(rule.title || rule.field || rule.type);
      if (rule.field && !type)
        issues.push(`「${name}」的控件 ${rule.type} 暂不支持`);
      if (!rule.field && !WORKFLOW_FORM_LAYOUTS.has(String(rule.type)))
        issues.push(`布局 ${rule.type} 暂不支持`);
      if (
        rule.props?.multiple ||
        (type === 'time' && rule.props?.isRange) ||
        (type === 'date' &&
          rule.props?.type &&
          !['date', 'datetime'].includes(rule.props.type))
      )
        issues.push(`「${name}」暂不支持多选或时间、日期范围`);
      if (type === 'choiceList' && !Array.isArray(rule.props?.data))
        issues.push(`「${name}」需要静态候选数据`);
      if (Array.isArray(rule.children)) visit(rule.children);
      for (const column of rule.props?.columns || [])
        if (Array.isArray(column.rule)) visit(column.rule);
    }
  }
  visit(rules);
  return [...new Set(issues)];
}

/** Clone the frozen rules and remove fields/defaults not authorized in this view. */
export function prepareWorkflowFormRules(
  rules: Record<string, any>[],
  fields: RuntimeField[],
  disabled = false,
): Record<string, any>[] {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  function visit(
    nodes: Record<string, any>[],
    scope = byKey,
  ): Record<string, any>[] {
    return nodes.flatMap((original) => {
      const rule = JSON.parse(JSON.stringify(original));
      const field = rule.field ? scope.get(String(rule.field)) : undefined;
      if (rule.field && (!field || field.hidden)) return [];
      // Values belong to the instance, never to the public rendering schema.
      delete rule.value;
      if (field) {
        const locked =
          disabled ||
          field.readonly ||
          (field.type === 'table' &&
            field.children?.some((child) => child.hidden || child.readonly));
        rule.props = { ...rule.props, disabled: !!locked, readonly: !!locked };
        rule.$required = !locked && field.required;
        rule.validate = locked ? [] : [...(rule.validate || [])];
        if (
          !locked &&
          field.required &&
          !rule.validate.some(
            (validator: Record<string, any>) =>
              validator.required &&
              (!['choiceList', 'table'].includes(field.type) ||
                (validator.type === 'array' && validator.min >= 1)),
          )
        )
          rule.validate.push({
            required: true,
            ...(() => {
              if (['choiceList', 'table'].includes(field.type)) {
                return { type: 'array', min: 1 };
              }
              if (field.type === 'number') {
                return { type: 'number' };
              }
              if (field.type === 'boolean') {
                return { type: 'boolean' };
              }
              return {};
            })(),
            message: `请填写「${field.label}」`,
            trigger: ['change', 'blur'],
          });
        if (field.type === 'time') rule.props.valueFormat = 'HH:mm:ss';
        if (field.type === 'choiceList' && Array.isArray(rule.props.data)) {
          const disabledKey = rule.props.props?.disabled || 'disabled';
          rule.props.data = rule.props.data.map(
            (item: Record<string, any>) => ({
              ...item,
              [disabledKey]: !!locked || !!item[disabledKey],
            }),
          );
        }
        if (field.type === 'date')
          rule.props.valueFormat =
            field.dateMode === 'datetime'
              ? 'YYYY-MM-DDTHH:mm:ss'
              : 'YYYY-MM-DD';
        if (field.type === 'table' && Array.isArray(rule.props.columns)) {
          const children = new Map(
            field.children?.map((child) => [child.key, child]),
          );
          rule.props.columns = rule.props.columns.flatMap(
            (column: Record<string, any>) => {
              const childRules = visit(
                column.rule || [],
                new Map(
                  [...children].map(([key, child]) => [
                    key,
                    locked ? { ...child, readonly: true } : child,
                  ]),
                ),
              );
              return childRules.length > 0
                ? [{ ...column, rule: childRules }]
                : [];
            },
          );
        }
      }
      if (Array.isArray(rule.children))
        rule.children = visit(rule.children, scope);
      if (!rule.field && !WORKFLOW_FORM_LAYOUTS.has(String(rule.type)))
        return [];
      if (!rule.field && !rule.children?.length) return [];
      return [rule];
    });
  }
  return visit(rules);
}

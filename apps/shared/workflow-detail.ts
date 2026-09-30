import type { WorkflowNode } from './workflow';
import type {
  RuntimeActor,
  RuntimeField,
  WorkflowDetailModule,
  WorkflowDetailView,
} from './workflow-runtime';

export const DEFAULT_WORKFLOW_MODULES = [
  { key: 'basic', label: '基础信息', widgetKind: 'form' },
  { key: 'houses', label: '房屋信息', widgetKind: 'table' },
  { key: 'compensation', label: '补偿安置', widgetKind: 'table' },
  { key: 'rewards', label: '奖励补贴', widgetKind: 'table' },
  { key: 'population', label: '协议人口信息', widgetKind: 'form' },
] as const;

export function moduleDataPath(
  module: Pick<WorkflowDetailModule, 'key' | 'widgetKind'>,
): string[] {
  const roots: Record<string, string> = {
    basic: 'basic',
    houses: 'houses',
    compensation: 'compensationItems',
    rewards: 'rewardItems',
    population: 'population',
  };
  return roots[module.key]
    ? [roots[module.key]!]
    : [
        module.widgetKind === 'table' ? 'extraTables' : 'extraForms',
        module.key,
      ];
}
export function readPath(value: any, path: string[]): any {
  return path.reduce((current, key) => current?.[key], value);
}
export function writePath(
  target: Record<string, any>,
  path: string[],
  value: unknown,
) {
  let parent = target;
  for (const key of path.slice(0, -1)) parent = parent[key] ||= {};
  parent[path.at(-1)!] = value;
}
function permits(codes: string[], required?: string[]) {
  return (
    !required?.length ||
    required.some(
      (code) =>
        codes.includes(code) ||
        codes.includes('*') ||
        (code.startsWith('Agree:') && codes.includes('Agree:*')) ||
        (code.startsWith('Agree:Module:') &&
          codes.includes('Agree:Module:*')) ||
        (code.startsWith('Agree:Field:') && codes.includes('Agree:Field:*')),
    )
  );
}
export const WORKFLOW_DETAIL_FIELD_ALIASES: Record<string, string> = {
  'basic.agreementNo': 'agreementNo',
  'basic.amount': 'BuChangJinE',
  'basic.assistUserId': 'assistUserId',
  'basic.compensatee': 'compensatee',
  'basic.handlerUserId': 'handlerUserId',
  'basic.remark': 'remark',
  'houses.address': 'houseAddress',
};

/** 共用权限合成：节点只能收紧模板和角色限制，模块显式只读优先于字段编辑。 */
export function effectiveDetailView(
  view: WorkflowDetailView,
  node: WorkflowNode,
  actor: RuntimeActor,
  canAct: boolean,
): WorkflowDetailView {
  const modules: WorkflowDetailModule[] = [];
  for (const source of view.modules) {
    const access = node.moduleAccess?.[source.key] || 'inherit';
    if (
      access === 'hidden' ||
      !permits(actor.codes, source.authCode ? [source.authCode] : undefined)
    )
      continue;
    const moduleLocked = !canAct || access === 'readonly';
    function fieldAccess(field: RuntimeField): RuntimeField {
      const alias = WORKFLOW_DETAIL_FIELD_ALIASES[`${source.key}.${field.key}`];
      const mode =
        node.fieldAccess?.[`${source.key}.${field.key}`] ||
        (alias ? node.fieldAccess?.[alias] : undefined) ||
        node.fieldAccess?.[field.key];
      const { defaultValue: _default, ...metadata } = field;
      const result = {
        ...metadata,
        hidden:
          field.hidden ||
          mode === 'hidden' ||
          !permits(actor.codes, field.visibleCodes) ||
          !!field.visibleCodeGroups?.some(
            (group) => !permits(actor.codes, group),
          ),
        readonly:
          field.readonly ||
          moduleLocked ||
          mode === 'readonly' ||
          (node.type === 'approve' && access !== 'edit' && mode !== 'edit') ||
          !permits(actor.codes, field.editableCodes) ||
          !!field.editableCodeGroups?.some(
            (group) => !permits(actor.codes, group),
          ),
        children: field.children?.map(fieldAccess),
      };
      if (result.children?.some((child) => child.hidden || child.readonly))
        result.readonly = true;
      return result;
    }
    const fields = source.fields.map(fieldAccess);
    // 表格有锁定列时暂时整表只读，避免改行/删行绕过列限制。
    const readonly =
      moduleLocked || fields.every((f) => f.hidden || f.readonly);
    modules.push({
      ...source,
      fields,
      readonly,
      rules: filterRules(source.rules, fields),
    });
  }
  return { ...view, modules };
}
function filterRules(
  rules: Record<string, any>[],
  fields: RuntimeField[],
): Record<string, any>[] {
  return rules.flatMap((raw) => {
    const rule = JSON.parse(JSON.stringify(raw));
    delete rule.value;
    if (!rule.field) {
      if (Array.isArray(rule.children))
        rule.children = filterRules(rule.children, fields);
      return [rule];
    }
    const field = fields.find((f) => f.key === rule.field);
    if (!field || field.hidden) return [];
    rule.props = { ...rule.props, disabled: field.readonly };
    if (field.children && Array.isArray(rule.props.columns)) {
      rule.props.columns = rule.props.columns
        .map((column: any) => ({
          ...column,
          rule: filterRules(column.rule || [], field.children!),
        }))
        .filter((column: any) => column.rule.length);
      if (field.readonly) {
        rule.props.addable = false;
        rule.props.deletable = false;
      }
    }
    return [rule];
  });
}
function projectObject(
  value: any,
  fields: RuntimeField[],
  writable: boolean,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (
      field.hidden ||
      (writable && field.readonly) ||
      value?.[field.key] === undefined
    )
      continue;
    result[field.key] =
      field.children && Array.isArray(value[field.key])
        ? value[field.key].map((row: any) =>
            projectObject(row, field.children!, writable),
          )
        : value[field.key];
  }
  return result;
}
/** 所有读取通道和客户端补丁共用数据白名单；隐藏模块不会落入返回值。 */
export function projectWorkflowAgreement(
  detail: any,
  view: WorkflowDetailView,
  writable = false,
): Record<string, any> {
  const result: Record<string, any> = writable
    ? {}
    : {
        id: detail.id,
        agreementNo: detail.agreementNo,
        status: detail.status,
        statusValue: detail.statusValue,
      };
  for (const module of view.modules) {
    if (writable && module.readonly) continue;
    const path = moduleDataPath(module);
    const source = readPath(detail, path);
    if (source === undefined) continue;
    if (module.widgetKind === 'table') {
      const table = module.fields[0];
      if (!table || table.hidden || (writable && table.readonly)) continue;
      writePath(
        result,
        path,
        (Array.isArray(source) ? source : []).map((row) => ({
          ...(row.id === undefined ? {} : { id: row.id }),
          ...projectObject(row, table.children || [], writable),
        })),
      );
    } else
      writePath(result, path, projectObject(source, module.fields, writable));
  }
  return result;
}

/** 协议头兼容字段也必须遵守其所属模块，避免隐藏后从另一数据通道泄露。 */
export const HEADER_MODULE_FIELDS: Record<string, [string, string]> = {
  compensatee: ['basic', 'compensatee'],
  BuChangJinE: ['basic', 'amount'],
  houseAddress: ['houses', 'address'],
  remark: ['basic', 'remark'],
  handlerUserId: ['basic', 'handlerUserId'],
  assistUserId: ['basic', 'assistUserId'],
};
export function detailHeaderAccess(view: WorkflowDetailView, key: string) {
  const binding = HEADER_MODULE_FIELDS[key];
  if (!binding) return undefined;
  const module = view.modules.find((m) => m.key === binding[0]);
  if (!module) return { hidden: true, readonly: true };
  const fields =
    module.widgetKind === 'table' ? module.fields[0]?.children : module.fields;
  const field = fields?.find((f) => f.key === binding[1]);
  return {
    hidden: !field || field.hidden,
    readonly: !!module.readonly || !field || field.readonly,
  };
}

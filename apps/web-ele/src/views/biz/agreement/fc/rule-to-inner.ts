/**
 * 把 FormCreate rule 转成详情用的 moduleInner 字段/列
 * 自定义组件绑定了 fc 模板时，详情应读模板而不是默认「名称/备注」
 */
import type {
  ModuleInnerControlType,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';
import type { FcRule } from './types';

import { isFcRule } from './types';

const LAYOUT_TYPES = new Set([
  'col',
  'div',
  'elCard',
  'elCol',
  'elRow',
  'fcRow',
  'row',
  'tableForm',
]);

/**
 * 遍历 rule 树
 * @param nodes 节点
 * @param visit 访问函数
 */
function walkFc(nodes: unknown, visit: (node: FcRule) => void) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const n = node as FcRule;
    visit(n);
    if (Array.isArray(n.children)) walkFc(n.children, visit);
    if (Array.isArray(n.rule)) walkFc(n.rule, visit);
    if (Array.isArray(n.props?.columns)) walkFc(n.props.columns, visit);
  }
}

/**
 * FC 控件 type → 内部 controlType
 * @param type FC type
 */
function mapControlType(type?: string): ModuleInnerControlType {
  const t = String(type || 'input');
  if (t === 'select' || t === 'el-select') return 'select';
  if (t === 'radio' || t === 'el-radio-group') return 'radio';
  if (t === 'textarea' || t === 'el-textarea') return 'textarea';
  if (t === 'datePicker' || t === 'date' || t === 'el-date-picker')
    return 'date';
  if (t === 'switch' || t === 'yesno') return 'yesno';
  return 'input';
}

/**
 * 从列/字段节点抽出内部字段
 * @param node FC 节点
 * @param order 顺序
 */
function toFieldItem(node: FcRule, order: number): ModuleInnerFieldItem | null {
  const cell = Array.isArray(node.rule) ? node.rule[0] : node;
  const key =
    String(
      cell?.field ||
        node.field ||
        node.prop ||
        node.props?.prop ||
        node.props?.field ||
        '',
    ).trim() || `col_${order}`;
  if (key.startsWith('_')) return null;
  const label = String(
    node.label ||
      node.title ||
      node.props?.label ||
      cell?.title ||
      cell?.label ||
      key,
  );
  const controlType = mapControlType(cell?.type || node.type);
  const widthRaw = node.style?.width || cell?.style?.width || node.props?.width;
  const minWidth = Number.parseInt(String(widthRaw || ''), 10);
  const options = (cell?.options || node.options) as
    | undefined
    | { label: string; value: string }[];
  return {
    key,
    label,
    enabled: true,
    order,
    custom: true,
    required: !!(node.required || cell?.$required || cell?.required),
    controlType,
    cellType:
      controlType === 'select' || controlType === 'yesno'
        ? controlType
        : 'text',
    minWidth: Number.isFinite(minWidth) && minWidth > 0 ? minWidth : 120,
    placeholder: cell?.props?.placeholder || node.props?.placeholder,
    span: Number(cell?.col?.span || node.col?.span || node.span) || undefined,
    options: Array.isArray(options) ? options : undefined,
  };
}

/**
 * 从 rule 里找 tableForm 并解析列
 * @param rule FormCreate rule
 */
export function parseFcTableFields(rule: unknown): ModuleInnerFieldItem[] {
  if (!isFcRule(rule)) return [];
  let columns: FcRule[] = [];
  let tableTitle = '';
  walkFc(rule, (node) => {
    const cols = node.props?.columns;
    if (
      (node.type === 'tableForm' || Array.isArray(cols)) &&
      Array.isArray(cols) &&
      cols.length > 0 &&
      columns.length === 0
    ) {
      columns = cols;
      tableTitle = String(node.title || node.props?.title || '');
    }
  });
  void tableTitle;
  const fields: ModuleInnerFieldItem[] = [];
  columns.forEach((col, i) => {
    const item = toFieldItem(col, (i + 1) * 10);
    if (item) fields.push(item);
  });
  return fields;
}

/**
 * 从 rule 里解析表单字段（跳过布局、表格）
 * @param rule FormCreate rule
 */
export function parseFcFormFields(rule: unknown): ModuleInnerFieldItem[] {
  if (!isFcRule(rule)) return [];
  const fields: ModuleInnerFieldItem[] = [];
  walkFc(rule, (node) => {
    if (LAYOUT_TYPES.has(String(node.type || ''))) return;
    if (Array.isArray(node.props?.columns)) return;
    const item = toFieldItem(node, (fields.length + 1) * 10);
    if (item && !fields.some((f) => f.key === item.key)) {
      fields.push(item);
    }
  });
  return fields;
}

/**
 * 用 FC 表格列拼一个 section（供自定义表格详情用）
 * @param rule 模板 rule
 * @param label 组件名
 */
export function buildSectionFromFcTable(
  rule: unknown,
  label: string,
): ModuleInnerSection | null {
  const fields = parseFcTableFields(rule);
  if (fields.length === 0) return null;
  let title = label;
  walkFc(rule, (node) => {
    if (node.type === 'tableForm' && node.title) {
      title = String(node.title);
    }
  });
  return {
    key: 'main',
    label: title || label,
    enabled: true,
    order: 10,
    custom: true,
    tableOptions: { allowAdd: true, allowRemove: true, minRows: 0 },
    fields,
  };
}

/**
 * 用 FC 表单字段拼一个 section
 * @param rule 模板 rule
 * @param label 组件名
 */
export function buildSectionFromFcForm(
  rule: unknown,
  label: string,
): ModuleInnerSection | null {
  const fields = parseFcFormFields(rule);
  if (fields.length === 0) return null;
  return {
    key: 'main',
    label,
    enabled: true,
    order: 10,
    custom: true,
    fields,
  };
}

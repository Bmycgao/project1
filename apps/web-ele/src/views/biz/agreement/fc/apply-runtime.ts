/**
 * FormCreate 运行时：合并设计器 props（只读/禁用）与详情页编辑态、字段权限
 */
import type { FcRule } from './types';

import { cloneFcRule } from './types';

/** 布局类节点，不参与字段权限 */
const LAYOUT_TYPES = new Set([
  'col',
  'div',
  'elCard',
  'elCol',
  'elRow',
  'fcRow',
  'row',
]);

/** 运行时访问上下文 */
export interface FcRuntimeAccessCtx {
  /** 详情是否处于编辑态 */
  pageEditable: boolean;
  /** 字段是否可见（逻辑名或 field key） */
  fieldVisible: (field: string) => boolean;
  /** 字段是否可编辑 */
  fieldEditable: (field: string) => boolean;
}

/**
 * 遍历 rule 树
 * @param nodes 节点列表
 * @param visit 访问回调
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
 * 取 FC 节点绑定的数据字段名
 * @param node 规则节点
 */
export function getFcRuleFieldKey(node: FcRule): string {
  const cell = Array.isArray(node.rule) ? node.rule[0] : node;
  return String(
    cell?.field ||
      node.field ||
      node.prop ||
      node.props?.prop ||
      node.props?.field ||
      '',
  ).trim();
}

/**
 * 是否表格列容器（列权限走列 field）
 * @param node 节点
 */
function isTableColumnNode(node: FcRule): boolean {
  return Array.isArray(node.props?.columns) && node.type === 'tableForm';
}

/**
 * 对单字段节点写入运行时 disabled / readonly / hidden
 * @param node 规则节点
 * @param ctx 访问上下文
 */
function applyNodeRuntimeProps(node: FcRule, ctx: FcRuntimeAccessCtx) {
  if (LAYOUT_TYPES.has(String(node.type || ''))) return;
  if (isTableColumnNode(node)) return;

  const field = getFcRuleFieldKey(node);
  if (!field || field.startsWith('_')) return;

  const accessKey = String(node.props?.accessField || field).trim();
  const visible =
    ctx.fieldVisible(accessKey) &&
    (accessKey === field ? true : ctx.fieldVisible(field));

  if (!visible) {
    node.hidden = true;
    node.display = false;
    return;
  }

  const props = { ...node.props };
  const templateReadonly = props.readonly === true;
  const templateDisabled = props.disabled === true;

  const fieldCanEdit =
    ctx.pageEditable &&
    ctx.fieldEditable(accessKey) &&
    (accessKey === field ? true : ctx.fieldEditable(field));

  if (!ctx.pageEditable || !fieldCanEdit) {
    props.disabled = true;
    delete props.readonly;
  } else if (templateDisabled) {
    props.disabled = true;
    delete props.readonly;
  } else if (templateReadonly) {
    props.readonly = true;
    props.disabled = false;
  }

  node.props = props;
}

/**
 * 克隆 rule 并叠加运行时访问控制（保留设计器其它 props）
 * @param rule 原始 rule
 * @param ctx 访问上下文
 */
export function prepareFcRuntimeRule(
  rule: FcRule[],
  ctx: FcRuntimeAccessCtx,
): FcRule[] {
  const cloned = cloneFcRule(rule || []);
  walkFc(cloned, (node) => applyNodeRuntimeProps(node, ctx));
  return cloned;
}

/**
 * 角色授权：将菜单树拆成四类资源（文档 2.6）
 * - 菜单：目录/菜单/内嵌/外链
 * - 按钮：操作按钮（含 Agree:View:* 仅可见）
 * - 字段：Agree:Field:*
 * - 模块：Agree:Module:*
 */
import type { SystemMenuApi } from '#/api/system/menu';

export type PermResourceKind = 'button' | 'field' | 'menu' | 'module';

type MenuNode = SystemMenuApi.SystemMenu;

/**
 * 按 authCode / type 归类资源
 * @param node 菜单节点
 */
export function classifyPermNode(node: MenuNode): PermResourceKind | null {
  const type = String(node.type || '');
  const code = String(node.authCode || '');

  if (code.startsWith('Agree:Field:')) return 'field';
  if (code.startsWith('Agree:Module:')) return 'module';

  if (type === 'button') return 'button';

  if (
    type === 'catalog' ||
    type === 'menu' ||
    type === 'embedded' ||
    type === 'link'
  ) {
    return 'menu';
  }

  return null;
}

/**
 * 收集某类资源下所有节点 id（字符串）
 * @param nodes 全量菜单树
 * @param kind 资源类型
 */
export function collectPermIdsByKind(
  nodes: MenuNode[],
  kind: PermResourceKind,
): Set<string> {
  const ids = new Set<string>();

  /** 递归扫描 */
  function walk(list: MenuNode[]) {
    for (const node of list) {
      if (classifyPermNode(node) === kind) {
        ids.add(String(node.id));
      }
      if (node.children?.length) walk(node.children);
    }
  }

  walk(nodes || []);
  return ids;
}

/**
 * 构建「菜单」树：去掉所有按钮节点
 * @param nodes 全量菜单树
 */
export function buildMenuResourceTree(nodes: MenuNode[]): MenuNode[] {
  const result: MenuNode[] = [];
  for (const node of nodes || []) {
    if (classifyPermNode(node) === 'button' || node.type === 'button') {
      continue;
    }
    // 字段/模块只可能是 button，这里不会误伤
    const children = buildMenuResourceTree(node.children || []);
    result.push({
      ...node,
      children,
    });
  }
  return result;
}

/**
 * 构建按钮/字段/模块扁平树（带父级路径，便于辨认）
 * @param nodes 全量菜单树
 * @param kind button | field | module
 */
export function buildFlatResourceTree(
  nodes: MenuNode[],
  kind: Exclude<PermResourceKind, 'menu'>,
): MenuNode[] {
  const out: MenuNode[] = [];

  /**
   * @param list 当前层
   * @param parentLabel 父级标题路径
   */
  function walk(list: MenuNode[], parentLabel: string) {
    for (const node of list) {
      const label = String(node.meta?.title || node.name || node.id);
      if (node.type === 'button') {
        if (classifyPermNode(node) === kind) {
          const auth = node.authCode ? ` (${node.authCode})` : '';
          out.push({
            ...node,
            children: [],
            meta: {
              ...(node.meta || {}),
              // 展示：所属菜单 · 按钮名 (权限码)
              title: parentLabel
                ? `${parentLabel} · ${label}${auth}`
                : `${label}${auth}`,
              icon: undefined,
            },
          });
        }
        continue;
      }
      const nextLabel = parentLabel ? `${parentLabel} / ${label}` : label;
      if (node.children?.length) {
        walk(node.children, nextLabel);
      }
    }
  }

  walk(nodes || [], '');
  return out;
}

/**
 * 合并某一类勾选结果到总 permissions
 * @param allSelected 当前全部已选 id
 * @param kindIds 该类资源全部 id 集合
 * @param checkedInKind 该类当前勾选
 */
export function mergePermSelection(
  allSelected: Array<number | string>,
  kindIds: Set<string>,
  checkedInKind: Array<number | string>,
): Array<number | string> {
  const rest = (allSelected || []).filter(
    (id) => !kindIds.has(String(id)),
  );
  const nextKind = (checkedInKind || []).filter((id) =>
    kindIds.has(String(id)),
  );
  // 去重并保持稳定顺序：其它类在前，本类在后
  const seen = new Set<string>();
  const merged: Array<number | string> = [];
  for (const id of [...rest, ...nextKind]) {
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(id);
  }
  return merged;
}

/**
 * 从总选中里取出某一类的勾选
 * @param allSelected 全部已选
 * @param kindIds 该类 id 集合
 */
export function pickPermSelection(
  allSelected: Array<number | string>,
  kindIds: Set<string>,
): Array<number | string> {
  return (allSelected || []).filter((id) => kindIds.has(String(id)));
}

/**
 * 角色授权：将菜单树拆成四类资源（文档 2.6）
 * - 菜单：目录/菜单/内嵌/外链
 * - 按钮：操作按钮（含 Agree:View:* 仅可见）
 * - 字段：Agree:Field:*
 * - 模块：Agree:Module:*
 *
 * 按钮/字段/模块按所属菜单分组；标题走 i18n；分组节点不可勾选。
 */
import type { SystemMenuApi } from '#/api/system/menu';

import { $t } from '#/locales';

export type PermResourceKind = 'button' | 'field' | 'menu' | 'module';

type MenuNode = SystemMenuApi.SystemMenu;

/** 分组节点 id 前缀（不参与权限落库） */
const GROUP_ID_PREFIX = '__perm_group__:';

/**
 * 菜单标题转可读文案（支持 i18n key / 中文原样）
 * @param raw meta.title 或 name
 */
export function resolvePermLabel(raw?: string) {
  const text = String(raw || '').trim();
  if (!text) return '—';
  const translated = $t(text);
  return translated || text;
}

/**
 * 按 authCode / type 归类资源
 * @param node 菜单节点
 */
export function classifyPermNode(node: MenuNode): null | PermResourceKind {
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
 * 是否为电子协议相关（分组排序优先）
 * @param authCode 权限码
 * @param pathLabel 菜单路径
 */
function isAgreeRelated(authCode?: string, pathLabel?: string) {
  if (String(authCode || '').startsWith('Agree:')) return true;
  return String(pathLabel || '').includes('电子协议');
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
    const children = buildMenuResourceTree(node.children || []);
    result.push({
      ...node,
      children,
    });
  }
  return result;
}

/**
 * 叶子节点展示标题
 * @param node 按钮/字段/模块节点
 * @param kind 资源类型
 */
function formatLeafTitle(node: MenuNode, kind: PermResourceKind) {
  let raw = String(node.meta?.title || node.name || node.id);
  if (kind === 'field') {
    raw = raw.replace(/^字段[-:：\s]*/, '');
  }
  if (kind === 'module') {
    raw = raw.replace(/^(模块|区域)[-:：\s]*/, '');
  }
  return resolvePermLabel(raw);
}

/**
 * 按所属菜单分组构建资源树（分组节点 disabled）
 * @param nodes 全量菜单树
 * @param kind button | field | module
 * @param keyword 可选关键字（中文名 / 权限码 / 菜单路径）
 */
export function buildGroupedResourceTree(
  nodes: MenuNode[],
  kind: Exclude<PermResourceKind, 'menu'>,
  keyword?: string,
): MenuNode[] {
  const groups = new Map<
    string,
    { leaves: MenuNode[]; pathLabel: string; pivotId: string }
  >();

  /**
   * @param list 当前层
   * @param pathParts 已翻译父级标题
   * @param pivotId 最近菜单/目录 id
   */
  function walk(list: MenuNode[], pathParts: string[], pivotId: string) {
    for (const node of list) {
      const label = resolvePermLabel(
        String(node.meta?.title || node.name || node.id),
      );
      if (node.type === 'button') {
        if (classifyPermNode(node) !== kind) continue;
        const pathLabel = pathParts.join(' / ') || '未归类';
        const key = pivotId || pathLabel;
        let group = groups.get(key);
        if (!group) {
          group = { leaves: [], pathLabel, pivotId: key };
          groups.set(key, group);
        }
        group.leaves.push({
          ...node,
          children: [],
          disabled: false,
          meta: {
            ...node.meta,
            title: formatLeafTitle(node, kind),
            authCode: node.authCode,
            viewOnly: String(node.authCode || '').startsWith('Agree:View:'),
          },
        });
        continue;
      }
      const nextParts = [...pathParts, label];
      const nextPivot = String(node.id ?? pivotId);
      if (node.children?.length) {
        walk(node.children, nextParts, nextPivot);
      }
    }
  }

  walk(nodes || [], [], 'root');

  const kw = String(keyword || '')
    .trim()
    .toLowerCase();
  const result: MenuNode[] = [];

  for (const group of groups.values()) {
    let leaves = group.leaves;
    if (kw) {
      leaves = leaves.filter((leaf) => {
        const title = String(leaf.meta?.title || '').toLowerCase();
        const code = String(leaf.authCode || '').toLowerCase();
        const path = group.pathLabel.toLowerCase();
        return title.includes(kw) || code.includes(kw) || path.includes(kw);
      });
    }
    if (leaves.length === 0) continue;

    leaves = [...leaves].toSorted((a, b) => {
      const aAgree = isAgreeRelated(a.authCode) ? 0 : 1;
      const bAgree = isAgreeRelated(b.authCode) ? 0 : 1;
      if (aAgree !== bAgree) return aAgree - bAgree;
      return String(a.meta?.title || '').localeCompare(
        String(b.meta?.title || ''),
        'zh-CN',
      );
    });

    result.push({
      id: `${GROUP_ID_PREFIX}${kind}:${group.pivotId}`,
      name: `perm_group_${group.pivotId}`,
      type: 'catalog',
      status: 1,
      disabled: true,
      meta: {
        title: group.pathLabel,
        leafCount: leaves.length,
      },
      children: leaves,
    } as MenuNode);
  }

  result.sort((a, b) => {
    const aPath = String(a.meta?.title || '');
    const bPath = String(b.meta?.title || '');
    const aAgree = isAgreeRelated(undefined, aPath) ? 0 : 1;
    const bAgree = isAgreeRelated(undefined, bPath) ? 0 : 1;
    if (aAgree !== bAgree) return aAgree - bAgree;
    return aPath.localeCompare(bPath, 'zh-CN');
  });

  return result;
}

/**
 * @deprecated 请用 buildGroupedResourceTree；保留扁平别名兼容旧调用
 * @param nodes 全量菜单树
 * @param kind button | field | module
 */
export function buildFlatResourceTree(
  nodes: MenuNode[],
  kind: Exclude<PermResourceKind, 'menu'>,
): MenuNode[] {
  return buildGroupedResourceTree(nodes, kind);
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
  const rest = (allSelected || []).filter((id) => !kindIds.has(String(id)));
  const nextKind = (checkedInKind || []).filter((id) => {
    const key = String(id);
    if (key.startsWith(GROUP_ID_PREFIX)) return false;
    return kindIds.has(key);
  });
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

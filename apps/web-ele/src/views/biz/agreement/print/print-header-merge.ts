import {
  extractTableHeaderGroups,
  listLeafTableCells,
  toTableColumnRows,
} from './print-element-meta';
import { cloneTemplate } from './template-store';

export interface HeaderMerge {
  fromLeaf: number;
  toLeaf: number;
  title: string;
  id: string;
  rowIndex: number;
  cellIndexes: number[];
}

function parentRange(columns: unknown, index: number) {
  const groups = extractTableHeaderGroups(columns)
    .filter((group) => group.fromLeaf <= index && group.toLeaf >= index)
    .toSorted((a, b) => a.toLeaf - a.fromLeaf - (b.toLeaf - b.fromLeaf));
  const group = groups[0];
  return group ? `${group.fromLeaf}:${group.toLeaf}` : 'root';
}

/** 合并标记跟随数据列保存；数据列插入、删除和重建分组时不会串到其他列。 */
export function listHeaderMerges(columns: unknown): HeaderMerge[] {
  const rows = toTableColumnRows(columns);
  const leaves = listLeafTableCells(columns);
  const result: HeaderMerge[] = [];
  let index = 0;
  while (index < leaves.length) {
    const first = leaves[index];
    if (!first) break;
    const cell = rows[first.rowIndex]?.[first.cellIndex];
    const id = String(cell?.agreeHeaderMergeId || '');
    const start = index++;
    if (!id || cell?.checked === false) continue;
    const cellIndexes = [first.cellIndex];
    while (index < leaves.length) {
      const leaf = leaves[index];
      if (!leaf) break;
      const next = rows[leaf.rowIndex]?.[leaf.cellIndex];
      if (
        next?.agreeHeaderMergeId !== id ||
        next?.checked === false ||
        leaf.rowIndex !== first.rowIndex ||
        Number(next?.rowspan || 1) !== Number(cell?.rowspan || 1) ||
        parentRange(columns, index) !== parentRange(columns, start)
      )
        break;
      cellIndexes.push(leaf.cellIndex);
      index++;
    }
    if (cellIndexes.length > 1)
      result.push({
        id,
        fromLeaf: start,
        toLeaf: index - 1,
        rowIndex: first.rowIndex,
        cellIndexes,
        title: String(cell?.agreeHeaderMergeTitle || first.title || '合并表头'),
      });
  }
  return result;
}

export function mergeTableHeaders(
  columns: unknown,
  from: number,
  to: number,
  title = '',
) {
  const rows = toTableColumnRows(cloneTemplate(toTableColumnRows(columns)));
  const leaves = listLeafTableCells(rows);
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const first = leaves[start];
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    !first ||
    end >= leaves.length ||
    start === end
  ) {
    throw new Error('请选择至少两个相邻的数据列表头');
  }
  const firstCell = rows[first.rowIndex]?.[first.cellIndex];
  for (let index = start; index <= end; index++) {
    const leaf = leaves[index];
    const cell = leaf && rows[leaf.rowIndex]?.[leaf.cellIndex];
    if (
      !cell ||
      cell.checked === false ||
      leaf?.rowIndex !== first.rowIndex ||
      Number(cell.rowspan || 1) !== Number(firstCell?.rowspan || 1) ||
      parentRange(rows, index) !== parentRange(rows, start)
    ) {
      throw new Error('只能合并同一层、同一上级分组内的相邻表头');
    }
  }
  for (const group of listHeaderMerges(rows)) {
    if (
      group.toLeaf >= start &&
      group.fromLeaf <= end &&
      (group.fromLeaf < start || group.toLeaf > end)
    ) {
      throw new Error('选区包含部分已合并表头，请先拆分或选中完整范围');
    }
  }
  const used = new Set(rows.flat().map((cell) => cell.agreeHeaderMergeId));
  let id = `header-${start}-${end}`;
  while (used.has(id)) id += '_';
  for (const leaf of leaves.slice(start, end + 1)) {
    const cell = rows[leaf.rowIndex]?.[leaf.cellIndex];
    if (!cell) continue;
    cell.agreeHeaderMergeId = id;
    cell.agreeHeaderMergeTitle = title.trim() || first.title || '合并表头';
  }
  return rows;
}

export function splitTableHeader(columns: unknown, id: string) {
  const rows = toTableColumnRows(cloneTemplate(toTableColumnRows(columns)));
  for (const cell of rows.flat()) {
    if (cell.agreeHeaderMergeId !== id) continue;
    delete cell.agreeHeaderMergeId;
    delete cell.agreeHeaderMergeTitle;
  }
  return rows;
}

/** 只投影表头，底下的数据列继续从原始 columns 读取。 */
export function projectTableHeaders(columns: unknown) {
  const rows = toTableColumnRows(cloneTemplate(toTableColumnRows(columns)));
  rows.forEach((row, ri) =>
    row.forEach((cell, ci) => {
      cell.editorRowIndex = ri;
      cell.editorCellIndex = ci;
    }),
  );
  listLeafTableCells(columns).forEach((leaf, index) => {
    const cell = rows[leaf.rowIndex]?.[leaf.cellIndex];
    if (cell) {
      cell.editorLeafIndex = index;
      cell.editorLeafEnd = index;
    }
  });
  for (const group of listHeaderMerges(columns)) {
    const row = rows[group.rowIndex];
    const firstIndex = group.cellIndexes[0];
    const first = firstIndex === undefined ? undefined : row?.[firstIndex];
    if (!first || !row) continue;
    first.title = group.title;
    first.colspan = group.toLeaf - group.fromLeaf + 1;
    first.width = group.cellIndexes.reduce(
      (sum, index) => sum + Number(row[index]?.width || 80),
      0,
    );
    first.editorLeafEnd = group.toLeaf;
    first.headerMergeId = group.id;
    for (const index of group.cellIndexes.slice(1)) {
      const cell = row[index];
      if (cell) cell.headerMergeCovered = true;
    }
  }
  return rows.map((row) =>
    row.filter((cell) => !cell.headerMergeCovered && cell.checked !== false),
  );
}

/** 收集 hiprint 表格；单页 target 可能就是 table 本身。 */
function collectPrintTables(root: ParentNode): HTMLTableElement[] {
  const nested = [
    ...root.querySelectorAll<HTMLTableElement>(
      'table.hiprint-printElement-tableTarget',
    ),
  ];
  if (nested.length > 0) return nested;
  if (root instanceof HTMLTableElement) return [root];
  return [...root.querySelectorAll('table')];
}

/**
 * hiprint 只用最后一层表头生成 colgroup。三层表头时最后一行往往只有
 * 「数量 / 单价」，续表列宽和表体对不齐。按叶子列重建 colgroup。
 */
export function rebuildPrintTableColgroups(
  root: ParentNode,
  leaves: { width: number }[],
) {
  if (leaves.length === 0) return;
  for (const table of collectPrintTables(root)) {
    let colgroup = table.querySelector('colgroup');
    if (!colgroup) {
      colgroup = document.createElement('colgroup');
    }
    if (table.firstChild !== colgroup) {
      table.prepend(colgroup);
    }
    colgroup.innerHTML = '';
    for (const leaf of leaves) {
      const col = document.createElement('col');
      col.setAttribute('width', `${Number(leaf.width) || 80}pt`);
      colgroup.append(col);
    }
  }
}

/**
 * hiprint 续表会把 rowspan/colspan 为 0 的隐藏格改回可见，多出空列。
 * 排版后再藏一次，避免上下页表头错位。
 */
export function hideConsumedPrintCells(root: ParentNode) {
  for (const td of root.querySelectorAll('tbody td')) {
    const rowspan = Number(td.getAttribute('rowspan') || '1');
    const colspan = Number(td.getAttribute('colspan') || '1');
    if (rowspan < 1 || colspan < 1) {
      (td as HTMLElement).style.display = 'none';
    }
  }
}

/**
 * 续表表头与首页保持同一份 HTML，避免分页后多出空表头格。
 * @param cache 挂在 printElementType 上，跨页复用
 */
export function syncContinuedTableHeaders(
  root: ParentNode,
  cache: { html?: string },
) {
  for (const table of collectPrintTables(root)) {
    const thead = table.querySelector('thead');
    if (!thead) continue;
    if (!cache.html) {
      cache.html = thead.innerHTML;
      continue;
    }
    if (thead.innerHTML !== cache.html) thead.innerHTML = cache.html;
  }
}

/** hiprint 完成每页排版后，仅合并 thead；colgroup、tbody、tfoot 保持独立列。 */
export function applyHeaderMergesToDom(
  root: ParentNode,
  merges: HeaderMerge[],
) {
  for (const head of root.querySelectorAll('thead')) {
    if (head.dataset.agreeHeaderMerged) continue;
    const rows = [...head.querySelectorAll('tr')].map((row) => [
      ...row.children,
    ]);
    for (const group of merges) {
      const cells = rows[group.rowIndex];
      const firstIndex = group.cellIndexes[0];
      const first = firstIndex === undefined ? undefined : cells?.[firstIndex];
      if (!first || !cells) continue;
      first.setAttribute('colspan', String(group.toLeaf - group.fromLeaf + 1));
      first.textContent = group.title;
      (first as HTMLElement).style.removeProperty('width');
      for (const index of group.cellIndexes.slice(1)) cells[index]?.remove();
    }
    head.dataset.agreeHeaderMerged = 'true';
  }
}

/** 表格类型构造器不保留 onRendered，必须在实例创建后安装；预览、打印、PDF 共用。 */
export function installHeaderMergeRuntime(instance: any, template: any) {
  for (const [panelIndex, panel] of (template.panels || []).entries()) {
    for (const [elementIndex, element] of (
      panel.printElements || []
    ).entries()) {
      if (element.printElementType?.type !== 'table') continue;
      const columnRows = toTableColumnRows(element.options?.columns);
      const leaves = listLeafTableCells(columnRows);
      const merges = listHeaderMerges(columnRows).map((group) => ({
        ...group,
        cellIndexes: group.cellIndexes.map(
          (index) =>
            (columnRows[group.rowIndex] || [])
              .slice(0, index)
              .filter((cell) => cell.checked !== false).length,
        ),
      }));
      const type =
        instance.printPanels?.[panelIndex]?.printElements?.[elementIndex]
          ?.printElementType;
      if (!type) continue;
      const previous = type.onRendered;
      const headerCache: { html?: string } = {};
      type.onRendered = (target: any, options: any, page: any) => {
        if (typeof previous === 'function') previous(target, options, page);
        const root = target?.[0] || target;
        if (!root?.querySelectorAll) return;
        rebuildPrintTableColgroups(root, leaves);
        hideConsumedPrintCells(root);
        if (merges.length > 0) applyHeaderMergesToDom(root, merges);
        syncContinuedTableHeaders(root, headerCache);
      };
    }
  }
}

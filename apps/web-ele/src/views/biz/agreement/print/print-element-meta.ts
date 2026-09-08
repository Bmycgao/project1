import type { AgreePrintFieldItem } from './fields';

import { buildPresetTableColumns } from './fields';
import { normalizeTemplateWatermark } from './print-watermark';
import { cloneTemplate } from './template-store';

/**
 * 打印模板元素元数据：遍历 / 定位 / 补丁 options（高级规则绑定）
 */

/** 元素定位（面板下标 + 元素下标） */
export interface PrintElementRef {
  panelIndex: number;
  elementIndex: number;
  /** 下拉展示用唯一键 */
  key: string;
  /** 元素类型 text | table | … */
  type: string;
  /** 绑定字段 */
  field?: string;
  /** 标题/标签 */
  label: string;
  options: Record<string, unknown>;
}

/**
 * 生成元素定位 key
 * @param panelIndex 面板序号
 * @param elementIndex 元素序号
 * @param el 元素 JSON
 */
function buildElementKey(
  panelIndex: number,
  elementIndex: number,
  el: Record<string, any>,
) {
  const field = el?.options?.field || '';
  const type = el?.printElementType?.type || 'unknown';
  const left = el?.options?.left ?? 0;
  const top = el?.options?.top ?? 0;
  return `${panelIndex}-${elementIndex}-${type}-${field}-${left}-${top}`;
}

/**
 * 解析模板 JSON 为可编辑元素列表
 * @param template hiprint getJson
 */
export function listPrintElements(
  template: null | Record<string, any> | undefined,
): PrintElementRef[] {
  const result: PrintElementRef[] = [];
  const panels = template?.panels || [];
  panels.forEach((panel: Record<string, any>, panelIndex: number) => {
    (panel.printElements || []).forEach(
      (el: Record<string, any>, elementIndex: number) => {
        const type = String(el?.printElementType?.type || 'unknown');
        const field = el?.options?.field as string | undefined;
        const title = String(
          el?.options?.title || el?.printElementType?.title || '',
        );
        const textType = el?.options?.textType as string | undefined;
        const typeLabel = textType ? `${type}(${textType})` : type;
        const label = `#${elementIndex + 1} ${title || field || typeLabel} [${typeLabel}]`;
        result.push({
          panelIndex,
          elementIndex,
          key: buildElementKey(panelIndex, elementIndex, el),
          type,
          field,
          label,
          options: { ...el?.options },
        });
      },
    );
  });
  return result;
}

/**
 * 用自绘画布的“面板:元素”键定位检视器元素。
 * 画布键刻意保持短且稳定，检视器键还包含类型/字段/坐标，二者不能直接比较。
 */
export function findPrintElementByCanvasKey(
  template: null | Record<string, any> | undefined,
  canvasKey: string,
  expectedType?: string,
): PrintElementRef | undefined {
  const match = /^(\d+):(\d+)$/.exec(String(canvasKey || '').trim());
  if (!match) return undefined;
  const panelIndex = Number(match[1]);
  const elementIndex = Number(match[2]);
  return listPrintElements(template).find(
    (item) =>
      item.panelIndex === panelIndex &&
      item.elementIndex === elementIndex &&
      (!expectedType || item.type === expectedType),
  );
}

/**
 * 读取指定元素的 options
 * @param template 模板 JSON
 * @param ref 元素定位
 */
export function getElementOptions(
  template: Record<string, any>,
  ref: Pick<PrintElementRef, 'elementIndex' | 'panelIndex'>,
): null | Record<string, unknown> {
  const el =
    template?.panels?.[ref.panelIndex]?.printElements?.[ref.elementIndex];
  return el?.options ? { ...el.options } : null;
}

/**
 * 合并写入元素 options（agree* 高级规则等）
 * @param template 模板 JSON
 * @param ref 元素定位
 * @param patch 待合并字段
 */
export function patchElementOptions(
  template: Record<string, any>,
  ref: Pick<PrintElementRef, 'elementIndex' | 'panelIndex'>,
  patch: Record<string, unknown>,
): Record<string, any> {
  /** 使用 JSON 深拷贝，避免 structuredClone 对 Vue Proxy / hiprint 特殊字段报错 */
  const next = cloneTemplate(template);
  const el = next?.panels?.[ref.panelIndex]?.printElements?.[ref.elementIndex];
  if (!el) {
    throw new Error(
      `未找到纸面元素 #${ref.elementIndex + 1}，请重新点选纸面元素`,
    );
  }
  el.options = { ...el.options, ...patch };
  /** 空字符串表示清除规则：重建 options，避免动态 delete */
  const cleared = new Set(
    Object.entries(patch)
      .filter(([, v]) => v === '' || v === null || v === undefined)
      .map(([k]) => k),
  );
  if (cleared.size > 0) {
    el.options = Object.fromEntries(
      Object.entries(el.options).filter(([k]) => !cleared.has(k)),
    );
  }
  return next;
}

/** 检视器里的叶子列（真正绑打印数据的格子，不含合并分组标题） */
export interface LeafTableCell {
  rowIndex: number;
  cellIndex: number;
  title: string;
  field: string;
  width: number;
  align: 'center' | 'left' | 'right';
  tableSummary: boolean;
  agreeColExpr: string;
  /** 同一列上下相同值合并 */
  agreeMergeSame: boolean;
  /** 此列为空时并入左边格子（只影响本行） */
  agreeHMergeEmpty: boolean;
  /** 值为 0 时格子显示空 */
  agreeHideZero: boolean;
  /** 单元格展示格式（money / dateCn 等），不改原始数字 */
  agreeColFormat: string;
}

/**
 * 把 hiprint columns 收成二维表头
 * @param columns options.columns
 */
export function toTableColumnRows(columns: unknown): Record<string, any>[][] {
  if (!Array.isArray(columns)) return [[]];
  return Array.isArray(columns[0]) ? columns : [columns];
}

/**
 * 是否多行表头（如补偿表「项目信息 / 计价信息」）
 * @param columns options.columns
 */
export function hasMultiRowTableHeader(columns: unknown) {
  return toTableColumnRows(columns).length > 1;
}

/**
 * 合并分组格：colspan>1 且没有真实 field（含 sanitize 留下的 col1_2）
 * @param cell 表头格子
 */
export function isGroupHeaderCell(
  cell: null | Record<string, any> | undefined,
) {
  const colspan = Number(cell?.colspan) || 1;
  if (colspan <= 1) return false;
  const field = String(cell?.field || '').trim();
  return !field || /^col\d+_\d+$/.test(field);
}

function roundLeafWidth(raw: unknown) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 80;
  return Math.round(n);
}

/**
 * 规范单元格水平对齐
 * @param raw 列/格上的 align
 */
export function normalizePrintAlign(raw: unknown): 'center' | 'left' | 'right' {
  return raw === 'center' || raw === 'right' ? raw : 'left';
}

/**
 * 画布格子 CSS：text-align + flex 合并格用的 justify-content
 * @param raw 列/格 align
 */
export function printAlignCss(raw: unknown) {
  const align = normalizePrintAlign(raw);
  const justify =
    align === 'center'
      ? 'center'
      : align === 'right'
        ? 'flex-end'
        : 'flex-start';
  return `text-align:${align};justify-content:${justify}`;
}

function cellToLeaf(
  rowIndex: number,
  cellIndex: number,
  cell: Record<string, any>,
): LeafTableCell {
  return {
    rowIndex,
    cellIndex,
    title: String(cell?.title || ''),
    field: String(cell?.field || ''),
    width: roundLeafWidth(cell?.width),
    align: normalizePrintAlign(cell?.align),
    tableSummary: cell?.tableSummary === 'sum',
    agreeColExpr: String(cell?.agreeColExpr || ''),
    agreeMergeSame: Boolean(cell?.agreeMergeSame),
    agreeHMergeEmpty: Boolean(cell?.agreeHMergeEmpty),
    agreeHideZero: Boolean(cell?.agreeHideZero),
    agreeColFormat: String(cell?.agreeColFormat || ''),
  };
}

/**
 * 按纸面从左到右列出数据列（跳过分组标题，保留跨行的序号/备注）
 * @param columns options.columns
 */
export function listLeafTableCells(columns: unknown): LeafTableCell[] {
  const rows = toTableColumnRows(columns);
  if (rows.length === 0) return [];

  const occupied: boolean[][] = rows.map(() => []);
  const placed: {
    cell: Record<string, any>;
    cellIndex: number;
    rowIndex: number;
    startCol: number;
  }[] = [];

  const mark = (r: number, c: number, rowspan: number, colspan: number) => {
    for (let i = 0; i < rowspan; i += 1) {
      const rr = r + i;
      if (!occupied[rr]) occupied[rr] = [];
      for (let j = 0; j < colspan; j += 1) occupied[rr][c + j] = true;
    }
  };

  const nextFree = (r: number) => {
    if (!occupied[r]) occupied[r] = [];
    let c = 0;
    while (occupied[r][c]) c += 1;
    return c;
  };

  rows.forEach((row, ri) => {
    if (!Array.isArray(row)) return;
    row.forEach((cell, ci) => {
      const colspan = Number(cell?.colspan) || 1;
      const rowspan = Number(cell?.rowspan) || 1;
      const startCol = nextFree(ri);
      mark(ri, startCol, rowspan, colspan);
      if (!isGroupHeaderCell(cell)) {
        placed.push({ startCol, rowIndex: ri, cellIndex: ci, cell });
      }
    });
  });

  placed.sort((a, b) => a.startCol - b.startCol || a.rowIndex - b.rowIndex);
  return placed.map((p) => cellToLeaf(p.rowIndex, p.cellIndex, p.cell));
}

export interface TableHeaderGroupRule {
  fromLeaf: number;
  title: string;
  toLeaf: number;
}

/** 从现有 rowspan/colspan 矩阵还原分组范围 */
export function extractTableHeaderGroups(
  columns: unknown,
): TableHeaderGroupRule[] {
  const rows = toTableColumnRows(columns);
  const occupied: boolean[][] = rows.map(() => []);
  const groups: TableHeaderGroupRule[] = [];
  rows.forEach((row, rowIndex) => {
    row.forEach((cell) => {
      let startCol = 0;
      while (occupied[rowIndex]?.[startCol]) startCol += 1;
      const colspan = Math.max(1, Number(cell?.colspan) || 1);
      const rowspan = Math.max(1, Number(cell?.rowspan) || 1);
      for (let r = rowIndex; r < rowIndex + rowspan; r += 1) {
        const occupiedRow = occupied[r] || (occupied[r] = []);
        for (let c = startCol; c < startCol + colspan; c += 1) {
          occupiedRow[c] = true;
        }
      }
      if (isGroupHeaderCell(cell)) {
        groups.push({
          fromLeaf: startCol,
          title: String(cell.title || '分组标题'),
          toLeaf: startCol + colspan - 1,
        });
      }
    });
  });
  return groups;
}

function headerGroupsCross(
  left: TableHeaderGroupRule,
  right: TableHeaderGroupRule,
) {
  const overlap =
    left.fromLeaf <= right.toLeaf && right.fromLeaf <= left.toLeaf;
  const nested =
    (left.fromLeaf <= right.fromLeaf && left.toLeaf >= right.toLeaf) ||
    (right.fromLeaf <= left.fromLeaf && right.toLeaf >= left.toLeaf);
  return overlap && !nested;
}

/** 把层级分组规则编译回 hiprint 多行表头矩阵 */
export function buildTableHeaderColumns(
  leaves: Record<string, any>[],
  groups: TableHeaderGroupRule[],
) {
  const normalized = groups
    .map((group) => ({
      fromLeaf: Math.max(0, Math.min(group.fromLeaf, group.toLeaf)),
      title: String(group.title || '').trim() || '分组标题',
      toLeaf: Math.min(
        leaves.length - 1,
        Math.max(group.fromLeaf, group.toLeaf),
      ),
    }))
    .filter((group) => group.toLeaf > group.fromLeaf);
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const left = normalized[i];
      const right = normalized[j];
      if (left && right && headerGroupsCross(left, right)) {
        throw new Error('表头分组只能相互包含或完全分开，不能交叉重叠');
      }
    }
  }
  const parentOf = normalized.map((group, index) => {
    let parent = -1;
    let parentSize = Number.POSITIVE_INFINITY;
    normalized.forEach((candidate, candidateIndex) => {
      if (candidateIndex === index) return;
      const contains =
        candidate.fromLeaf <= group.fromLeaf &&
        candidate.toLeaf >= group.toLeaf &&
        (candidate.fromLeaf < group.fromLeaf ||
          candidate.toLeaf > group.toLeaf);
      const size = candidate.toLeaf - candidate.fromLeaf;
      if (contains && size < parentSize) {
        parent = candidateIndex;
        parentSize = size;
      }
    });
    return parent;
  });
  const depthOf = (index: number) => {
    let depth = 0;
    let parent = parentOf[index] ?? -1;
    while (parent >= 0) {
      depth += 1;
      parent = parentOf[parent] ?? -1;
    }
    return depth;
  };
  const totalRows =
    normalized.length > 0
      ? Math.max(...normalized.map((_, index) => depthOf(index))) + 2
      : 1;
  const rows: Record<string, any>[][] = Array.from(
    { length: totalRows },
    () => [],
  );

  const appendContents = (
    fromLeaf: number,
    toLeaf: number,
    parentIndex: number,
    depth: number,
  ) => {
    const children = normalized
      .map((group, index) => ({ group, index }))
      .filter((item) => parentOf[item.index] === parentIndex)
      .toSorted((a, b) => a.group.fromLeaf - b.group.fromLeaf);
    const depthRow = rows[depth] || (rows[depth] = []);
    let cursor = fromLeaf;
    for (const child of children) {
      while (cursor < child.group.fromLeaf) {
        depthRow.push({
          ...cloneTemplate(leaves[cursor] || {}),
          colspan: 1,
          rowspan: totalRows - depth,
        });
        cursor += 1;
      }
      let width = 0;
      for (const leaf of leaves.slice(
        child.group.fromLeaf,
        child.group.toLeaf + 1,
      )) {
        width += Number(leaf?.width) || 80;
      }
      depthRow.push({
        align: 'center',
        colspan: child.group.toLeaf - child.group.fromLeaf + 1,
        field: '',
        rowspan: 1,
        title: child.group.title,
        width,
      });
      appendContents(
        child.group.fromLeaf,
        child.group.toLeaf,
        child.index,
        depth + 1,
      );
      cursor = child.group.toLeaf + 1;
    }
    while (cursor <= toLeaf) {
      depthRow.push({
        ...cloneTemplate(leaves[cursor] || {}),
        colspan: 1,
        rowspan: totalRows - depth,
      });
      cursor += 1;
    }
  };
  appendContents(0, leaves.length - 1, -1, 0);
  return rows.filter((row) => row.length > 0);
}

/**
 * 把连续叶子列建立分组；在已有分组内部继续分组即可形成多层表头。
 * 叶子格完整保留，因此字段绑定、列公式、格式和列宽不会丢失。
 */
export function groupTableHeaderColumns(
  columns: unknown,
  fromLeaf: number,
  toLeaf: number,
  title: string,
): Record<string, any>[][] {
  const rows = toTableColumnRows(columns);
  const leaves = listLeafTableCells(rows).map((leaf) =>
    cloneTemplate(rows[leaf.rowIndex]?.[leaf.cellIndex] || {}),
  );
  const start = Math.max(0, Math.min(fromLeaf, toLeaf));
  const end = Math.min(leaves.length - 1, Math.max(fromLeaf, toLeaf));
  if (end <= start) throw new Error('分组表头至少需要连续两列');
  const nextGroup = {
    fromLeaf: start,
    title: String(title || '').trim() || '分组标题',
    toLeaf: end,
  };
  const groups = extractTableHeaderGroups(rows).filter(
    (group) =>
      group.fromLeaf !== nextGroup.fromLeaf ||
      group.toLeaf !== nextGroup.toLeaf,
  );
  return buildTableHeaderColumns(leaves, [...groups, nextGroup]);
}

/** 多行/分组表头转为单行，完整保留所有叶子格配置 */
export function flattenTableHeaderColumns(
  columns: unknown,
): Record<string, any>[][] {
  const rows = toTableColumnRows(columns);
  const leaves = listLeafTableCells(rows);
  return [
    leaves.map((leaf) => {
      const source = rows[leaf.rowIndex]?.[leaf.cellIndex] || {};
      return { ...cloneTemplate(source), colspan: 1, rowspan: 1 };
    }),
  ];
}

function applyLeafFields(
  cell: Record<string, any>,
  patch: Partial<LeafTableCell>,
) {
  if (patch.title !== undefined) cell.title = patch.title;
  if (patch.field !== undefined) cell.field = patch.field;
  if (patch.width !== undefined) cell.width = patch.width;
  if (patch.align !== undefined) cell.align = normalizePrintAlign(patch.align);
  if (patch.tableSummary) cell.tableSummary = 'sum';
  else if (patch.tableSummary === false) delete cell.tableSummary;
  const expr = String(patch.agreeColExpr || '').trim();
  if (expr) cell.agreeColExpr = expr;
  else delete cell.agreeColExpr;
  if (patch.agreeMergeSame) cell.agreeMergeSame = true;
  else delete cell.agreeMergeSame;
  if (patch.agreeHMergeEmpty) cell.agreeHMergeEmpty = true;
  else delete cell.agreeHMergeEmpty;
  if (patch.agreeHideZero) cell.agreeHideZero = true;
  else delete cell.agreeHideZero;
  const colFormat = String(patch.agreeColFormat || '').trim();
  if (colFormat) cell.agreeColFormat = colFormat;
  else delete cell.agreeColFormat;
}

function newLeafCell(patch: Partial<LeafTableCell>): Record<string, any> {
  const cell: Record<string, any> = {
    title: patch.title || '新列',
    field: patch.field || '',
    width: patch.width || 80,
    align: patch.align ? normalizePrintAlign(patch.align) : 'left',
    colspan: 1,
    rowspan: 1,
    checked: true,
  };
  applyLeafFields(cell, patch);
  return cell;
}

/**
 * 写入表格列定义（会变成单行表头；仅套用推荐列时使用）
 * @param template 模板
 * @param ref 表格元素
 * @param columns 一行列配置
 */
export function patchTableColumns(
  template: Record<string, any>,
  ref: Pick<PrintElementRef, 'elementIndex' | 'panelIndex'>,
  columns: Record<string, unknown>[] | Record<string, unknown>[][],
): Record<string, any> {
  const rows = Array.isArray(columns[0])
    ? (columns as Record<string, unknown>[][])
    : [columns as Record<string, unknown>[]];
  return patchElementOptions(template, ref, { columns: rows });
}

/**
 * 按叶子列补丁写回，不拍扁多行表头
 * @param template 模板
 * @param ref 表格元素
 * @param leaves 检视器当前列出的数据列（含新增 rowIndex<0、已删的不在列表里）
 */
export function patchLeafTableColumns(
  template: Record<string, any>,
  ref: Pick<PrintElementRef, 'elementIndex' | 'panelIndex'>,
  leaves: LeafTableCell[],
): Record<string, any> {
  const next = cloneTemplate(template);
  const el = next?.panels?.[ref.panelIndex]?.printElements?.[ref.elementIndex];
  if (!el?.options) {
    throw new Error('当前元素没有表格列');
  }
  const rows = toTableColumnRows(el.options.columns);
  const original = listLeafTableCells(el.options.columns);
  const keep = new Set(
    leaves
      .filter((c) => c.rowIndex >= 0 && c.cellIndex >= 0)
      .map((c) => `${c.rowIndex}:${c.cellIndex}`),
  );

  for (const leaf of leaves) {
    if (leaf.rowIndex < 0) continue;
    const cell = rows[leaf.rowIndex]?.[leaf.cellIndex];
    if (cell) applyLeafFields(cell, leaf);
  }

  const removed = original.filter(
    (c) => !keep.has(`${c.rowIndex}:${c.cellIndex}`),
  );
  removed.sort((a, b) =>
    a.rowIndex === b.rowIndex
      ? b.cellIndex - a.cellIndex
      : b.rowIndex - a.rowIndex,
  );
  for (const item of removed) {
    rows[item.rowIndex]?.splice(item.cellIndex, 1);
  }

  const lastRow = rows[rows.length - 1] || rows[0];
  if (!lastRow) {
    throw new Error('表格列为空，无法追加叶子列');
  }
  for (const leaf of leaves) {
    if (leaf.rowIndex >= 0) continue;
    lastRow.push(newLeafCell(leaf));
  }

  el.options.columns = rows;
  return next;
}

/**
 * 在指定叶子列右侧插入一列，并同步扩展其所属的多层表头分组。
 * 例如在「计价信息 > 单价」右侧加列，新增列仍归属「计价信息」。
 */
export function insertLeafTableColumn(
  template: Record<string, any>,
  ref: Pick<PrintElementRef, 'elementIndex' | 'panelIndex'>,
  afterLeafIndex: number,
  patch: Partial<LeafTableCell> = {},
): Record<string, any> {
  const next = cloneTemplate(template);
  const el = next?.panels?.[ref.panelIndex]?.printElements?.[ref.elementIndex];
  if (!el?.options) throw new Error('当前元素没有表格列');
  const leaves = listLeafTableCells(el.options.columns).map((leaf) => {
    const cell = toTableColumnRows(el.options.columns)[leaf.rowIndex]?.[
      leaf.cellIndex
    ];
    return cloneTemplate(cell || {});
  });
  if (leaves.length === 0) throw new Error('表格列为空，无法插入列');
  const insertAt = Math.min(
    leaves.length,
    Math.max(0, Math.floor(afterLeafIndex) + 1),
  );
  leaves.splice(insertAt, 0, newLeafCell(patch));
  const groups = extractTableHeaderGroups(el.options.columns).map((group) => ({
    ...group,
    fromLeaf:
      group.fromLeaf > afterLeafIndex ? group.fromLeaf + 1 : group.fromLeaf,
    toLeaf: group.toLeaf >= afterLeafIndex ? group.toLeaf + 1 : group.toLeaf,
  }));
  el.options.columns = buildTableHeaderColumns(leaves, groups);
  return next;
}

/**
 * 只改某一列的 field/title，不重写整个 columns（避免拍扁双行表头）
 * @param template 模板
 * @param ref 表格元素
 * @param colIndex 检视器叶子列下标（无定位时的兜底）
 * @param prevField 该列改之前的 field
 * @param patch 新 field / 可选 title
 * @param loc 叶子格在二维 columns 里的坐标
 */
export function patchTableColumnFieldByIndex(
  template: Record<string, any>,
  ref: Pick<PrintElementRef, 'elementIndex' | 'panelIndex'>,
  colIndex: number,
  prevField: string,
  patch: { field: string; title?: string },
  loc?: { cellIndex: number; rowIndex: number },
): Record<string, any> {
  const next = cloneTemplate(template);
  const el = next?.panels?.[ref.panelIndex]?.printElements?.[ref.elementIndex];
  const columns = el?.options?.columns;
  if (!el || !Array.isArray(columns)) {
    throw new Error('当前元素没有表格列');
  }
  const rows = toTableColumnRows(columns);
  let target: null | Record<string, any> = null;
  if (loc && loc.rowIndex >= 0) {
    const cell = rows[loc.rowIndex]?.[loc.cellIndex];
    if (cell) target = cell;
  }
  const oldField = String(prevField || '').trim();
  if (!target && oldField) {
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      target =
        row.find(
          (cell) =>
            String(cell?.field || '') === oldField && !isGroupHeaderCell(cell),
        ) || null;
      if (target) break;
    }
  }
  if (!target) {
    const leaves = listLeafTableCells(columns);
    const hit = leaves[colIndex];
    if (hit) target = rows[hit.rowIndex]?.[hit.cellIndex] || null;
  }
  if (!target && rows[0]) {
    target = newLeafCell({
      title: patch.title || '新列',
      field: patch.field,
      width: 80,
      align: 'left',
    });
    const tail = rows[rows.length - 1];
    if (!tail) {
      throw new Error('表格列为空');
    }
    tail.push(target);
    el.options.columns = rows;
  }
  if (!target) {
    throw new Error('未找到对应列');
  }
  target.field = patch.field;
  if (patch.title) target.title = patch.title;
  return next;
}

/**
 * 在指定元素后插入新元素（计算结果文本等）
 * @param template 模板
 * @param panelIndex 面板
 * @param afterIndex 插在该下标之后；-1 表示追加到末尾
 * @param element 新元素 JSON
 */
export function insertPrintElement(
  template: Record<string, any>,
  panelIndex: number,
  afterIndex: number,
  element: Record<string, any>,
): Record<string, any> {
  const next = cloneTemplate(template);
  const list = next?.panels?.[panelIndex]?.printElements;
  if (!Array.isArray(list)) {
    throw new TypeError('无法插入元素：模板结构无效');
  }
  const idx = afterIndex < 0 ? list.length : afterIndex + 1;
  list.splice(idx, 0, element);
  return next;
}

/**
 * 复制一份元素并右下偏移，插在原元素后面
 * @param template 模板
 * @param ref 源元素
 * @param offset 偏移量
 */
export function duplicatePrintElement(
  template: Record<string, any>,
  ref: Pick<PrintElementRef, 'elementIndex' | 'panelIndex'>,
  offset = 12,
): Record<string, any> {
  const next = cloneTemplate(template);
  const list = next?.panels?.[ref.panelIndex]?.printElements;
  const src = list?.[ref.elementIndex];
  if (!src) {
    throw new Error('未找到要复制的元素');
  }
  const copy = cloneTemplate(src);
  copy.options = copy.options || {};
  copy.options.left = Number(copy.options.left || 0) + offset;
  copy.options.top = Number(copy.options.top || 0) + offset;
  list.splice(ref.elementIndex + 1, 0, copy);
  return next;
}

/**
 * 删除指定元素
 * @param template 模板
 * @param ref 元素定位
 */
export function removePrintElement(
  template: Record<string, any>,
  ref: Pick<PrintElementRef, 'elementIndex' | 'panelIndex'>,
): Record<string, any> {
  const next = cloneTemplate(template);
  const list = next?.panels?.[ref.panelIndex]?.printElements;
  if (!Array.isArray(list) || !list[ref.elementIndex]) {
    throw new Error('未找到要删除的元素');
  }
  list.splice(ref.elementIndex, 1);
  return next;
}

/**
 * 生成计算结果动态文本元素
 * @param opts 位置与公式
 */
export function buildCalcResultElement(opts: {
  expr: string;
  field: string;
  left: number;
  testData?: string;
  title: string;
  top: number;
}) {
  return {
    options: {
      left: opts.left,
      top: opts.top,
      height: 16,
      width: 540,
      title: opts.title,
      field: opts.field,
      testData: opts.testData || '',
      fontSize: 11,
      fontWeight: '600',
      agreeValueExpr: opts.expr,
    },
    printElementType: { title: '文本', type: 'text' },
  };
}

/** 数据源拖放到纸面时的 MIME（部分浏览器只认 text/plain） */
export const AGREE_PRINT_FIELD_DND = 'agree-print-field';

/** 左侧积木拖到纸面（绕开 hiprint jQuery 拖拽，兼容画布缩放） */
export const AGREE_PRINT_TOOLBOX_DND = 'agree-print-toolbox';

/** HTML5 拖拽会话：部分浏览器除 drop 外读不到 dataTransfer，用内存兜底 */
export type AgreePrintHtml5DragSession =
  | null
  | { item: AgreePrintFieldItem; kind: typeof AGREE_PRINT_FIELD_DND }
  | { kind: typeof AGREE_PRINT_TOOLBOX_DND; tid: string };

let agreePrintHtml5Drag: AgreePrintHtml5DragSession = null;

/**
 * 记录当前积木 / 字段拖拽
 * @param session 拖拽载荷，dragend 时传 null
 */
export function setAgreePrintHtml5Drag(session: AgreePrintHtml5DragSession) {
  agreePrintHtml5Drag = session;
}

/** 读取当前 HTML5 拖拽（drop 解析失败时兜底） */
export function getAgreePrintHtml5Drag() {
  return agreePrintHtml5Drag;
}

/** 积木 tid → printElementType（design 时缺 tid 会让表格 css() 崩） */
const TOOLBOX_TYPE_META: Record<
  string,
  { tid: string; title: string; type: string }
> = {
  staticTitle: {
    tid: 'agreePrintModule.staticTitle',
    title: '文本',
    type: 'text',
  },
  dynamicText: {
    tid: 'agreePrintModule.dynamicText',
    title: '文本',
    type: 'text',
  },
  longText: {
    tid: 'agreePrintModule.longText',
    title: '长文本',
    type: 'longText',
  },
  table: { tid: 'agreePrintModule.table', title: '表格', type: 'table' },
  qrcode: { tid: 'agreePrintModule.qrcode', title: '文本', type: 'text' },
  barcode: { tid: 'agreePrintModule.barcode', title: '文本', type: 'text' },
  hline: { tid: 'agreePrintModule.hline', title: '横线', type: 'hline' },
  vline: { tid: 'agreePrintModule.vline', title: '竖线', type: 'vline' },
  rect: { tid: 'agreePrintModule.rect', title: '矩形', type: 'rect' },
};

function typeMeta(key: string) {
  return TOOLBOX_TYPE_META[key] || TOOLBOX_TYPE_META.dynamicText;
}

/**
 * hiprint 画表会走 columns[0].forEach / columns[idx].columns；缺 tid、空列、空行会崩
 * @param template 即将挂到画布的 JSON
 */
export function sanitizePrintTemplate(template: Record<string, any>) {
  const next = cloneTemplate(template);
  normalizeTemplateWatermark(next);
  for (const panel of next.panels || []) {
    /**
     * 关掉 hiprint 自带的“跨页自动续排”：它按 paperFooter 边界判断元素是否要
     * 挪到下一页，设计态下命中时会把表格的 designTarget 算成 undefined 直接崩掉
     * （尤其是横向纸变矮、表格没跟着降高时最容易触发）。我们已经有手动加页/
     * 从此处起新页，不需要引擎再自动分页，统一关掉最稳。
     */
    panel.panelPageRule = 'none';
    panel.printElements = (panel.printElements || []).filter(Boolean);
    for (const el of panel.printElements) {
      const type = String(el?.printElementType?.type || '');
      if (!el.printElementType) el.printElementType = { type };
      if (!el.printElementType.tid) {
        const hit = Object.values(TOOLBOX_TYPE_META).find(
          (m) => m.type === type,
        );
        if (hit) el.printElementType.tid = hit.tid;
        else if (type === 'table')
          el.printElementType.tid = 'agreePrintModule.table';
      }
      if (!el.options) el.options = {};
      if (type !== 'table') continue;
      el.options.columns = normalizeTableColumns(el.options.columns);
      if (el.options.field === '') delete el.options.field;
    }
  }
  return next;
}

/**
 * 列必须是二维数组且每行都是格子数组；叶子格补 field，分组格保持空 field
 * @param columns options.columns
 */
function normalizeTableColumns(columns: unknown): Record<string, any>[][] {
  const rows: unknown[] = Array.isArray(columns)
    ? Array.isArray(columns[0])
      ? columns
      : [columns]
    : [[]];
  const next = rows
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row, ri) => {
      const cells = row.filter(
        (cell): cell is Record<string, any> =>
          Boolean(cell) && typeof cell === 'object',
      );
      return cells.map((cell: Record<string, any>, ci: number) => {
        const colspan = Number(cell?.colspan) || 1;
        const rowspan = Number(cell?.rowspan) || 1;
        let field = String(cell?.field || '').trim();
        const isGroup = colspan > 1 && (!field || /^col\d+_\d+$/.test(field));
        if (isGroup) {
          field = '';
        } else if (!field) {
          field = `col${ri + 1}_${ci + 1}`;
        }
        return {
          ...cell,
          title: cell?.title || field || '分组',
          field,
          width: Number(cell?.width) > 0 ? Number(cell.width) : 80,
          colspan,
          rowspan,
          checked: cell?.checked !== false,
        };
      });
    })
    .filter((row) => row.length > 0);
  /** hiprint TablePrintElement 会对 columns[0] 做 forEach，空行会炸 */
  if (next.length === 0 || !next[0]?.length) {
    return [
      [
        {
          title: '列1',
          field: 'col1',
          width: 180,
          align: 'left',
          colspan: 1,
          rowspan: 1,
          checked: true,
        },
        {
          title: '列2',
          field: 'col2',
          width: 180,
          align: 'left',
          colspan: 1,
          rowspan: 1,
          checked: true,
        },
        {
          title: '列3',
          field: 'col3',
          width: 190,
          align: 'right',
          colspan: 1,
          rowspan: 1,
          checked: true,
        },
      ],
    ];
  }
  return next;
}

/**
 * 按积木 tid 生成空白纸面元素（与 provider 默认尺寸对齐）
 * @param tid agreePrintModule.xxx
 * @param left 设计器 left
 * @param top 设计器 top
 */
export function buildToolboxPrintElement(
  tid: string,
  left: number,
  top: number,
) {
  const type = tid.split('.').pop() || '';
  if (type === 'table') {
    return {
      options: {
        left,
        top,
        width: 550,
        height: 54,
        tableHeaderRepeat: 'page',
        tableFooterRepeat: 'last',
        columns: normalizeTableColumns([
          [
            { title: '列1', field: 'col1', width: 180, align: 'left' },
            { title: '列2', field: 'col2', width: 180, align: 'left' },
            { title: '列3', field: 'col3', width: 190, align: 'right' },
          ],
        ]),
      },
      printElementType: { ...typeMeta('table') },
    };
  }
  if (type === 'longText') {
    return {
      options: {
        left,
        top,
        title: '长文本',
        field: '',
        width: 400,
        height: 40,
      },
      printElementType: { ...typeMeta('longText') },
    };
  }
  if (type === 'qrcode') {
    return {
      options: {
        left,
        top,
        title: '二维码',
        field: 'qrcodeContent',
        textType: 'qrcode',
        hideTitle: true,
        qrcodeLevel: 1,
        width: 50,
        height: 50,
        testData: 'AGREE:XY-2026-001',
      },
      printElementType: { ...typeMeta('qrcode') },
    };
  }
  if (type === 'barcode') {
    return {
      options: {
        left,
        top,
        title: '条形码',
        field: 'barcodeContent',
        textType: 'barcode',
        barcodeMode: 'CODE128',
        hideTitle: true,
        barAutoWidth: true,
        width: 160,
        height: 40,
        testData: 'XY-2026-001',
      },
      printElementType: { ...typeMeta('barcode') },
    };
  }
  if (type === 'hline') {
    return {
      options: { left, top, width: 550, height: 9, borderWidth: 0.75 },
      printElementType: { ...typeMeta('hline') },
    };
  }
  if (type === 'vline') {
    return {
      options: { left, top, width: 9, height: 120, borderWidth: 0.75 },
      printElementType: { ...typeMeta('vline') },
    };
  }
  if (type === 'rect') {
    return {
      options: {
        left,
        top,
        width: 120,
        height: 80,
        borderWidth: 0.75,
      },
      printElementType: { ...typeMeta('rect') },
    };
  }
  if (type === 'staticTitle') {
    return {
      options: {
        left,
        top,
        title: '请输入标题',
        hideTitle: true,
        height: 16,
        width: 220,
        fontSize: 12,
        fontWeight: '600',
      },
      printElementType: { ...typeMeta('staticTitle') },
    };
  }
  return {
    options: {
      left,
      top,
      title: '未绑定',
      field: '',
      testData: '',
      height: 16,
      width: 200,
      fontSize: 10,
    },
    printElementType: { ...typeMeta('dynamicText') },
  };
}

/**
 * 按数据源字段生成已绑定的纸面元素
 * @param item 主表字段或表格数据源
 * @param left 设计器 left
 * @param top 设计器 top
 */
export function buildBoundPrintElement(
  item: AgreePrintFieldItem,
  left: number,
  top: number,
) {
  if (item.group === 'table') {
    return {
      options: {
        left,
        top,
        field: item.field,
        width: 550,
        height: 54,
        tableHeaderRepeat: 'page',
        tableFooterRepeat: 'last',
        columns: normalizeTableColumns([buildPresetTableColumns(item.field)]),
      },
      printElementType: { ...typeMeta('table') },
    };
  }
  const isQr = item.textType === 'qrcode';
  const isBar = item.textType === 'barcode';
  return {
    options: {
      left,
      top,
      title: item.text,
      field: item.field,
      testData: item.testData || '',
      height: isQr ? 50 : isBar ? 35 : 16,
      width: isQr ? 50 : isBar ? 140 : 200,
      fontSize: 10,
      ...(isQr ? { hideTitle: true, textType: 'qrcode', qrcodeLevel: 1 } : {}),
      ...(isBar
        ? {
            hideTitle: true,
            textType: 'barcode',
            barcodeMode: 'CODE128',
            barAutoWidth: true,
          }
        : {}),
    },
    printElementType: {
      ...typeMeta(isQr ? 'qrcode' : isBar ? 'barcode' : 'dynamicText'),
    },
  };
}

/**
 * 表格打印运行时：按列相同值合并、展示格式、零值显示为空
 * hiprint 会对 rowsColumnsMerge / formatter2 做 eval(源码)，
 * 必须用具名 function（不能 new Function → anonymous），并写成字符串以免 JSON 克隆丢掉
 */
import {
  createColumnFormatterSrc,
  tableSummaryDecimals,
} from './format-print-value';
import {
  listLeafTableCells,
  normalizePrintAlign,
  toTableColumnRows,
} from './print-element-meta';
import { evalPrintExpr } from './print-expr';
import { applyAgreeFootersRuntime } from './print-table-footer';

/**
 * 格子是否视为空（空并左 / 隐零共用）
 * @param row 当前数据行
 * @param field 列 field
 * @param hideZero 0 当空
 */
export function isPrintCellEmpty(
  row: null | Record<string, unknown> | undefined,
  field: string,
  hideZero: boolean,
) {
  if (!field) return true;
  const value = row?.[field];
  if (value === null || value === undefined) return true;
  const str = String(value).trim();
  if (str === '' || str === '—') return true;
  if (hideZero) {
    if (typeof value === 'number' && value === 0) return true;
    if (String(value).trim() !== '' && Number(value) === 0) return true;
  }
  return false;
}

/**
 * 读行上的约定 colspan；长度或总和对不上则视为无效
 * @param row 数据行
 * @param leafCount 叶子列数
 */
export function readRowHMerge(
  row: null | Record<string, unknown> | undefined,
  leafCount: number,
) {
  const raw = row?.agreeHMerge;
  if (!Array.isArray(raw) || raw.length !== leafCount || leafCount <= 0) {
    return null;
  }
  const spans = raw.map((n) => Math.max(0, Math.floor(Number(n) || 0)));
  const sum = spans.reduce((s, n) => s + n, 0);
  return sum === leafCount ? spans : null;
}

/**
 * 一行的横向 colspan：行上 agreeHMerge 优先，否则「空并左」
 * @param row 当前数据行
 * @param leafFields 叶子列 field
 * @param hMergeEmpty 各列是否空并左
 * @param hideZero 各列是否隐零（0 当空）
 */
export function computeRowHColSpans(
  row: null | Record<string, unknown> | undefined,
  leafFields: string[],
  hMergeEmpty: boolean[],
  hideZero: boolean[],
) {
  const n = leafFields.length;
  const custom = readRowHMerge(row as Record<string, unknown>, n);
  if (custom) return custom;
  const spans = Array.from({ length: n }, () => 1);
  for (let ci = 1; ci < n; ci += 1) {
    if (!hMergeEmpty[ci]) continue;
    const field = leafFields[ci] || '';
    if (!isPrintCellEmpty(row, field, Boolean(hideZero[ci]))) continue;
    let left = ci - 1;
    while (left >= 0 && spans[left] === 0) left -= 1;
    if (left < 0) continue;
    spans[left] = (spans[left] ?? 0) + (spans[ci] ?? 1);
    spans[ci] = 0;
  }
  return spans;
}

/**
 * 格子所属起始列（被吃掉的格往左找主人）
 * @param spans 一行 colspan
 * @param colIndex 叶子列下标
 */
export function ownerLeafCol(spans: number[], colIndex: number) {
  let i = Math.min(Math.max(0, colIndex), Math.max(0, spans.length - 1));
  while (i > 0 && (spans[i] ?? 0) === 0) i -= 1;
  return i;
}

/**
 * 把 from～to 列合成一格（只改这一行的 spans）
 * @param spans 当前 colspan
 * @param fromCol 起点列
 * @param toCol 终点列
 */
export function mergeLeafHSpans(
  spans: number[],
  fromCol: number,
  toCol: number,
) {
  const next = [...spans];
  if (next.length === 0) return next;
  const a = Math.min(fromCol, toCol);
  const b = Math.max(fromCol, toCol);
  const left = ownerLeafCol(next, a);
  const right = ownerLeafCol(next, b);
  if (left === right) return next;
  let sum = 0;
  for (let i = left; i <= right; i += 1) sum += next[i] ?? 0;
  next[left] = sum;
  for (let i = left + 1; i <= right; i += 1) next[i] = 0;
  return next;
}

/**
 * 拆开一格为若干 colspan=1
 * @param spans 当前 colspan
 * @param colIndex 点中的列（可以是被合并进去的列）
 */
export function splitLeafHSpan(spans: number[], colIndex: number) {
  const next = [...spans];
  const start = ownerLeafCol(next, colIndex);
  const n = next[start] ?? 1;
  if (n <= 1) return next;
  for (let i = 0; i < n && start + i < next.length; i += 1) next[start + i] = 1;
  return next;
}

/** 模板上保存的表体横合：按行特征匹配，保存后附件一预览也能用 */
export type AgreeBodyHMergeRule = {
  /** 样例行下标，when 对不上时按此套 */
  rowIndex: number;
  /** 叶子列 colspan */
  spans: number[];
  /** 用 name / address / certNo 等匹配真实行 */
  when?: Record<string, string>;
};

/** 用来识别一行的字段，避免只靠行号 */
const BODY_HMERGE_WHEN_FIELDS = ['id', 'name', 'address', 'certNo'] as const;

/**
 * 从数据行抽出匹配条件
 * @param row 样例或业务行
 */
export function buildBodyHMergeWhen(row: Record<string, unknown>) {
  const when: Record<string, string> = {};
  for (const field of BODY_HMERGE_WHEN_FIELDS) {
    const value = String(row[field] ?? '').trim();
    if (value && value !== '—') when[field] = value;
  }
  return when;
}

/**
 * 规则 when 是否对上这一行
 * @param when 规则条件
 * @param row 数据行
 */
function ruleWhenMatches(
  when: Record<string, string> | undefined,
  row: Record<string, unknown>,
) {
  if (!when) return false;
  const keys = Object.keys(when);
  if (keys.length === 0) return false;
  return keys.every((k) => String(row[k] ?? '').trim() === when[k]);
}

/**
 * 规范化模板里的 agreeBodyHMerges
 * @param raw options.agreeBodyHMerges
 * @param leafCount 叶子列数
 */
export function normalizeAgreeBodyHMerges(
  raw: unknown,
  leafCount: number,
): AgreeBodyHMergeRule[] {
  if (!Array.isArray(raw) || leafCount <= 0) return [];
  const out: AgreeBodyHMergeRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (!Array.isArray(rec.spans) || rec.spans.length !== leafCount) continue;
    const spans = rec.spans.map((n) => Math.max(0, Math.floor(Number(n) || 0)));
    const sum = spans.reduce((s, n) => s + n, 0);
    if (sum !== leafCount) continue;
    const whenBag =
      rec.when && typeof rec.when === 'object' && !Array.isArray(rec.when)
        ? (rec.when as Record<string, unknown>)
        : {};
    const when: Record<string, string> = {};
    for (const [k, v] of Object.entries(whenBag)) {
      const s = String(v ?? '').trim();
      if (k && s) when[k] = s;
    }
    const rowIndex = Math.floor(Number(rec.rowIndex));
    out.push({
      rowIndex: Number.isFinite(rowIndex) && rowIndex >= 0 ? rowIndex : -1,
      spans,
      ...(Object.keys(when).length > 0 ? { when } : {}),
    });
  }
  return out;
}

/**
 * 写入或更新某一行的模板横合
 * @param rules 已有规则
 * @param rowIndex 行下标
 * @param row 该行数据（抽 when）
 * @param spans 新 colspan
 */
export function upsertAgreeBodyHMerge(
  rules: AgreeBodyHMergeRule[],
  rowIndex: number,
  row: Record<string, unknown>,
  spans: number[],
): AgreeBodyHMergeRule[] {
  const when = buildBodyHMergeWhen(row);
  const next = normalizeAgreeBodyHMerges(rules, spans.length);
  const hit = next.findIndex(
    (r) =>
      (Object.keys(when).length > 0 && ruleWhenMatches(r.when, row)) ||
      r.rowIndex === rowIndex,
  );
  const rule: AgreeBodyHMergeRule = {
    rowIndex,
    spans: [...spans],
    ...(Object.keys(when).length > 0 ? { when } : {}),
  };
  if (hit === -1) {
    next.push(rule);
  } else {
    next[hit] = rule;
  }
  return next;
}

/**
 * 去掉某一行的模板横合
 * @param rules 已有规则
 * @param rowIndex 行下标
 * @param row 该行数据
 * @param leafCount 叶子列数
 */
export function removeAgreeBodyHMerge(
  rules: AgreeBodyHMergeRule[],
  rowIndex: number,
  row: Record<string, unknown>,
  leafCount: number,
): AgreeBodyHMergeRule[] {
  const when = buildBodyHMergeWhen(row);
  return normalizeAgreeBodyHMerges(rules, leafCount).filter(
    (r) =>
      !(
        (Object.keys(when).length > 0 && ruleWhenMatches(r.when, row)) ||
        r.rowIndex === rowIndex
      ),
  );
}

/**
 * 把模板横合套到打印行上（行上已有合法 agreeHMerge 则不覆盖）
 * @param rows 表格数据
 * @param rules 模板规则
 * @param leafCount 叶子列数
 */
export function applyAgreeBodyHMergesToRows(
  rows: Record<string, unknown>[],
  rules: unknown,
  leafCount: number,
) {
  const list = normalizeAgreeBodyHMerges(rules, leafCount);
  if (list.length === 0) return rows;
  const used = new Set<number>();
  return rows.map((row, ri) => {
    if (readRowHMerge(row, leafCount)) return row;
    let hit = -1;
    for (let i = 0; i < list.length; i += 1) {
      if (used.has(i)) continue;
      if (ruleWhenMatches(list[i]?.when, row)) {
        hit = i;
        break;
      }
    }
    if (hit < 0) {
      for (let i = 0; i < list.length; i += 1) {
        if (used.has(i)) continue;
        if (list[i]?.rowIndex === ri) {
          hit = i;
          break;
        }
      }
    }
    if (hit < 0) return row;
    used.add(hit);
    const spans = list[hit]?.spans;
    if (!spans) return row;
    return { ...row, agreeHMerge: [...spans] };
  });
}

/** 表体矩形合并规则：允许横向、纵向或同时跨行跨列 */
export type AgreeBodyCellMergeRule = {
  colspan: number;
  rowspan: number;
  startCol: number;
  startRow: number;
  /** 用起始行特征匹配真实数据，失败时回退 startRow */
  when?: Record<string, string>;
};

export function normalizeAgreeBodyCellMerges(
  raw: unknown,
  leafCount: number,
): AgreeBodyCellMergeRule[] {
  if (!Array.isArray(raw) || leafCount <= 0) return [];
  const result: AgreeBodyCellMergeRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const startRow = Math.max(0, Math.floor(Number(rec.startRow) || 0));
    const startCol = Math.max(0, Math.floor(Number(rec.startCol) || 0));
    const rowspan = Math.max(1, Math.floor(Number(rec.rowspan) || 1));
    const colspan = Math.min(
      leafCount - startCol,
      Math.max(1, Math.floor(Number(rec.colspan) || 1)),
    );
    if (startCol >= leafCount || (rowspan === 1 && colspan === 1)) continue;
    const whenBag =
      rec.when && typeof rec.when === 'object' && !Array.isArray(rec.when)
        ? (rec.when as Record<string, unknown>)
        : {};
    const when: Record<string, string> = {};
    for (const [key, value] of Object.entries(whenBag)) {
      const text = String(value ?? '').trim();
      if (key && text) when[key] = text;
    }
    result.push({
      colspan,
      rowspan,
      startCol,
      startRow,
      ...(Object.keys(when).length > 0 ? { when } : {}),
    });
  }
  return result;
}

function bodyMergeRectanglesOverlap(
  left: AgreeBodyCellMergeRule,
  right: AgreeBodyCellMergeRule,
) {
  return !(
    left.startRow + left.rowspan <= right.startRow ||
    right.startRow + right.rowspan <= left.startRow ||
    left.startCol + left.colspan <= right.startCol ||
    right.startCol + right.colspan <= left.startCol
  );
}

export function upsertAgreeBodyCellMerge(
  rules: AgreeBodyCellMergeRule[],
  rule: Omit<AgreeBodyCellMergeRule, 'when'>,
  startRowData: Record<string, unknown>,
  leafCount: number,
) {
  const nextRule: AgreeBodyCellMergeRule = {
    ...rule,
    when: buildBodyHMergeWhen(startRowData),
  };
  const normalized = normalizeAgreeBodyCellMerges(rules, leafCount).filter(
    (item) => !bodyMergeRectanglesOverlap(item, nextRule),
  );
  return [...normalized, nextRule];
}

export function removeAgreeBodyCellMergeAt(
  rules: AgreeBodyCellMergeRule[],
  rowIndex: number,
  colIndex: number,
  leafCount: number,
) {
  return normalizeAgreeBodyCellMerges(rules, leafCount).filter(
    (item) =>
      !(
        rowIndex >= item.startRow &&
        rowIndex < item.startRow + item.rowspan &&
        colIndex >= item.startCol &&
        colIndex < item.startCol + item.colspan
      ),
  );
}

/** 表体中某一指定格的计算规则；按行特征优先定位，行号仅作为兜底。 */
export type AgreeBodyCellExprRule = {
  /** 目标叶子列下标，兼容旧字段改名 */
  colIndex: number;
  /** 公式，使用与逐行列公式相同的安全表达式 DSL */
  expr: string;
  /** 目标叶子列（列调整后仍优先按 field 对齐） */
  field: string;
  /** 样例行下标；when 不匹配时作为回退 */
  rowIndex: number;
  /** 用 id / name / address / certNo 匹配真实数据行 */
  when?: Record<string, string>;
};

/** 规范化表体单格公式，丢弃不存在列或空表达式的规则。 */
export function normalizeAgreeBodyCellExprs(
  raw: unknown,
  leafFields: string[],
): AgreeBodyCellExprRule[] {
  if (!Array.isArray(raw) || leafFields.length === 0) return [];
  const fields = new Set(leafFields.filter(Boolean));
  const result: AgreeBodyCellExprRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const colIndex = Math.max(0, Math.floor(Number(rec.colIndex) || 0));
    const field = String(rec.field || leafFields[colIndex] || '').trim();
    const expr = String(rec.expr || '').trim();
    if (!field || !fields.has(field) || !expr) continue;
    const whenBag =
      rec.when && typeof rec.when === 'object' && !Array.isArray(rec.when)
        ? (rec.when as Record<string, unknown>)
        : {};
    const when: Record<string, string> = {};
    for (const [key, value] of Object.entries(whenBag)) {
      const text = String(value ?? '').trim();
      if (key && text) when[key] = text;
    }
    result.push({
      colIndex,
      expr,
      field,
      rowIndex: Math.max(0, Math.floor(Number(rec.rowIndex) || 0)),
      ...(Object.keys(when).length > 0 ? { when } : {}),
    });
  }
  return result;
}

/** 写入单格公式；同一行、同一字段的旧规则会被替换。 */
export function upsertAgreeBodyCellExpr(
  rules: AgreeBodyCellExprRule[],
  rule: Omit<AgreeBodyCellExprRule, 'when'>,
  row: Record<string, unknown>,
  leafFields: string[],
) {
  const when = buildBodyHMergeWhen(row);
  const nextRule: AgreeBodyCellExprRule = { ...rule, when };
  const normalized = normalizeAgreeBodyCellExprs(rules, leafFields).filter(
    (item) =>
      !(
        item.field === nextRule.field &&
        ((Object.keys(when).length > 0 && ruleWhenMatches(item.when, row)) ||
          item.rowIndex === nextRule.rowIndex)
      ),
  );
  return [...normalized, nextRule];
}

/**
 * 对指定表体格覆盖计算结果。先跑逐行列公式，再执行本规则，故单格公式可覆盖该列默认公式。
 */
export function applyAgreeBodyCellExprsToRows(
  rows: Record<string, unknown>[],
  rules: unknown,
  leafFields: string[],
  rootCtx: Record<string, unknown>,
) {
  const list = normalizeAgreeBodyCellExprs(rules, leafFields);
  if (list.length === 0) return rows;
  let next = rows;
  for (const rule of list) {
    let rowIndex = rule.rowIndex;
    if (rule.when && !ruleWhenMatches(rule.when, next[rowIndex] || {})) {
      const matched = next.findIndex((row) => ruleWhenMatches(rule.when, row));
      if (matched !== -1) rowIndex = matched;
    }
    const row = next[rowIndex];
    if (!row) continue;
    const patched = { ...row };
    patched[rule.field] = evalPrintExpr(
      rule.expr,
      { ...rootCtx, ...patched, i: rowIndex, index: rowIndex, row: patched },
      { silent: true },
    );
    if (next === rows) next = [...rows];
    next[rowIndex] = patched;
  }
  return next;
}

/** 把矩形合并编译为每行每列的 [rowspan, colspan]，供画布和 hiprint 共用 */
export function applyAgreeBodyCellMergesToRows(
  rows: Record<string, unknown>[],
  rules: unknown,
  leafCount: number,
) {
  const normalized = normalizeAgreeBodyCellMerges(rules, leafCount);
  if (normalized.length === 0) return rows;
  const matrix: ([number, number] | null)[][] = rows.map(() =>
    Array.from({ length: leafCount }, () => null),
  );
  for (const rule of normalized) {
    let startRow = rule.startRow;
    if (rule.when && !ruleWhenMatches(rule.when, rows[startRow] || {})) {
      const matched = rows.findIndex((row) => ruleWhenMatches(rule.when, row));
      if (matched !== -1) startRow = matched;
    }
    if (startRow < 0 || startRow >= rows.length) continue;
    const rowEnd = Math.min(rows.length, startRow + rule.rowspan);
    const colEnd = Math.min(leafCount, rule.startCol + rule.colspan);
    for (let rowIndex = startRow; rowIndex < rowEnd; rowIndex += 1) {
      const matrixRow = matrix[rowIndex];
      if (!matrixRow) continue;
      for (let colIndex = rule.startCol; colIndex < colEnd; colIndex += 1) {
        matrixRow[colIndex] = [0, 0];
      }
    }
    const startMatrixRow = matrix[startRow];
    if (startMatrixRow) {
      startMatrixRow[rule.startCol] = [
        rowEnd - startRow,
        colEnd - rule.startCol,
      ];
    }
  }
  return rows.map((row, rowIndex) => {
    const cells = matrix[rowIndex];
    return cells?.some(Boolean) ? { ...row, agreeCellMerges: cells } : row;
  });
}

/**
 * 按模板表格把 agreeBodyHMerges 写进对应 printData 数组
 * @param template 模板 JSON
 * @param printData 业务/样例数据
 */
export function applyAgreeBodyHMergesToPrintData(
  template: Record<string, any>,
  printData: Record<string, unknown>,
) {
  for (const panel of template.panels || []) {
    for (const el of panel.printElements || []) {
      if (el?.printElementType?.type !== 'table') continue;
      const field = String(el.options?.field || '').trim();
      if (!field) continue;
      const rows = printData[field];
      if (!Array.isArray(rows)) continue;
      const leafCount = listLeafTableCells(el.options?.columns).length;
      const withHorizontal = applyAgreeBodyHMergesToRows(
        rows as Record<string, unknown>[],
        el.options?.agreeBodyHMerges,
        leafCount,
      );
      printData[field] = applyAgreeBodyCellMergesToRows(
        withHorizontal,
        el.options?.agreeBodyCellMerges,
        leafCount,
      );
    }
  }
  return printData;
}

/**
 * 生成表体合并函数源码：上下相同值 rowspan + 空并左 colspan
 * hiprint 实参是 (行数据, 列定义, 列下标, 行下标, 表数据, printData)
 * 返回 [rowspan, colspan]；被吃掉的格返回 [0, 0]
 * @param leafFields 叶子列 field
 * @param mergeFields 需要上下合并的 field
 * @param hMergeEmpty 各列是否空并左
 * @param hideZero 各列是否隐零
 * @param tableField 表格数据源 key
 */
export function createSameValueMergeSrc(
  leafFields: string[],
  mergeFields: string[],
  hMergeEmpty: boolean[],
  hideZero: boolean[],
  tableField: string,
) {
  return `function rowsColumnsMerge(data, col, colIndex, rowIndex, tableData, printData) {
    var fields = ${JSON.stringify(leafFields)};
    var mergeFields = ${JSON.stringify(mergeFields)};
    var hMergeEmpty = ${JSON.stringify(hMergeEmpty)};
    var hideZero = ${JSON.stringify(hideZero)};
    var tableField = ${JSON.stringify(tableField)};
    var list = [];
    if (tableData && tableData.length > 0) {
      list = tableData;
    } else if (printData && tableField && printData[tableField]) {
      list = printData[tableField];
    }
    var row = (list && list[rowIndex]) || data || {};
    var explicit = row.agreeCellMerges;
    if (explicit && explicit[colIndex] && explicit[colIndex].length === 2) {
      return [Number(explicit[colIndex][0]) || 0, Number(explicit[colIndex][1]) || 0];
    }
    var hSpans = null;
    var custom = row.agreeHMerge;
    var i;
    if (custom && custom.length === fields.length) {
      var sum = 0;
      hSpans = [];
      for (i = 0; i < fields.length; i += 1) {
        var cv = Math.max(0, Number(custom[i]) || 0);
        hSpans[i] = cv;
        sum += cv;
      }
      if (sum !== fields.length) hSpans = null;
    }
    if (!hSpans) {
      hSpans = [];
      for (i = 0; i < fields.length; i += 1) hSpans[i] = 1;
      for (i = 1; i < fields.length; i += 1) {
        if (!hMergeEmpty[i]) continue;
        var hf = fields[i] || '';
        var hv = row[hf];
        var empty = !hf || hv == null || String(hv).trim() === '' || String(hv).trim() === '—';
        if (!empty && hideZero[i]) {
          if (typeof hv === 'number' && hv === 0) empty = true;
          else if (String(hv).trim() !== '' && Number(hv) === 0) empty = true;
        }
        if (!empty) continue;
        var left = i - 1;
        while (left >= 0 && hSpans[left] === 0) left -= 1;
        if (left < 0) continue;
        hSpans[left] += hSpans[i];
        hSpans[i] = 0;
      }
    }
    var h = hSpans[colIndex];
    if (h === 0) return [0, 0];
    if (h > 1) return [1, h];
    var field = (col && col.field) ? col.field : fields[colIndex];
    if (!field || mergeFields.indexOf(field) < 0) return [1, 1];
    if (!list || !list.length) return [1, 1];
    var key = data && data[field] != null ? String(data[field]).trim() : '';
    if (!key) return [1, 1];
    var start = rowIndex;
    while (start > 0) {
      var prev = list[start - 1];
      var prevKey = prev && prev[field] != null ? String(prev[field]).trim() : '';
      if (prevKey !== key) break;
      start -= 1;
    }
    if (start !== rowIndex) return [0, 0];
    var span = 1;
    while (rowIndex + span < list.length) {
      var nextRow = list[rowIndex + span];
      var nextKey = nextRow && nextRow[field] != null ? String(nextRow[field]).trim() : '';
      if (nextKey !== key) break;
      span += 1;
    }
    return [span, 1];
  }`;
}

/**
 * 把源码变成具名函数；失败则退回字符串给 hiprint 自行 eval
 * @param src function rowsColumnsMerge(...) { ... }
 */
export function evalNamedMergeFn(src: string) {
  try {
    // 打印引擎只认具名函数源码，需按字符串求值（非任意用户代码）
    // oxlint-disable-next-line eslint/no-eval
    return eval(`(${src})`) as (
      data: unknown,
      col: Record<string, unknown>,
      colIndex: number,
      rowIndex: number,
      tableData: unknown[],
      printData: Record<string, unknown>,
    ) => [number, number];
  } catch {
    return src;
  }
}

/**
 * 给叶子列挂 formatter2（展示格式 + 隐零），合计仍用原始数字
 * @param columns hiprint columns
 */
export function applyColumnFormatters(columns: unknown) {
  const rows = toTableColumnRows(columns);
  for (const leaf of listLeafTableCells(columns)) {
    const format = String(leaf.agreeColFormat || '').trim();
    if (!format && !leaf.agreeHideZero) continue;
    const cell = rows[leaf.rowIndex]?.[leaf.cellIndex];
    if (!cell) continue;
    /** hiprint getColumnFormatter 只 eval formatter2，formatter 当字符串会调用失败 */
    cell.formatter2 = createColumnFormatterSrc(format, leaf.agreeHideZero);
    delete cell.formatter;
    const decimals = tableSummaryDecimals(format);
    if (decimals !== undefined && cell.tableSummary) {
      cell.tableSummaryNumFormat = decimals;
    }
  }
}

/**
 * 把叶子列 align 写成 left/center/right，供 hiprint td[align] 使用
 * @param columns options.columns
 */
function applyColumnAligns(columns: unknown) {
  const rows = toTableColumnRows(columns);
  for (const leaf of listLeafTableCells(columns)) {
    const cell = rows[leaf.rowIndex]?.[leaf.cellIndex];
    if (!cell) continue;
    cell.align = normalizePrintAlign(cell.align);
  }
}

/**
 * 按列开关注入合并函数和列 formatter2
 * 始终挂 rowsColumnsMerge，以便行上 agreeHMerge 在未开「空并左」时也能生效
 * @param el 表格元素
 */
export function applyTablePrintRuntime(el: { options?: Record<string, any> }) {
  const opts = el?.options;
  if (!opts) return;
  /** 兼容旧模板：跨页续表必须重复表头，表尾只在最后一页出现。 */
  opts.tableHeaderRepeat = 'page';
  opts.tableFooterRepeat = 'last';
  const tableField = String(opts.field || '');
  const leaf = listLeafTableCells(opts.columns);
  const leafFields = leaf.map((c) => c.field);
  const hMergeEmpty = leaf.map((c) => Boolean(c.agreeHMergeEmpty));
  const hideZero = leaf.map((c) => Boolean(c.agreeHideZero));
  let mergeFields = leaf
    .filter((c) => c.agreeMergeSame && c.field)
    .map((c) => c.field);
  if (
    mergeFields.length === 0 &&
    tableField === 'houses' &&
    leafFields.includes('householdName')
  ) {
    mergeFields = ['householdName'];
  }
  const needMerge = true;
  if (needMerge) {
    /** 必须是具名函数源码字符串：引擎会 eval，JSON 克隆也不会丢掉 */
    opts.rowsColumnsMerge = createSameValueMergeSrc(
      leafFields,
      mergeFields,
      hMergeEmpty,
      hideZero,
      tableField,
    );
  }
  applyColumnAligns(opts.columns);
  applyColumnFormatters(opts.columns);
  applyAgreeFootersRuntime(opts, leaf.length);
}

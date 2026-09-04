/**
 * 表格表尾行：结构 colspan（与「相同值合并」无关）
 * 存 options.agreeFooters，打印前编译成 hiprint footerFormatter
 */

/** 表尾一格 */
export type AgreeFooterCell = {
  align?: 'center' | 'left' | 'right';
  /** 横向合并列数，>=1 */
  colspan: number;
  /** 从 printData 根级取值（如 amount）；空串表示不用 */
  field?: string;
  /** 静态文案 */
  text?: string;
};

/** 表尾一行 */
export type AgreeFooterRow = {
  cells: AgreeFooterCell[];
};

/**
 * 叶子列数 → 一行「每格 colspan=1」的默认表尾
 * @param leafCount 数据列数
 */
export function createEmptyFooterRow(leafCount: number): AgreeFooterRow {
  const n = Math.max(1, leafCount);
  return {
    cells: Array.from({ length: n }, () => ({
      text: '',
      colspan: 1,
      align: 'left' as const,
    })),
  };
}

/**
 * 一行占用的总列数
 * @param row 表尾行
 */
export function footerRowSpanTotal(row: AgreeFooterRow) {
  return row.cells.reduce((s, c) => s + Math.max(1, Number(c.colspan) || 1), 0);
}

/**
 * 规范化表尾：补齐/截断到叶子列数
 * @param rows 原始表尾
 * @param leafCount 叶子列数
 */
export function normalizeAgreeFooters(
  rows: AgreeFooterRow[] | null | undefined,
  leafCount: number,
): AgreeFooterRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const target = Math.max(1, leafCount);
  return rows.map((row) => {
    const cells = (row.cells || []).map((c) => ({
      text: String(c.text ?? ''),
      field: String(c.field ?? '').trim(),
      colspan: Math.max(1, Number(c.colspan) || 1),
      align:
        c.align === 'center' || c.align === 'right'
          ? c.align
          : ('left' as const),
    }));
    let total = cells.reduce((s, c) => s + c.colspan, 0);
    while (total < target) {
      cells.push({ text: '', field: '', colspan: 1, align: 'left' });
      total += 1;
    }
    while (total > target && cells.length > 0) {
      const last = cells.at(-1);
      if (!last) break;
      if (last.colspan > 1 && total - 1 >= target) {
        last.colspan -= 1;
        total -= 1;
      } else if (cells.length > 1) {
        total -= last.colspan;
        cells.pop();
      } else {
        last.colspan = target;
        total = target;
      }
    }
    return { cells };
  });
}

/**
 * 合并一行里连续格子 [fromIndex, toIndex]（含）
 * @param row 表尾行
 * @param fromIndex 起点格下标
 * @param toIndex 终点格下标
 */
export function mergeFooterCells(
  row: AgreeFooterRow,
  fromIndex: number,
  toIndex: number,
): AgreeFooterRow {
  const a = Math.min(fromIndex, toIndex);
  const b = Math.max(fromIndex, toIndex);
  if (a < 0 || b >= row.cells.length || a === b) {
    return { cells: row.cells.map((c) => ({ ...c })) };
  }
  const cells = row.cells.map((c) => ({ ...c }));
  let span = 0;
  for (let i = a; i <= b; i += 1) {
    const cell = cells[i];
    if (!cell) continue;
    span += Math.max(1, cell.colspan);
  }
  const keep = cells[a];
  if (!keep) return { cells: row.cells.map((c) => ({ ...c })) };
  keep.colspan = span;
  cells.splice(a + 1, b - a);
  return { cells };
}

/**
 * 拆分一格为若干 colspan=1
 * @param row 表尾行
 * @param cellIndex 格子下标
 */
export function splitFooterCell(
  row: AgreeFooterRow,
  cellIndex: number,
): AgreeFooterRow {
  const cells = row.cells.map((c) => ({ ...c }));
  const cell = cells[cellIndex];
  if (!cell || cell.colspan <= 1) return { cells };
  const n = cell.colspan;
  cell.colspan = 1;
  const extras: AgreeFooterCell[] = Array.from({ length: n - 1 }, () => ({
    text: '',
    colspan: 1,
    align: cell.align || 'left',
  }));
  cells.splice(cellIndex + 1, 0, ...extras);
  return { cells };
}

/**
 * 编译 hiprint footerFormatter 源码（具名 function，引擎会 eval）
 * 实参常见为 (options, rows, optionsColumn) 或带 printData；用 printData 回填 field
 * @param footers 表尾行
 */
export function createFooterFormatterSrc(footers: AgreeFooterRow[]) {
  const rows = footers.map((row) =>
    row.cells.map((c) => ({
      text: String(c.text ?? ''),
      field: String(c.field ?? '').trim(),
      colspan: Math.max(1, Number(c.colspan) || 1),
      align: c.align === 'center' || c.align === 'right' ? c.align : 'left',
    })),
  );
  return `function footerFormatter(options, rows, optionsColumn, printData) {
    var footers = ${JSON.stringify(rows)};
    var html = '';
    for (var ri = 0; ri < footers.length; ri++) {
      var cells = footers[ri];
      html += '<tr>';
      for (var ci = 0; ci < cells.length; ci++) {
        var cell = cells[ci];
        var text = cell.text || '';
        if (cell.field && printData && printData[cell.field] != null) {
          text = String(printData[cell.field]);
        }
        html += '<td colspan="' + cell.colspan + '" style="text-align:' + cell.align + ';padding:0 4pt;border:1px solid #000;">' + text + '</td>';
      }
      html += '</tr>';
    }
    return html;
  }`;
}

/**
 * 给表格 options 挂上 footerFormatter；无表尾则删除
 * @param opts 表格 options
 * @param leafCount 叶子列数
 */
export function applyAgreeFootersRuntime(
  opts: Record<string, any>,
  leafCount: number,
) {
  const normalized = normalizeAgreeFooters(opts.agreeFooters, leafCount);
  if (normalized.length === 0) {
    delete opts.footerFormatter;
    return;
  }
  opts.agreeFooters = normalized;
  opts.footerFormatter = createFooterFormatterSrc(normalized);
}

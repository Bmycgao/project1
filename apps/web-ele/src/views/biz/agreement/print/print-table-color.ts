import { listLeafTableCells, toTableColumnRows } from './print-element-meta';
import { evalPrintExpr } from './print-expr';

/** Only accept a single CSS color, never arbitrary declarations or HTML. */
export function normalizeTableColor(value: unknown): string {
  const color = String(value || '').trim();
  return /^(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(
    color,
  )
    ? color
    : '';
}

export function resolveTableCellColor(
  column: Record<string, any>,
  row: Record<string, unknown>,
  root: Record<string, unknown> = {},
) {
  const conditionColor = normalizeTableColor(column.agreeConditionColor);
  if (
    conditionColor &&
    column.agreeColorWhen &&
    evalPrintExpr(
      String(column.agreeColorWhen),
      { ...root, ...row, row, value: row[String(column.field || '')] },
      { silent: true },
    )
  )
    return conditionColor;
  return normalizeTableColor(column.agreeColor);
}

export function applyTableColorMeta(
  rows: Record<string, unknown>[],
  columns: unknown,
  root: Record<string, unknown>,
): Record<string, unknown>[] {
  const leaves = listLeafTableCells(columns);
  if (
    !leaves.some(
      (col) =>
        col.agreeColor || (col.agreeColorWhen && col.agreeConditionColor),
    )
  )
    return rows;
  return rows.map((row) => ({
    ...row,
    __agreeCellColors: leaves.map((col) =>
      resolveTableCellColor(col, row, root),
    ),
  }));
}

function colorStyler(previous: unknown, expression: string) {
  const source =
    typeof previous === 'string' || typeof previous === 'function'
      ? String(previous)
      : '';
  return `function agreeColorStyler(value, row, index, options) {
    var style = {};
    ${source ? `try { style = (${source}).apply(this, arguments) || {}; } catch (error) {}` : ''}
    var color = ${expression};
    if (color) style.color = color;
    return style;
  }`;
}

/** Compiled after data calculations. Native column stylers survive engine initialization and PDF cloning. */
export function applyTableColorsRuntime(options: Record<string, any>) {
  const rows = toTableColumnRows(options.columns);
  const base = normalizeTableColor(options.color);
  for (const row of rows)
    for (const cell of row) {
      const color = normalizeTableColor(cell.agreeHeaderColor) || base;
      if (color)
        cell.stylerHeader = colorStyler(
          cell.stylerHeader,
          JSON.stringify(color),
        );
    }
  listLeafTableCells(rows).forEach((leaf, index) => {
    const cell = rows[leaf.rowIndex]?.[leaf.cellIndex];
    if (!cell || (!base && !leaf.agreeColor && !leaf.agreeConditionColor))
      return;
    cell.styler2 = colorStyler(
      cell.styler2 || cell.styler,
      `(row && row.__agreeCellColors && row.__agreeCellColors[${index}]) || ${JSON.stringify(normalizeTableColor(leaf.agreeColor) || base)}`,
    );
  });
}

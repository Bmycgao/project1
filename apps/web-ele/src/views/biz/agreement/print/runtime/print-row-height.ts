import { requireDefined } from '../../../../../../../shared/require-defined';

/** HTML 表格行的 height 是最小占位，内容换行仍可撑高整行。 */
export function minimumRowHeight(value: unknown, fallback = 18) {
  const height = Number(value);
  return Number.isFinite(height) && height > 0 ? height : fallback;
}

export function headerRowHeight(options: Record<string, any>, row: number) {
  return minimumRowHeight(
    options.agreeHeaderRowHeights?.[row],
    minimumRowHeight(options.tableHeaderRowHeight),
  );
}

function snapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => snapshot(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            key !== 'index' &&
            !key.startsWith('__') &&
            !['agreeCellMerges', 'agreeHMerge'].includes(key),
        )
        .toSorted(([a], [b]) => {
          let keyOrder;
          if (a < b) {
            keyOrder = -1;
          } else {
            keyOrder = a > b ? 1 : 0;
          }
          return keyOrder;
        })
        .map(([key, item]) => [key, snapshot(item)]),
    );
  }
  return value;
}

/** 在公式、排序、筛选及序号重排前定位原始记录；重复内容绝不回退到行号。 */
export function identifyPrintRows(
  rows: Record<string, unknown>[],
): Array<Record<string, unknown> & { __agreeRowKey?: string }> {
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    .filter((field) => /^(?:id|uuid|key)$|(?:Id|ID|_id)$/.test(field))
    .toSorted((a, b) => {
      let fieldOrder;
      if (a === 'id') {
        fieldOrder = -1;
      } else {
        fieldOrder = b === 'id' ? 1 : a.localeCompare(b);
      }
      return fieldOrder;
    });
  const valueKey = (value: unknown) =>
    (typeof value === 'string' && value.trim()) ||
    (typeof value === 'number' && Number.isFinite(value))
      ? JSON.stringify(value)
      : null;
  const counts = fields.map((field) => {
    const count = new Map<string, number>();
    rows.forEach((row) => {
      const key = valueKey(row[field]);
      if (key !== null) count.set(key, (count.get(key) || 0) + 1);
    });
    return count;
  });
  const contents = rows.map((row) =>
    JSON.stringify(['content', snapshot(row)]),
  );
  const contentCounts = new Map<string, number>();
  contents.forEach((key) =>
    contentCounts.set(key, (contentCounts.get(key) || 0) + 1),
  );
  return rows.map((row, index) => {
    const fieldIndex = fields.findIndex((field, i) => {
      const key = valueKey(row[field]);
      return key !== null && counts[i]?.get(key) === 1;
    });
    const field = fields[fieldIndex];
    let key;
    if (field) {
      key = JSON.stringify(['field', field, row[field]]);
    } else {
      key =
        contentCounts.get(requireDefined(contents[index])) === 1
          ? contents[index]
          : undefined;
    }
    return { ...row, __agreeRowKey: key };
  });
}

export function normalizeRowHeights(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .filter(
        ([key, height]) =>
          key &&
          Number.isFinite(Number(height)) &&
          Number(height) >= 6 &&
          Number(height) <= 600,
      )
      .map(([key, height]) => [key, Number(height)]),
  );
}

export function rowHeightOverride(
  raw: unknown,
  key: unknown,
): number | undefined {
  if (
    typeof key !== 'string' ||
    !key ||
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    !Object.hasOwn(raw, key)
  )
    return undefined;
  const height = Number((raw as Record<string, unknown>)[key]);
  return Number.isFinite(height) && height >= 6 && height <= 600
    ? height
    : undefined;
}

export function setRowHeightOverride(
  raw: unknown,
  key: string,
  height?: number,
) {
  const next = normalizeRowHeights(raw);
  if (height === undefined) Reflect.deleteProperty(next, key);
  else if (Number.isFinite(height) && height >= 6 && height <= 600)
    next[key] = height;
  return next;
}

export function detailRowHeight(
  options: Record<string, any>,
  row: Record<string, unknown>,
) {
  return (
    rowHeightOverride(options.agreeBodyRowHeights, row.__agreeRowKey) ??
    minimumRowHeight(options.tableBodyRowHeight)
  );
}

/** 旧坐标模板也按运行时记录标识应用覆盖，并保留已有行样式函数。 */
export function applyDetailRowHeightRuntime(options: Record<string, any>) {
  const heights = normalizeRowHeights(options.agreeBodyRowHeights);
  if (options.agreeFormGrid || Object.keys(heights).length === 0) return;
  const previous =
    typeof options.rowStyler === 'string' ||
    typeof options.rowStyler === 'function'
      ? String(options.rowStyler)
      : '';
  options.rowStyler = `function agreeDetailRowStyle(row) {
    var style = {};
    ${previous ? `try { style = (${previous}).apply(this, arguments) || {}; } catch (error) {}` : ''}
    var heights = ${JSON.stringify(heights)};
    var key = row && row.__agreeRowKey;
    if (key && Object.prototype.hasOwnProperty.call(heights, key)) style.height = String(heights[key]) + 'pt';
    return style;
  }`;
}

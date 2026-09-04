/**
 * 表格打印运行时：按列相同值合并、展示格式、零值显示为空
 * hiprint 会对 rowsColumnsMerge / formatter2 做 eval(源码)，
 * 必须用具名 function（不能 new Function → anonymous），并写成字符串以免 JSON 克隆丢掉
 */
import {
  createColumnFormatterSrc,
  tableSummaryDecimals,
} from './format-print-value';
import { listLeafTableCells, toTableColumnRows } from './print-element-meta';
import { applyAgreeFootersRuntime } from './print-table-footer';

/**
 * 生成表体 rowspan 合并函数源码（同一列、连续相同、非空才合）
 * hiprint 实参是 (行数据, 列定义, 列下标, 行下标, 表数据, printData)
 * @param leafFields 叶子列 field，下标即 hiprint colIndex
 * @param mergeFields 需要合并的 field
 * @param tableField 表格数据源 key，tableData 为空时回退 printData[tableField]
 */
export function createSameValueMergeSrc(
  leafFields: string[],
  mergeFields: string[],
  tableField: string,
) {
  return `function rowsColumnsMerge(data, col, colIndex, rowIndex, tableData, printData) {
    var fields = ${JSON.stringify(leafFields)};
    var mergeFields = ${JSON.stringify(mergeFields)};
    var tableField = ${JSON.stringify(tableField)};
    var field = (col && col.field) ? col.field : fields[colIndex];
    if (!field || mergeFields.indexOf(field) < 0) return [1, 1];
    var list = [];
    if (tableData && tableData.length > 0) {
      list = tableData;
    } else if (printData && tableField && printData[tableField]) {
      list = printData[tableField];
    }
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
 * 按列开关注入合并函数和列 formatter2
 * 旧房屋表没有 agreeMergeSame 时仍合并户名，避免行为回退
 * @param el 表格元素
 */
export function applyTablePrintRuntime(el: { options?: Record<string, any> }) {
  const opts = el?.options;
  if (!opts) return;
  const tableField = String(opts.field || '');
  const leaf = listLeafTableCells(opts.columns);
  const leafFields = leaf.map((c) => c.field);
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
  if (mergeFields.length > 0) {
    /** 必须是具名函数源码字符串：引擎会 eval，JSON 克隆也不会丢掉 */
    opts.rowsColumnsMerge = createSameValueMergeSrc(
      leafFields,
      mergeFields,
      tableField,
    );
  }
  applyColumnFormatters(opts.columns);
  applyAgreeFootersRuntime(opts, leaf.length);
}

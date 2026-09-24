import { formatPrintValue } from '../data/format-print-value';
import { evalPrintExpr } from './print-expr';

export interface FormGridCell {
  mode: 'field' | 'formula' | 'text';
  value: string;
  format?: string;
  align?: 'center' | 'left' | 'right';
  bold?: boolean;
  colspan?: number;
  rowspan?: number;
}

export interface FormGridRow {
  cells: FormGridCell[];
  /** 空字符串表示固定行；填写数组路径后，本行按数组逐项重复。 */
  source?: string;
  empty?: 'blank' | 'omit';
  height?: number;
}

export interface FormGrid {
  version: 1;
  columns: number[];
  rows: FormGridRow[];
}

export function emptyFormCell(): FormGridCell {
  return { mode: 'text', value: '' };
}

export function createFormGrid(): FormGrid {
  return {
    version: 1,
    columns: [90, 185, 90, 185],
    rows: [
      {
        cells: [
          { mode: 'text', value: '协议编号' },
          { mode: 'field', value: 'agreementNo' },
          { mode: 'text', value: '签约日期' },
          { mode: 'field', value: 'signDate', format: 'date' },
        ],
      },
      {
        cells: [
          { mode: 'text', value: '房屋信息', colspan: 4, bold: true },
          emptyFormCell(),
          emptyFormCell(),
          emptyFormCell(),
        ],
      },
      {
        cells: [
          { mode: 'text', value: '序号' },
          { mode: 'text', value: '房屋地址' },
          { mode: 'text', value: '建筑面积' },
          { mode: 'text', value: '备注' },
        ],
      },
      {
        source: 'houses',
        empty: 'blank',
        cells: [
          { mode: 'formula', value: 'index + 1' },
          { mode: 'field', value: 'row.address' },
          { mode: 'field', value: 'row.buildArea' },
          emptyFormCell(),
        ],
      },
      {
        cells: [
          { mode: 'text', value: '合计（元）' },
          { mode: 'field', value: 'amount', format: 'money', colspan: 3 },
          emptyFormCell(),
          emptyFormCell(),
        ],
      },
    ],
  };
}

/** 数据路径仅允许读取自有属性，避免把字段绑定解释为可执行代码。 */
export function readFormField(root: unknown, path: string): unknown {
  const keys = path
    .trim()
    .replaceAll(/\[(\d+)\]/g, '.$1')
    .split('.');
  let value = root;
  for (const key of keys) {
    if (
      !key ||
      ['__proto__', 'constructor', 'prototype'].includes(key) ||
      value === null ||
      typeof value !== 'object' ||
      !Object.hasOwn(value, key)
    )
      return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export function normalizeFormGrid(raw: unknown): FormGrid {
  const input = (raw || {}) as Partial<FormGrid>;
  const columns =
    Array.isArray(input.columns) && input.columns.length
      ? input.columns.map((width) => Math.max(20, Number(width) || 80))
      : [100, 100, 100, 100];
  const rows = (
    Array.isArray(input.rows) && input.rows.length
      ? input.rows
      : [{ cells: [] }]
  ).map(
    (row): FormGridRow => ({
      source: String(row.source || '').trim(),
      empty: row.empty === 'omit' ? 'omit' : 'blank',
      height: Math.max(18, Number(row.height) || 22),
      cells: columns.map((_, index) => {
        const cell = row.cells?.[index];
        return {
          mode:
            cell?.mode === 'field' || cell?.mode === 'formula'
              ? cell.mode
              : 'text',
          value: String(cell?.value ?? ''),
          format: String(cell?.format || ''),
          align:
            cell?.align === 'center' || cell?.align === 'right'
              ? cell.align
              : 'left',
          bold: cell?.bold === true,
          colspan: Math.max(1, Math.floor(Number(cell?.colspan) || 1)),
          rowspan: Math.max(1, Math.floor(Number(cell?.rowspan) || 1)),
        };
      }),
    }),
  );
  const grid: FormGrid = { version: 1, columns, rows };
  const spans = formGridSpans(grid);
  rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      const span = spans[r]![c]!;
      cell.rowspan = span[0] || 1;
      cell.colspan = span[1] || 1;
    }),
  );
  return grid;
}

/** 固定区域允许矩形合并；跨动态行的纵向合并不能稳定对应展开后的记录。 */
export function formGridSpans(grid: FormGrid): [number, number][][] {
  const spans = grid.rows.map(() =>
    grid.columns.map((): [number, number] => [1, 1]),
  );
  const covered = new Set<string>();
  grid.rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      if (covered.has(`${r}:${c}`)) {
        spans[r]![c] = [0, 0];
        return;
      }
      let down = Math.min(
        Math.max(1, Math.floor(Number(cell.rowspan) || 1)),
        grid.rows.length - r,
      );
      const across = Math.min(
        Math.max(1, Math.floor(Number(cell.colspan) || 1)),
        grid.columns.length - c,
      );
      for (let i = r; i < r + down; i++)
        if (grid.rows[i]?.source) {
          down = Math.max(1, i - r);
          break;
        }
      for (let y = r; y < r + down; y++)
        for (let x = c; x < c + across; x++)
          if (covered.has(`${y}:${x}`)) down = 1;
      let width = across;
      for (let x = c + 1; x < c + width; x++)
        if (covered.has(`${r}:${x}`)) width = x - c;
      spans[r]![c] = [down, width];
      for (let y = r; y < r + down; y++)
        for (let x = c; x < c + width; x++)
          if (y !== r || x !== c) covered.add(`${y}:${x}`);
    }),
  );
  return spans;
}

export function mergeFormCells(
  grid: FormGrid,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): FormGrid {
  const next = normalizeFormGrid(grid);
  const top = Math.min(r1, r2);
  const bottom = Math.max(r1, r2);
  const left = Math.min(c1, c2);
  const right = Math.max(c1, c2);
  if (!next.rows[top]?.cells[left] || !next.rows[bottom]?.cells[right])
    throw new Error('请选择表格范围内的单元格');
  if (
    bottom > top &&
    next.rows.slice(top, bottom + 1).some((row) => row.source)
  )
    throw new Error('动态明细行只能横向合并，不能与其他行纵向合并');
  const spans = formGridSpans(next);
  spans.forEach((row, r) =>
    row.forEach(([down, across], c) => {
      if (
        !down ||
        !across ||
        r > bottom ||
        c > right ||
        r + down <= top ||
        c + across <= left
      )
        return;
      if (
        r < top ||
        c < left ||
        r + down - 1 > bottom ||
        c + across - 1 > right
      )
        throw new Error('选区跨过已有合并单元格，请先拆分该单元格');
    }),
  );
  for (let r = top; r <= bottom; r++)
    for (let c = left; c <= right; c++)
      Object.assign(next.rows[r]!.cells[c]!, { rowspan: 1, colspan: 1 });
  Object.assign(next.rows[top]!.cells[left]!, {
    rowspan: bottom - top + 1,
    colspan: right - left + 1,
  });
  return next;
}

/** 增删行列时平移或缩放已有合并区域，删除合并起点时保留其内容。 */
export function resizeFormGrid(
  grid: FormGrid,
  axis: 'column' | 'row',
  index: number,
  remove = false,
): FormGrid {
  const next = normalizeFormGrid(grid);
  const length = axis === 'row' ? next.rows.length : next.columns.length;
  if (
    (remove && length <= 1) ||
    index < 0 ||
    index > length ||
    (remove && index === length)
  )
    return next;
  const merges: {
    across: number;
    c: number;
    cell: FormGridCell;
    down: number;
    r: number;
  }[] = [];
  formGridSpans(next).forEach((row, r) =>
    row.forEach(([down, across], c) => {
      if (down > 1 || across > 1)
        merges.push({
          r,
          c,
          down,
          across,
          cell: { ...next.rows[r]!.cells[c]! },
        });
    }),
  );
  next.rows.forEach((row) =>
    row.cells.forEach((cell) =>
      Object.assign(cell, { rowspan: 1, colspan: 1 }),
    ),
  );
  if (axis === 'row')
    next.rows.splice(
      index,
      remove ? 1 : 0,
      ...(remove
        ? []
        : [{ cells: next.columns.map(emptyFormCell), height: 22 }]),
    );
  else {
    next.columns.splice(index, remove ? 1 : 0, ...(remove ? [] : [100]));
    next.rows.forEach((row) =>
      row.cells.splice(
        index,
        remove ? 1 : 0,
        ...(remove ? [] : [emptyFormCell()]),
      ),
    );
  }
  for (const merge of merges) {
    const start = axis === 'row' ? merge.r : merge.c;
    const span = axis === 'row' ? merge.down : merge.across;
    let newStart = start;
    let newSpan = span;
    if (remove) {
      if (index < start) newStart--;
      else if (index < start + span) newSpan--;
    } else if (index <= start) newStart++;
    else if (index < start + span) newSpan++;
    if (newSpan <= 0) continue;
    const r = axis === 'row' ? newStart : merge.r;
    const c = axis === 'column' ? newStart : merge.c;
    Object.assign(next.rows[r]!.cells[c]!, merge.cell, {
      rowspan: axis === 'row' ? newSpan : merge.down,
      colspan: axis === 'column' ? newSpan : merge.across,
    });
  }
  return normalizeFormGrid(next);
}

export function compileFormGrid(raw: unknown, root: Record<string, unknown>) {
  const grid = normalizeFormGrid(raw);
  const spans = formGridSpans(grid);
  const rows: Record<string, unknown>[] = [];
  grid.rows.forEach((templateRow, templateIndex) => {
    const source = templateRow.source
      ? readFormField(root, templateRow.source)
      : undefined;
    const records = templateRow.source
      ? Array.isArray(source) && source.length
        ? source
        : templateRow.empty === 'omit'
          ? []
          : [null]
      : [null];
    records.forEach((record, index) => {
      const context = { ...root, root, row: record || {}, index };
      const data: Record<string, unknown> = {
        agreeCellMerges: spans[templateIndex],
        __formTemplateRow: templateIndex,
        __formHeight: templateRow.height,
        __formStyles: templateRow.cells.map((cell) => ({
          textAlign: cell.align,
          fontWeight: cell.bold ? '700' : '400',
        })),
      };
      templateRow.cells.forEach((cell, c) => {
        let value: unknown = cell.value;
        if (cell.mode === 'field') value = readFormField(context, cell.value);
        if (cell.mode === 'formula')
          value =
            templateRow.source && record === null
              ? ''
              : evalPrintExpr(cell.value, context, { silent: true });
        data[`__form_c${c}`] = formatPrintValue(
          value,
          cell.format || '',
          context,
        );
      });
      rows.push(data);
    });
  });
  return { grid, rows };
}

/** 只编译运行时副本；源模板保存的是单元格配置，不保存生成的数据。 */
export function prepareFormGrids(
  template: Record<string, any>,
  data: Record<string, unknown>,
) {
  for (const [p, panel] of (template.panels || []).entries())
    for (const [e, element] of (panel.printElements || []).entries()) {
      const options = element.options;
      if (!options?.agreeFormGrid) continue;
      const { grid, rows } = compileFormGrid(options.agreeFormGrid, data);
      let field = `__agree_form_${p}_${e}`;
      while (Object.hasOwn(data, field)) field += '_';
      data[field] = rows;
      const totalWidth = grid.columns.reduce((sum, value) => sum + value, 0);
      options.field = field;
      options.columns = [
        grid.columns.map((width, index) => ({
          title: '',
          field: `__form_c${index}`,
          width: (width / totalWidth) * (Number(options.width) || 550),
          checked: true,
          align: 'left',
          formatter2: `function formCellText(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\\n/g, '<br/>'); }`,
          styler2: `function formCellStyle(value, row) { var style = Object.assign({}, row && row.__formStyles && row.__formStyles[${index}]); style.height = String(row && row.__formHeight || 22) + 'pt'; return style; }`,
        })),
      ];
      options.tableHeaderRepeat = 'none';
      // 引擎最后会清理 td 的 height；行高需通过 tr 的 rowStyler 保留。
      options.rowStyler =
        "function formRowStyle(row) { return { height: String(row && row.__formHeight || 22) + 'pt' }; }";
      options.__formRowCount = rows.length;
      // 单元格合并来自展开后的行，不再叠加普通明细表的按列计算和合并设置。
      for (const key of [
        'agreeBodyCellMerges',
        'agreeBodyHMerges',
        'agreeBodyCellExprs',
        'agreeRowFilter',
        'agreeFooters',
      ])
        delete options[key];
    }
}

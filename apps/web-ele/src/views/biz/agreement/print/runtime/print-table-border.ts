import { requireDefined } from '../../../../../../../shared/require-defined';

const SOLID = '0.75pt solid #333';
const HIDDEN = '0.75pt hidden #333';
export const TABLE_BORDER_SIDES = ['top', 'bottom', 'left', 'right'] as const;
export type TableBorderSide = (typeof TABLE_BORDER_SIDES)[number];
export interface TableBorderOverrides {
  outer?: Partial<Record<TableBorderSide, boolean>>;
  headerInner?: boolean;
  bodyInner?: boolean;
  footerInner?: boolean;
  headerDivider?: boolean;
  footerDivider?: boolean;
}

export function normalizeTableBorders(raw: unknown): TableBorderOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const input = raw as TableBorderOverrides;
  const result: TableBorderOverrides = {};
  for (const key of [
    'headerInner',
    'bodyInner',
    'footerInner',
    'headerDivider',
    'footerDivider',
  ] as const)
    if (typeof input[key] === 'boolean') result[key] = input[key];
  if (input.outer && typeof input.outer === 'object') {
    const outer: Partial<Record<TableBorderSide, boolean>> = {};
    for (const side of TABLE_BORDER_SIDES)
      if (typeof input.outer[side] === 'boolean')
        outer[side] = input.outer[side];
    if (Object.keys(outer).length > 0) result.outer = outer;
  }
  return result;
}

/** Legacy settings remain intact until the corresponding visible control is edited. */
export function resolveTableBorderControls(
  options: Record<string, any>,
  regions: { footer: boolean; header: boolean },
) {
  const overrides = normalizeTableBorders(options.agreeTableBorders);
  const header = options.tableHeaderBorder !== 'noBorder';
  const footer = options.tableFooterBorder !== 'noBorder';
  const explicit =
    options.tableBorder === 'border' || options.tableBorder === 'noBorder';
  const whole = options.tableBorder !== 'noBorder';
  const sideValues = explicit
    ? [whole]
    : [
        true,
        ...(regions.header ? [header] : []),
        ...(regions.footer ? [footer] : []),
      ];
  const mixed = sideValues.some(Boolean) && !sideValues.every(Boolean);
  let defaultTopBorder;
  if (explicit) {
    defaultTopBorder = whole;
  } else {
    defaultTopBorder = regions.header ? header : true;
  }
  let defaultBottomBorder;
  if (explicit) {
    defaultBottomBorder = whole;
  } else {
    defaultBottomBorder = regions.footer ? footer : true;
  }
  return {
    outer: {
      top: overrides.outer?.top ?? defaultTopBorder,
      bottom: overrides.outer?.bottom ?? defaultBottomBorder,
      left: overrides.outer?.left ?? sideValues.every(Boolean),
      right: overrides.outer?.right ?? sideValues.every(Boolean),
    },
    mixedOuter: {
      left: overrides.outer?.left === undefined && mixed,
      right: overrides.outer?.right === undefined && mixed,
    },
    headerInner:
      overrides.headerInner ?? options.tableHeaderCellBorder !== 'noBorder',
    bodyInner:
      overrides.bodyInner ?? options.tableBodyCellBorder !== 'noBorder',
    footerInner:
      overrides.footerInner ?? options.tableFooterCellBorder !== 'noBorder',
    headerDivider: overrides.headerDivider ?? header,
    footerDivider: overrides.footerDivider ?? footer,
  };
}

const BORDER_KEYS = [
  'agreeTableBorders',
  'tableBorder',
  'tableHeaderBorder',
  'tableHeaderCellBorder',
  'tableBodyCellBorder',
  'tableFooterBorder',
  'tableFooterCellBorder',
] as const;

function outerBorder(value: unknown) {
  // hidden suppresses the neighbouring cell's border in collapsed tables.
  return value === 'noBorder' ? HIDDEN : SOLID;
}

/** Apply borders to cell edges, including merged cells and newly split pages. */
export function applyDocumentTableBorders(
  table: HTMLElement,
  options?: Record<string, unknown>,
) {
  const settings: Record<string, unknown> = options
    ? Object.fromEntries(BORDER_KEYS.map((key) => [key, options[key] || '']))
    : JSON.parse(table.dataset.docBorderOptions || '{}');
  table.dataset.docBorderOptions = JSON.stringify(settings);
  // A table/row border must not redraw an edge disabled on its cells.
  table.style.border = 'none';
  const allRows = [
    ...table.querySelectorAll<HTMLTableRowElement>(
      ':scope > thead > tr, :scope > tbody > tr',
    ),
  ];
  const headerRows = allRows.filter(
    (row) => row.parentElement?.tagName === 'THEAD',
  );
  const footerRows = allRows.filter((row) =>
    row.querySelector(':scope > [data-doc-footer]'),
  );
  const bodyRows = allRows.filter(
    (row) => !headerRows.includes(row) && !footerRows.includes(row),
  );
  const columnCount = table.querySelectorAll(':scope > colgroup > col').length;
  const overrides = normalizeTableBorders(settings.agreeTableBorders);
  const sections = [
    {
      rows: headerRows,
      cell: 'tableHeaderCellBorder',
      outer: 'tableHeaderBorder',
      inner: overrides.headerInner,
    },
    {
      rows: bodyRows,
      cell: 'tableBodyCellBorder',
      outer: '',
      inner: overrides.bodyInner,
    },
    {
      rows: footerRows,
      cell: 'tableFooterCellBorder',
      outer: 'tableFooterBorder',
      inner: overrides.footerInner,
    },
  ];

  for (const section of sections) {
    const occupied: number[] = [];
    section.rows.forEach((row, rowIndex) => {
      row.style.border = 'none';
      let column = 0;
      for (const cell of [...row.cells]) {
        while ((occupied[column] || 0) > rowIndex) column++;
        const endColumn = column + cell.colSpan;
        const endRow = rowIndex + cell.rowSpan;
        for (let c = column; c < endColumn; c++) occupied[c] = endRow;
        cell.style.border =
          settings[section.cell] === 'noBorder' ? 'none' : SOLID;
        const edges = {
          borderTop: rowIndex === 0,
          borderBottom: endRow >= section.rows.length,
          borderLeft: column === 0,
          borderRight: endColumn === columnCount,
        } as const;
        if (section.outer) {
          for (const [edge, touches] of Object.entries(edges))
            if (touches)
              cell.style[edge as keyof typeof edges] = outerBorder(
                settings[section.outer],
              );
        }
        const tableEdges = {
          ...edges,
          borderTop: edges.borderTop && row === allRows[0],
          borderBottom:
            edges.borderBottom && section.rows.at(-1) === allRows.at(-1),
        };
        for (const [edge, touches] of Object.entries(tableEdges)) {
          if (!touches) continue;
          // Explicit whole-table settings take priority on the page perimeter.
          // Otherwise header/footer edges retain their own settings.
          if (settings.tableBorder || !section.outer)
            cell.style[edge as keyof typeof edges] = outerBorder(
              settings.tableBorder,
            );
        }
        // Each internal edge, divider and perimeter edge has one owner.
        if (section.inner !== undefined)
          for (const [edge, touches] of Object.entries(edges))
            if (!touches)
              cell.style[edge as keyof typeof edges] = section.inner
                ? SOLID
                : HIDDEN;

        if (
          headerRows.length > 0 &&
          bodyRows.length > 0 &&
          overrides.headerDivider !== undefined
        ) {
          if (section.rows === headerRows && edges.borderBottom)
            cell.style.borderBottom = overrides.headerDivider ? SOLID : HIDDEN;
          if (section.rows === bodyRows && edges.borderTop)
            cell.style.borderTop = overrides.headerDivider ? SOLID : HIDDEN;
        }
        if (footerRows.length > 0 && overrides.footerDivider !== undefined) {
          const preceding = bodyRows.length > 0 ? bodyRows : headerRows;
          if (
            preceding.length > 0 &&
            section.rows === footerRows &&
            edges.borderTop
          )
            cell.style.borderTop = overrides.footerDivider ? SOLID : HIDDEN;
          if (section.rows === preceding && edges.borderBottom)
            cell.style.borderBottom = overrides.footerDivider ? SOLID : HIDDEN;
        }
        for (const side of TABLE_BORDER_SIDES) {
          const edge =
            `border${requireDefined(side[0]).toUpperCase()}${side.slice(1)}` as keyof typeof edges;
          if (tableEdges[edge] && overrides.outer?.[side] !== undefined)
            cell.style[edge] = overrides.outer[side] ? SOLID : HIDDEN;
        }
        column = endColumn;
      }
    });
  }
}

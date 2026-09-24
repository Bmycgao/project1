import type { AgreePrintData } from '../types';

import dayjs from 'dayjs';

import { resolveTablePreview } from '../designer/template-model';
import { documentRows } from './document-layout';
import {
  normalizeTableColor,
  resolveTableCellColor,
} from './print-table-color';
import { resolvePrintTextValue } from './print-text-value';
import { normalizeWatermarkOptions } from './print-watermark';

const PX = 96 / 72;
const pt = (value: number) => `${value}pt`;
const num = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const clone = <T extends Node>(node: T): T => node.cloneNode(true) as T;

function node(tag: string, styles: Partial<CSSStyleDeclaration> = {}) {
  const el = document.createElement(tag);
  Object.assign(el.style, styles);
  return el;
}

function font(options: Record<string, any>): Partial<CSSStyleDeclaration> {
  const size = num(options.fontSize, 10) || 10;
  return {
    fontFamily: options.fontFamily || 'SimSun, serif',
    fontSize: pt(size),
    lineHeight: pt(Math.max(size * 1.25, num(options.lineHeight))),
    fontWeight: String(options.fontWeight || '400'),
    fontStyle: options.fontStyle || 'normal',
    color: normalizeTableColor(options.color) || '#111',
    backgroundColor:
      normalizeTableColor(options.backgroundColor) || 'transparent',
    textAlign: options.textAlign || 'left',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'normal',
    letterSpacing: pt(num(options.letterSpacing)),
    textDecoration: options.textDecoration || 'none',
  };
}

async function codeImage(options: Record<string, any>, value: string) {
  const canvas = document.createElement('canvas');
  if (options.textType === 'qrcode') {
    const { default: bwip } = await import('bwip-js');
    bwip.toCanvas(canvas, {
      bcid: 'qrcode',
      text: value || ' ',
      scale: 4,
      padding: 0,
      eclevel:
        ({ 0: 'M', 1: 'L', 2: 'H', 3: 'Q' } as const)[
          Number(options.qrcodeLevel) as 0 | 1 | 2 | 3
        ] || 'L',
    });
  } else {
    const { default: barcode } = await import('jsbarcode');
    barcode(canvas, value || ' ', {
      format: options.barcodeMode || 'CODE128',
      displayValue: false,
      margin: 0,
    });
  }
  const image = document.createElement('img');
  image.src = canvas.toDataURL();
  image.alt = options.textType === 'qrcode' ? '二维码' : '条形码';
  Object.assign(image.style, {
    width: pt(num(options.width, 50)),
    maxWidth: '100%',
    height: pt(num(options.height, 50)),
    objectFit: 'contain',
    display: 'block',
  });
  return image;
}

export function renderDocumentTable(
  options: Record<string, any>,
  data: AgreePrintData,
  maxRows = Number.MAX_SAFE_INTEGER,
) {
  const model = resolveTablePreview(options, data, maxRows, {
    rowsPrepared: true,
  });
  const table = node('table', {
    ...font(options),
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    boxSizing: 'border-box',
    border: options.tableBorder === 'noBorder' ? 'none' : '0.75pt solid #333',
  });
  table.dataset.docTable = 'true';
  const total = model.leafCols.reduce((sum, cell) => sum + cell.width, 0) || 1;
  const columns = node('colgroup');
  model.leafCols.forEach((col) =>
    columns.append(node('col', { width: `${(col.width / total) * 100}%` })),
  );
  table.append(columns);
  const head = node('thead');
  model.headerRows.forEach((row) => {
    const tr = node('tr', {
      border:
        options.tableHeaderBorder === 'noBorder' ? 'none' : '0.75pt solid #333',
    });
    row.forEach((cell) => {
      const td = node('td', {
        border:
          options.tableHeaderCellBorder === 'noBorder'
            ? 'none'
            : '0.75pt solid #333',
        padding: '2pt',
        height: pt(num(options.tableHeaderRowHeight, 18)),
        backgroundColor:
          normalizeTableColor(
            cell.backgroundColor ||
              cell.background ||
              options.tableHeaderBackground,
          ) || 'transparent',
        color: normalizeTableColor(cell.agreeHeaderColor) || 'inherit',
        fontWeight: String(
          cell.fontWeight || options.tableHeaderFontWeight || '700',
        ),
        fontSize: pt(
          num(options.tableHeaderFontSize, num(options.fontSize, 10)),
        ),
        textAlign: cell.align || 'center',
      }) as HTMLTableCellElement;
      td.colSpan = num(cell.colspan, 1) || 1;
      td.rowSpan = num(cell.rowspan, 1) || 1;
      td.textContent = String(cell.title || '');
      // 仅设计器点选：正式打印忽略这些 data-*，不会出现在纸面上
      td.dataset.docHeader = '1';
      if (Number.isInteger(cell.editorLeafIndex)) {
        td.dataset.docLeafStart = String(cell.editorLeafIndex);
        td.dataset.docLeafEnd = String(
          Number.isInteger(cell.editorLeafEnd)
            ? cell.editorLeafEnd
            : cell.editorLeafIndex,
        );
      } else if (Number.isInteger(cell.editorGroupFrom)) {
        td.dataset.docLeafStart = String(cell.editorGroupFrom);
        td.dataset.docLeafEnd = String(
          Number.isInteger(cell.editorGroupTo)
            ? cell.editorGroupTo
            : cell.editorGroupFrom,
        );
        td.dataset.docHeaderGroup = '1';
      }
      if (cell.field) td.dataset.docHeaderField = String(cell.field);
      if (cell.headerMergeId) {
        td.dataset.docHeaderMerge = String(cell.headerMergeId);
      }
      tr.append(td);
    });
    head.append(tr);
  });
  table.append(head);
  const body = node('tbody');
  model.bodyRows.forEach((row) => {
    const tr = node('tr');
    row
      .filter((cell) => !cell.hidden)
      .forEach((cell) => {
        const col = model.leafCols[cell.colIndex] || {};
        const td = node('td', {
          border:
            options.tableBodyCellBorder === 'noBorder'
              ? 'none'
              : '0.75pt solid #333',
          padding: '2pt',
          height: pt(num(options.tableBodyRowHeight, 18)),
          textAlign: cell.align || 'center',
          verticalAlign: 'middle',
          color:
            resolveTableCellColor(col, cell.rawRow, data as any) || 'inherit',
        }) as HTMLTableCellElement;
        td.colSpan = cell.colspan;
        td.rowSpan = cell.rowspan;
        td.dataset.docCol = String(cell.colIndex);
        td.dataset.docRecord = String(cell.rowIndex);
        td.textContent = cell.text;
        if (options.agreeFormGrid) {
          Object.assign(
            td.style,
            (cell.rawRow.__formStyles as any[])?.[cell.colIndex],
          );
          td.style.height = pt(num(cell.rawRow.__formHeight, 22));
        }
        tr.append(td);
      });
    body.append(tr);
  });
  model.footerRows.forEach((row, rowIndex) => {
    const tr = node('tr', {
      border:
        options.tableFooterBorder === 'noBorder' ? 'none' : '0.75pt solid #333',
    });
    let col = 0;
    row.forEach((cell, cellIndex) => {
      const td = node('td', {
        border:
          options.tableFooterCellBorder === 'noBorder'
            ? 'none'
            : '0.75pt solid #333',
        padding: '2pt',
        textAlign: cell.align || 'center',
        color: normalizeTableColor(cell.color) || 'inherit',
      }) as HTMLTableCellElement;
      td.colSpan = cell.colspan;
      td.textContent = cell.text;
      td.dataset.docCol = String(col);
      td.dataset.docFooter = 'true';
      td.dataset.docFooterRow = String(rowIndex);
      td.dataset.docFooterCell = String(cellIndex);
      col += cell.colspan;
      tr.append(td);
    });
    body.append(tr);
  });
  table.append(body);
  return table;
}

async function content(
  element: any,
  data: AgreePrintData,
): Promise<HTMLElement> {
  const options = element.options || {};
  const type = element.printElementType?.type;
  if (options.__documentHidden)
    return node('div', {
      height: pt(num(options.height, 16)),
      visibility: 'hidden',
    });
  if (type === 'table') return renderDocumentTable(options, data);
  if (['barcode', 'qrcode'].includes(options.textType))
    return codeImage(options, resolvePrintTextValue(options, data as any));
  if (type === 'image') {
    const image = document.createElement('img');
    const src = String(
      (data as any)[options.field] ||
        options.src ||
        options.url ||
        options.testData ||
        '',
    );
    if (/^(https?:|data:image\/|blob:|\/)/i.test(src)) image.src = src;
    Object.assign(image.style, {
      width: '100%',
      height: pt(num(options.height, 50)),
      objectFit: 'contain',
    });
    return image;
  }
  if (['hline', 'oval', 'rect', 'vline'].includes(type))
    return node('div', {
      boxSizing: 'border-box',
      height: pt(type === 'hline' ? 1 : num(options.height, 20)),
      border: `${Math.max(0.5, num(options.borderWidth, 0.75))}pt ${options.borderStyle || 'solid'} ${normalizeTableColor(options.color) || '#333'}`,
      backgroundColor:
        normalizeTableColor(options.backgroundColor) || 'transparent',
      borderRadius: type === 'oval' ? '50%' : '0',
    });
  const text = node('div', font(options));
  text.dataset.docText = 'true';
  const value = resolvePrintTextValue(options, data as any);
  text.textContent =
    options.field || options.agreeValueExpr
      ? `${options.hideTitle || !options.title ? '' : `${options.title}：`}${value}`
      : String(options.title || value || '');
  return text;
}

function fragmentTable(table: HTMLElement, start: number, end: number) {
  const copy = clone(table);
  const rows = [...table.querySelectorAll(':scope > tbody > tr')];
  const body = copy.querySelector('tbody')!;
  body.replaceChildren();
  for (let r = start; r < end; r++) {
    const tr = clone(rows[r]!) as HTMLElement;
    if (r === start) {
      for (let previous = 0; previous < start; previous++)
        for (const cell of [
          ...rows[previous]!.children,
        ] as HTMLTableCellElement[]) {
          if (previous + cell.rowSpan > start) {
            const continued = clone(cell);
            continued.rowSpan = Math.min(end, previous + cell.rowSpan) - start;
            const before = [...tr.children].find(
              (item) =>
                num((item as HTMLElement).dataset.docCol) >
                num(cell.dataset.docCol),
            );
            tr.insertBefore(continued, before || null);
          }
        }
    }
    for (const cell of [...tr.children] as HTMLTableCellElement[])
      cell.rowSpan = Math.min(cell.rowSpan, end - r);
    body.append(tr);
  }
  return copy;
}

function height(element: HTMLElement) {
  return element.getBoundingClientRect().height;
}

/** 超过一页的文本按真实换行高度拆开；不裁剪、不省略原文。 */
function splitText(
  element: HTMLElement,
  room: number,
  width: number,
  measure: HTMLElement,
): [HTMLElement, HTMLElement | null] {
  const first = clone(element);
  const rest = clone(element);
  const characters = Array.from(element.textContent || '');
  const box = node('div', { width: `${width}px` });
  box.append(first);
  measure.append(box);
  first.style.minHeight = '0';
  first.style.height = 'auto';
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    first.textContent = characters.slice(0, middle).join('');
    if (height(first) <= room + 0.2) low = middle;
    else high = middle - 1;
  }
  if (!low && characters.length) {
    box.remove();
    throw new Error('页面可用高度不足以放下一行文字，请增大纸张或减小字号');
  }
  first.textContent = characters.slice(0, low).join('');
  rest.textContent = characters.slice(low).join('');
  box.remove();
  return [first, rest.textContent ? rest : null];
}

function splitTable(
  table: HTMLElement,
  room: number,
  width: number,
  measure: HTMLElement,
  fullRoom: number,
): [HTMLElement, HTMLElement | null] {
  const count = table.querySelectorAll(':scope > tbody > tr').length;
  if (!count) throw new Error('表头超过单页可用高度，请减小表头字号或行高');
  const box = node('div', { width: `${width}px` });
  measure.append(box);
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const part = fragmentTable(table, 0, middle);
    box.replaceChildren(part);
    if (height(part) <= room) low = middle;
    else high = middle - 1;
  }
  if (low > 0) {
    box.remove();
    return [
      fragmentTable(table, 0, low),
      low < count ? fragmentTable(table, low, count) : null,
    ];
  }
  // 单条地址等超长内容本身超过一页：逐格拆成延续行，保留全部文字。
  const first = fragmentTable(table, 0, 1);
  const remainder = clone(table);
  box.replaceChildren(first);
  if (height(first) <= fullRoom && room < fullRoom) {
    box.remove();
    throw new Error('当前页放不下一条完整表格记录，转到下一页');
  }
  const headHeight = height(first.querySelector('thead') as HTMLElement);
  const cells = [
    ...first.querySelectorAll('tbody tr:first-child > td'),
  ] as HTMLTableCellElement[];
  const restCells = [
    ...remainder.querySelectorAll('tbody tr:first-child > td'),
  ] as HTMLTableCellElement[];
  let continued = false;
  cells.forEach((cell, index) => {
    const computed = getComputedStyle(cell);
    const paragraph = node('div', {
      font: computed.font,
      lineHeight: computed.lineHeight,
      letterSpacing: computed.letterSpacing,
      whiteSpace: computed.whiteSpace,
      overflowWrap: 'anywhere',
      wordBreak: computed.wordBreak,
    });
    paragraph.textContent = cell.textContent;
    const [prefix, suffix] = splitText(
      paragraph,
      room - headHeight - 10 * PX,
      Math.max(10, cell.getBoundingClientRect().width - 4 * PX),
      measure,
    );
    cell.textContent = prefix.textContent;
    cell.style.height = 'auto';
    const restCell = restCells[index];
    if (restCell) restCell.textContent = suffix?.textContent || '';
    continued ||= !!suffix;
  });
  box.remove();
  if (!continued) throw new Error('表头或行高超过单页可用高度，请调整表格样式');
  return [first, remainder];
}

function splitRow(
  row: HTMLElement,
  room: number,
  measure: HTMLElement,
  fullRoom: number,
): [HTMLElement, HTMLElement | null] {
  const first = clone(row);
  const rest = clone(row);
  const gap = Number.parseFloat(getComputedStyle(row).paddingTop) || 0;
  room -= gap;
  fullRoom -= gap;
  rest.style.paddingTop = '0';
  let remains = false;
  [...row.children].forEach((item, index) => {
    const cell = item as HTMLElement;
    const original = cell.firstElementChild as HTMLElement;
    const firstCell = first.children[index] as HTMLElement;
    const restCell = rest.children[index] as HTMLElement;
    const cellGap = Number.parseFloat(getComputedStyle(cell).paddingTop) || 0;
    restCell.style.paddingTop = '0';
    if (!original) return;
    let pair: [HTMLElement, HTMLElement | null];
    if (original.dataset.docTable)
      pair = splitTable(
        original,
        room - cellGap,
        cell.getBoundingClientRect().width,
        measure,
        fullRoom - cellGap,
      );
    else if (original.dataset.docText)
      pair = splitText(
        original,
        room - cellGap,
        cell.getBoundingClientRect().width,
        measure,
      );
    else {
      const media = clone(original);
      media.style.maxHeight = `${Math.max(0, room - cellGap)}px`;
      pair = [media, null];
    }
    firstCell.replaceChildren(pair[0]);
    restCell.replaceChildren(...(pair[1] ? [pair[1]] : []));
    remains ||= !!pair[1];
  });
  return [first, remains ? rest : null];
}

/** 所有正文使用普通流与 flex 行列；只有水印、页码属于纸面装饰层。 */
export async function renderDocument(
  template: Record<string, any>,
  data: AgreePrintData,
): Promise<HTMLElement> {
  const root = node('div');
  root.className = 'agree-document';
  const style = document.createElement('style');
  style.textContent =
    '.agree-document,.agree-document *{box-sizing:border-box}.agree-document .hiprint-printPanel{margin:0!important;padding:0!important}.agree-document .hiprint-printPaper{margin:0!important;overflow:hidden;break-after:page;page-break-after:always}.agree-document .hiprint-printPanel:last-child .hiprint-printPaper:last-child{break-after:auto;page-break-after:auto}.agree-document td{overflow-wrap:anywhere;white-space:pre-wrap}.agree-document img{max-width:100%}@media print{html,body{margin:0!important;padding:0!important}.agree-document{zoom:1!important;transform:none!important}}';
  root.append(style);
  const staging = node('div', {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
  });
  staging.append(root);
  document.body.append(staging);
  const measure = node('div');
  staging.append(measure);
  try {
    for (const [panelIndex, panel] of (template.panels || []).entries()) {
      const width = num(panel.width, 210);
      const paperHeight = num(panel.height, 297);
      const bodyHeight = (paperHeight * 72) / 25.4 - 60;
      const panelNode = node('div');
      panelNode.className = 'hiprint-printPanel';
      root.append(panelNode);
      let body: HTMLElement;
      let used = 0;
      const newPage = () => {
        const paper = node('section', {
          position: 'relative',
          width: `${width}mm`,
          height: `${paperHeight}mm`,
          padding: '20pt 20pt 40pt',
          backgroundColor: '#fff',
          color: '#111',
        });
        paper.className = 'hiprint-printPaper';
        paper.dataset.panelIndex = String(panelIndex);
        body = node('div', {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          height: pt(bodyHeight),
          width: '100%',
        });
        body.className = 'document-body';
        paper.append(body);
        panelNode.append(paper);
        used = 0;
        const mark = normalizeWatermarkOptions(panel.watermarkOptions);
        if (mark.content) {
          const layer = node('div', {
            position: 'absolute',
            inset: '0',
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, ${mark.width}px)`,
            gridAutoRows: `${mark.height}px`,
            pointerEvents: 'none',
            overflow: 'hidden',
          });
          const count =
            Math.ceil((width * 96) / 25.4 / mark.width) *
            Math.ceil((paperHeight * 96) / 25.4 / mark.height);
          for (let i = 0; i < count; i++) {
            const label = node('span', {
              alignSelf: 'center',
              textAlign: 'center',
              transform: `rotate(-${mark.rotate}deg)`,
              fontSize: mark.fontSize,
              color: normalizeTableColor(mark.fillStyle) || '#aaa',
            });
            label.textContent =
              mark.content +
              (mark.timestamp ? ` ${dayjs().format(mark.format)}` : '');
            layer.append(label);
          }
          paper.append(layer);
        }
        return paper;
      };
      newPage();
      const rows: HTMLElement[] = [];
      for (const members of documentRows(panel)) {
        const row = node('div', {
          display: 'flex',
          flexShrink: '0',
          alignItems: 'flex-start',
          width: '100%',
          paddingTop: pt(
            Math.max(
              ...members.map((el) => num(el.options.agreeDocument?.gap)),
            ),
          ),
        });
        row.dataset.docRow = String(members[0].options.agreeDocument.row);
        row.dataset.keepNext = String(
          members.some((el) => el.options.agreeDocument.keepNext),
        );
        let cursor = 0;
        for (const element of members) {
          const options = element.options;
          const layout = options.agreeDocument;
          const left = Math.max(cursor, Math.min(95, num(layout.left)));
          const cellWidth = Math.max(
            1,
            Math.min(100 - left, num(layout.width, 100)),
          );
          const cell = node('div', {
            flex: `0 0 ${cellWidth}%`,
            width: `${cellWidth}%`,
            minWidth: '0',
            marginLeft: `${Math.max(0, left - cursor)}%`,
            paddingTop: pt(Math.max(0, num(layout.spaceBefore))),
            ...font(options),
          });
          cell.dataset.docKey = `${panelIndex}:${options.__documentSourceIndex}`;
          cell.dataset.docField = options.field || '';
          cell.dataset.docType = element.printElementType?.type || 'text';
          cell.append(await content(element, data));
          row.append(cell);
          cursor = left + cellWidth;
        }
        rows.push(row);
      }
      // 测量与输出使用同一套字体和实际 DOM；等待字体后再决定分页。
      body!.append(...rows);
      await document.fonts.ready;
      await Promise.all(
        [...body!.querySelectorAll('img')].map((image) =>
          image.decode().catch(() => {}),
        ),
      );
      const heights = rows.map(height);
      const minimums = rows.map((row, index) => {
        if (rows[index - 1]?.dataset.keepNext !== 'true') return 0;
        let minimum = 0;
        for (const cell of [...row.children] as HTMLElement[]) {
          const child = cell.firstElementChild as HTMLElement | null;
          if (!child) continue;
          const cellGap =
            Number.parseFloat(getComputedStyle(cell).paddingTop) || 0;
          if (child.dataset.docTable) {
            const box = node('div', {
              width: `${cell.getBoundingClientRect().width}px`,
            });
            const firstRecord = fragmentTable(
              child,
              0,
              Math.min(1, child.querySelectorAll('tbody > tr').length),
            );
            box.append(firstRecord);
            measure.append(box);
            minimum = Math.max(minimum, height(firstRecord) + cellGap);
            box.remove();
          } else minimum = Math.max(minimum, height(child) + cellGap);
        }
        minimum += Number.parseFloat(getComputedStyle(row).paddingTop) || 0;
        return minimum > bodyHeight * PX - heights[index - 1]!
          ? 80 * PX
          : minimum;
      });
      rows.forEach((row) => row.remove());
      for (const [index, original] of rows.entries()) {
        let row: HTMLElement | null = original;
        if (
          original.dataset.keepNext === 'true' &&
          used > 0 &&
          used + heights[index]! + (minimums[index + 1] || 0) > bodyHeight * PX
        )
          newPage();
        while (row) {
          body!.append(row);
          const size = height(row);
          if (used + size <= bodyHeight * PX + 0.5) {
            used += size;
            row = null;
            continue;
          }
          if (
            size <= bodyHeight * PX &&
            used > 0 &&
            !row.querySelector('[data-doc-table]')
          ) {
            row.remove();
            newPage();
            continue;
          }
          if (used > 0 && bodyHeight * PX - used < 80 * PX) {
            row.remove();
            newPage();
            continue;
          }
          const room = bodyHeight * PX - used;
          let parts: [HTMLElement, HTMLElement | null];
          try {
            parts = splitRow(row, room, measure, bodyHeight * PX);
          } catch (error) {
            if (!used) throw error;
            row.remove();
            newPage();
            continue;
          }
          const [first, remainder] = parts;
          row.replaceWith(first);
          used += height(first);
          if (used > bodyHeight * PX + 2)
            throw new Error('内容无法在当前纸张内完整排版，请检查字号或行高');
          row = remainder;
          if (row) newPage();
        }
      }
    }
    const pages = [
      ...root.querySelectorAll<HTMLElement>('.hiprint-printPaper'),
    ];
    pages.forEach((page, index) => {
      if (template.panels[Number(page.dataset.panelIndex)]?.paperNumberDisabled)
        return;
      const number = node('div', {
        position: 'absolute',
        right: '20pt',
        bottom: '15pt',
        fontSize: '9pt',
        fontFamily: 'SimSun, serif',
      });
      number.textContent = `${index + 1} / ${pages.length}`;
      page.append(number);
    });
    return root;
  } finally {
    staging.remove();
  }
}

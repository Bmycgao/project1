import { cloneJson } from '../../clone';

export const DOCUMENT_LAYOUT = 'document-flow';
export type DocumentPlacement = 'after' | 'before' | 'beside' | 'beside-before';
export interface DocumentBox {
  gap: number;
  left: number;
  row: number;
  width: number;
  keepNext?: boolean;
  /** 当前元素在本行内的上方留白，不改变同行其他元素。 */
  spaceBefore?: number;
}

export const MAX_DOCUMENT_SPACE_PT = 200;

/** 编辑时只呈现一个上方间距，兼容旧模板的整行间距。 */
export function documentElementSpacing(
  template: Record<string, any>,
  key: string,
): number {
  const [p, i] = key.split(':').map(Number);
  const panel = template.panels?.[p!];
  const box = panel?.printElements?.[i!]?.options?.agreeDocument;
  if (!box) return 0;
  const gap = Math.max(
    0,
    ...panel.printElements
      .filter((el: any) => el.options?.agreeDocument?.row === box.row)
      .map((el: any) => Number(el.options.agreeDocument.gap) || 0),
  );
  return gap + (Number(box.spaceBefore) || 0);
}

export function adjustDocumentElementSpacing(
  template: Record<string, any>,
  key: string,
  deltaPt: number,
) {
  const next = toDocumentTemplate(template);
  const [panelIndex, elementIndex] = key.split(':').map(Number);
  const box =
    next.panels?.[panelIndex!]?.printElements?.[elementIndex!]?.options
      ?.agreeDocument;
  if (box && Number.isFinite(deltaPt)) {
    const total = documentElementSpacing(next, key);
    const peers = next.panels[panelIndex!].printElements.filter(
      (el: any) => el.options?.agreeDocument?.row === box.row,
    );
    const gap = total - (Number(box.spaceBefore) || 0);
    // 把旧的共享间距转成每个元素自己的间距，其他元素的视觉位置不变。
    for (const peer of gap > 0 ? peers : []) {
      const layout = peer.options.agreeDocument;
      layout.spaceBefore = (Number(layout.spaceBefore) || 0) + gap;
      layout.gap = 0;
    }
    box.spaceBefore =
      Math.round(
        Math.max(
          0,
          Math.min(Math.max(MAX_DOCUMENT_SPACE_PT, total), total + deltaPt),
        ) * 10,
      ) / 10;
  }
  return next;
}

export function isDocumentTemplate(template: any): boolean {
  return template?.agreeLayout === DOCUMENT_LAYOUT;
}

/** 旧坐标只用于首次推断行列；转换后内容高度由浏览器决定。 */
export function toDocumentTemplate(template: Record<string, any>) {
  const next = cloneJson(template);
  next.agreeLayout = DOCUMENT_LAYOUT;
  for (const panel of next.panels || []) {
    const elements: any[] = panel.printElements || [];
    const hasRows = elements.some((el) => el.options?.agreeDocument);
    const bodyWidth = ((Number(panel.width) || 210) * 72) / 25.4 - 40;
    const pending = elements
      .filter((el) => !el.options?.agreeDocument)
      .sort(
        (a, b) => Number(a.options?.top || 0) - Number(b.options?.top || 0),
      );
    let rowId =
      Math.max(
        -1,
        ...elements.map((el) => Number(el.options?.agreeDocument?.row ?? -1)),
      ) + 1;
    let previousBottom = 20;
    const rows: any[][] = [];
    for (const element of pending) {
      const row = rows.at(-1);
      if (
        row &&
        Math.abs(
          Number(element.options?.top || 0) - Number(row[0].options?.top || 0),
        ) <= 8
      )
        row.push(element);
      else rows.push([element]);
    }
    for (const row of rows) {
      row.sort(
        (a, b) => Number(a.options?.left || 0) - Number(b.options?.left || 0),
      );
      const top = Math.min(...row.map((el) => Number(el.options?.top || 0)));
      const gap = hasRows
        ? 12
        : Math.max(0, Math.min(200, top - previousBottom));
      row.forEach((element, index) => {
        const options = (element.options ||= {});
        const left = Math.max(0, Number(options.left || 0) - 20);
        const nextLeft = row[index + 1]
          ? Number(row[index + 1].options?.left || 0) - 20 - 8
          : bodyWidth;
        const width = Math.max(
          12,
          Math.min(
            Number(options.width) || bodyWidth,
            nextLeft - left,
            bodyWidth - left,
          ),
        );
        options.agreeDocument = {
          row: rowId,
          gap,
          left: Math.min(95, (left / bodyWidth) * 100),
          width: Math.min(100, (width / bodyWidth) * 100),
          keepNext:
            !options.field &&
            !!options.title &&
            /^(?:[一二三四五六七八九十]+[、．.]|（[一二三四五六七八九十]+）)/.test(
              String(options.title),
            ),
        } satisfies DocumentBox;
      });
      previousBottom = Math.max(
        ...row.map(
          (el) =>
            Number(el.options?.top || 0) + Number(el.options?.height || 0),
        ),
      );
      rowId++;
    }
    documentRows(panel).forEach((members, index) =>
      members.forEach((element) => {
        element.options.agreeDocument.row = index;
      }),
    );
  }
  return next;
}

export function documentRows(panel: Record<string, any>): any[][] {
  const rows = new Map<number, any[]>();
  for (const [index, element] of (panel.printElements || []).entries()) {
    const row = Number(element.options?.agreeDocument?.row ?? index);
    const list = rows.get(row) || [];
    list.push(element);
    rows.set(row, list);
  }
  return [...rows]
    .sort(([a], [b]) => a - b)
    .map(([, list]) =>
      list.sort(
        (a, b) =>
          Number(a.options.agreeDocument?.left || 0) -
          Number(b.options.agreeDocument?.left || 0),
      ),
    );
}

function documentCellLeft(el: any) {
  return Number(el?.options?.agreeDocument?.left) || 0;
}
function documentCellWidth(el: any) {
  return Math.max(1, Number(el?.options?.agreeDocument?.width) || 0);
}

/** 通栏和半格叠在同一行时不横排收拢，避免协议名称去占征收人的位置。 */
function documentRowOverlaps(row: any[]) {
  return row.some(
    (el, index) =>
      index > 0 &&
      documentCellLeft(el) <
        documentCellLeft(row[index - 1]) +
          documentCellWidth(row[index - 1]) -
          0.5,
  );
}

/**
 * 同行有块被隐藏移除后，剩下的按原顺序向左收拢，宽度不变。
 * 「保留空位」的占位块仍占原槽，该行不收拢。
 * @param panel 已过滤显隐后的运行时面板
 * @param originalElements 过滤前同一面板的元素（对象引用需一致）
 */
export function compactDocumentHiddenRows(
  panel: Record<string, any>,
  originalElements: any[],
) {
  const live = new Set(panel.printElements || []);
  for (const orig of documentRows({ printElements: originalElements })) {
    if (orig.length < 2 || documentRowOverlaps(orig)) continue;
    const kept = orig.filter((el) => live.has(el));
    if (
      kept.length === 0 ||
      kept.length === orig.length ||
      kept.some((el) => el.options?.__documentHidden)
    )
      continue;
    const start = Math.min(...orig.map(documentCellLeft));
    const gaps = orig
      .slice(1)
      .map((el, index) =>
        Math.max(
          0,
          documentCellLeft(el) -
            documentCellLeft(orig[index]!) -
            documentCellWidth(orig[index]!),
        ),
      )
      .toSorted((a, b) => a - b);
    const gap = gaps[Math.floor(gaps.length / 2)] || 0;
    let cursor = start;
    for (const el of kept) {
      const box = el.options?.agreeDocument;
      if (!box) continue;
      box.left = Math.round(cursor * 10) / 10;
      cursor += documentCellWidth(el) + gap;
    }
  }
}

/** 同行元素按视觉顺序返回，key 始终使用源模板下标。 */
export function documentRowMembers(
  template: Record<string, any>,
  key: string,
): Array<{ element: any; key: string }> {
  const [p, i] = key.split(':').map(Number);
  const panel = template.panels?.[p!];
  const box = panel?.printElements?.[i!]?.options?.agreeDocument;
  if (!box) return [];
  return panel.printElements
    .map((element: any, index: number) => ({ key: `${p}:${index}`, element }))
    .filter((item: any) => item.element.options?.agreeDocument?.row === box.row)
    .sort(
      (a: any, b: any) =>
        a.element.options.agreeDocument.left -
        b.element.options.agreeDocument.left,
    );
}

/** 调整相邻两列，保留整行总宽、列间距和其他列的位置。 */
export function resizeDocumentColumns(
  template: Record<string, any>,
  leftKey: string,
  rightKey: string,
  delta: number,
) {
  const next = toDocumentTemplate(template);
  const peers = documentRowMembers(next, leftKey);
  const index = peers.findIndex((item) => item.key === leftKey);
  if (
    index < 0 ||
    peers[index + 1]?.key !== rightKey ||
    !Number.isFinite(delta)
  )
    return next;
  const left = peers[index]!.element.options.agreeDocument;
  const right = peers[index + 1]!.element.options.agreeDocument;
  const minimum = Math.min(5, (left.width + right.width) / 2);
  const shift = Math.max(
    minimum - left.width,
    Math.min(right.width - minimum, delta),
  );
  left.width += shift;
  right.left += shift;
  right.width -= shift;
  return next;
}

/** 换位保留各元素宽度、留白、行边界及原有列间距。 */
function arrangeExistingRow(members: any[], original: any[]) {
  const gaps = original
    .slice(1)
    .map((el, index) =>
      Math.max(
        0,
        el.options.agreeDocument.left -
          original[index].options.agreeDocument.left -
          original[index].options.agreeDocument.width,
      ),
    );
  let left = original[0].options.agreeDocument.left;
  members.forEach((el, index) => {
    el.options.agreeDocument.left = left;
    left += el.options.agreeDocument.width + (gaps[index] || 0);
  });
}

export function shiftDocumentElement(
  template: Record<string, any>,
  key: string,
  direction: -1 | 1,
) {
  const next = toDocumentTemplate(template);
  const peers = documentRowMembers(next, key);
  const index = peers.findIndex((item) => item.key === key);
  if (!peers[index + direction]) return next;
  const original = peers.map((item) => item.element);
  const members = [...original];
  [members[index], members[index + direction]] = [
    members[index + direction],
    members[index],
  ];
  arrangeExistingRow(members, original);
  return next;
}

export function setDocumentElementWidth(
  template: Record<string, any>,
  key: string,
  requested: number,
) {
  const next = toDocumentTemplate(template);
  const peers = documentRowMembers(next, key);
  const item = peers.find((item) => item.key === key);
  if (!item || !Number.isFinite(requested)) return next;
  const box = item.element.options.agreeDocument;
  const { min, max, gap } = documentWidthLimits(peers.length);
  const width = Math.max(min, Math.min(max, requested));
  if (peers.length === 1) {
    const align =
      Math.abs(box.left - (100 - box.width) / 2) < 1
        ? 'center'
        : box.left > 1
          ? 'right'
          : 'left';
    box.width = width;
    box.left =
      align === 'center'
        ? (100 - width) / 2
        : align === 'right'
          ? 100 - width
          : 0;
  } else {
    const others = peers.filter((peer) => peer !== item);
    const remaining = 100 - width - gap * (peers.length - 1);
    const total = others.reduce(
      (sum, peer) => sum + peer.element.options.agreeDocument.width,
      0,
    );
    let cursor = 0;
    peers.forEach((peer) => {
      const config = peer.element.options.agreeDocument;
      config.width =
        peer === item
          ? width
          : remaining * (total > 0 ? config.width / total : 1 / others.length);
      config.left = cursor;
      cursor += config.width + gap;
    });
  }
  return next;
}

export function documentWidthLimits(count: number) {
  const columns = Math.max(1, count);
  const gap = Math.min(3, 40 / columns);
  const min = Math.min(5, (100 - gap * (columns - 1)) / columns);
  return { min, max: 100 - (columns - 1) * (gap + min), gap };
}

/** 移动的是结构位置，坐标与样例数据的高度无关；也可跨手工区段移动。 */
export function moveDocumentElement(
  template: Record<string, any>,
  sourceKey: string,
  targetKey: string,
  placement: DocumentPlacement,
) {
  const next = toDocumentTemplate(template);
  const [sp, si] = sourceKey.split(':').map(Number);
  const [tp, ti] = targetKey.split(':').map(Number);
  const source = next.panels?.[sp!]?.printElements?.[si!];
  const target = next.panels?.[tp!]?.printElements?.[ti!];
  if (!source || !target || source === target) return next;
  if (sp !== tp) {
    next.panels[sp!].printElements.splice(si!, 1);
    next.panels[tp!].printElements.push(source);
  }
  const panel = next.panels[tp!];
  const targetRow = Number(target.options.agreeDocument.row);
  if (placement === 'beside' || placement === 'beside-before') {
    const peers = panel.printElements
      .filter(
        (el: any) =>
          el !== source && Number(el.options.agreeDocument.row) === targetRow,
      )
      .sort(
        (a: any, b: any) =>
          a.options.agreeDocument.left - b.options.agreeDocument.left,
      );
    const members = [...peers];
    members.splice(
      peers.indexOf(target) + (placement === 'beside-before' ? 0 : 1),
      0,
      source,
    );
    if (sp === tp && source.options.agreeDocument.row === targetRow) {
      arrangeExistingRow(
        members,
        [...peers, source].sort(
          (a, b) => a.options.agreeDocument.left - b.options.agreeDocument.left,
        ),
      );
    } else {
      const gap = Math.min(3, 40 / members.length);
      const width = (100 - (members.length - 1) * gap) / members.length;
      members.forEach((el, index) => {
        el.options.agreeDocument = {
          ...el.options.agreeDocument,
          row: targetRow,
          gap: target.options.agreeDocument.gap,
          left: index * (width + gap),
          width,
        };
      });
    }
  } else {
    source.options.agreeDocument = {
      ...source.options.agreeDocument,
      row: targetRow + (placement === 'before' ? -0.5 : 0.5),
    };
  }
  documentRows(panel).forEach((row, index) =>
    row.forEach((el) => {
      el.options.agreeDocument.row = index;
    }),
  );
  return next;
}

export function placeNewDocumentElement(
  template: Record<string, any>,
  panelIndex: number,
  targetKey?: string,
  placement: DocumentPlacement = 'after',
) {
  const next = toDocumentTemplate(template);
  const elements = next.panels?.[panelIndex]?.printElements || [];
  return targetKey
    ? moveDocumentElement(
        next,
        `${panelIndex}:${elements.length - 1}`,
        targetKey,
        placement,
      )
    : next;
}

export function splitDocumentPanel(
  template: Record<string, any>,
  panelIndex: number,
  key?: string,
  after = false,
) {
  const next = toDocumentTemplate(template);
  const panel = next.panels[panelIndex];
  const row = key
    ? Number(
        panel.printElements[Number(key.split(':')[1])]?.options.agreeDocument
          .row,
      ) + (after ? 0.5 : 0)
    : Infinity;
  const moved = panel.printElements.filter(
    (el: any) => Number(el.options.agreeDocument.row) >= row,
  );
  panel.printElements = panel.printElements.filter(
    (el: any) => !moved.includes(el),
  );
  const newPanel = { ...cloneJson(panel), printElements: moved };
  next.panels.splice(panelIndex + 1, 0, newPanel);
  documentRows(newPanel).forEach((members, index) =>
    members.forEach((el) => {
      el.options.agreeDocument.row = index;
      if (index === 0) el.options.agreeDocument.gap = 0;
    }),
  );
  return {
    template: next,
    newPanelIndex: panelIndex + 1,
    movedCount: moved.length,
  };
}

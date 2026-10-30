<script setup lang="ts">
import type { AgreePrintData } from '../types';
import type {
  CanvasFieldDropPayload,
  CanvasToolboxDropPayload,
} from './template-model';
import type { PalettePayload, PalettePoint } from './use-palette-pointer-drag';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from 'vue';

import { requireDefined } from '../../../../../../../shared/require-defined';
import { cloneJson } from '../../clone';
import {
  adjustDocumentElementSpacing,
  documentElementSpacing,
  documentRowMembers,
  MAX_DOCUMENT_SPACE_PT,
  moveDocumentElement,
  resizeDocumentColumns,
} from '../runtime/document-layout';
import { renderDocument } from '../runtime/document-renderer';
import { preparePrintTemplate } from '../runtime/prepare-template';
import { fieldInFilterExpr } from '../runtime/print-row-filter';
import {
  minimumRowHeight,
  rowHeightOverride,
  setRowHeightOverride,
} from '../runtime/print-row-height';
import {
  normalizeAgreeBodyCellMerges,
  normalizeAgreeBodyHMerges,
} from '../runtime/print-table-runtime';
import {
  AGREE_PRINT_FIELD_DND,
  getAgreePrintHtml5Drag,
  listLeafTableCells,
} from '../template/print-element-meta';
import { placeCellToolbar } from './place-cell-toolbar';
import { usePalettePointerDrag } from './use-palette-pointer-drag';

const props = defineProps<{
  bodyCellSelection?: null | {
    endCol: number;
    endRow: number;
    key: string;
    startCol: number;
    startRow: number;
  };
  headerCellSelection?: null | {
    field: string;
    fromLeaf: number;
    key: string;
    mergeId: string;
    toLeaf: number;
  };
  highlightColIndex?: number;
  highlightTableKey?: string;
  sampleData: AgreePrintData | null;
  selectedKey: string;
  templateJson: null | Record<string, any>;
  zoom: number;
}>();
const emit = defineEmits<{
  bodyFormulaRequested: [];
  bodyMergeRequested: [];
  bodySplitRequested: [];
  contextmenu: [{ clientX: number; clientY: number; key: string }];
  fieldDrop: [CanvasFieldDropPayload];
  headerFilterRequested: [
    {
      anchor: { bottom: number; left: number; right: number; top: number };
      clientX: number;
      clientY: number;
      field: string;
      fromLeaf: number;
      key: string;
      toLeaf: number;
    },
  ];
  pageSelect: [number];
  tableBodyCellSelect: [
    {
      colIndex: number;
      key: string;
      rawRow: Record<string, unknown>;
      rowIndex: number;
      shiftKey: boolean;
    },
  ];
  tableBodySelectionClear: [];
  tableFooterCellSelect: [{ cellIndex: number; key: string; rowIndex: number }];
  tableHeaderCellSelect: [
    {
      clientX: number;
      clientY: number;
      field: string;
      fromLeaf: number;
      key: string;
      mergeId: string;
      shiftKey: boolean;
      toLeaf: number;
    },
  ];
  toolboxDrop: [CanvasToolboxDropPayload];
  'update:selectedKey': [string];
  'update:templateJson': [Record<string, any>];
}>();
const host = ref<HTMLElement | null>(null);
const shell = ref<HTMLElement | null>(null);
const cellToolbar = ref<HTMLElement | null>(null);
const rowHeightPanel = ref<HTMLElement | null>(null);
const rowHeightOpen = ref(false);
const rowHeightPanelId = useId();
const cellToolbarBox = ref<null | {
  left: number;
  maxHeight: number;
  maxWidth: number;
  top: number;
}>(null);
const rowHeightPanelBox = ref<typeof cellToolbarBox.value>(null);
const rowHeightTarget = ref<null | {
  col: number;
  key: string;
  record: number;
  rowKey?: string;
  templateRow?: number;
}>(null);
const cellSelectionSize = computed(() => {
  const selection = props.bodyCellSelection;
  return {
    rows: selection ? Math.abs(selection.endRow - selection.startRow) + 1 : 1,
    cols: selection ? Math.abs(selection.endCol - selection.startCol) + 1 : 1,
  };
});
const singleCellSelected = computed(
  () =>
    cellSelectionSize.value.rows === 1 && cellSelectionSize.value.cols === 1,
);
const cellSelectionLabel = computed(() => {
  const selection = props.bodyCellSelection;
  if (selection && !singleCellSelected.value)
    return `已选 ${cellSelectionSize.value.rows} 行 × ${cellSelectionSize.value.cols} 列`;
  const row = selection?.endRow ?? rowHeightTarget.value?.record ?? 0;
  const col = selection?.endCol ?? rowHeightTarget.value?.col ?? 0;
  return `第 ${row + 1} 行 · 第 ${col + 1} 列`;
});
const bodyCellActions = computed(() => {
  const selection = props.bodyCellSelection;
  if (!selection || !props.templateJson)
    return { split: false, formula: false };
  const [p, e] = selection.key.split(':').map(Number);
  const options =
    props.templateJson.panels?.[requireDefined(p)]?.printElements?.[
      requireDefined(e)
    ]?.options || {};
  const leaves = listLeafTableCells(options.columns);
  const row = selection.startRow;
  const col = selection.startCol;
  const merged = normalizeAgreeBodyCellMerges(
    options.agreeBodyCellMerges,
    leaves.length,
  ).some(
    (rule) =>
      row >= rule.startRow &&
      row < rule.startRow + rule.rowspan &&
      col >= rule.startCol &&
      col < rule.startCol + rule.colspan,
  );
  const rawRow = preparedData.value[options.field]?.[row] || {};
  const horizontal = normalizeAgreeBodyHMerges(
    options.agreeBodyHMerges,
    leaves.length,
  ).some(
    (rule) =>
      (rule.rowIndex === row ||
        (rule.when &&
          Object.keys(rule.when).length > 0 &&
          Object.entries(rule.when).every(
            ([key, value]) => String(rawRow[key] ?? '').trim() === value,
          ))) &&
      (rule.spans[col] ?? 0) > 1,
  );
  return {
    split: singleCellSelected.value && (merged || horizontal),
    formula: singleCellSelected.value && !!leaves[col]?.field,
  };
});
const rowHeightOptions = computed(() => {
  const target = rowHeightTarget.value;
  if (!target || target.key !== props.selectedKey) return null;
  const [p, e] = target.key.split(':').map(Number);
  const element =
    props.templateJson?.panels?.[requireDefined(p)]?.printElements?.[
      requireDefined(e)
    ];
  if (element?.printElementType?.type !== 'table') return null;
  if (
    element.options.agreeFormGrid &&
    !element.options.agreeFormGrid.rows[target.templateRow ?? -1]
  )
    return null;
  return element.options;
});
const selectedTemplateRow = computed(
  () =>
    rowHeightOptions.value?.agreeFormGrid?.rows[
      rowHeightTarget.value?.templateRow ?? -1
    ],
);
const isRecordHeight = computed(
  () =>
    !!rowHeightOptions.value &&
    (!rowHeightOptions.value.agreeFormGrid ||
      !!selectedTemplateRow.value?.source),
);
const selectedRowOverride = computed(() =>
  rowHeightOverride(
    selectedTemplateRow.value?.source
      ? selectedTemplateRow.value.recordHeights
      : rowHeightOptions.value?.agreeBodyRowHeights,
    rowHeightTarget.value?.rowKey,
  ),
);
const canAdjustRowHeight = computed(
  () => !isRecordHeight.value || !!rowHeightTarget.value?.rowKey,
);
const selectedRowHeight = computed(() => {
  const options = rowHeightOptions.value;
  return (
    selectedRowOverride.value ??
    (options?.agreeFormGrid
      ? minimumRowHeight(
          options.agreeFormGrid.rows[rowHeightTarget.value?.templateRow ?? -1]
            ?.height,
          22,
        )
      : minimumRowHeight(options?.tableBodyRowHeight))
  );
});

function saveSelectedRowHeight(height?: number) {
  const target = rowHeightTarget.value;
  if (!target || !props.templateJson || !canAdjustRowHeight.value) return;
  const next = cloneJson(props.templateJson);
  const [p, e] = target.key.split(':').map(Number);
  const options =
    next.panels[requireDefined(p)].printElements[requireDefined(e)].options;
  if (options.agreeFormGrid) {
    const row = options.agreeFormGrid.rows[target.templateRow ?? -1];
    if (!row) return;
    if (row.source && target.rowKey) {
      const heights = setRowHeightOverride(
        row.recordHeights,
        target.rowKey,
        height,
      );
      if (Object.keys(heights).length > 0) row.recordHeights = heights;
      else delete row.recordHeights;
    } else if (height !== undefined) row.height = height;
  } else if (target.rowKey) {
    const heights = setRowHeightOverride(
      options.agreeBodyRowHeights,
      target.rowKey,
      height,
    );
    if (Object.keys(heights).length > 0) options.agreeBodyRowHeights = heights;
    else delete options.agreeBodyRowHeights;
  }
  commitLayout(next, target.key);
}

function changeSelectedRowHeight(event: Event) {
  const input = event.target as HTMLInputElement;
  const target = rowHeightTarget.value;
  if (
    !target ||
    !props.templateJson ||
    !input.checkValidity() ||
    !input.value
  ) {
    input.value = String(selectedRowHeight.value);
    return;
  }
  saveSelectedRowHeight(Number(input.value));
}
const selectionBox = ref<null | { left: number; top: number }>(null);
const guide = ref<null | {
  height: number;
  kind: 'beside' | 'order' | 'resize' | 'spacing';
  label: string;
  left: number;
  top: number;
  width: number;
}>(null);
const busy = ref(false);
const errorMessage = ref('');
const defaultHint =
  '选中元素后可拖动手柄调整位置；点表头编辑明细表，表体可拖选合并或拆分。';
const hint = ref(defaultHint);
let generation = 0;
const preparedData = ref<Record<string, any>>({});
let draggedKey = '';
let draggedPaper: HTMLElement | null = null;
let dragOriginY = 0;
let dragMode: 'auto' | 'order' | 'spacing' = 'auto';
let dragContent: HTMLElement | null = null;
let resizeObserver: ResizeObserver | undefined;

const selection = computed(() => {
  if (!props.templateJson || !props.selectedKey) return null;
  const peers = documentRowMembers(props.templateJson, props.selectedKey);
  const index = peers.findIndex((item) => item.key === props.selectedKey);
  const item = peers[index];
  return item
    ? { peers, index, box: item.element.options.agreeDocument }
    : null;
});
const dividers = ref<
  Array<{
    height: number;
    left: number;
    leftKey: string;
    rightKey: string;
    top: number;
    value: number;
  }>
>([]);
let resize: null | {
  delta: number;
  left: HTMLElement;
  leftKey: string;
  leftStyle: string;
  right: HTMLElement;
  rightKey: string;
  rightStyle: string;
  rowWidth: number;
  startX: number;
  template: Record<string, any>;
} = null;
function commitLayout(next: Record<string, any>, key = props.selectedKey) {
  emit('update:templateJson', next);
  emit('update:selectedKey', key);
}
function startResize(
  event: PointerEvent,
  divider: (typeof dividers.value)[number],
) {
  if (event.button !== 0 || !props.templateJson) return;
  event.preventDefault();
  const elements = [
    ...(host.value?.querySelectorAll<HTMLElement>('[data-doc-key]') || []),
  ];
  const left = elements.find((el) => el.dataset.docKey === divider.leftKey);
  const right = elements.find(
    (el) =>
      el.dataset.docKey === divider.rightKey &&
      el.parentElement === left?.parentElement,
  );
  if (!left || !right) return;
  resize = {
    leftKey: divider.leftKey,
    rightKey: divider.rightKey,
    startX: event.clientX,
    rowWidth: requireDefined(left.parentElement).getBoundingClientRect().width,
    delta: 0,
    template: props.templateJson,
    left,
    right,
    leftStyle: left.style.cssText,
    rightStyle: right.style.cssText,
  };
  window.addEventListener('pointermove', moveResize);
  window.addEventListener('pointerup', finishResize);
  window.addEventListener('pointercancel', cancelResize);
}
function moveResize(event: PointerEvent) {
  if (!resize || !shell.value) return;
  const r = resize;
  r.delta = ((event.clientX - r.startX) / Math.max(1, r.rowWidth)) * 100;
  const next = resizeDocumentColumns(
    r.template,
    r.leftKey,
    r.rightKey,
    r.delta,
  );
  const peers = documentRowMembers(next, r.leftKey);
  const a = requireDefined(peers.find((item) => item.key === r.leftKey)).element
    .options.agreeDocument;
  const b = requireDefined(peers.find((item) => item.key === r.rightKey))
    .element.options.agreeDocument;
  r.left.style.flexBasis = r.left.style.width = `${a.width}%`;
  r.right.style.flexBasis = r.right.style.width = `${b.width}%`;
  const box = r.left.getBoundingClientRect();
  const other = r.right.getBoundingClientRect();
  const outer = shell.value.getBoundingClientRect();
  guide.value = {
    kind: 'resize',
    left: (box.right + other.left) / 2 - outer.left,
    top: box.top - outer.top,
    width: 3,
    height: Math.max(box.height, other.height),
    label: `左 ${a.width.toFixed(1)}% / 右 ${b.width.toFixed(1)}% · 松开应用，Esc 取消`,
  };
  updateSelectionBox();
}
function cancelResize() {
  if (resize) {
    resize.left.style.cssText = resize.leftStyle;
    resize.right.style.cssText = resize.rightStyle;
  }
  resize = null;
  guide.value = null;
  window.removeEventListener('pointermove', moveResize);
  window.removeEventListener('pointerup', finishResize);
  window.removeEventListener('pointercancel', cancelResize);
  updateSelectionBox();
}
function finishResize(event: PointerEvent) {
  if (!resize) return;
  moveResize(event);
  const r = resize;
  cancelResize();
  if (Math.abs(r.delta) > 0.01)
    commitLayout(
      resizeDocumentColumns(r.template, r.leftKey, r.rightKey, r.delta),
    );
}
function keyboardResize(
  event: KeyboardEvent,
  divider: (typeof dividers.value)[number],
) {
  if (event.key === 'Escape') cancelResize();
  if (!props.templateJson || !['ArrowLeft', 'ArrowRight'].includes(event.key))
    return;
  event.preventDefault();
  if (resize) return;
  commitLayout(
    resizeDocumentColumns(
      props.templateJson,
      divider.leftKey,
      divider.rightKey,
      (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 5 : 1),
    ),
  );
}

function updateSelectionBox() {
  dividers.value = [];
  const cellSelection = props.bodyCellSelection;
  const rowTarget = rowHeightTarget.value;
  let toolbarBox: typeof cellToolbarBox.value = null;
  let heightPanelBox: typeof rowHeightPanelBox.value = null;
  if ((cellSelection || rowTarget) && shell.value) {
    const element = [
      ...(host.value?.querySelectorAll<HTMLElement>('[data-doc-key]') || []),
    ].filter(
      (el) => el.dataset.docKey === (cellSelection?.key || rowTarget?.key),
    );
    const target = element
      .flatMap((el) => [
        ...el.querySelectorAll<HTMLElement>('td[data-doc-record]'),
      ])
      .find((td) => {
        let matchesRow;
        if (cellSelection) {
          matchesRow = Number(td.dataset.docRecord) === cellSelection.endRow;
        } else {
          matchesRow = rowTarget?.rowKey
            ? td.dataset.docRowKey === rowTarget.rowKey &&
              (rowTarget.templateRow === undefined ||
                Number(td.dataset.docTemplateRow) === rowTarget.templateRow)
            : Number(td.dataset.docRecord) === rowTarget?.record;
        }
        return (
          matchesRow &&
          Number(td.dataset.docCol) ===
            (cellSelection?.endCol ?? rowTarget?.col)
        );
      });
    if (target) {
      let rect: Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'> =
        target.getBoundingClientRect();
      const outer = shell.value.getBoundingClientRect();
      const bounds = visibleCanvasBounds();
      const size = cellToolbar.value?.getBoundingClientRect();
      if (cellSelection && !singleCellSelected.value) {
        const fragment = target.closest('[data-doc-key]');
        const cells = [
          ...(fragment?.querySelectorAll('.document-cell-selected') || []),
        ].map((cell) => cell.getBoundingClientRect());
        const top = Math.min(...cells.map((cell) => cell.top));
        const bottom = Math.max(...cells.map((cell) => cell.bottom));
        if (
          cells.length > 0 &&
          bottom - top + (size?.height || 38) + 16 <= bounds.bottom - bounds.top
        )
          rect = {
            ...rect,
            top,
            bottom,
            left: Math.min(...cells.map((cell) => cell.left)),
            right: Math.max(...cells.map((cell) => cell.right)),
          };
      }
      if (
        rect.bottom >= bounds.top &&
        rect.top <= bounds.bottom &&
        rect.right >= bounds.left &&
        rect.left <= bounds.right
      ) {
        const placed = placeCellToolbar(rect, bounds, {
          width: size?.width || 360,
          height: size?.height || 38,
        });
        toolbarBox = {
          ...placed,
          left: placed.left - outer.left,
          top: placed.top - outer.top,
        };
        if (rowHeightOpen.value) {
          const panelSize = rowHeightPanel.value?.getBoundingClientRect();
          const panel = placeCellToolbar(
            {
              left: placed.left,
              right: placed.left + (size?.width || 360),
              top: placed.top,
              bottom: placed.top + (size?.height || 38),
            },
            bounds,
            {
              width: panelSize?.width || 320,
              height: panelSize?.height || 190,
            },
          );
          heightPanelBox = {
            ...panel,
            left: panel.left - outer.left,
            top: panel.top - outer.top,
          };
        }
      }
    }
  }
  cellToolbarBox.value = toolbarBox;
  rowHeightPanelBox.value = heightPanelBox;
  const selected = [
    ...(host.value?.querySelectorAll<HTMLElement>('[data-doc-key]') || []),
  ].find((el) => el.dataset.docKey === props.selectedKey);
  const content = selected?.firstElementChild;
  if (!content || !shell.value) {
    selectionBox.value = null;
    return;
  }
  const box = content.getBoundingClientRect();
  const outer = shell.value.getBoundingClientRect();
  const members = [
    ...(selected?.parentElement?.querySelectorAll<HTMLElement>(
      ':scope > [data-doc-key]',
    ) || []),
  ];
  for (let i = 0; i < members.length - 1; i++) {
    const left = requireDefined(members[i]);
    const right = requireDefined(members[i + 1]);
    const a = left.getBoundingClientRect();
    const b = right.getBoundingClientRect();
    const peer = selection.value?.peers.find(
      (item) => item.key === left.dataset.docKey,
    );
    if (
      !peer ||
      selection.value?.peers[selection.value.peers.indexOf(peer) + 1]?.key !==
        right.dataset.docKey
    )
      continue;
    dividers.value.push({
      left: (a.right + b.left) / 2 - outer.left - 5,
      top: Math.min(a.top, b.top) - outer.top,
      height: Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top),
      leftKey: requireDefined(left.dataset.docKey),
      rightKey: requireDefined(right.dataset.docKey),
      value: peer.element.options.agreeDocument.width,
    });
  }
  /** 调间距/排序放在表外右侧，避免压住表头；右侧不够再改到表上方 */
  const handleW = 136;
  const handleH = 28;
  const gap = 8;
  const rightLeft = box.right - outer.left + gap;
  const aboveTop = box.top - outer.top - handleH - 4;
  const useRight = rightLeft + handleW <= outer.width - 4;
  selectionBox.value = {
    left: useRight
      ? rightLeft
      : Math.max(
          0,
          Math.min(box.right - outer.left - handleW, outer.width - handleW),
        ),
    top: useRight ? Math.max(0, box.top - outer.top) : Math.max(0, aboveTop),
  };
}

function visibleCanvasBounds() {
  const bounds = {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
  for (
    let parent = shell.value?.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent);
    const rect = parent.getBoundingClientRect();
    if (
      rect.width &&
      /(auto|scroll|hidden|clip)/.test(style.overflowX || style.overflow)
    ) {
      bounds.left = Math.max(bounds.left, rect.left);
      bounds.right = Math.min(bounds.right, rect.right);
    }
    if (
      rect.height &&
      /(auto|scroll|hidden|clip)/.test(style.overflowY || style.overflow)
    ) {
      bounds.top = Math.max(bounds.top, rect.top);
      bounds.bottom = Math.min(bounds.bottom, rect.bottom);
    }
  }
  return {
    left: bounds.left + 8,
    top: bounds.top + 8,
    right: bounds.right - 8,
    bottom: bounds.bottom - 8,
  };
}

let selectionFrame = 0;
function scheduleSelectionBox() {
  if (selectionFrame) return;
  selectionFrame = requestAnimationFrame(() => {
    selectionFrame = 0;
    updateSelectionBox();
  });
}

function closeRowHeightOnOutsideClick(event: PointerEvent) {
  const target = event.target as Node;
  if (
    !cellToolbar.value?.contains(target) &&
    !rowHeightPanel.value?.contains(target)
  )
    rowHeightOpen.value = false;
}

/**
 * 设计器专用：往表头格塞 ▾，正式打印走另一份 renderDocument，不会带上按钮
 * @param td 表头格
 * @param canFilter 单列叶子才显示
 */
function mountHeaderFilterButton(td: HTMLElement, canFilter: boolean) {
  const old = td.querySelector('.document-header-filter');
  if (!canFilter) {
    old?.remove();
    return;
  }
  td.style.position = 'relative';
  let btn = old as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'document-header-filter';
    btn.dataset.docHeaderFilter = '1';
    btn.setAttribute('aria-label', '筛选本列');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.title = '筛选本列';
    btn.textContent = '▾';
    btn.addEventListener('pointerdown', (event) => event.stopPropagation());
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const wrap = td.closest<HTMLElement>('[data-doc-key]');
      if (!wrap) return;
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      emit('headerFilterRequested', {
        key: wrap.dataset.docKey || '',
        field: td.dataset.docHeaderField || '',
        fromLeaf: Number(td.dataset.docLeafStart),
        toLeaf: Number(td.dataset.docLeafEnd ?? td.dataset.docLeafStart),
        clientX: rect.left,
        clientY: rect.bottom,
        anchor: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        },
      });
    });
    td.append(btn);
  }
  btn.classList.toggle(
    'is-on',
    td.classList.contains('document-header-filtered'),
  );
  btn.classList.toggle(
    'is-sorted',
    td.classList.contains('document-header-sorted'),
  );
}

function selectOutline() {
  host.value?.querySelectorAll<HTMLElement>('[data-doc-key]').forEach((el) => {
    el.classList.toggle(
      'document-selected',
      el.dataset.docKey === props.selectedKey,
    );
    const activeCell =
      rowHeightTarget.value?.key === el.dataset.docKey ||
      props.bodyCellSelection?.key === el.dataset.docKey ||
      props.headerCellSelection?.key === el.dataset.docKey;
    el.classList.toggle('document-cell-active', activeCell);
    el.classList.toggle('document-table-selected', !!el.querySelector('table'));
    el.draggable = false;
    if (el.firstElementChild instanceof HTMLElement)
      el.firstElementChild.draggable = false;
    el.title =
      '拖到空白处调间距；拖到其他内容上排序。也可使用选中后的拖动手柄。';
    el.querySelectorAll<HTMLTableCellElement>('td[data-doc-col]').forEach(
      (td) => {
        const selection = props.bodyCellSelection;
        const r = Number(td.dataset.docRecord);
        const c = Number(td.dataset.docCol);
        const target = rowHeightTarget.value;
        const formSelected =
          !selection &&
          !!target &&
          target.key === el.dataset.docKey &&
          r === target.record &&
          c === target.col;
        const inSelection =
          formSelected ||
          (!!selection &&
            selection.key === el.dataset.docKey &&
            r >= Math.min(selection.startRow, selection.endRow) &&
            r <= Math.max(selection.startRow, selection.endRow) &&
            c >= Math.min(selection.startCol, selection.endCol) &&
            c <= Math.max(selection.startCol, selection.endCol));
        td.classList.toggle('document-cell-selected', inSelection);
        td.classList.toggle(
          'document-cell-single',
          inSelection && singleCellSelected.value,
        );
        td.classList.toggle(
          'document-cell-range',
          inSelection && !singleCellSelected.value,
        );
        td.classList.toggle(
          'document-column-highlight',
          el.dataset.docKey === props.highlightTableKey &&
            c === props.highlightColIndex,
        );
        const range = singleCellSelected.value ? null : selection;
        td.classList.toggle(
          'is-range-top',
          !!range &&
            inSelection &&
            r === Math.min(range.startRow, range.endRow),
        );
        td.classList.toggle(
          'is-range-bottom',
          !!range &&
            inSelection &&
            r + td.rowSpan - 1 >= Math.max(range.startRow, range.endRow),
        );
        td.classList.toggle(
          'is-range-left',
          !!range &&
            inSelection &&
            c === Math.min(range.startCol, range.endCol),
        );
        td.classList.toggle(
          'is-range-right',
          !!range &&
            inSelection &&
            c + td.colSpan - 1 >= Math.max(range.startCol, range.endCol),
        );
        const heightTarget = rowHeightTarget.value;
        td.parentElement?.classList.toggle(
          'document-row-height-selected',
          rowHeightOpen.value &&
            !!heightTarget &&
            td.dataset.docRecord !== undefined &&
            heightTarget.key === el.dataset.docKey &&
            (heightTarget.rowKey
              ? td.dataset.docRowKey === heightTarget.rowKey &&
                (heightTarget.templateRow === undefined ||
                  Number(td.dataset.docTemplateRow) ===
                    heightTarget.templateRow)
              : r === heightTarget.record),
        );
      },
    );
    const [panelIndex, elementIndex] = String(el.dataset.docKey || '')
      .split(':')
      .map(Number);
    const tableOptions =
      props.templateJson?.panels?.[requireDefined(panelIndex)]?.printElements?.[
        requireDefined(elementIndex)
      ]?.options || {};
    const filterExpr = String(tableOptions.agreeRowFilter || '');
    el.querySelectorAll<HTMLElement>('td[data-doc-header]').forEach((td) => {
      const from = Number(td.dataset.docLeafStart);
      const to = Number(td.dataset.docLeafEnd ?? from);
      const headerSel = props.headerCellSelection;
      const inHeader =
        !!headerSel &&
        headerSel.key === el.dataset.docKey &&
        Number.isInteger(from) &&
        from === headerSel.fromLeaf &&
        to === headerSel.toLeaf;
      td.classList.toggle('document-header-selected', inHeader);
      const field = td.dataset.docHeaderField || '';
      const fromLeaf = Number(td.dataset.docLeafStart);
      const toLeaf = Number(td.dataset.docLeafEnd ?? fromLeaf);
      const canFilter = fromLeaf === toLeaf && !!field;
      td.classList.toggle(
        'document-header-filtered',
        canFilter && fieldInFilterExpr(filterExpr, field),
      );
      const sorted = (tableOptions.agreeRowSort || []).some(
        (rule: { field?: string }) => rule?.field === field,
      );
      td.classList.toggle('document-header-sorted', canFilter && sorted);
      mountHeaderFilterButton(td, canFilter);
    });
  });
  updateSelectionBox();
}
watch(
  () => [props.templateJson, props.sampleData],
  async () => {
    if (resize) cancelResize();
    const version = ++generation;
    if (!props.templateJson) return;
    busy.value = true;
    errorMessage.value = '';
    try {
      const prepared = preparePrintTemplate(
        props.templateJson,
        (props.sampleData || {}) as AgreePrintData,
      );
      const html = await renderDocument(prepared.template, prepared.printData, {
        design: true,
      });
      if (version !== generation) return;
      preparedData.value = prepared.printData;
      await nextTick();
      host.value?.replaceChildren(html);
      selectOutline();
    } catch (error) {
      if (version === generation)
        errorMessage.value =
          error instanceof Error ? error.message : String(error);
    } finally {
      if (version === generation) busy.value = false;
    }
  },
  { immediate: true, deep: true },
);
watch(
  () => props.selectedKey,
  () => {
    if (rowHeightTarget.value?.key !== props.selectedKey)
      rowHeightTarget.value = null;
    void nextTick(selectOutline);
  },
);
watch(
  () => props.zoom,
  () => void nextTick(updateSelectionBox),
);
watch(
  () => [
    rowHeightTarget.value,
    props.bodyCellSelection,
    props.headerCellSelection,
    props.highlightColIndex,
    props.highlightTableKey,
    rowHeightOpen.value,
  ],
  selectOutline,
  { deep: true },
);
function cancelDrag(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    cancelResize();
    dragEnd();
  }
}
watch(cellToolbar, (element, previous) => {
  if (previous) resizeObserver?.unobserve(previous);
  if (element) resizeObserver?.observe(element);
  if (element) void nextTick(updateSelectionBox);
});
watch(rowHeightPanel, (element, previous) => {
  if (previous) resizeObserver?.unobserve(previous);
  if (element) resizeObserver?.observe(element);
  if (element) void nextTick(updateSelectionBox);
});
watch(rowHeightOpen, () => void nextTick(updateSelectionBox));
onMounted(() => {
  resizeObserver = new ResizeObserver(updateSelectionBox);
  if (host.value) resizeObserver.observe(host.value);
  window.addEventListener('keydown', cancelDrag);
  window.addEventListener('resize', scheduleSelectionBox);
  window.addEventListener('scroll', scheduleSelectionBox, true);
  window.addEventListener('pointerdown', closeRowHeightOnOutsideClick);
});
onBeforeUnmount(() => {
  generation++;
  cancelResize();
  resizeObserver?.disconnect();
  window.removeEventListener('keydown', cancelDrag);
  window.removeEventListener('resize', scheduleSelectionBox);
  window.removeEventListener('scroll', scheduleSelectionBox, true);
  window.removeEventListener('pointerdown', closeRowHeightOnOutsideClick);
  if (selectionFrame) cancelAnimationFrame(selectionFrame);
});

type DragPoint = PalettePoint & {
  dataTransfer?: DataTransfer | null;
  preventDefault: () => void;
  target: EventTarget | null;
};
function cellAt(event: { target: EventTarget | null }) {
  return (event.target as HTMLElement)?.closest<HTMLElement>('[data-doc-key]');
}
function click(event: MouseEvent) {
  rowHeightOpen.value = false;
  rowHeightTarget.value = null;
  const cell = cellAt(event);
  const paper = (event.target as HTMLElement).closest<HTMLElement>(
    '[data-panel-index]',
  );
  if (!cell) {
    if (paper) emit('pageSelect', Number(paper.dataset.panelIndex));
    emit('update:selectedKey', '');
    return;
  }
  emit('update:selectedKey', requireDefined(cell.dataset.docKey));
  if (!(event.target as HTMLElement).closest('td[data-doc-record]'))
    emit('tableBodySelectionClear');
  const footer = (event.target as HTMLElement).closest<HTMLElement>(
    'td[data-doc-footer]',
  );
  if (footer) {
    emit('tableFooterCellSelect', {
      key: requireDefined(cell.dataset.docKey),
      rowIndex: Number(footer.dataset.docFooterRow),
      cellIndex: Number(footer.dataset.docFooterCell),
    });
    return;
  }
  const header = (event.target as HTMLElement).closest<HTMLElement>(
    'td[data-doc-header]',
  );
  if ((event.target as HTMLElement).closest('[data-doc-header-filter]')) {
    return;
  }
  if (header && header.dataset.docLeafStart !== undefined) {
    emit('tableHeaderCellSelect', {
      key: requireDefined(cell.dataset.docKey),
      fromLeaf: Number(header.dataset.docLeafStart),
      toLeaf: Number(header.dataset.docLeafEnd ?? header.dataset.docLeafStart),
      field: header.dataset.docHeaderField || '',
      mergeId: header.dataset.docHeaderMerge || '',
      shiftKey: event.shiftKey,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    return;
  }
  const td = (event.target as HTMLElement).closest<HTMLElement>(
    'td[data-doc-record]',
  );
  const [p, i] = requireDefined(cell.dataset.docKey).split(':').map(Number);
  if (td) {
    rowHeightTarget.value = {
      col: Number(td.dataset.docCol),
      key: requireDefined(cell.dataset.docKey),
      record: Number(td.dataset.docRecord),
      rowKey: td.dataset.docRowKey,
      templateRow:
        td.dataset.docTemplateRow === undefined
          ? undefined
          : Number(td.dataset.docTemplateRow),
    };
    void nextTick(selectOutline);
  }
  if (
    td &&
    !props.templateJson?.panels?.[requireDefined(p)]?.printElements?.[
      requireDefined(i)
    ]?.options?.agreeFormGrid
  )
    emit('tableBodyCellSelect', {
      key: requireDefined(cell.dataset.docKey),
      rowIndex: Number(td.dataset.docRecord),
      colIndex: Number(td.dataset.docCol),
      rawRow:
        preparedData.value[requireDefined(cell.dataset.docField)]?.[
          Number(td.dataset.docRecord)
        ] || {},
      shiftKey: event.shiftKey,
    });
}
function context(event: MouseEvent) {
  const cell = cellAt(event);
  if (!cell) return;
  event.preventDefault();
  emit('update:selectedKey', requireDefined(cell.dataset.docKey));
  emit('contextmenu', {
    key: requireDefined(cell.dataset.docKey),
    clientX: event.clientX,
    clientY: event.clientY,
  });
}
type CanvasPointerPayload = {
  content: HTMLElement;
  key: string;
  mode: 'auto' | 'order' | 'spacing';
  paper: HTMLElement;
};
const { start: beginCanvasPointer, suppressClick: suppressCanvasClick } =
  usePalettePointerDrag<CanvasPointerPayload>({
    begin(point, payload) {
      draggedKey = payload.key;
      draggedPaper = payload.paper;
      dragContent = payload.content;
      dragMode = payload.mode;
      dragOriginY = point.clientY - payload.paper.getBoundingClientRect().top;
    },
    move(point) {
      const event = pointerEventAt(point);
      if (event) dragOver(event);
      else guide.value = null;
    },
    drop(point) {
      const event = pointerEventAt(point);
      if (event) drop(event);
    },
    cancel: dragEnd,
  });
function startCanvasPointer(
  event: PointerEvent,
  mode: CanvasPointerPayload['mode'] = 'auto',
) {
  if (resize || busy.value) return;
  const cell =
    mode === 'auto'
      ? cellAt(event)
      : [
          ...(host.value?.querySelectorAll<HTMLElement>('[data-doc-key]') ||
            []),
        ].find((el) => el.dataset.docKey === props.selectedKey);
  const paper = cell?.closest<HTMLElement>('[data-panel-index]');
  if (!cell?.firstElementChild || !paper) return;
  beginCanvasPointer(
    event,
    {
      key: requireDefined(cell.dataset.docKey),
      mode,
      content: cell.firstElementChild as HTMLElement,
      paper,
    },
    '移动元素',
  );
}
function target(event: DragPoint) {
  let cell = cellAt(event);
  const paper =
    (event.target as HTMLElement).closest<HTMLElement>('[data-panel-index]') ||
    [
      ...(host.value?.querySelectorAll<HTMLElement>('[data-panel-index]') ||
        []),
    ].find((el) => {
      const r = el.getBoundingClientRect();
      return (
        event.clientX >= r.left &&
        event.clientX <= r.right &&
        event.clientY >= r.top &&
        event.clientY <= r.bottom
      );
    });
  if (!paper) return null;
  let bounds = cell?.firstElementChild?.getBoundingClientRect();
  if (bounds && (event.clientY < bounds.top || event.clientY > bounds.bottom)) {
    cell = null;
    bounds = undefined;
  }
  // 排序手柄在空白处也吸附到最近的内容边界，不要求精确压住文字。
  if (
    (!cell || cell.dataset.docKey === draggedKey) &&
    (dragMode === 'order' || !draggedKey)
  ) {
    const candidates = [
      ...paper.querySelectorAll<HTMLElement>('[data-doc-key]'),
    ].filter((el) => el.dataset.docKey !== draggedKey && el.firstElementChild);
    cell =
      candidates.toSorted((a, b) => {
        const distance = (el: HTMLElement) => {
          const r = requireDefined(
            el.firstElementChild,
          ).getBoundingClientRect();
          return Math.min(
            Math.abs(event.clientY - r.top),
            Math.abs(event.clientY - r.bottom),
          );
        };
        return distance(a) - distance(b);
      })[0] || null;
    bounds = cell?.firstElementChild?.getBoundingClientRect();
  }
  let placement: 'after' | 'before' | 'beside' | 'beside-before' = 'after';
  if (bounds) {
    const insideY =
      event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (
      insideY &&
      event.clientX > bounds.right - Math.min(32, bounds.width * 0.15) &&
      event.clientX <= bounds.right
    )
      placement = 'beside';
    else if (
      insideY &&
      event.clientX >= bounds.left &&
      event.clientX < bounds.left + Math.min(32, bounds.width * 0.15)
    )
      placement = 'beside-before';
    else if (event.clientY < bounds.top + bounds.height / 2)
      placement = 'before';
  }
  return {
    cell,
    paper,
    key: cell?.dataset.docKey,
    panelIndex: Number(paper.dataset.panelIndex),
    placement,
  } as const;
}
function spacingDelta(
  event: DragPoint,
  dest: NonNullable<ReturnType<typeof target>>,
) {
  if (
    !draggedKey ||
    dragMode === 'order' ||
    dest.paper !== draggedPaper ||
    (dragMode !== 'spacing' && dest.key && dest.key !== draggedKey)
  )
    return null;
  return (
    (((event.clientY - dest.paper.getBoundingClientRect().top - dragOriginY) /
      (Math.max(1, props.zoom) / 100)) *
      72) /
    96
  );
}
function dragEnd() {
  draggedKey = '';
  draggedPaper = null;
  dragContent = null;
  dragMode = 'auto';
  guide.value = null;
  hint.value = defaultHint;
}
function dragOver(event: DragPoint) {
  const drop = target(event);
  if (!drop) {
    guide.value = null;
    return;
  }
  event.preventDefault();
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = draggedKey ? 'move' : 'copy';
  const delta = spacingDelta(event, drop);
  if (delta !== null) {
    const current = documentElementSpacing(
      requireDefined(props.templateJson),
      draggedKey,
    );
    const spacing = Math.max(
      0,
      Math.min(Math.max(MAX_DOCUMENT_SPACE_PT, current), current + delta),
    );
    hint.value =
      spacing === 0
        ? '上方间距已收紧到 0；要跨过上一段，请使用「排序」手柄'
        : '松开调整当前元素间距，同行其他元素位置不变';
    if (dragContent && shell.value) {
      const box = dragContent.getBoundingClientRect();
      const outer = shell.value.getBoundingClientRect();
      guide.value = {
        kind: 'spacing',
        left: box.left - outer.left,
        top:
          box.top -
          outer.top +
          ((((spacing - current) * props.zoom) / 100) * 96) / 72,
        width: box.width,
        height: box.height,
        label: `上方间距 ${Math.round(spacing)} pt ≈ ${((spacing * 25.4) / 72).toFixed(1)} mm${spacing === 0 ? ' · 已到最小值' : ''}`,
      };
    }
    return;
  }
  if (dragMode === 'spacing') {
    guide.value = null;
    hint.value = '调间距请留在当前纸张内；跨页移动请使用「排序」';
    return;
  }
  let dropHint;
  if (drop.placement === 'beside' || drop.placement === 'beside-before') {
    dropHint = `松开放到目标${drop.placement === 'beside-before' ? '左' : '右'}侧`;
  } else {
    dropHint =
      drop.placement === 'before' ? '松开插入目标上方' : '松开插入目标下方';
  }
  hint.value = dropHint;
  if (drop.cell && shell.value) {
    const bounds = requireDefined(
      drop.cell.firstElementChild,
    ).getBoundingClientRect();
    const row = requireDefined(drop.cell.parentElement).getBoundingClientRect();
    const outer = shell.value.getBoundingClientRect();
    const beside =
      drop.placement === 'beside' || drop.placement === 'beside-before';
    let guideLeft;
    if (beside) {
      guideLeft =
        drop.placement === 'beside-before' ? bounds.left : bounds.right;
    } else {
      guideLeft = row.left;
    }
    let guideTop;
    if (beside) {
      guideTop = bounds.top;
    } else {
      guideTop = drop.placement === 'before' ? row.top : row.bottom;
    }
    let guideLabel;
    if (beside) {
      guideLabel = besideLabel(requireDefined(drop.key), drop.placement);
    } else {
      guideLabel =
        drop.placement === 'before' ? '插入此行之前' : '插入此行之后';
    }
    guide.value = {
      kind: beside ? 'beside' : 'order',
      left: guideLeft - outer.left,
      top: guideTop - outer.top,
      width: beside ? 3 : row.width,
      height: beside ? bounds.height : 3,
      label: guideLabel,
    };
  } else guide.value = null;
}
function besideLabel(key: string, placement: string) {
  if (!props.templateJson) return '';
  const peers = documentRowMembers(props.templateJson, key);
  const same = peers.some((item) => item.key === draggedKey);
  const count = peers.length + (same ? 0 : 1);
  return `放在目标${placement === 'beside-before' ? '左' : '右'}侧 · ${same ? '保留各列宽度' : `共 ${count} 列，每列约 ${((100 - Math.min(3, 40 / count) * (count - 1)) / count).toFixed(1)}%`}`;
}
function drop(event: DragPoint, externalPayload?: PalettePayload) {
  const dest = target(event);
  if (!dest || !props.templateJson) return;
  event.preventDefault();
  const delta = spacingDelta(event, dest);
  if (delta !== null) {
    emit(
      'update:templateJson',
      adjustDocumentElementSpacing(props.templateJson, draggedKey, delta),
    );
    emit('update:selectedKey', draggedKey);
    dragEnd();
    return;
  }
  if (dragMode === 'spacing') {
    dragEnd();
    return;
  }
  let payload: any = externalPayload || getAgreePrintHtml5Drag();
  if (!payload) {
    try {
      payload = JSON.parse(event.dataTransfer?.getData('text/plain') || '{}');
    } catch {
      return;
    }
  }
  const source = draggedKey || payload?.documentKey;
  if (source) {
    let targetKey = dest.key;
    if (!targetKey) {
      const elements =
        props.templateJson.panels[dest.panelIndex]?.printElements || [];
      targetKey =
        elements.length > 0
          ? `${dest.panelIndex}:${elements.length - 1}`
          : undefined;
    }
    let next: Record<string, any>;
    let selected = source;
    if (targetKey) {
      next = moveDocumentElement(
        props.templateJson,
        source,
        targetKey,
        dest.placement,
      );
      if (Number(source.split(':')[0]) !== dest.panelIndex)
        selected = `${dest.panelIndex}:${next.panels[dest.panelIndex].printElements.length - 1}`;
    } else {
      next = cloneJson(props.templateJson);
      const [p, i] = source.split(':').map(Number);
      const [element] = next.panels[requireDefined(p)].printElements.splice(
        requireDefined(i),
        1,
      );
      element.options.agreeDocument.row = 0;
      next.panels[dest.panelIndex].printElements.push(element);
      selected = `${dest.panelIndex}:${next.panels[dest.panelIndex].printElements.length - 1}`;
    }
    commitLayout(next, selected);
  } else if (payload?.kind) {
    const position = {
      panelIndex: dest.panelIndex,
      left: 20,
      top: dest.key
        ? Number(
            props.templateJson.panels[dest.panelIndex].printElements[
              Number(dest.key.split(':')[1])
            ]?.options?.top || 20,
          )
        : 100_000,
      documentTarget: dest.key,
      documentPlacement: dest.placement,
    };
    if (payload.kind === AGREE_PRINT_FIELD_DND)
      emit('fieldDrop', { ...position, item: payload.item });
    else emit('toolboxDrop', { ...position, tid: payload.tid });
  }
  dragEnd();
}
function scrollToPanel(index: number) {
  host.value
    ?.querySelector(`[data-panel-index="${index}"]`)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function pointerEventAt(point: PalettePoint): DragPoint | null {
  const element = document.elementFromPoint(point.clientX, point.clientY);
  if (!element || !shell.value?.contains(element) || busy.value) return null;
  return {
    ...{ clientX: point.clientX, clientY: point.clientY },
    target: element,
    preventDefault() {},
  };
}
function paletteDragOver(point: PalettePoint) {
  const event = pointerEventAt(point);
  if (event) dragOver(event);
  else dragEnd();
}
function paletteDrop(point: PalettePoint, payload: PalettePayload) {
  const event = pointerEventAt(point);
  if (event) drop(event, payload);
  dragEnd();
}
defineExpose({
  scrollToPanel,
  paletteDragOver,
  paletteDrop,
  cancelPaletteDrag: dragEnd,
});
</script>

<template>
  <div
    ref="shell"
    class="document-canvas"
    @dragenter="dragOver"
    @dragover="dragOver"
    @drop="drop"
    @click.capture="suppressCanvasClick"
  >
    <p class="document-hint">文档流排版 · {{ busy ? '正在排版…' : hint }}</p>
    <div
      v-if="(bodyCellSelection || rowHeightOptions) && cellToolbarBox && !busy"
      ref="cellToolbar"
      class="document-cell-toolbar"
      :style="{
        left: `${cellToolbarBox.left}px`,
        top: `${cellToolbarBox.top}px`,
        maxWidth: `${cellToolbarBox.maxWidth}px`,
        maxHeight: `${cellToolbarBox.maxHeight}px`,
      }"
      @pointerdown.stop
      @click.stop
      role="toolbar"
      aria-label="选中单元格操作"
      @keydown.esc.stop.prevent="rowHeightOpen = false"
    >
      <div class="document-cell-toolbar__actions">
        <span class="document-cell-toolbar__label">{{
          cellSelectionLabel
        }}</span>
        <template v-if="bodyCellSelection && !rowHeightOptions?.agreeFormGrid">
          <span
            :title="
              singleCellSelected
                ? '请选择至少两个相邻单元格，可拖选或按住 Shift 点选终点'
                : '合并所选矩形区域'
            "
          >
            <button
              type="button"
              :disabled="singleCellSelected"
              @click="emit('bodyMergeRequested')"
            >
              合并
            </button>
          </span>
          <span
            :title="
              bodyCellActions.split
                ? '拆分当前合并单元格'
                : '请选择一个手工合并的单元格；自动合并请在列规则中调整'
            "
          >
            <button
              type="button"
              :disabled="!bodyCellActions.split"
              @click="emit('bodySplitRequested')"
            >
              拆分
            </button>
          </span>
          <span
            :title="
              bodyCellActions.formula
                ? '设置当前单元格的计算公式'
                : '请选择一个绑定字段的单元格'
            "
          >
            <button
              type="button"
              :disabled="!bodyCellActions.formula"
              @click="emit('bodyFormulaRequested')"
            >
              计算
            </button>
          </span>
        </template>
        <button
          v-if="rowHeightOptions"
          type="button"
          :aria-expanded="rowHeightOpen"
          :aria-controls="rowHeightPanelId"
          title="更多：行高设置"
          @click="rowHeightOpen = !rowHeightOpen"
        >
          更多 ⋯
        </button>
      </div>
    </div>
    <div
      v-if="rowHeightOpen && rowHeightOptions && rowHeightPanelBox && !busy"
      ref="rowHeightPanel"
      :id="rowHeightPanelId"
      class="document-row-height-panel"
      role="group"
      aria-label="行高设置"
      :style="{
        left: `${rowHeightPanelBox.left}px`,
        top: `${rowHeightPanelBox.top}px`,
        maxWidth: `${rowHeightPanelBox.maxWidth}px`,
        maxHeight: `${rowHeightPanelBox.maxHeight}px`,
      }"
      @pointerdown.stop
      @click.stop
      @keydown.esc.stop.prevent="rowHeightOpen = false"
    >
      <strong>行高设置</strong>
      <label v-if="rowHeightOptions" class="document-row-height-control">
        当前行最小高度
        <input
          type="number"
          :value="selectedRowHeight"
          :min="rowHeightOptions.agreeFormGrid ? 18 : 6"
          max="600"
          step="any"
          aria-label="画布行最小高度"
          :disabled="!canAdjustRowHeight"
          @change="changeSelectedRowHeight"
        />
        pt
      </label>
      <button
        v-if="rowHeightOptions && isRecordHeight"
        type="button"
        :disabled="selectedRowOverride === undefined"
        @click="saveSelectedRowHeight()"
      >
        恢复默认行高
      </button>
      <small v-if="rowHeightOptions">{{
        !canAdjustRowHeight
          ? '记录内容相同且没有唯一标识，请在数据中提供唯一 id 后单独调整。'
          : isRecordHeight
            ? `${selectedRowOverride === undefined ? '当前行跟随默认' : '当前行已单独设置'}；仅影响本记录，长内容自动撑高。`
            : '仅调整当前行；同行所有单元格同步变化，长内容自动撑高。'
      }}</small>
    </div>
    <p v-if="errorMessage" class="document-error" role="alert">
      {{ errorMessage }}
    </p>
    <div
      v-if="selectionBox && !busy"
      class="document-drag-handles"
      :style="{ left: `${selectionBox.left}px`, top: `${selectionBox.top}px` }"
      @click.stop
    >
      <button
        type="button"
        draggable="false"
        title="上下拖动调整间距，向上可收紧到 0"
        @pointerdown.stop="startCanvasPointer($event, 'spacing')"
      >
        ↕ 调间距
      </button>
      <button
        type="button"
        draggable="false"
        title="拖到蓝色插入线处改变顺序；拖到左右边缘放入同行"
        @pointerdown.stop="startCanvasPointer($event, 'order')"
      >
        ⠿ 排序
      </button>
    </div>
    <div
      v-for="divider in dividers"
      :key="divider.leftKey"
      role="separator"
      tabindex="0"
      aria-label="调整相邻两列宽度"
      aria-orientation="vertical"
      :aria-valuenow="Math.round(divider.value)"
      class="document-column-divider"
      :style="{
        left: `${divider.left}px`,
        top: `${divider.top}px`,
        height: `${divider.height}px`,
      }"
      @pointerdown.stop="startResize($event, divider)"
      @keydown.stop="keyboardResize($event, divider)"
      @click.stop
    >
      <span>↔</span>
    </div>
    <div
      v-if="guide"
      class="document-drop-guide"
      :class="`is-${guide.kind}`"
      :style="{
        left: `${guide.left}px`,
        top: `${guide.top}px`,
        width: `${guide.width}px`,
        height: `${guide.height}px`,
      }"
    >
      <span>{{ guide.label }}</span>
    </div>
    <div
      ref="host"
      :style="{ zoom: zoom / 100 }"
      @click="click"
      @contextmenu="context"
      @pointerdown="startCanvasPointer"
      @dragstart.prevent
    ></div>
  </div>
</template>

<style scoped>
.document-canvas {
  position: relative;
  min-height: 100%;
  padding: 20px;
  background: var(--el-bg-color-page);
}

.document-column-divider {
  position: absolute;
  z-index: 3;
  width: 10px;
  min-height: 24px;
  touch-action: none;
  cursor: col-resize;
  background: linear-gradient(
    to right,
    transparent 4px,
    #60a5fa 4px,
    #60a5fa 6px,
    transparent 6px
  );
}

.document-column-divider span {
  position: absolute;
  top: 50%;
  left: -4px;
  line-height: 20px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 3px;
}

.document-column-divider:focus-visible {
  outline: 2px solid #2563eb;
}

.document-cell-toolbar {
  position: absolute;
  z-index: 4;
  display: flex;
  flex-direction: column;
  width: max-content;
  overflow: auto;
  font-size: 12px;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  box-shadow: 0 3px 12px #0002;
}

.document-cell-toolbar__actions {
  display: flex;
  gap: 2px;
  align-items: center;
  min-height: 36px;
  padding: 4px 6px;
  white-space: nowrap;
}

.document-cell-toolbar__label {
  padding: 0 8px;
  margin-right: 4px;
  color: var(--el-text-color-secondary);
  border-right: 1px solid var(--el-border-color-light);
}

.document-cell-toolbar button,
.document-row-height-panel button {
  padding: 4px 8px;
  color: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 4px;
}

.document-cell-toolbar button:hover:not(:disabled),
.document-cell-toolbar button[aria-expanded='true'] {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.document-cell-toolbar button:disabled,
.document-row-height-panel button:disabled {
  color: var(--el-text-color-disabled);
  cursor: not-allowed;
}

.document-cell-toolbar button:focus-visible,
.document-row-height-panel button:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}

.document-row-height-panel {
  position: absolute;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 320px;
  padding: 12px;
  overflow: auto;
  font-size: 12px;
  color: var(--el-text-color-primary);
  white-space: normal;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  box-shadow: 0 3px 12px #0002;
}

.document-row-height-panel strong {
  font-weight: 500;
}

.document-row-height-panel small {
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.document-row-height-panel button {
  align-self: flex-start;
  padding-left: 0;
  color: var(--el-color-primary);
}

.document-row-height-control {
  display: flex;
  gap: 6px;
  align-items: center;
}

.document-row-height-control input {
  width: 64px;
  padding: 3px;
  color: inherit;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}

.document-canvas :deep(.document-row-height-selected > td) {
  background-image: linear-gradient(rgb(64 158 255 / 5%), rgb(64 158 255 / 5%));
}

.document-canvas :deep(.document-cell-single) {
  outline: 2px solid #409eff;
  outline-offset: -2px;
}

.document-canvas :deep(.document-cell-range) {
  --cell-top: transparent;
  --cell-bottom: transparent;
  --cell-left: transparent;
  --cell-right: transparent;

  background-image: linear-gradient(
    rgb(64 158 255 / 10%),
    rgb(64 158 255 / 10%)
  );
  box-shadow:
    inset 0 2px var(--cell-top),
    inset 0 -2px var(--cell-bottom),
    inset 2px 0 var(--cell-left),
    inset -2px 0 var(--cell-right);
}

.document-canvas :deep(.is-range-top) {
  --cell-top: #409eff;
}

.document-canvas :deep(.is-range-bottom) {
  --cell-bottom: #409eff;
}

.document-canvas :deep(.is-range-left) {
  --cell-left: #409eff;
}

.document-canvas :deep(.is-range-right) {
  --cell-right: #409eff;
}

.document-canvas :deep(.document-column-highlight) {
  background-image: linear-gradient(rgb(64 158 255 / 8%), rgb(64 158 255 / 8%));
}

.document-canvas :deep(td[data-doc-header]) {
  position: relative;
  overflow: visible;
  cursor: pointer;
}

.document-canvas :deep(.document-header-selected) {
  outline: 2px solid #2563eb;
  outline-offset: -2px;
  background: #dbeafe !important;
}

.document-canvas :deep(.document-header-filter) {
  /* 将编辑控件贴在右下边线上，不占用表头文字的排版宽度。 */
  position: absolute;
  right: -3px;
  bottom: -7px;
  z-index: 2;
  width: 12px;
  height: 12px;
  padding: 0;
  font-size: 9px;
  line-height: 10px;
  color: #64748b;
  pointer-events: none;
  cursor: pointer;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 3px;
  opacity: 0;
}

.document-canvas :deep(td[data-doc-header]:hover .document-header-filter),
.document-canvas :deep(.document-header-filter:focus-visible),
.document-canvas :deep(.document-header-filter.is-on),
.document-canvas :deep(.document-header-filter.is-sorted) {
  pointer-events: auto;
  opacity: 1;
}

.document-canvas :deep(.document-header-filter:hover),
.document-canvas :deep(.document-header-filter:focus-visible),
.document-canvas :deep(.document-header-filter.is-on) {
  color: #15803d;
  border-color: currentcolor;
}

.document-canvas :deep(.document-header-filter.is-sorted) {
  color: #1d4ed8;
  border-color: currentcolor;
}

.document-hint {
  margin: 0 0 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.document-error {
  color: var(--el-color-danger);
}

.document-canvas :deep(.hiprint-printPanel) {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
  padding-bottom: 24px !important;
}

.document-canvas :deep(.hiprint-printPaper) {
  outline: 1px solid #d7dce3;
  box-shadow: 0 1px 8px #0002;
}

.document-canvas :deep([data-doc-key] > :first-child) {
  touch-action: none;
  cursor: grab;
  user-select: none;
}

.document-canvas :deep([data-doc-key] > :first-child:hover) {
  outline: 1px dashed #60a5fa;
}

/* 扩大细线的编辑命中区域，不改变正文占位或打印结果。 */
.document-canvas :deep([data-doc-type='hline']),
.document-canvas :deep([data-doc-type='vline']) {
  position: relative;
}

.document-canvas :deep([data-doc-type='hline']::before) {
  position: absolute;
  inset: -5px 0;
  cursor: grab;
  content: '';
}

.document-canvas :deep([data-doc-type='vline']::before) {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -5px;
  width: 12px;
  cursor: grab;
  content: '';
}

.document-canvas :deep(.document-selected > :first-child) {
  outline: 2px solid #409eff !important;
}

.document-canvas
  :deep(.document-selected.document-table-selected > :first-child) {
  outline-width: 1px !important;
}

.document-canvas :deep(.document-selected.document-cell-active > :first-child) {
  outline: 1px solid #cbd5e1 !important;
}

.document-drag-handles {
  position: absolute;
  z-index: 3;
  display: flex;
  gap: 4px;
  height: 24px;
}

.document-drag-handles button {
  padding: 1px 8px;
  font-size: 12px;
  color: var(--el-color-primary);
  touch-action: none;
  cursor: grab;
  user-select: none;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 4px;
}

.document-drop-guide {
  position: absolute;
  z-index: 4;
  pointer-events: none;
  background: #2563eb;
}

.document-drop-guide span {
  position: absolute;
  bottom: 100%;
  left: 0;
  padding: 3px 7px;
  font-size: 12px;
  color: white;
  white-space: nowrap;
  background: #2563eb;
  border-radius: 3px;
}

.document-drop-guide.is-spacing {
  background: #10b9810d;
  border: 2px dashed #059669;
}

.document-drop-guide.is-spacing span {
  background: #047857;
}
</style>

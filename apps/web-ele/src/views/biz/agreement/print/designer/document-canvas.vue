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
  watch,
} from 'vue';

import { cloneJson } from '../../clone';
import {
  adjustDocumentElementSpacing,
  documentElementSpacing,
  documentRowMembers,
  documentWidthLimits,
  MAX_DOCUMENT_SPACE_PT,
  moveDocumentElement,
  resizeDocumentColumns,
  setDocumentElementWidth,
  shiftDocumentElement,
} from '../runtime/document-layout';
import { renderDocument } from '../runtime/document-renderer';
import { preparePrintTemplate } from '../runtime/prepare-template';
import { fieldInFilterExpr } from '../runtime/print-row-filter';
import {
  AGREE_PRINT_FIELD_DND,
  getAgreePrintHtml5Drag,
} from '../template/print-element-meta';
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
const cellToolbarBox = ref<null | { left: number; top: number }>(null);
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
const error = ref('');
const defaultHint =
  '选中后拖动「调间距」或「排序」。点表头打开编辑明细表；表体可拖选合并/拆分。';
const hint = ref(defaultHint);
let generation = 0;
let preparedData: Record<string, any> = {};
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
const spacingMm = computed(() =>
  props.templateJson
    ? Math.round(
        ((documentElementSpacing(props.templateJson, props.selectedKey) *
          25.4) /
          72) *
          10,
      ) / 10
    : 0,
);
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
function toolbarWidth(event: Event) {
  if (props.templateJson)
    commitLayout(
      setDocumentElementWidth(
        props.templateJson,
        props.selectedKey,
        Number((event.target as HTMLInputElement).value),
      ),
    );
}
function toolbarSpacing(value: number) {
  if (props.templateJson)
    commitLayout(
      adjustDocumentElementSpacing(
        props.templateJson,
        props.selectedKey,
        (value * 72) / 25.4 -
          documentElementSpacing(props.templateJson, props.selectedKey),
      ),
    );
}
function toolbarAlign(align: 'center' | 'left' | 'right') {
  if (!props.templateJson || selection.value?.peers.length !== 1) return;
  const next = cloneJson(props.templateJson);
  const [p, i] = props.selectedKey.split(':').map(Number);
  const box = next.panels[p!].printElements[i!].options.agreeDocument;
  box.left =
    align === 'right'
      ? 100 - box.width
      : align === 'center'
        ? (100 - box.width) / 2
        : 0;
  commitLayout(next);
}
function toolbarShift(direction: -1 | 1) {
  if (props.templateJson)
    commitLayout(
      shiftDocumentElement(props.templateJson, props.selectedKey, direction),
    );
}
function toolbarSeparate() {
  const peer = selection.value?.peers.find(
    (item) => item.key !== props.selectedKey,
  );
  if (peer && props.templateJson)
    commitLayout(
      moveDocumentElement(
        props.templateJson,
        props.selectedKey,
        peer.key,
        'after',
      ),
    );
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
    rowWidth: left.parentElement!.getBoundingClientRect().width,
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
  const a = peers.find((item) => item.key === r.leftKey)!.element.options
    .agreeDocument;
  const b = peers.find((item) => item.key === r.rightKey)!.element.options
    .agreeDocument;
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
  cellToolbarBox.value = null;
  const cellSelection = props.bodyCellSelection;
  if (cellSelection && shell.value) {
    const element = [
      ...(host.value?.querySelectorAll<HTMLElement>('[data-doc-key]') || []),
    ].filter((el) => el.dataset.docKey === cellSelection.key);
    const target = element
      .flatMap((el) => [
        ...el.querySelectorAll<HTMLElement>('td[data-doc-record]'),
      ])
      .find(
        (td) =>
          Number(td.dataset.docRecord) === cellSelection.endRow &&
          Number(td.dataset.docCol) === cellSelection.endCol,
      );
    if (target) {
      const rect = target.getBoundingClientRect();
      const outer = shell.value.getBoundingClientRect();
      cellToolbarBox.value = {
        left: Math.max(0, Math.min(rect.left - outer.left, outer.width - 260)),
        top: rect.bottom - outer.top + 4,
      };
    }
  }
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
    const left = members[i]!;
    const right = members[i + 1]!;
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
      leftKey: left.dataset.docKey!,
      rightKey: right.dataset.docKey!,
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
    btn.textContent = '▾';
    btn.addEventListener('pointerdown', (event) => event.stopPropagation());
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const wrap = td.closest<HTMLElement>('[data-doc-key]');
      if (!wrap) return;
      const rect = btn.getBoundingClientRect();
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
    el.draggable = false;
    if (el.firstElementChild instanceof HTMLElement)
      el.firstElementChild.draggable = false;
    el.title =
      '拖到空白处调间距；拖到其他内容上排序。也可使用选中后的拖动手柄。';
    el.querySelectorAll<HTMLElement>('td[data-doc-col]').forEach((td) => {
      const selection = props.bodyCellSelection;
      const r = Number(td.dataset.docRecord);
      const c = Number(td.dataset.docCol);
      const inSelection =
        !!selection &&
        selection.key === el.dataset.docKey &&
        r >= Math.min(selection.startRow, selection.endRow) &&
        r <= Math.max(selection.startRow, selection.endRow) &&
        c >= Math.min(selection.startCol, selection.endCol) &&
        c <= Math.max(selection.startCol, selection.endCol);
      td.classList.toggle(
        'document-cell-selected',
        inSelection ||
          (el.dataset.docKey === props.highlightTableKey &&
            c === props.highlightColIndex),
      );
    });
    const [panelIndex, elementIndex] = String(el.dataset.docKey || '')
      .split(':')
      .map(Number);
    const tableOptions =
      props.templateJson?.panels?.[panelIndex!]?.printElements?.[elementIndex!]
        ?.options || {};
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
    error.value = '';
    try {
      const prepared = preparePrintTemplate(
        props.templateJson,
        (props.sampleData || {}) as AgreePrintData,
      );
      const html = await renderDocument(prepared.template, prepared.printData);
      if (version !== generation) return;
      preparedData = prepared.printData;
      await nextTick();
      host.value?.replaceChildren(html);
      selectOutline();
    } catch (error) {
      if (version === generation) error.value = (error as Error).message;
    } finally {
      if (version === generation) busy.value = false;
    }
  },
  { immediate: true, deep: true },
);
watch(
  () => props.selectedKey,
  () => void nextTick(selectOutline),
);
watch(
  () => props.zoom,
  () => void nextTick(updateSelectionBox),
);
watch(
  () => [
    props.bodyCellSelection,
    props.headerCellSelection,
    props.highlightColIndex,
    props.highlightTableKey,
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
onMounted(() => {
  resizeObserver = new ResizeObserver(updateSelectionBox);
  if (host.value) resizeObserver.observe(host.value);
  window.addEventListener('keydown', cancelDrag);
});
onBeforeUnmount(() => {
  generation++;
  cancelResize();
  resizeObserver?.disconnect();
  window.removeEventListener('keydown', cancelDrag);
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
  const cell = cellAt(event);
  const paper = (event.target as HTMLElement).closest<HTMLElement>(
    '[data-panel-index]',
  );
  if (!cell) {
    if (paper) emit('pageSelect', Number(paper.dataset.panelIndex));
    emit('update:selectedKey', '');
    return;
  }
  emit('update:selectedKey', cell.dataset.docKey!);
  const footer = (event.target as HTMLElement).closest<HTMLElement>(
    'td[data-doc-footer]',
  );
  if (footer) {
    emit('tableFooterCellSelect', {
      key: cell.dataset.docKey!,
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
      key: cell.dataset.docKey!,
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
  const [p, i] = cell.dataset.docKey!.split(':').map(Number);
  if (
    td &&
    !props.templateJson?.panels?.[p!]?.printElements?.[i!]?.options
      ?.agreeFormGrid
  )
    emit('tableBodyCellSelect', {
      key: cell.dataset.docKey!,
      rowIndex: Number(td.dataset.docRecord),
      colIndex: Number(td.dataset.docCol),
      rawRow:
        preparedData[cell.dataset.docField!]?.[Number(td.dataset.docRecord)] ||
        {},
      shiftKey: event.shiftKey,
    });
}
function context(event: MouseEvent) {
  const cell = cellAt(event);
  if (!cell) return;
  event.preventDefault();
  emit('update:selectedKey', cell.dataset.docKey!);
  emit('contextmenu', {
    key: cell.dataset.docKey!,
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
      key: cell.dataset.docKey!,
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
          const r = el.firstElementChild!.getBoundingClientRect();
          return Math.min(
            Math.abs(event.clientY - r.top),
            Math.abs(event.clientY - r.bottom),
          );
        };
        return distance(a) - distance(b);
      })[0] || null;
    bounds = cell?.firstElementChild?.getBoundingClientRect();
  }
  const placement =
    bounds &&
    event.clientY >= bounds.top &&
    event.clientY <= bounds.bottom &&
    event.clientX > bounds.right - Math.min(32, bounds.width * 0.15) &&
    event.clientX <= bounds.right
      ? 'beside'
      : bounds &&
          event.clientY >= bounds.top &&
          event.clientY <= bounds.bottom &&
          event.clientX >= bounds.left &&
          event.clientX < bounds.left + Math.min(32, bounds.width * 0.15)
        ? 'beside-before'
        : bounds && event.clientY < bounds.top + bounds.height / 2
          ? 'before'
          : 'after';
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
    const current = documentElementSpacing(props.templateJson!, draggedKey);
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
  hint.value =
    drop.placement === 'beside' || drop.placement === 'beside-before'
      ? `松开放到目标${drop.placement === 'beside-before' ? '左' : '右'}侧`
      : drop.placement === 'before'
        ? '松开插入目标上方'
        : '松开插入目标下方';
  if (drop.cell && shell.value) {
    const bounds = drop.cell.firstElementChild!.getBoundingClientRect();
    const row = drop.cell.parentElement!.getBoundingClientRect();
    const outer = shell.value.getBoundingClientRect();
    const beside =
      drop.placement === 'beside' || drop.placement === 'beside-before';
    guide.value = {
      kind: beside ? 'beside' : 'order',
      left:
        (beside
          ? drop.placement === 'beside-before'
            ? bounds.left
            : bounds.right
          : row.left) - outer.left,
      top:
        (beside
          ? bounds.top
          : drop.placement === 'before'
            ? row.top
            : row.bottom) - outer.top,
      width: beside ? 3 : row.width,
      height: beside ? bounds.height : 3,
      label: beside
        ? besideLabel(drop.key!, drop.placement)
        : drop.placement === 'before'
          ? '插入此行之前'
          : '插入此行之后',
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
      const [element] = next.panels[p!].printElements.splice(i!, 1);
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
      v-if="selection"
      class="document-layout-toolbar"
      role="toolbar"
      aria-label="常用排版"
      @keydown.stop
      @click.stop
    >
      <span>排版</span>
      <button
        type="button"
        :disabled="selection.index === 0"
        @click="toolbarShift(-1)"
      >
        向左换位
      </button>
      <button
        type="button"
        :disabled="selection.index === selection.peers.length - 1"
        @click="toolbarShift(1)"
      >
        向右换位
      </button>
      <button
        v-if="selection.peers.length > 1"
        type="button"
        @click="toolbarSeparate"
      >
        独占一行
      </button>
      <label>宽度
        <input
          aria-label="元素宽度百分比"
          type="number"
          :min="documentWidthLimits(selection.peers.length).min"
          :max="documentWidthLimits(selection.peers.length).max"
          :value="Math.round(selection.box.width * 10) / 10"
          step="1"
          @change="toolbarWidth"
        />
        %</label>
      <template v-if="selection.peers.length === 1">
        <button type="button" @click="toolbarAlign('left')">靠左</button>
        <button type="button" @click="toolbarAlign('center')">居中</button>
        <button type="button" @click="toolbarAlign('right')">靠右</button>
      </template>
      <label>上方间距
        <input
          aria-label="上方间距毫米"
          type="number"
          min="0"
          :value="spacingMm"
          step="1"
          @change="
            toolbarSpacing(Number(($event.target as HTMLInputElement).value))
          "
        />
        mm</label>
      <button type="button" @click="toolbarSpacing(0)">清除间距</button>
      <span v-if="selection.peers.length > 1">拖动列间蓝线调宽</span>
    </div>
    <div
      v-if="bodyCellSelection && cellToolbarBox && !busy"
      class="document-cell-toolbar"
      :style="{
        left: `${cellToolbarBox.left}px`,
        top: `${cellToolbarBox.top}px`,
      }"
      @pointerdown.stop
      @click.stop
      role="toolbar"
      aria-label="选中单元格操作"
    >
      <span>已选
        {{
          Math.abs(bodyCellSelection.endRow - bodyCellSelection.startRow) + 1
        }}
        ×
        {{
          Math.abs(bodyCellSelection.endCol - bodyCellSelection.startCol) + 1
        }}</span>
      <button type="button" @click="emit('bodyMergeRequested')">合并</button>
      <button type="button" @click="emit('bodySplitRequested')">拆分</button>
      <button type="button" @click="emit('bodyFormulaRequested')">计算</button>
    </div>
    <p v-if="error" class="document-error" role="alert">{{ error }}</p>
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

.document-layout-toolbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}

.document-layout-toolbar button {
  padding: 3px 6px;
  color: var(--el-color-primary);
  cursor: pointer;
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 4px;
}

.document-layout-toolbar button:disabled {
  cursor: default;
  opacity: 0.4;
}

.document-layout-toolbar label {
  display: flex;
  gap: 4px;
  align-items: center;
}

.document-layout-toolbar input {
  width: 60px;
  padding: 3px;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 3px;
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
  z-index: 2;
  display: flex;
  gap: 12px;
  padding: 8px;
  font-size: 12px;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 6px;
  box-shadow: 0 3px 12px #0002;
}

.document-cell-toolbar input {
  width: 88px;
  padding: 1px 4px;
  border: 1px solid #bfdbfe;
  border-radius: 3px;
}

.document-canvas :deep(.document-cell-selected) {
  outline: 2px solid #60a5fa;
  outline-offset: -2px;
}

.document-canvas :deep(td[data-doc-header]) {
  position: relative;

  /* 压过渲染器 inline padding，给 ▾ 留槽，避免挡住标题 */
  padding-right: 16px !important;
  cursor: pointer;
}

.document-canvas :deep(.document-header-selected) {
  outline: 2px solid #2563eb;
  outline-offset: -2px;
  background: #dbeafe !important;
}

.document-canvas :deep(.document-header-filter) {
  position: absolute;
  top: 50%;
  right: 1px;
  z-index: 1;
  width: 14px;
  height: 16px;
  padding: 0;
  font-size: 10px;
  line-height: 16px;
  color: #64748b;
  cursor: pointer;
  background: transparent;
  border: 0;
  opacity: 0;
  transform: translateY(-50%);
}

.document-canvas :deep(td[data-doc-header]:hover .document-header-filter),
.document-canvas :deep(.document-header-filter.is-on),
.document-canvas :deep(.document-header-filter.is-sorted) {
  opacity: 1;
}

.document-canvas :deep(.document-header-filter:hover),
.document-canvas :deep(.document-header-filter.is-on) {
  color: #15803d;
}

.document-canvas :deep(.document-header-filter.is-sorted) {
  color: #1d4ed8;
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

.document-canvas :deep(.document-selected > :first-child) {
  outline: 2px solid #409eff !important;
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

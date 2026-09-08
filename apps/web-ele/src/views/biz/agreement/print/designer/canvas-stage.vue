<script lang="ts" setup>
/**
 * 自绘打印画布：多页纵向连续展示 + 选中 / 拖拽 / 缩放 / 越界红框
 * - 不使用 hiprint design() 模式，元素坐标完全自控，避免横向错乱与刻度杂线
 * - 以模板 JSON 为唯一数据源，交互结束后回写并向上层 emit
 */
import type { AgreePrintFieldItem } from '../fields';
import type { AgreePrintData } from '../types';
import type {
  CanvasFieldDropPayload,
  CanvasToolboxDropPayload,
  DesignElement,
  DesignPage,
  TablePreviewModel,
} from './template-model';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { preparePrintTemplate } from '../prepare-template';
import {
  AGREE_PRINT_FIELD_DND,
  AGREE_PRINT_TOOLBOX_DND,
  getAgreePrintHtml5Drag,
} from '../print-element-meta';
import { cloneTemplate } from '../template-store';
import CanvasCode from './canvas-code.vue';
import {
  elementKey,
  isElementOverflow,
  PAGE_MARGIN_PT,
  PT_TO_PX,
  readDesignPages,
  resolveTablePreview,
  resolveTextPreview,
  tablePreviewRowLimit,
} from './template-model';

/** 带表格预览缓存的编辑态元素 */
interface RenderElement extends DesignElement {
  /** 表格设计态预览（仅 type=table） */
  tablePreview?: null | TablePreviewModel;
}

/** 带缓存元素的页面 */
interface RenderPage extends Omit<DesignPage, 'elements'> {
  elements: RenderElement[];
}

const props = defineProps<{
  /** 当前选中的表体连续格范围 */
  bodyCellSelection?: null | {
    endCol: number;
    endRow: number;
    key: string;
    startCol: number;
    startRow: number;
  };
  /** 检视器或表体交互正在高亮的叶子列 */
  highlightColIndex?: number;
  /** 列高亮只作用于这一张表，避免其他表格同序号列被误选 */
  highlightTableKey?: string;
  /** 样例数据（仅设计态展示，非正式协议） */
  sampleData: AgreePrintData | null;
  /** 当前选中元素 key */
  selectedKey: string;
  /** 模板 JSON */
  templateJson: null | Record<string, any>;
  /** 展示比例（百分比） */
  zoom: number;
}>();

const emit = defineEmits<{
  /** 在表格旁打开当前单元格的计算设置 */
  bodyFormulaRequested: [];
  /** 在表格旁的快捷条确认合并 */
  bodyMergeRequested: [];
  /** 在表格旁的快捷条拆分当前合并 */
  bodySplitRequested: [];
  /** 右键菜单：传出选中 key 与屏幕坐标 */
  contextmenu: [payload: { clientX: number; clientY: number; key: string }];
  /** 数据源字段拖入纸面 */
  fieldDrop: [payload: CanvasFieldDropPayload];
  /** 点中某页空白处 */
  pageSelect: [panelIndex: number];
  /** 点选表体格；拖选或 Shift 点终点可扩成矩形范围 */
  tableBodyCellSelect: [
    payload: {
      colIndex: number;
      key: string;
      rawRow: Record<string, unknown>;
      rowIndex: number;
      shiftKey: boolean;
    },
  ];
  /** 点选表尾格 */
  tableFooterCellSelect: [
    payload: { cellIndex: number; key: string; rowIndex: number },
  ];
  /** 左侧积木拖入纸面 */
  toolboxDrop: [payload: CanvasToolboxDropPayload];
  /** 更新选中元素 */
  'update:selectedKey': [string];
  /** 回写模板 JSON（拖拽 / 缩放结束时） */
  'update:templateJson': [Record<string, any>];
}>();

/** 本地可变副本：拖拽 / 缩放期间就地修改，结束后向上 emit */
const local = ref<Record<string, any>>(cloneTemplate(props.templateJson || {}));
/** 画布根节点，用于读取浏览器实际排版后的表格高度。 */
const canvasRef = ref<HTMLElement | null>(null);
/** 表格真实内容高度（pt）；用于模拟 hiprint 对后续元素的纵向回流。 */
const tableActualHeightsPt = ref<Record<string, number>>({});
/** 交互期间不接受外部 templateJson 覆盖，避免拖拽被打断 */
let interacting = false;
/** 强制刷新计算（就地改 options 不触发响应式时用） */
const tick = ref(0);
/** 当前拖拽落点提示；页面隔断额外显示横向定位线 */
const dropGuide = ref<null | {
  kind: string;
  panelIndex: number;
  top: number;
}>(null);
/** 元素对齐吸附线（pt 坐标，仅拖动中显示） */
const alignmentGuides = ref<null | {
  panelIndex: number;
  x?: number;
  y?: number;
}>(null);

watch(
  () => props.templateJson,
  (val) => {
    if (interacting) return;
    local.value = cloneTemplate(val || {});
    tick.value++;
  },
);

/** 选中变化后滚入可视区 */
watch(
  () => props.selectedKey,
  (key) => {
    if (!key) return;
    void nextTick(() => {
      if (!interacting && !bodySelectionKey) scrollToKey(key);
    });
  },
);

/** 每像素对应的 pt（含缩放） */
const scale = computed(() => (props.zoom / 100) * PT_TO_PX);

const SOURCE_INDEX_KEY = '__agreeCanvasSourceIndex';

/**
 * 给运行时副本保留原元素下标。preparePrintTemplate 会过滤条件元素，若直接用
 * 过滤后的下标会导致画布选中/拖动写回错误的模板元素。
 */
function markSourceElementIndexes(template: Record<string, any>) {
  for (const panel of template.panels || []) {
    (panel.printElements || []).forEach(
      (el: Record<string, any>, elementIndex: number) => {
        const options = (el.options ||= {});
        options[SOURCE_INDEX_KEY] = elementIndex;
      },
    );
  }
}

/** 根据已测得的表格真实高度，把其下方元素按 hiprint 的规则同步移动。 */
function applyMeasuredTableFlow(page: RenderPage) {
  const tables = page.elements
    .filter((el) => el.type === 'table')
    .map((el) => ({
      bottom: (Number(el.options.top) || 0) + (Number(el.options.height) || 0),
      delta:
        (tableActualHeightsPt.value[el.key] ??
          (Number(el.options.height) || 0)) - (Number(el.options.height) || 0),
      key: el.key,
    }));
  if (tables.every((table) => Math.abs(table.delta) < 0.1)) return page;
  return {
    ...page,
    elements: page.elements.map((el) => {
      const top = Number(el.options.top) || 0;
      let shift = 0;
      for (const table of tables) {
        if (table.key !== el.key && top >= table.bottom - 0.1) {
          shift += table.delta;
        }
      }
      if (Math.abs(shift) < 0.1) return el;
      return {
        ...el,
        options: { ...el.options, top: top + shift },
      };
    }),
  };
}

/** 与正式快速预览相同的条件显隐、计算、筛选及流式压缩结果。 */
const runtimePreview = computed(() => {
  void tick.value;
  const runtimeSource = cloneTemplate(local.value);
  markSourceElementIndexes(runtimeSource);
  return props.sampleData
    ? preparePrintTemplate(runtimeSource, props.sampleData)
    : { printData: props.sampleData, template: runtimeSource };
});

/**
 * 编辑态页面列表（表格预览只算一次，避免模板里重复 resolve）
 */
const pages = computed<RenderPage[]>(() => {
  const prepared = runtimePreview.value;
  const panels: Record<string, any>[] = prepared.template.panels || [];
  return readDesignPages(prepared.template).map((page) => {
    const elements = page.elements.map((el) => {
      const sourceEl =
        panels[page.panelIndex]?.printElements?.[el.elementIndex];
      const sourceIndex = Number(sourceEl?.options?.[SOURCE_INDEX_KEY]);
      const elementIndex = Number.isInteger(sourceIndex)
        ? sourceIndex
        : el.elementIndex;
      const next = {
        ...el,
        elementIndex,
        key: elementKey(page.panelIndex, elementIndex),
        tablePreview:
          el.type === 'table'
            ? resolveTablePreview(
                el.options,
                prepared.printData,
                tablePreviewRowLimit(el.options),
                { rowsPrepared: true },
              )
            : null,
      };
      return next;
    });
    return applyMeasuredTableFlow({ ...page, elements });
  });
});

/**
 * 浏览器完成表格自动换行后读取真实高度；高度稳定后不再触发响应式更新。
 * offsetHeight 不受画布 transform 缩放影响，因此可直接按 96dpi 换算回 pt。
 */
async function measureRenderedTableHeights() {
  await nextTick();
  const measured: Record<string, number> = {};
  canvasRef.value
    ?.querySelectorAll<HTMLElement>('.agree-canvas__el[data-el-key]')
    .forEach((node) => {
      const table = node.querySelector<HTMLElement>('.agree-canvas__table');
      const key = node.dataset.elKey;
      if (table && key) {
        const cssHeight = Number.parseFloat(getComputedStyle(table).height);
        measured[key] =
          (Number.isFinite(cssHeight) ? cssHeight : table.offsetHeight) /
          PT_TO_PX;
      }
    });
  const current = tableActualHeightsPt.value;
  const keys = Object.keys(measured);
  if (
    keys.length === Object.keys(current).length &&
    keys.every(
      (key) => Math.abs((measured[key] ?? 0) - (current[key] ?? 0)) < 0.1,
    )
  ) {
    return;
  }
  tableActualHeightsPt.value = measured;
}

watch(
  pages,
  () => {
    void measureRenderedTableHeights();
  },
  { flush: 'post', immediate: true },
);

/** 把选中元素滚入中间舞台可视区 */
function scrollToKey(key: string) {
  const node = document.querySelector<HTMLElement>(
    `.agree-canvas__el[data-el-key="${CSS.escape(key)}"]`,
  );
  node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** 把指定页滚入舞台可视区 */
function scrollToPanel(panelIndex: number) {
  const node = document.querySelector<HTMLElement>(
    `.agree-canvas__page-wrap[data-page-index="${panelIndex}"]`,
  );
  node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** 元素像素样式（未缩放，缩放由页面 transform 承担） */
function elementStyle(el: DesignElement) {
  const o = el.options;
  return {
    left: `${(Number(o.left) || 0) * PT_TO_PX}px`,
    top: `${(Number(o.top) || 0) * PT_TO_PX}px`,
    width: `${(Number(o.width) || 0) * PT_TO_PX}px`,
    height: `${displayHeight(el) * PT_TO_PX}px`,
  };
}

/** 选框、吸附与表格实际内容使用同一尺寸，不改打印用的设计高度。 */
function displayHeight(el: DesignElement) {
  return el.type === 'table'
    ? (tableActualHeightsPt.value[el.key] ?? Number(el.options.height)) || 0
    : Number(el.options.height) || 0;
}

/** 文本元素内联样式 */
function textStyle(o: Record<string, any>) {
  const style: Record<string, string> = {
    alignItems:
      o.textContentVerticalAlign === 'bottom'
        ? 'end'
        : o.textContentVerticalAlign === 'middle'
          ? 'center'
          : 'start',
    backgroundColor: o.backgroundColor || 'transparent',
    display: 'grid',
    fontFamily: o.fontFamily || 'SimSun',
    fontSize: `${(Number(o.fontSize) || 10) * PT_TO_PX}px`,
    lineHeight: `${(Number(o.lineHeight) || 9.75) * PT_TO_PX}px`,
    textAlign: o.textAlign || 'left',
    color: o.color || 'inherit',
  };
  if (Number(o.letterSpacing)) {
    style.letterSpacing = `${Number(o.letterSpacing) * PT_TO_PX}px`;
  }
  if (o.fontWeight) style.fontWeight = String(o.fontWeight);
  if (o.fontStyle) style.fontStyle = String(o.fontStyle);
  if (o.textDecoration) style.textDecoration = String(o.textDecoration);
  return style;
}

/** 矩形沿用 hiprint 的线宽、颜色与线型。 */
function rectStyle(o: Record<string, any>) {
  return {
    backgroundColor: o.backgroundColor || 'transparent',
    borderColor: o.color || '#333',
    borderStyle: o.borderStyle || 'solid',
    borderWidth: `${(Number(o.borderWidth) || 0.75) * PT_TO_PX}px`,
  };
}

/** 横竖线按模板的线宽、颜色和线型展示，贴近正式 hiprint 预览。 */
function lineStyle(o: Record<string, any>, vertical = false) {
  const width = `${(Number(o.borderWidth) || 0.75) * PT_TO_PX}px`;
  return vertical
    ? {
        borderLeftColor: o.color || '#333',
        borderLeftStyle: o.borderStyle || 'solid',
        borderLeftWidth: width,
      }
    : {
        borderTopColor: o.color || '#333',
        borderTopStyle: o.borderStyle || 'solid',
        borderTopWidth: width,
      };
}

/** 是否属于文本类展示（text / longText / dynamicText / staticTitle） */
function isTextLike(el: DesignElement) {
  return (
    !el.textType &&
    el.type !== 'table' &&
    el.type !== 'hline' &&
    el.type !== 'vline' &&
    el.type !== 'rect' &&
    el.type !== 'image'
  );
}

/** 文本展示内容 */
function textContent(o: Record<string, any>) {
  const value = resolveTextPreview(o, runtimePreview.value.printData);
  const title = o.hideTitle ? '' : String(o.title || '');
  if (title && value) return `${title}：${value}`;
  if (o.hideTitle && o.field) return value;
  return title || value || String(o.title || o.field || '文本');
}

/**
 * hiprint 只用最后一层表头生成 colgroup；跨层的叶子格则由其表头 width
 * 参与自动布局。这里保持相同结构，尤其避免多层表头的列宽与打印态不同。
 */
function tableColGroup(preview: TablePreviewModel) {
  return preview.headerRows.at(-1) || [];
}

function tableStyle(o: Record<string, any>) {
  return {
    backgroundColor: o.backgroundColor || 'transparent',
    border:
      o.tableBorder === 'noBorder' ? '0 solid transparent' : '1px solid #000',
    color: o.color || '#000',
    fontFamily: o.fontFamily || 'SimSun',
    fontSize: `${Number(o.fontSize) || 9}pt`,
    fontWeight: o.fontWeight || 'normal',
    lineHeight: `${Number(o.lineHeight) || 9.75}pt`,
  };
}

function headerCellStyle(
  options: Record<string, any>,
  cell: Record<string, any>,
) {
  const style: Record<string, any> = {
    backgroundColor:
      cell.backgroundColor ||
      cell.background ||
      options.tableHeaderBackground ||
      '#e8e8e8',
    border:
      options.tableHeaderCellBorder === 'noBorder'
        ? '0 solid transparent'
        : '1px solid #333',
    fontSize: `${Number(options.tableHeaderFontSize) || Number(options.fontSize) || 9}pt`,
    fontWeight: cell.fontWeight || options.tableHeaderFontWeight || '700',
    height: `${Number(options.tableHeaderRowHeight) || 18}pt`,
    textAlign: cell.align || 'center',
  };
  if ((Number(cell.colspan) || 1) === 1 && Number(cell.width) > 0) {
    style.width = `${Number(cell.width)}pt`;
  }
  return style;
}

function tableSectionRowStyle(
  options: Record<string, any>,
  area: 'footer' | 'header',
) {
  const setting =
    area === 'header' ? options.tableHeaderBorder : options.tableFooterBorder;
  return {
    border: setting === 'noBorder' ? '0 solid transparent' : '1px solid #333',
  };
}

/** 表体列宽由 hiprint 风格的 colgroup / 表头共同决定。 */
function cellStyle(
  options: Record<string, any>,
  cell: Record<string, any>,
  area: 'body' | 'footer' = 'body',
) {
  const borderSetting =
    area === 'footer'
      ? options.tableFooterCellBorder
      : options.tableBodyCellBorder;
  return {
    border:
      borderSetting === 'noBorder' ? '0 solid transparent' : '1px solid #333',
    height: `${Number(options.tableBodyRowHeight) || 18}pt`,
    textAlign: (cell.align || 'left') as any,
  };
}

let bodySelectionKey = '';

function onTableBodyCellPointer(
  e: MouseEvent,
  el: DesignElement,
  cell: {
    colIndex: number;
    rawRow: Record<string, unknown>;
    rowIndex: number;
  },
  extend = false,
) {
  selectElement(el);
  emit('tableBodyCellSelect', {
    colIndex: cell.colIndex,
    key: el.key,
    rawRow: cell.rawRow,
    rowIndex: cell.rowIndex,
    shiftKey: extend || e.shiftKey,
  });
}

function onTableBodyCellMouseDown(
  e: MouseEvent,
  el: DesignElement,
  cell: {
    colIndex: number;
    rawRow: Record<string, unknown>;
    rowIndex: number;
  },
) {
  bodySelectionKey = el.key;
  onTableBodyCellPointer(e, el, cell);
}

function onTableBodyCellMouseEnter(
  e: MouseEvent,
  el: DesignElement,
  cell: {
    colIndex: number;
    rawRow: Record<string, unknown>;
    rowIndex: number;
  },
) {
  if (e.buttons !== 1 || bodySelectionKey !== el.key) return;
  onTableBodyCellPointer(e, el, cell, true);
}

function clearBodySelecting() {
  bodySelectionKey = '';
}

function onTableFooterCellClick(
  el: DesignElement,
  rowIndex: number,
  cellIndex: number,
) {
  selectElement(el);
  emit('tableFooterCellSelect', { cellIndex, key: el.key, rowIndex });
}

function isBodyCellSelected(key: string, rowIndex: number, colIndex: number) {
  const selection = props.bodyCellSelection;
  if (!selection || selection.key !== key) return false;
  const startCol = Math.min(selection.startCol, selection.endCol);
  const endCol = Math.max(selection.startCol, selection.endCol);
  const startRow = Math.min(selection.startRow, selection.endRow);
  const endRow = Math.max(selection.startRow, selection.endRow);
  return (
    colIndex >= startCol &&
    colIndex <= endCol &&
    rowIndex >= startRow &&
    rowIndex <= endRow
  );
}

/** 越界红框 */
function isOverflow(el: DesignElement, page: DesignPage) {
  return isElementOverflow(el.options, page.widthMm, page.heightMm);
}

// ---------------- 左侧面板拖放 ----------------

/** 从内存会话或 dataTransfer 读取字段 / 积木载荷 */
function readCanvasDrag(e: DragEvent) {
  const session = getAgreePrintHtml5Drag();
  if (session) return session;
  try {
    const raw = e.dataTransfer?.getData('text/plain');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const item = parsed?.item;
    if (
      parsed?.kind === AGREE_PRINT_FIELD_DND &&
      typeof item?.field === 'string' &&
      typeof item?.text === 'string'
    ) {
      return {
        kind: AGREE_PRINT_FIELD_DND,
        item: item as AgreePrintFieldItem,
      } as const;
    }
    if (
      parsed?.kind === AGREE_PRINT_TOOLBOX_DND &&
      typeof parsed?.tid === 'string'
    ) {
      return { kind: AGREE_PRINT_TOOLBOX_DND, tid: parsed.tid } as const;
    }
  } catch {
    // 非本模块的拖拽文本直接忽略
  }
  return null;
}

/** 把屏幕坐标换算成当前纸面上的 hiprint pt 坐标 */
function paperPoint(e: DragEvent, page: RenderPage) {
  const paper = e.currentTarget as HTMLElement;
  const rect = paper.getBoundingClientRect();
  const ptPerScreenPx = 1 / (scale.value || PT_TO_PX);
  return {
    left: snapPt(Math.max(0, e.clientX - rect.left) * ptPerScreenPx, e.altKey),
    panelIndex: page.panelIndex,
    top: snapPt(Math.max(0, e.clientY - rect.top) * ptPerScreenPx, e.altKey),
  };
}

/** 字段或积木经过纸面：声明 copy drop，并显示当前目标页 / 隔断线 */
function onPaperDragOver(e: DragEvent, page: RenderPage) {
  const session = readCanvasDrag(e);
  if (!session) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  const point = paperPoint(e, page);
  dropGuide.value = {
    kind: session.kind === AGREE_PRINT_TOOLBOX_DND ? session.tid : session.kind,
    panelIndex: page.panelIndex,
    top: point.top,
  };
}

/** 指针确实离开当前纸面时清掉高亮（进入子元素不算离开） */
function onPaperDragLeave(e: DragEvent, page: RenderPage) {
  const current = e.currentTarget as HTMLElement | null;
  const related = e.relatedTarget as Node | null;
  if (current && related instanceof Node && current.contains(related)) return;
  if (dropGuide.value?.panelIndex === page.panelIndex) dropGuide.value = null;
}

/** 按目标页与 pt 落点上报字段或积木拖放 */
function onPaperDrop(e: DragEvent, page: RenderPage) {
  const session = readCanvasDrag(e);
  dropGuide.value = null;
  if (!session) return;
  e.preventDefault();
  e.stopPropagation();
  const point = paperPoint(e, page);
  if (session.kind === AGREE_PRINT_FIELD_DND) {
    emit('fieldDrop', { ...point, item: session.item });
    return;
  }
  emit('toolboxDrop', { ...point, tid: session.tid });
}

/** 拖拽取消或落在纸外时也要清掉目标页反馈 */
function clearDropGuide() {
  dropGuide.value = null;
}

// ---------------- 选中 ----------------

/** 点选元素 */
function selectElement(el: DesignElement) {
  emit('update:selectedKey', el.key);
}

/** 点空白清除选中 */
function clearSelection() {
  emit('update:selectedKey', '');
}

/** 点页内空白：切换活动页并清除元素选中 */
function selectPage(page: RenderPage) {
  emit('pageSelect', page.panelIndex);
  clearSelection();
}

/** 右键：选中并上报菜单位置 */
function onElementContextMenu(e: MouseEvent, el: DesignElement) {
  e.preventDefault();
  e.stopPropagation();
  selectElement(el);
  emit('contextmenu', {
    key: el.key,
    clientX: e.clientX,
    clientY: e.clientY,
  });
}

// ---------------- 拖拽 / 缩放 ----------------

/** 吸附网格（pt）；按住 Alt 可临时关闭吸附做精细调整 */
const GRID_PT = 5;
/** 拖动阈值（屏幕 px）：移动超过该值才算拖拽，避免点击时元素微动 */
const DRAG_THRESHOLD_PX = 3;

/** 拖动/缩放中的实时坐标提示（供画布右上角浮层展示） */
const dragHud = ref<null | { h: number; w: number; x: number; y: number }>(
  null,
);

interface DragState {
  el: DesignElement;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
  visualOffsetX: number;
  visualOffsetY: number;
  /** 是否已越过拖动阈值 */
  moved: boolean;
  /** resize 方向；move 时为 null */
  dir: null | { b: boolean; l: boolean; r: boolean; t: boolean };
}
let drag: DragState | null = null;

/** 按网格吸附取整（按住 Alt 时仅四舍五入不吸附） */
function snapPt(value: number, alt: boolean) {
  if (alt) return Math.round(value);
  return Math.round(value / GRID_PT) * GRID_PT;
}

function nearestGuide(moving: number[], targets: number[], threshold: number) {
  let best: null | { delta: number; guide: number } = null;
  for (const point of moving) {
    for (const target of targets) {
      const delta = target - point;
      if (Math.abs(delta) > threshold) continue;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, guide: target };
      }
    }
  }
  return best;
}

/** 纸张边/中心及同页元素边/中心吸附；Alt 临时关闭 */
function alignMovingElement(
  el: DesignElement,
  left: number,
  top: number,
  options: { alt: boolean; lockX: boolean; lockY: boolean },
) {
  alignmentGuides.value = null;
  if (options.alt) return { left, top };
  const page = pages.value.find((item) => item.panelIndex === el.panelIndex);
  if (!page) return { left, top };
  const width = Number(liveOptions(el).width) || 0;
  const height = displayHeight(el);
  const pageWidth = page.widthPx / PT_TO_PX;
  const pageHeight = page.heightPx / PT_TO_PX;
  const xTargets = [PAGE_MARGIN_PT, pageWidth / 2, pageWidth - PAGE_MARGIN_PT];
  const yTargets = [
    PAGE_MARGIN_PT,
    pageHeight / 2,
    pageHeight - PAGE_MARGIN_PT,
  ];
  page.elements.forEach((sibling) => {
    if (sibling.key === el.key) return;
    const o = sibling.options;
    const x = Number(o.left) || 0;
    const y = Number(o.top) || 0;
    const w = Number(o.width) || 0;
    const h = displayHeight(sibling);
    xTargets.push(x, x + w / 2, x + w);
    yTargets.push(y, y + h / 2, y + h);
  });
  const threshold = 6 / (scale.value || PT_TO_PX);
  const xHit = options.lockX
    ? null
    : nearestGuide([left, left + width / 2, left + width], xTargets, threshold);
  const yHit = options.lockY
    ? null
    : nearestGuide([top, top + height / 2, top + height], yTargets, threshold);
  alignmentGuides.value = {
    panelIndex: el.panelIndex,
    ...(xHit ? { x: xHit.guide } : {}),
    ...(yHit ? { y: yHit.guide } : {}),
  };
  return {
    left: Math.max(0, left + (xHit?.delta || 0)),
    top: Math.max(0, top + (yHit?.delta || 0)),
  };
}

/** 就地取到 options 对象（可变） */
function liveOptions(el: DesignElement): Record<string, any> {
  const panel = local.value?.panels?.[el.panelIndex];
  return panel?.printElements?.[el.elementIndex]?.options || el.options;
}

/** 记录起始状态（移动与缩放共用） */
function startDrag(e: MouseEvent, el: DesignElement, dir: DragState['dir']) {
  if (e.button !== 0) return;
  // 阻止默认行为，避免拖动时选中页面文字导致卡顿
  e.preventDefault();
  e.stopPropagation();
  selectElement(el);
  const o = liveOptions(el);
  drag = {
    el,
    startX: e.clientX,
    startY: e.clientY,
    startLeft: Number(o.left) || 0,
    startTop: Number(o.top) || 0,
    startWidth: Number(o.width) || 0,
    startHeight: Number(o.height) || 0,
    visualOffsetX: (Number(el.options.left) || 0) - (Number(o.left) || 0),
    visualOffsetY: (Number(el.options.top) || 0) - (Number(o.top) || 0),
    moved: false,
    dir,
  };
  beginInteraction();
}

/** 开始拖动（移动） */
function onElementMouseDown(e: MouseEvent, el: DesignElement) {
  startDrag(e, el, null);
}

/** 开始缩放 */
function onHandleMouseDown(
  e: MouseEvent,
  el: DesignElement,
  dir: { b: boolean; l: boolean; r: boolean; t: boolean },
) {
  if (el.type === 'table') {
    // 数据决定表高；只允许横向调整，避免拖选框误改分页与回流基准。
    if (!dir.l && !dir.r) return;
    dir = { ...dir, b: false, t: false };
  }
  startDrag(e, el, dir);
}

/** 挂载全局监听并禁用文字选中 */
function beginInteraction() {
  interacting = true;
  document.body.style.userSelect = 'none';
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);
  window.addEventListener('blur', onWindowMouseUp);
}

/** 拖动中：按缩放折算 pt 增量并就地改 options */
function onWindowMouseMove(e: MouseEvent) {
  if (!drag) return;
  const dxPx = e.clientX - drag.startX;
  const dyPx = e.clientY - drag.startY;
  // 阈值：移动不足 3px 视为点击，不改坐标
  if (!drag.moved && Math.hypot(dxPx, dyPx) < DRAG_THRESHOLD_PX) return;
  drag.moved = true;
  const s = scale.value || PT_TO_PX;
  let dxPt = dxPx / s;
  let dyPt = dyPx / s;
  const o = liveOptions(drag.el);
  if (drag.dir) {
    // 缩放：按方向调整 left/top/width/height，最小尺寸 8pt，按网格吸附
    if (drag.dir.r) {
      o.width = Math.max(8, snapPt(drag.startWidth + dxPt, e.altKey));
    }
    if (drag.dir.b) {
      o.height = Math.max(8, snapPt(drag.startHeight + dyPt, e.altKey));
    }
    if (drag.dir.l) {
      const w = Math.max(8, snapPt(drag.startWidth - dxPt, e.altKey));
      o.left = drag.startLeft + (drag.startWidth - w);
      o.width = w;
    }
    if (drag.dir.t) {
      const h = Math.max(8, snapPt(drag.startHeight - dyPt, e.altKey));
      o.top = drag.startTop + (drag.startHeight - h);
      o.height = h;
    }
  } else {
    // 移动：按住 Shift 锁定为主方向；网格吸附；允许拖到底部越界，松手后自动翻页
    if (e.shiftKey) {
      if (Math.abs(dxPx) > Math.abs(dyPx)) dyPt = 0;
      else dxPt = 0;
    }
    const lockX = e.shiftKey && dxPt === 0;
    const lockY = e.shiftKey && dyPt === 0;
    const aligned = alignMovingElement(
      drag.el,
      lockX
        ? drag.startLeft + drag.visualOffsetX
        : Math.max(
            0,
            snapPt(drag.startLeft + drag.visualOffsetX + dxPt, e.altKey),
          ),
      lockY
        ? drag.startTop + drag.visualOffsetY
        : Math.max(
            0,
            snapPt(drag.startTop + drag.visualOffsetY + dyPt, e.altKey),
          ),
      { alt: e.altKey, lockX, lockY },
    );
    o.left = aligned.left - drag.visualOffsetX;
    o.top = aligned.top - drag.visualOffsetY;
  }
  // 实时坐标提示
  dragHud.value = {
    x: Math.round(Number(o.left) || 0),
    y: Math.round(Number(o.top) || 0),
    w: Math.round(Number(o.width) || 0),
    h: Math.round(Number(o.height) || 0),
  };
  tick.value++;
}

/** 松手：结束交互并回写模板 */
function onWindowMouseUp() {
  window.removeEventListener('mousemove', onWindowMouseMove);
  window.removeEventListener('mouseup', onWindowMouseUp);
  window.removeEventListener('blur', onWindowMouseUp);
  document.body.style.userSelect = '';
  const wasDrag = drag;
  drag = null;
  interacting = false;
  dragHud.value = null;
  alignmentGuides.value = null;
  // 仅在真正移动过时才回写，纯点击不产生历史
  if (!wasDrag || !wasDrag.moved) return;
  emit('update:templateJson', cloneTemplate(local.value));
}

onMounted(() => {
  window.addEventListener('dragend', clearDropGuide);
  window.addEventListener('mouseup', clearBodySelecting);
});

onBeforeUnmount(() => {
  window.removeEventListener('blur', onWindowMouseUp);
  window.removeEventListener('dragend', clearDropGuide);
  window.removeEventListener('mouseup', clearBodySelecting);
  window.removeEventListener('mousemove', onWindowMouseMove);
  window.removeEventListener('mouseup', onWindowMouseUp);
  document.body.style.userSelect = '';
  alignmentGuides.value = null;
});

defineExpose({
  /** 供上层读取当前（含拖拽结果）模板 */
  getLocal: () => cloneTemplate(local.value),
  /** 把指定元素滚入可视区 */
  scrollToKey,
  /** 新增 / 隔断后滚到目标页 */
  scrollToPanel,
});
</script>

<template>
  <div ref="canvasRef" class="agree-canvas" @mousedown.self="clearSelection">
    <!-- 拖动/缩放实时坐标提示 -->
    <div v-if="dragHud" class="agree-canvas__hud">
      x {{ dragHud.x }} · y {{ dragHud.y }} · 宽 {{ dragHud.w }} · 高
      {{ dragHud.h }}
    </div>
    <div
      v-for="page in pages"
      :key="page.panelIndex"
      class="agree-canvas__page-wrap"
      :data-page-index="page.panelIndex"
      :style="{
        width: `${page.widthPx * (zoom / 100)}px`,
        height: `${page.heightPx * (zoom / 100)}px`,
      }"
    >
      <!-- 纸张：真实像素尺寸，用 transform 缩放 -->
      <div
        class="agree-canvas__paper"
        :class="{ 'is-drop-target': dropGuide?.panelIndex === page.panelIndex }"
        :style="{
          width: `${page.widthPx}px`,
          height: `${page.heightPx}px`,
          transform: `scale(${zoom / 100})`,
        }"
        @mousedown.self="selectPage(page)"
        @dragover="onPaperDragOver($event, page)"
        @dragleave="onPaperDragLeave($event, page)"
        @drop="onPaperDrop($event, page)"
      >
        <!-- 页码标签 -->
        <div class="agree-canvas__page-no">第 {{ page.panelIndex + 1 }} 页</div>
        <!-- 内容安全区提示线 -->
        <div
          class="agree-canvas__safe"
          :style="{
            inset: `${PAGE_MARGIN_PT * PT_TO_PX}px`,
          }"
        ></div>

        <div
          v-if="
            alignmentGuides?.panelIndex === page.panelIndex &&
            alignmentGuides.x !== undefined
          "
          class="agree-canvas__align-guide is-vertical"
          :style="{ left: `${alignmentGuides.x * PT_TO_PX}px` }"
        ></div>
        <div
          v-if="
            alignmentGuides?.panelIndex === page.panelIndex &&
            alignmentGuides.y !== undefined
          "
          class="agree-canvas__align-guide is-horizontal"
          :style="{ top: `${alignmentGuides.y * PT_TO_PX}px` }"
        ></div>

        <!-- 页面隔断拖放预览：仅设计态显示，不写入打印模板 -->
        <div
          v-if="
            dropGuide?.panelIndex === page.panelIndex &&
            dropGuide.kind === 'pageBreak'
          "
          class="agree-canvas__page-break-guide"
          :style="{ top: `${dropGuide.top * PT_TO_PX}px` }"
        >
          <span>在此隔断，以下内容移到新页</span>
        </div>

        <!-- 元素 -->
        <div
          v-for="el in page.elements"
          :key="el.key"
          class="agree-canvas__el"
          :data-el-key="el.key"
          :class="{
            'is-selected': el.key === selectedKey,
            'is-overflow': isOverflow(el, page),
          }"
          :style="elementStyle(el)"
          @mousedown="onElementMouseDown($event, el)"
          @contextmenu="onElementContextMenu($event, el)"
        >
          <!-- 文本类 -->
          <div
            v-if="isTextLike(el)"
            class="agree-canvas__text"
            :style="textStyle(el.options)"
          >
            {{ textContent(el.options) }}
          </div>

          <!-- 二维码 -->
          <CanvasCode
            v-else-if="el.textType === 'qrcode' || el.textType === 'barcode'"
            :options="el.options"
            :value="resolveTextPreview(el.options, runtimePreview.printData)"
          />

          <!-- 图片 -->
          <img
            v-else-if="el.type === 'image' && el.options.src"
            class="agree-canvas__img"
            :src="el.options.src"
            alt="图片"
          />

          <!-- 横线 -->
          <div
            v-else-if="el.type === 'hline'"
            class="agree-canvas__hline"
            :style="lineStyle(el.options)"
          ></div>

          <!-- 竖线 -->
          <div
            v-else-if="el.type === 'vline'"
            class="agree-canvas__vline"
            :style="lineStyle(el.options, true)"
          ></div>

          <!-- 矩形 -->
          <div
            v-else-if="el.type === 'rect'"
            class="agree-canvas__rect"
            :style="rectStyle(el.options)"
          ></div>

          <!-- 表格 -->
          <table
            v-else-if="el.type === 'table' && el.tablePreview"
            class="agree-canvas__table"
            :style="tableStyle(el.options)"
          >
            <colgroup>
              <col
                v-for="(col, ci) in tableColGroup(el.tablePreview)"
                :key="ci"
                :width="`${Number(col.width) || 80}pt`"
              />
            </colgroup>
            <thead>
              <tr
                v-for="(row, ri) in el.tablePreview.headerRows"
                :key="ri"
                :style="tableSectionRowStyle(el.options, 'header')"
              >
                <td
                  v-for="(cell, ci) in row"
                  :key="ci"
                  :colspan="Number(cell.colspan) || 1"
                  :rowspan="Number(cell.rowspan) || 1"
                  :style="headerCellStyle(el.options, cell)"
                >
                  {{ cell.title }}
                </td>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in el.tablePreview.bodyRows" :key="ri">
                <td
                  v-for="cell in row.filter((item) => !item.hidden)"
                  :key="cell.colIndex"
                  :colspan="cell.colspan"
                  :rowspan="cell.rowspan"
                  :class="{
                    'is-col-highlight':
                      highlightTableKey === el.key &&
                      highlightColIndex === cell.colIndex,
                    'is-cell-selected': isBodyCellSelected(
                      el.key,
                      cell.rowIndex,
                      cell.colIndex,
                    ),
                  }"
                  :style="
                    cellStyle(
                      el.options,
                      el.tablePreview.leafCols[cell.colIndex] || {},
                    )
                  "
                  @mousedown.stop.prevent="
                    onTableBodyCellMouseDown($event, el, cell)
                  "
                  @mouseenter="onTableBodyCellMouseEnter($event, el, cell)"
                >
                  {{ cell.text }}
                </td>
              </tr>
            </tbody>
            <tfoot v-if="el.tablePreview.footerRows.length">
              <tr
                v-for="(row, ri) in el.tablePreview.footerRows"
                :key="ri"
                :style="tableSectionRowStyle(el.options, 'footer')"
              >
                <td
                  v-for="cell in row"
                  :key="cell.cellIndex"
                  :colspan="cell.colspan"
                  :style="cellStyle(el.options, cell, 'footer')"
                  @mousedown.stop
                  @click.stop="
                    onTableFooterCellClick(el, cell.rowIndex, cell.cellIndex)
                  "
                >
                  {{ cell.text }}
                </td>
              </tr>
            </tfoot>
          </table>

          <!-- 未识别类型的元素才显示标题兜底，避免正常元素被重复渲染 -->
          <div v-else class="agree-canvas__text">{{ el.options.title }}</div>

          <div
            v-if="bodyCellSelection?.key === el.key"
            class="agree-canvas__cell-toolbar"
            @mousedown.stop.prevent
            @click.stop
          >
            <span>
              已选
              {{
                Math.abs(
                  bodyCellSelection.endRow - bodyCellSelection.startRow,
                ) + 1
              }}
              ×
              {{
                Math.abs(
                  bodyCellSelection.endCol - bodyCellSelection.startCol,
                ) + 1
              }}
            </span>
            <button type="button" @click="emit('bodyMergeRequested')">
              合并
            </button>
            <button type="button" @click="emit('bodySplitRequested')">
              拆分
            </button>
            <button type="button" @click="emit('bodyFormulaRequested')">
              计算
            </button>
            <em>拖选或 Shift 点终点</em>
          </div>

          <!-- 选中态：8 个缩放手柄 -->
          <template v-if="el.key === selectedKey">
            <button
              v-if="el.type === 'table'"
              type="button"
              class="agree-canvas__move-table"
              @mousedown="startDrag($event, el, null)"
            >
              ⠿ 拖动整表
            </button>
            <span
              v-if="el.type !== 'table'"
              class="agree-canvas__handle is-nw"
              @mousedown="
                onHandleMouseDown($event, el, {
                  l: true,
                  t: true,
                  r: false,
                  b: false,
                })
              "
            ></span>
            <span
              v-if="el.type !== 'table'"
              class="agree-canvas__handle is-n"
              @mousedown="
                onHandleMouseDown($event, el, {
                  l: false,
                  t: true,
                  r: false,
                  b: false,
                })
              "
            ></span>
            <span
              v-if="el.type !== 'table'"
              class="agree-canvas__handle is-ne"
              @mousedown="
                onHandleMouseDown($event, el, {
                  l: false,
                  t: true,
                  r: true,
                  b: false,
                })
              "
            ></span>
            <span
              class="agree-canvas__handle is-w"
              @mousedown="
                onHandleMouseDown($event, el, {
                  l: true,
                  t: false,
                  r: false,
                  b: false,
                })
              "
            ></span>
            <span
              class="agree-canvas__handle is-e"
              @mousedown="
                onHandleMouseDown($event, el, {
                  l: false,
                  t: false,
                  r: true,
                  b: false,
                })
              "
            ></span>
            <span
              v-if="el.type !== 'table'"
              class="agree-canvas__handle is-sw"
              @mousedown="
                onHandleMouseDown($event, el, {
                  l: true,
                  t: false,
                  r: false,
                  b: true,
                })
              "
            ></span>
            <span
              v-if="el.type !== 'table'"
              class="agree-canvas__handle is-s"
              @mousedown="
                onHandleMouseDown($event, el, {
                  l: false,
                  t: false,
                  r: false,
                  b: true,
                })
              "
            ></span>
            <span
              v-if="el.type !== 'table'"
              class="agree-canvas__handle is-se"
              @mousedown="
                onHandleMouseDown($event, el, {
                  l: false,
                  t: false,
                  r: true,
                  b: true,
                })
              "
            ></span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agree-canvas__move-table {
  position: absolute;
  top: -27px;
  left: 0;
  z-index: 2;
  padding: 3px 8px;
  font-size: 12px;
  color: #2563eb;
  cursor: move;
  background: white;
  border: 1px solid #93c5fd;
  border-radius: 4px;
}

.agree-canvas {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  min-height: 100%;
  padding: 24px 16px 48px;
  background: #eef1f6;
}

.agree-canvas__hud {
  position: sticky;
  top: 4px;
  z-index: 5;
  align-self: flex-end;
  padding: 3px 10px;
  font-size: 12px;
  color: #fff;
  pointer-events: none;
  background: rgb(30 41 59 / 88%);
  border-radius: 4px;
}

.agree-canvas__page-wrap {
  position: relative;
}

.agree-canvas__paper {
  position: absolute;
  top: 0;
  left: 0;
  color: inherit;
  outline: 1px solid #d7dce3;
  background: #fff;
  box-shadow: 0 2px 12px rgb(0 0 0 / 12%);
  transform-origin: top left;
}

.agree-canvas__paper.is-drop-target {
  outline: 2px solid #3b82f6;
  outline-offset: 3px;
  box-shadow:
    0 0 0 5px rgb(59 130 246 / 12%),
    0 2px 12px rgb(0 0 0 / 12%);
}

.agree-canvas__page-break-guide {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 4;
  height: 0;
  pointer-events: none;
  border-top: 2px dashed #f59e0b;
}

.agree-canvas__page-break-guide span {
  position: absolute;
  right: 8px;
  bottom: 4px;
  padding: 2px 7px;
  font-size: 10px;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 4px;
}

.agree-canvas__page-no {
  position: absolute;
  top: -22px;
  left: 0;
  font-size: 12px;
  color: #94a3b8;
}

.agree-canvas__safe {
  position: absolute;
  pointer-events: none;
  border: 1px dashed #dbe3ef;
}

.agree-canvas__align-guide {
  position: absolute;
  z-index: 8;
  pointer-events: none;
  background: #ec4899;
  box-shadow: 0 0 0 1px rgb(255 255 255 / 65%);
}

.agree-canvas__align-guide.is-vertical {
  top: 0;
  bottom: 0;
  width: 1px;
}

.agree-canvas__align-guide.is-horizontal {
  right: 0;
  left: 0;
  height: 1px;
}

.agree-canvas__el {
  position: absolute;
  box-sizing: border-box;
  overflow: visible;
  cursor: move;
  user-select: none;
  scroll-margin-top: 36px;
}

.agree-canvas__el.is-selected {
  outline: 1px solid #3b82f6;
}

.agree-canvas__el.is-overflow {
  outline: 1.5px solid #ef4444;
  background: rgb(239 68 68 / 6%);
}

.agree-canvas__text {
  width: 100%;
  height: 100%;
  overflow: hidden;
  word-break: break-all;
  white-space: pre-wrap;
}

.agree-canvas__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.agree-canvas__hline {
  width: 100%;
  border-top: 1px solid #333;
  transform: translateY(50%);
}

.agree-canvas__vline {
  height: 100%;
  border-left: 1px solid #333;
  transform: translateX(50%);
}

.agree-canvas__rect {
  width: 100%;
  height: 100%;
  border: 1px solid #333;
}

.agree-canvas__table {
  width: 100%;
  font-family: inherit;
  font-size: 9pt;
  line-height: 9.75pt;
  color: #000;
  table-layout: auto;
  border-collapse: collapse;
  border: 1px solid #000;
}

.agree-canvas__table thead td,
.agree-canvas__table td {
  box-sizing: border-box;
  height: 18pt;
  padding: 0 4pt;
  overflow: hidden;
  vertical-align: middle;
  color: #000;
  word-break: break-all;
  overflow-wrap: break-word;
  white-space: normal;
  border: 1px solid #333;
}

.agree-canvas__table thead td {
  font-weight: 400;
  background: transparent;
}

.agree-canvas__table td.is-col-highlight {
  background: rgb(59 130 246 / 14%);
  box-shadow: inset 0 0 0 1px #60a5fa;
}

.agree-canvas__table td.is-cell-selected {
  background: #dbeafe;
  box-shadow: inset 0 0 0 2px #2563eb;
}

.agree-canvas__table td:hover {
  cursor: cell;
  background: #eff6ff;
}

.agree-canvas__cell-toolbar {
  position: absolute;
  top: -36px;
  right: 0;
  z-index: 10;
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 4px 6px;
  font-size: 11px;
  color: #334155;
  white-space: nowrap;
  background: #fff;
  border: 1px solid #93c5fd;
  border-radius: 5px;
  box-shadow: 0 3px 10px rgb(15 23 42 / 16%);
}

.agree-canvas__cell-toolbar button {
  padding: 2px 7px;
  color: #1d4ed8;
  cursor: pointer;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 3px;
}

.agree-canvas__cell-toolbar em {
  font-style: normal;
  color: #94a3b8;
}

.agree-canvas__handle {
  position: absolute;
  z-index: 2;
  width: 8px;
  height: 8px;
  background: #fff;
  border: 1px solid #3b82f6;
}

.agree-canvas__handle.is-nw {
  top: -4px;
  left: -4px;
  cursor: nwse-resize;
}

.agree-canvas__handle.is-n {
  top: -4px;
  left: calc(50% - 4px);
  cursor: ns-resize;
}

.agree-canvas__handle.is-ne {
  top: -4px;
  right: -4px;
  cursor: nesw-resize;
}

.agree-canvas__handle.is-w {
  top: calc(50% - 4px);
  left: -4px;
  cursor: ew-resize;
}

.agree-canvas__handle.is-e {
  top: calc(50% - 4px);
  right: -4px;
  cursor: ew-resize;
}

.agree-canvas__handle.is-sw {
  bottom: -4px;
  left: -4px;
  cursor: nesw-resize;
}

.agree-canvas__handle.is-s {
  bottom: -4px;
  left: calc(50% - 4px);
  cursor: ns-resize;
}

.agree-canvas__handle.is-se {
  right: -4px;
  bottom: -4px;
  cursor: nwse-resize;
}
</style>

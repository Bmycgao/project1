<script lang="ts" setup>
/**
 * 协议打印模板设计面板（系统管理编辑页嵌入）
 * 交互参考 sv-print：撤销/缩放/复制删除/点选同步
 */
import type { AgreePrintFieldItem } from './fields';
import type { CanvasHighlightCol } from './print-canvas-table-body';
import type { AgreeFooterRow } from './print-table-footer';
import type { AgreePrintData } from './types';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import {
  ElButton,
  ElButtonGroup,
  ElDialog,
  ElInput,
  ElMessage,
  ElMessageBox,
} from 'element-plus';

import { getPrintTemplate, updatePrintTemplate } from '#/api';

import { agreePrintTemplate } from './agreement-template';
import { ensureHiprint } from './ensure-hiprint';
import { AGREE_PRINT_ALL_FIELDS, formatPrintFieldLabel } from './fields';
import { preparePrintTemplate } from './prepare-template';
import { mergeAgreeCustomOptions } from './print-agree-options';
import {
  clearCanvasTableBodies,
  fillCanvasTableBodies,
} from './print-canvas-table-body';
import PrintDataJsonDialog from './print-data-json-dialog.vue';
import PrintDataPanel from './print-data-panel.vue';
import {
  AGREE_PRINT_FIELD_DND,
  AGREE_PRINT_TOOLBOX_DND,
  buildBoundPrintElement,
  buildToolboxPrintElement,
  duplicatePrintElement,
  getAgreePrintHtml5Drag,
  insertPrintElement,
  listLeafTableCells,
  listPrintElements,
  patchElementOptions,
  patchLeafTableColumns,
  removePrintElement,
  sanitizePrintTemplate,
  setAgreePrintHtml5Drag,
} from './print-element-meta';
import PrintInspector from './print-inspector.vue';
import { mergeFooterCells, splitFooterCell } from './print-table-footer';
import PrintWatermarkDialog from './print-watermark-dialog.vue';
import { buildDesignerSamplePrintData } from './sample-print-data';
import { cloneTemplate, loadAgreePrintTemplate } from './template-store';

const props = defineProps<{
  /** 由父页统一保存元信息 + JSON（系统管理编辑页） */
  delegateSave?: boolean;
  /** 系统管理模板记录 id；不传则使用 localStorage 兜底 */
  templateId?: string;
}>();

const emit = defineEmits<{
  saveRequested: [json: Record<string, any>];
}>();

const HISTORY_MAX = 40;
const ZOOM_MIN = 60;
const ZOOM_MAX = 160;

const designing = ref(false);
const previewOpen = ref(false);
const watermarkOpen = ref(false);
const jsonOpen = ref(false);
const dataJsonOpen = ref(false);
const jsonText = ref('');
const previewHtmlHost = ref<HTMLElement | null>(null);
const customSaved = ref(false);
const templateCode = ref('');
const currentTemplateJson = ref<Record<string, any>>({});
const selectedElementKey = ref('');
/** 画布表体当前高亮列（必须带表身份，避免多表同列一起亮） */
const highlightCol = ref<CanvasHighlightCol | null>(null);
/** 检视器列高亮：仅当前选中表，避免切表后数字还对上 */
const inspectorHighlightColIndex = computed(() => {
  const hl = highlightCol.value;
  const table = selectedTableRef();
  if (
    !hl ||
    !table ||
    hl.panelIndex !== table.panelIndex ||
    hl.elementIndex !== table.elementIndex
  ) {
    return -1;
  }
  return hl.colIndex;
});
/** 画布表尾选中起止格 */
const footerSel = ref<null | {
  cellIndex: number;
  elementIndex: number;
  panelIndex: number;
  rowIndex: number;
}>(null);
const footerSelEnd = ref<null | {
  cellIndex: number;
  elementIndex: number;
  panelIndex: number;
  rowIndex: number;
}>(null);
const inspectorRef = ref<null | {
  applyDictionaryPick: (item: AgreePrintFieldItem) => void;
  focusColumn?: (colIndex: number) => void;
  focusFooterCell?: (rowIndex: number, cellIndex: number) => void;
}>(null);
const zoom = ref(100);
const canUndo = ref(false);
const canRedo = ref(false);
const ctxMenu = ref({ open: false, x: 0, y: 0 });

const samplePrintData = ref(buildDesignerSamplePrintData());

let $ref: any = null;
let templateInst: any = null;
/** 重建画布时忽略 onDataChanged，避免脏历史 */
let remounting = false;
let applyingHistory = false;
let history: Record<string, any>[] = [];
let historyIndex = -1;
let syncTimer: ReturnType<typeof setTimeout> | undefined;
let canvasHost: HTMLElement | null = null;
/** 右键刚打开菜单时忽略随后的 click，避免立刻关掉 */
let skipDocClick = false;

/** 加载模板 JSON */
async function fetchTemplateJson(): Promise<Record<string, any>> {
  if (props.templateId) {
    const row = await getPrintTemplate(props.templateId);
    templateCode.value = row.templateCode;
    if (row.templateJson?.panels?.length) {
      return cloneTemplate(row.templateJson);
    }
    return cloneTemplate(agreePrintTemplate);
  }
  return loadAgreePrintTemplate();
}

/** 读取画布 JSON：坐标来自 hiprint，筛行/显隐以内存模板为准 */
function readCanvasJson(): null | Record<string, any> {
  if (!templateInst) return null;
  const host =
    canvasHost ||
    document.querySelector<HTMLElement>('#agree-print-design-canvas');
  /** 覆盖层不进 getJson；先拆掉以免引擎扫到我们的格子 */
  clearCanvasTableBodies(host);
  let raw: any;
  try {
    raw =
      typeof templateInst.getJson === 'function'
        ? templateInst.getJson()
        : templateInst.getJsonTid?.();
  } catch (error) {
    console.warn('[print-designer] getJson failed', error);
    void refreshCanvasTableBodiesSoon();
    return currentTemplateJson.value
      ? cloneTemplate(currentTemplateJson.value)
      : null;
  }
  if (!raw?.panels) return null;
  const merged = mergeAgreeCustomOptions(raw, currentTemplateJson.value);
  void refreshCanvasTableBodiesSoon();
  return merged;
}

function refreshHistoryFlags() {
  canUndo.value = historyIndex > 0;
  canRedo.value = historyIndex >= 0 && historyIndex < history.length - 1;
}

/**
 * 压入撤销栈（相同快照跳过）
 * @param json 模板
 */
function pushHistory(json: Record<string, any>) {
  if (applyingHistory) return;
  const snap = cloneTemplate(json);
  const curr = history[historyIndex];
  if (curr && JSON.stringify(curr) === JSON.stringify(snap)) return;
  history = history.slice(0, historyIndex + 1);
  history.push(snap);
  if (history.length > HISTORY_MAX) history.shift();
  historyIndex = history.length - 1;
  refreshHistoryFlags();
}

/** 用当前模板重置撤销栈 */
function resetHistory(json: Record<string, any>) {
  history = [cloneTemplate(json)];
  historyIndex = 0;
  refreshHistoryFlags();
}

/**
 * 拖拽结束后同步 JSON / 历史（防抖，避免一步一撤销）
 */
function scheduleCanvasSync() {
  if (remounting || applyingHistory) return;
  customSaved.value = true;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (remounting || applyingHistory) return;
    const j = readCanvasJson();
    if (!j) return;
    currentTemplateJson.value = j;
    pushHistory(j);
    syncSelectedElementKey(j);
    refreshCanvasTableBodies();
  }, 400);
}

/**
 * 结束半截 jQuery 拖拽，避免重挂后 document 上还在读 children/options
 * @param $ jQuery
 */
function teardownHiprintDrag($: any) {
  try {
    $?.(document).trigger('mouseup');
    $?.('.ui-draggable-dragging').remove();
  } catch {
    // ignore
  }
}

/**
 * 用指定 JSON 重建设计器画布
 * @param tpl 模板 JSON
 * @param opts rebuildToolbox 仅首次/恢复默认时重建左侧积木
 */
async function mountDesigner(
  tpl: Record<string, any>,
  opts?: { rebuildToolbox?: boolean },
) {
  const { hiprint, PrintTemplate, $ } = await ensureHiprint({
    withProvider: true,
  });
  $ref = $;
  remounting = true;
  const rebuildToolbox = opts?.rebuildToolbox !== false;
  try {
    await nextTick();
    teardownHiprintDrag($);
    if (rebuildToolbox) {
      $('.agree-print-ep').empty();
      hiprint.PrintElementTypeManager.build(
        '.agree-print-ep',
        'agreePrintModule',
      );
      await nextTick();
      bindToolboxHtml5Drag();
    }
    $('#agree-print-design-canvas').empty();
    $('#PrintElementOptionSetting').empty();

    try {
      templateInst?.clear?.();
    } catch {
      // ignore
    }

    /** 给引擎一份纯 JSON，避免 Vue Proxy 让 columns[0] 变成 undefined */
    const safeTpl = sanitizePrintTemplate(tpl);
    const plain = cloneTemplate(safeTpl);
    currentTemplateJson.value = cloneTemplate(plain);
    templateInst = new PrintTemplate({
      template: plain,
      settingContainer: '#PrintElementOptionSetting',
      fields: AGREE_PRINT_ALL_FIELDS.map((f) => ({
        field: f.field,
        text: formatPrintFieldLabel(f),
      })),
      onDataChanged: () => {
        scheduleCanvasSync();
      },
    });
    templateInst.design('#agree-print-design-canvas', { grid: false });
    syncSelectedElementKey(currentTemplateJson.value);
    await nextTick();
    bindCanvasEvents();
    if (rebuildToolbox) bindToolboxHtml5Drag();
    void refreshCanvasTableBodiesSoon();
  } finally {
    remounting = false;
  }
}

/**
 * 当前检视器选中的表格身份；非表格则无
 */
function selectedTableRef() {
  const hit = listPrintElements(currentTemplateJson.value).find(
    (e) => e.key === selectedElementKey.value && e.type === 'table',
  );
  return hit
    ? { panelIndex: hit.panelIndex, elementIndex: hit.elementIndex }
    : null;
}

/**
 * 按内存模板 + 样例，给画布表格铺可滚动示意表体（可点列 / 表尾）
 */
function refreshCanvasTableBodies() {
  if (remounting) return;
  const host =
    canvasHost ||
    document.querySelector<HTMLElement>('#agree-print-design-canvas');
  fillCanvasTableBodies(
    host,
    currentTemplateJson.value,
    samplePrintData.value,
    {
      highlightCol: highlightCol.value,
      activeTable: selectedTableRef(),
      highlightFooter: footerSel.value,
      highlightFooterEnd: footerSelEnd.value,
      onBodyColumnClick: onCanvasBodyColumnClick,
      onBodyColumnDblClick: onCanvasBodyColumnDblClick,
      onFooterCellClick: onCanvasFooterCellClick,
    },
  );
}

/**
 * 选中纸面表格元素
 * @param panelIndex 面板
 * @param elementIndex 元素
 */
function selectTableElement(panelIndex: number, elementIndex: number) {
  const list = listPrintElements(currentTemplateJson.value);
  const hit = list.find(
    (e) => e.panelIndex === panelIndex && e.elementIndex === elementIndex,
  );
  if (hit) selectedElementKey.value = hit.key;
}

/**
 * 单击表体列：选中表格 + 高亮列
 */
function onCanvasBodyColumnClick(payload: {
  colIndex: number;
  elementIndex: number;
  field: string;
  panelIndex: number;
}) {
  selectTableElement(payload.panelIndex, payload.elementIndex);
  highlightCol.value = {
    panelIndex: payload.panelIndex,
    elementIndex: payload.elementIndex,
    colIndex: payload.colIndex,
  };
  footerSel.value = null;
  footerSelEnd.value = null;
  refreshCanvasTableBodies();
  inspectorRef.value?.focusColumn?.(payload.colIndex);
}

/**
 * 双击表体列：切换相同值合并（agreeMergeSame）
 */
function onCanvasBodyColumnDblClick(payload: {
  colIndex: number;
  elementIndex: number;
  field: string;
  panelIndex: number;
}) {
  const json = currentTemplateJson.value;
  if (!json) return;
  selectTableElement(payload.panelIndex, payload.elementIndex);
  highlightCol.value = {
    panelIndex: payload.panelIndex,
    elementIndex: payload.elementIndex,
    colIndex: payload.colIndex,
  };
  const el =
    json.panels?.[payload.panelIndex]?.printElements?.[payload.elementIndex];
  if (!el?.options) return;
  const leaves = listLeafTableCells(el.options.columns).map((c) => ({ ...c }));
  const col = leaves[payload.colIndex];
  if (!col) return;
  col.agreeMergeSame = !col.agreeMergeSame;
  const next = patchLeafTableColumns(
    json,
    { panelIndex: payload.panelIndex, elementIndex: payload.elementIndex },
    leaves,
  );
  void onCanvasPatch(next, { remount: false });
  ElMessage.success(
    col.agreeMergeSame
      ? `已开启「${col.title || col.field || '该列'}」相同值合并`
      : `已关闭「${col.title || col.field || '该列'}」相同值合并`,
  );
}

/**
 * 单击表尾格：选中 / Shift 扩选
 */
function onCanvasFooterCellClick(payload: {
  cellIndex: number;
  elementIndex: number;
  panelIndex: number;
  rowIndex: number;
  shiftKey: boolean;
}) {
  selectTableElement(payload.panelIndex, payload.elementIndex);
  highlightCol.value = null;
  const cur = {
    panelIndex: payload.panelIndex,
    elementIndex: payload.elementIndex,
    rowIndex: payload.rowIndex,
    cellIndex: payload.cellIndex,
  };
  if (
    payload.shiftKey &&
    footerSel.value &&
    footerSel.value.panelIndex === cur.panelIndex &&
    footerSel.value.elementIndex === cur.elementIndex &&
    footerSel.value.rowIndex === cur.rowIndex
  ) {
    footerSelEnd.value = cur;
  } else {
    footerSel.value = cur;
    footerSelEnd.value = null;
  }
  refreshCanvasTableBodies();
  inspectorRef.value?.focusFooterCell?.(payload.rowIndex, payload.cellIndex);
}

/**
 * 合并当前表尾选中区间（结构 colspan）
 */
async function mergeSelectedFooterCells() {
  const json = currentTemplateJson.value;
  const start = footerSel.value;
  if (!json || !start) {
    ElMessage.warning('请先点选表尾格子（可 Shift 点另一格扩选）');
    return;
  }
  const end = footerSelEnd.value || start;
  if (start.rowIndex !== end.rowIndex) {
    ElMessage.warning('只能合并同一行的表尾格子');
    return;
  }
  const el =
    json.panels?.[start.panelIndex]?.printElements?.[start.elementIndex];
  if (!el?.options) return;
  const rows = (el.options.agreeFooters || []) as AgreeFooterRow[];
  if (!rows[start.rowIndex]) return;
  const nextRows = rows.map((r, i) =>
    i === start.rowIndex
      ? mergeFooterCells(r, start.cellIndex, end.cellIndex)
      : { cells: r.cells.map((c) => ({ ...c })) },
  );
  const next = patchElementOptions(
    json,
    { panelIndex: start.panelIndex, elementIndex: start.elementIndex },
    { agreeFooters: nextRows },
  );
  footerSelEnd.value = null;
  footerSel.value = {
    ...start,
    cellIndex: Math.min(start.cellIndex, end.cellIndex),
  };
  await onCanvasPatch(next, { remount: false });
  ElMessage.success('表尾格子已合并（结构 colspan，与相同值合并无关）');
}

/**
 * 拆分当前表尾选中格
 */
async function splitSelectedFooterCell() {
  const json = currentTemplateJson.value;
  const start = footerSel.value;
  if (!json || !start) {
    ElMessage.warning('请先点选要拆分的表尾格子');
    return;
  }
  const el =
    json.panels?.[start.panelIndex]?.printElements?.[start.elementIndex];
  if (!el?.options) return;
  const rows = (el.options.agreeFooters || []) as AgreeFooterRow[];
  if (!rows[start.rowIndex]) return;
  const nextRows = rows.map((r, i) =>
    i === start.rowIndex
      ? splitFooterCell(r, start.cellIndex)
      : { cells: r.cells.map((c) => ({ ...c })) },
  );
  const next = patchElementOptions(
    json,
    { panelIndex: start.panelIndex, elementIndex: start.elementIndex },
    { agreeFooters: nextRows },
  );
  footerSelEnd.value = null;
  await onCanvasPatch(next, { remount: false });
  ElMessage.success('表尾格子已拆分');
}

/** hiprint 画完表头后再铺表体 */
async function refreshCanvasTableBodiesSoon() {
  await nextTick();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      refreshCanvasTableBodies();
    });
  });
}

/**
 * 重建后尽量保留当前选中元素（key 含坐标，拖动后会变）
 * @param json 模板
 */
function syncSelectedElementKey(json: Record<string, any>) {
  const list = listPrintElements(json);
  if (list.length === 0) {
    selectedElementKey.value = '';
    return;
  }
  if (list.some((e) => e.key === selectedElementKey.value)) return;
  const prev = selectedElementKey.value;
  const fieldHint = prev.split('-')[3];
  const byField = fieldHint
    ? list.find((e) => e.field && e.field === fieldHint)
    : undefined;
  const table = list.find((e) => e.type === 'table');
  const fallback = list[0];
  selectedElementKey.value = byField?.key || table?.key || fallback?.key || '';
}

/** 画布点选提示：用来对齐检视器，避免点表格却对上标题 */
interface SelectHint {
  field: string;
  left: number;
  top: number;
  type: string;
}

/**
 * 从 hiprint 选中态或点击坐标匹配检视器元素（不重挂）
 * @param clickTarget 左击目标，引擎 API 拿不到选中时用来兜底
 */
function syncSelectionFromEngine(clickTarget?: EventTarget | null) {
  const json = currentTemplateJson.value;
  const list = listPrintElements(json);
  if (list.length === 0) return;
  const hint =
    hintFromDom(clickTarget) ||
    readEngineSelectedHint() ||
    hintFromDom(querySelectedPrintElement());
  if (!hint) return;
  selectedElementKey.value = matchPrintElement(list, hint).key;
}

/**
 * 按类型优先、再 field、再坐标，把 hint 对到模板元素
 * @param list 纸面元素
 * @param hint 点选提示
 */
function matchPrintElement(
  list: ReturnType<typeof listPrintElements>,
  hint: SelectHint,
) {
  const typed = hint.type
    ? list.filter((e) => printTypeCompat(e.type, hint.type))
    : list;
  const candidates = typed.length > 0 ? typed : list;
  const first = candidates[0] ?? list[0];
  if (!first) {
    throw new Error('纸面无可用元素');
  }
  let best = first;
  let bestScore = -Infinity;
  for (const item of candidates) {
    let score = 0;
    if (hint.type && printTypeCompat(item.type, hint.type)) score += 120;
    if (hint.field && item.field && hint.field === item.field) score += 80;
    const dx = Math.abs(Number(item.options.left || 0) - hint.left);
    const dy = Math.abs(Number(item.options.top || 0) - hint.top);
    score -= dx + dy;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

/**
 * 文本类兼容 longText；表格必须对表格
 * @param a 模板类型
 * @param b 点选推断类型
 */
function printTypeCompat(a: string, b: string) {
  if (a === b) return true;
  const textLike = new Set(['longText', 'text']);
  return textLike.has(a) && textLike.has(b);
}

/**
 * 读取引擎当前选中元素的 left/top/field/type
 */
function readEngineSelectedHint(): null | SelectHint {
  try {
    const els = templateInst?.getSelectEls?.();
    const one = els?.jquery
      ? els.get(0)
      : Array.isArray(els)
        ? els[0]
        : els?.[0];
    const opts = one?.options || one?.printElement?.options;
    const type = String(
      one?.printElementType?.type ||
        one?.printElement?.printElementType?.type ||
        '',
    );
    if (opts && (opts.left !== undefined || opts.top !== undefined)) {
      return {
        left: Number(opts.left) || 0,
        top: Number(opts.top) || 0,
        field: String(opts.field || ''),
        type,
      };
    }
  } catch {
    // 走 DOM 兜底
  }
  return hintFromDom(querySelectedPrintElement());
}

/**
 * 只认纸面元素上的 selected，避免表头格子 .selected 被当成整页选中
 */
function querySelectedPrintElement(): HTMLElement | null {
  return (
    (canvasHost?.querySelector(
      '.hiprint-printElement.selected, .hiprint-printElement.ui-selected',
    ) as HTMLElement | null) || null
  );
}

/**
 * 从 class 推断 hiprint 元素类型（点表格格子时必须认出 table）
 * @param node 纸面元素 DOM
 */
function inferPrintTypeFromDom(node: HTMLElement) {
  /** 点表头格子时 class 不一定带 table，但纸面元素里会有 <table> */
  if (node.querySelector('table')) return 'table';
  const cls =
    `${node.className || ''} ${node.getAttribute('class') || ''}`.toLowerCase();
  if (cls.includes('printelement-table') || cls.includes('print-table'))
    return 'table';
  if (cls.includes('longtext')) return 'longText';
  if (cls.includes('hline')) return 'hline';
  if (cls.includes('vline')) return 'vline';
  if (cls.includes('rect')) return 'rect';
  if (cls.includes('oval')) return 'oval';
  if (cls.includes('html')) return 'html';
  if (cls.includes('image')) return 'image';
  return '';
}

/**
 * 点格子时 closest 可能落在内部节点：上溯到带 left/top 的最外层纸面元素
 * @param target 点击或选中节点
 */
function resolvePrintElementNode(
  target: EventTarget | HTMLElement | null | undefined,
): HTMLElement | null {
  const start = (target as HTMLElement | null)?.closest?.(
    '.hiprint-printElement',
  ) as HTMLElement | null;
  if (!start) return null;
  let current: HTMLElement | null = start;
  let positioned: HTMLElement | null = null;
  while (current) {
    const left = Number.parseFloat(current.style.left);
    const top = Number.parseFloat(current.style.top);
    if (Number.isFinite(left) && Number.isFinite(top)) {
      positioned = current;
    }
    const parentEl: HTMLElement | null = current.parentElement;
    const next = parentEl?.closest?.(
      '.hiprint-printElement',
    ) as HTMLElement | null;
    if (!next || next === current) break;
    current = next;
  }
  return positioned || start;
}

/**
 * 从纸面 DOM 读 left/top/type（hiprint 元素 style 与 options 同坐标系）
 * @param target 点击或选中节点
 */
function hintFromDom(
  target: EventTarget | HTMLElement | null | undefined,
): null | SelectHint {
  const node = resolvePrintElementNode(target);
  if (!node) return null;
  const left = Number.parseFloat(node.style.left);
  const top = Number.parseFloat(node.style.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return {
    left,
    top,
    field: String(node.getAttribute('field') || node.dataset.field || ''),
    type: inferPrintTypeFromDom(node),
  };
}

function unbindCanvasEvents() {
  canvasHost?.removeEventListener('mousedown', onCanvasPointer, true);
  canvasHost?.removeEventListener('click', onCanvasPointer, true);
  canvasHost?.removeEventListener('contextmenu', onCanvasContextMenu);
  canvasHost?.removeEventListener('dragover', onCanvasCaptureDragOver, true);
  canvasHost?.removeEventListener('drop', onCanvasCaptureDrop, true);
  canvasHost = null;
}

function bindCanvasEvents() {
  unbindCanvasEvents();
  canvasHost = document.querySelector('#agree-print-design-canvas');
  /** 捕获阶段监听：hiprint 常在元素上 stopPropagation，冒泡到不了画布容器 */
  canvasHost?.addEventListener('mousedown', onCanvasPointer, true);
  canvasHost?.addEventListener('click', onCanvasPointer, true);
  canvasHost?.addEventListener('contextmenu', onCanvasContextMenu);
  canvasHost?.addEventListener('dragover', onCanvasCaptureDragOver, true);
  canvasHost?.addEventListener('drop', onCanvasCaptureDrop, true);
}

/**
 * 画布捕获 dragover：让积木/字段能落到 hiprint 表格上
 * @param e 拖拽
 */
function onCanvasCaptureDragOver(e: DragEvent) {
  if (!getAgreePrintHtml5Drag()) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
}

/**
 * 画布捕获 drop：表格引擎会拦 HTML5 drop，这里抢先放置
 * @param e 放下
 */
function onCanvasCaptureDrop(e: DragEvent) {
  if (!getAgreePrintHtml5Drag()) return;
  e.preventDefault();
  e.stopPropagation();
  void onCanvasDrop(e);
}

/** 左击纸面：等 hiprint 选中后再同步检视器 */
function onCanvasPointer(e: MouseEvent) {
  if (e.type === 'mousedown' && e.button !== 0) return;
  ctxMenu.value.open = false;
  const target = e.target;
  window.setTimeout(() => syncSelectionFromEngine(target), 80);
}

/** 右键菜单 */
function onCanvasContextMenu(e: MouseEvent) {
  e.preventDefault();
  skipDocClick = true;
  window.setTimeout(() => {
    syncSelectionFromEngine(e.target);
    ctxMenu.value = { open: true, x: e.clientX, y: e.clientY };
  }, 0);
  window.setTimeout(() => {
    skipDocClick = false;
  }, 300);
}

function closeCtxMenu() {
  if (skipDocClick) return;
  ctxMenu.value.open = false;
}

/** 等鼠标松开后再重挂，避免和 hiprint document 拖拽监听打架 */
function waitMouseIdle() {
  return new Promise<void>((resolve) => {
    window.setTimeout(() => {
      teardownHiprintDrag($ref);
      resolve();
    }, 80);
  });
}

/**
 * 检视器写回：筛行静默更新 JSON；改列/绑定才重挂画布
 * @param json 新模板
 * @param opts remount 默认 true
 */
async function onCanvasPatch(
  json: Record<string, any>,
  opts?: { remount?: boolean },
) {
  customSaved.value = true;
  const safe = sanitizePrintTemplate(json);
  currentTemplateJson.value = cloneTemplate(safe);
  pushHistory(safe);
  if (opts?.remount === false) {
    syncSelectedElementKey(safe);
    void refreshCanvasTableBodiesSoon();
    return;
  }
  designing.value = true;
  try {
    await mountDesigner(safe, { rebuildToolbox: false });
  } catch (error: any) {
    console.error('[print-designer] canvas patch failed', error);
    ElMessage.error(error?.message || '刷新设计器失败');
  } finally {
    designing.value = false;
  }
}

/**
 * 检视器点列时同步画布高亮（绑到当前选中表）
 * @param colIndex 列下标
 */
function onInspectorHighlightCol(colIndex: number) {
  const table = selectedTableRef();
  highlightCol.value = table && colIndex >= 0 ? { ...table, colIndex } : null;
  footerSel.value = null;
  footerSelEnd.value = null;
  refreshCanvasTableBodies();
}

/**
 * 数据字典点选 → 绑定到当前检视器元素
 * @param item 字段
 */
function onDictionaryPick(item: AgreePrintFieldItem) {
  inspectorRef.value?.applyDictionaryPick(item);
}

const canvasDropActive = ref(false);

/**
 * 数据源拖到纸面上方时允许放下
 * @param e 拖拽
 */
function onCanvasDragOver(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  canvasDropActive.value = true;
}

function onCanvasDragLeave(e: DragEvent) {
  const box = e.currentTarget as HTMLElement;
  const next = e.relatedTarget as Node | null;
  if (next && box.contains(next)) return;
  canvasDropActive.value = false;
}

/**
 * 解析数据源拖拽载荷
 * @param e drop 事件
 */
function parseFieldDrag(e: DragEvent): AgreePrintFieldItem | null {
  const raw = e.dataTransfer?.getData('text/plain');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as {
        item?: AgreePrintFieldItem;
        kind?: string;
      };
      if (parsed?.kind === AGREE_PRINT_FIELD_DND && parsed.item?.field) {
        return parsed.item;
      }
    } catch {
      // 非本面板拖拽
    }
  }
  const session = getAgreePrintHtml5Drag();
  if (session?.kind === AGREE_PRINT_FIELD_DND) return session.item;
  return null;
}

/**
 * 鼠标位置换算为模板 left/top（含当前缩放）
 * @param e drop 事件
 */
function dropPos(e: DragEvent) {
  const host = document.querySelector('#agree-print-design-canvas');
  const paper = host?.querySelector(
    '.hiprint-printPaper',
  ) as HTMLElement | null;
  const el = paper || host;
  if (!el) return { left: 20, top: 40 };
  const rect = el.getBoundingClientRect();
  const scale = zoom.value / 100 || 1;
  return {
    left: Math.max(8, Math.round((e.clientX - rect.left) / scale)),
    top: Math.max(8, Math.round((e.clientY - rect.top) / scale)),
  };
}

/**
 * 把数据源字段放到纸面：生成已绑定文本或表格
 * @param e drop 事件
 */
async function onCanvasDrop(e: DragEvent) {
  e.preventDefault();
  canvasDropActive.value = false;
  const toolboxTid = parseToolboxDrag(e);
  if (toolboxTid) {
    await placeToolboxElement(toolboxTid, dropPos(e));
    return;
  }
  const item = parseFieldDrag(e);
  if (!item) return;
  if (item.group === 'derived') {
    ElMessage.info('派生量用于显隐，请不要放到纸面');
    return;
  }
  const json = readCanvasJson() || currentTemplateJson.value;
  if (!json?.panels?.length) {
    ElMessage.warning('画布未就绪');
    return;
  }
  const { left, top } = dropPos(e);
  const node = buildBoundPrintElement(item, left, top);
  const next = insertPrintElement(json, 0, -1, node);
  await waitMouseIdle();
  await onCanvasPatch(next);
  const created = [...listPrintElements(currentTemplateJson.value)]
    .toReversed()
    .find((el) => el.field === item.field);
  if (created) selectedElementKey.value = created.key;
  ElMessage.success(`已放置「${item.text}」`);
}

/** 积木 HTML5 拖拽进行中，松开后忽略 click，避免点一下放两个 */
let toolboxDragging = false;

/**
 * 关掉 hiprint 自带 jQuery 拖拽，改走 HTML5（表格才能拖，缩放后落点也对）
 */
function bindToolboxHtml5Drag() {
  const host = document.querySelector('.agree-print-ep');
  if (!host || !$ref) return;
  host.querySelectorAll('.ep-draggable-item').forEach((node) => {
    const el = node as HTMLElement;
    if (el.dataset.html5Bound === '1') return;
    el.dataset.html5Bound = '1';
    try {
      const $el = $ref(el);
      if ($el.data('ui-draggable') || $el.data('uiDraggable')) {
        $el.draggable('destroy');
      }
    } catch {
      // 未初始化则忽略
    }
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', onToolboxDragStart);
    el.addEventListener('dragend', onToolboxDragEnd);
    el.addEventListener('click', onToolboxClick);
  });
}

/**
 * 积木开始拖：写入 tid
 * @param e 拖拽
 */
function onToolboxDragStart(e: DragEvent) {
  toolboxDragging = true;
  const tid = readToolboxTid(e.currentTarget as HTMLElement);
  if (!tid) return;
  setAgreePrintHtml5Drag({ kind: AGREE_PRINT_TOOLBOX_DND, tid });
  const payload = JSON.stringify({ kind: AGREE_PRINT_TOOLBOX_DND, tid });
  e.dataTransfer?.setData('text/plain', payload);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
}

function onToolboxDragEnd() {
  window.setTimeout(() => {
    toolboxDragging = false;
    setAgreePrintHtml5Drag(null);
  }, 0);
}

/**
 * 点积木：放到纸面下方空位（表格 jQuery 拖不动时的兜底）
 */
function onToolboxClick(e: MouseEvent) {
  if (toolboxDragging) return;
  const tid = readToolboxTid(e.currentTarget as HTMLElement);
  if (!tid) return;
  void placeToolboxElement(tid, nextToolboxPlacePos());
}

/**
 * 从 hiprint 生成的芯片上读 tid
 * @param el 芯片 DOM
 */
function readToolboxTid(el: HTMLElement | null) {
  let cur: HTMLElement | null = el;
  while (cur && !cur.classList.contains('agree-print-ep')) {
    const tid = cur.getAttribute('tid') || cur.dataset.tid || '';
    if (tid) return tid;
    cur = cur.parentElement;
  }
  const text = String(el?.textContent || '').trim();
  const byTitle: Record<string, string> = {
    静态标题: 'agreePrintModule.staticTitle',
    动态文本: 'agreePrintModule.dynamicText',
    长文本: 'agreePrintModule.longText',
    表格: 'agreePrintModule.table',
    二维码: 'agreePrintModule.qrcode',
    条形码: 'agreePrintModule.barcode',
    横线: 'agreePrintModule.hline',
    竖线: 'agreePrintModule.vline',
    矩形: 'agreePrintModule.rect',
  };
  return byTitle[text] || '';
}

/**
 * 解析积木 HTML5 拖拽
 * @param e drop
 */
function parseToolboxDrag(e: DragEvent): null | string {
  const raw = e.dataTransfer?.getData('text/plain');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { kind?: string; tid?: string };
      if (parsed?.kind === AGREE_PRINT_TOOLBOX_DND && parsed.tid) {
        return parsed.tid;
      }
    } catch {
      // 非积木拖拽
    }
  }
  const session = getAgreePrintHtml5Drag();
  if (session?.kind === AGREE_PRINT_TOOLBOX_DND) return session.tid;
  return null;
}

/** 点击放置：跟在现有元素下面 */
function nextToolboxPlacePos() {
  const list = listPrintElements(currentTemplateJson.value);
  let top = 24;
  for (const item of list) {
    const bottom =
      Number(item.options.top || 0) + Number(item.options.height || 16);
    if (bottom > top) top = bottom;
  }
  return { left: 20, top: Math.round(top + 12) };
}

/**
 * 把积木写进模板并刷新画布
 * @param tid provider tid
 * @param pos 落点
 */
async function placeToolboxElement(
  tid: string,
  pos: { left: number; top: number },
) {
  const json = readCanvasJson() || currentTemplateJson.value;
  if (!json?.panels?.length) {
    ElMessage.warning('画布未就绪');
    return;
  }
  const node = buildToolboxPrintElement(tid, pos.left, pos.top);
  const next = insertPrintElement(json, 0, -1, node);
  await waitMouseIdle();
  await onCanvasPatch(next);
  const created = listPrintElements(currentTemplateJson.value).at(-1);
  if (created) selectedElementKey.value = created.key;
  const label = tid.split('.').pop() || '元素';
  ElMessage.success(`已放置「${label}」`);
}

/** 初始化设计器 */
async function setupDesigner() {
  designing.value = true;
  try {
    history = [];
    historyIndex = -1;
    const tpl = await fetchTemplateJson();
    await mountDesigner(tpl);
    resetHistory(currentTemplateJson.value);
  } catch (error: any) {
    console.error(error);
    ElMessage.error(error?.message || '设计器初始化失败');
  } finally {
    designing.value = false;
  }
}

/** 保存：有父级托管时抛出 JSON，否则自行写入 */
async function onSave() {
  if (!templateInst) return;
  try {
    const json = readCanvasJson();
    if (!json?.panels) {
      ElMessage.warning('未能获取模板 JSON');
      return;
    }
    currentTemplateJson.value = json;
    if (props.delegateSave) {
      emit('saveRequested', json);
      return;
    }
    if (props.templateId) {
      await updatePrintTemplate(props.templateId, { templateJson: json });
      customSaved.value = false;
      ElMessage.success('模板已保存到服务端');
      return;
    }
    const { saveAgreePrintTemplate } = await import('./template-store');
    saveAgreePrintTemplate(json);
    customSaved.value = false;
    ElMessage.success('模板已保存（本地）');
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败');
  }
}

/** 父页保存成功后去掉未保存标记 */
function markClean() {
  customSaved.value = false;
}

defineExpose({
  getTemplateJson: () => readCanvasJson() || currentTemplateJson.value,
  markClean,
});

/** 恢复默认版式 */
async function onReset() {
  try {
    await ElMessageBox.confirm(
      '将重新加载默认版式到画布，并恢复内置样例数据（需点保存才会写入服务端），是否继续？',
      '恢复默认',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  customSaved.value = false;
  history = [];
  samplePrintData.value = buildDesignerSamplePrintData();
  await mountDesigner(cloneTemplate(agreePrintTemplate));
  resetHistory(currentTemplateJson.value);
  ElMessage.success('已加载默认版式和样例数据');
}

/** 打开水印对话框前同步画布 JSON */
function openWatermarkDialog() {
  const j = readCanvasJson();
  if (j) currentTemplateJson.value = j;
  if (!currentTemplateJson.value?.panels?.length) {
    ElMessage.warning('设计器尚未就绪，请稍后再试');
    return;
  }
  watermarkOpen.value = true;
}

/**
 * 水印写回后重挂，画布与预览共用同一份 watermarkOptions
 * @param json 带水印的模板
 */
async function onWatermarkApply(json: Record<string, any>) {
  await onCanvasPatch(json, { remount: true });
  ElMessage.success('水印已应用到画布，请用「快速预览」确认打印效果');
}

/** 打开数据源 JSON 编辑器 */
function openDataJsonEditor() {
  dataJsonOpen.value = true;
}

/**
 * 用粘贴的业务 JSON 替换设计器样例，快速预览 / 筛行行数跟着变
 * @param data 解析后的 printData
 */
function onDataJsonApply(data: AgreePrintData) {
  samplePrintData.value = data;
  void refreshCanvasTableBodiesSoon();
  ElMessage.success('已应用数据源 JSON，画布表体与快速预览会用这份数据');
}

/** 打开 JSON 编辑器 */
function openJsonEditor() {
  const j = readCanvasJson() || currentTemplateJson.value;
  jsonText.value = JSON.stringify(j, null, 2);
  jsonOpen.value = true;
}

/** 从 JSON 编辑器应用模板 */
async function applyJsonEditor() {
  try {
    const parsed = JSON.parse(jsonText.value);
    if (!parsed?.panels?.length) {
      ElMessage.warning('JSON 缺少 panels');
      return;
    }
    jsonOpen.value = false;
    customSaved.value = true;
    designing.value = true;
    await mountDesigner(parsed);
    pushHistory(currentTemplateJson.value);
    ElMessage.success('已从 JSON 刷新画布');
  } catch {
    ElMessage.error('JSON 格式不正确');
  } finally {
    designing.value = false;
  }
}

/** 样例数据快速预览 */
async function onPreview() {
  if (!templateInst) return;
  try {
    const { PrintTemplate } = await ensureHiprint();
    const json = readCanvasJson() || currentTemplateJson.value;
    const data = samplePrintData.value;
    const { template: preparedTpl, printData: enriched } = preparePrintTemplate(
      json || cloneTemplate(agreePrintTemplate),
      data,
    );
    const previewTpl = new PrintTemplate({ template: preparedTpl });
    previewOpen.value = true;
    await nextTick();
    const host = previewHtmlHost.value;
    if (!host) return;
    host.innerHTML = '';
    const $html = previewTpl.getHtml(enriched);
    if ($html?.appendTo) $html.appendTo(host);
  } catch (error: any) {
    ElMessage.error(error?.message || '预览失败');
  }
}

/**
 * 调整缩放百分比
 * @param delta 增减值
 */
function nudgeZoom(delta: number) {
  zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom.value + delta));
}

function resetZoom() {
  zoom.value = 100;
}

/**
 * 复制当前元素（右下偏移）
 */
async function duplicateSelected() {
  ctxMenu.value.open = false;
  const json = readCanvasJson() || currentTemplateJson.value;
  const el = listPrintElements(json).find(
    (e) => e.key === selectedElementKey.value,
  );
  if (!el) {
    ElMessage.warning('请先点选画布上的元素');
    return;
  }
  try {
    const next = duplicatePrintElement(json, el);
    const copied = listPrintElements(next)[el.elementIndex + 1];
    if (copied) selectedElementKey.value = copied.key;
    await onCanvasPatch(next);
    ElMessage.success('已复制一份');
  } catch (error: any) {
    ElMessage.error(error?.message || '复制失败');
  }
}

/** 删除当前元素 */
async function deleteSelected() {
  ctxMenu.value.open = false;
  const json = readCanvasJson() || currentTemplateJson.value;
  const el = listPrintElements(json).find(
    (e) => e.key === selectedElementKey.value,
  );
  if (!el) {
    ElMessage.warning('请先点选画布上的元素');
    return;
  }
  try {
    const next = removePrintElement(json, el);
    selectedElementKey.value = '';
    await onCanvasPatch(next);
  } catch (error: any) {
    ElMessage.error(error?.message || '删除失败');
  }
}

/** 撤销 */
async function undo() {
  if (historyIndex <= 0) return;
  applyingHistory = true;
  historyIndex -= 1;
  refreshHistoryFlags();
  customSaved.value = true;
  designing.value = true;
  try {
    const snap = history[historyIndex];
    if (!snap) return;
    await mountDesigner(snap, { rebuildToolbox: false });
  } finally {
    designing.value = false;
    applyingHistory = false;
  }
}

/** 重做 */
async function redo() {
  if (historyIndex >= history.length - 1) return;
  applyingHistory = true;
  historyIndex += 1;
  refreshHistoryFlags();
  customSaved.value = true;
  designing.value = true;
  try {
    const snap = history[historyIndex];
    if (!snap) return;
    await mountDesigner(snap, { rebuildToolbox: false });
  } finally {
    designing.value = false;
    applyingHistory = false;
  }
}

/**
 * 快捷键：Ctrl+S 保存，Ctrl+Z 撤销，Ctrl+Y 重做，Ctrl+D 复制，Delete 删除
 * @param e 键盘事件
 */
function onDesignerKeydown(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  const typing = !!t?.closest('input, textarea, [contenteditable="true"]');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void onSave();
    return;
  }
  if (typing) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    void duplicateSelected();
    return;
  }
  if (e.key === 'Delete') {
    e.preventDefault();
    void deleteSelected();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    void undo();
    return;
  }
  if (
    (e.ctrlKey || e.metaKey) &&
    (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
  ) {
    e.preventDefault();
    void redo();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onDesignerKeydown);
  window.addEventListener('click', closeCtxMenu);
  void setupDesigner();
});

watch(
  () => props.templateId,
  () => {
    void setupDesigner();
  },
);

watch(samplePrintData, () => {
  void refreshCanvasTableBodiesSoon();
});

/** 换选元素时清掉不属于当前表的列高亮，并刷新表外圈 */
watch(selectedElementKey, () => {
  if (remounting) return;
  const table = selectedTableRef();
  const hl = highlightCol.value;
  if (
    hl &&
    table &&
    hl.panelIndex === table.panelIndex &&
    hl.elementIndex === table.elementIndex
  ) {
    refreshCanvasTableBodies();
    return;
  }
  if (hl) highlightCol.value = null;
  refreshCanvasTableBodies();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onDesignerKeydown);
  window.removeEventListener('click', closeCtxMenu);
  unbindCanvasEvents();
  if (syncTimer) clearTimeout(syncTimer);
  try {
    templateInst?.clear?.();
  } catch {
    // ignore
  }
  templateInst = null;
  if ($ref) {
    $ref('.agree-print-ep').empty();
    $ref('#agree-print-design-canvas').empty();
    $ref('#PrintElementOptionSetting').empty();
  }
});
</script>

<template>
  <div class="agree-print-designer" v-loading="designing">
    <div class="agree-print-designer__toolbar">
      <div class="agree-print-designer__toolbar-left">
        <ElButtonGroup>
          <ElButton size="small" :disabled="!canUndo" @click="undo">
            撤销
          </ElButton>
          <ElButton size="small" :disabled="!canRedo" @click="redo">
            重做
          </ElButton>
        </ElButtonGroup>
        <ElButtonGroup>
          <ElButton size="small" @click="duplicateSelected">复制</ElButton>
          <ElButton size="small" @click="deleteSelected">删除</ElButton>
        </ElButtonGroup>
        <ElButtonGroup>
          <ElButton size="small" @click="nudgeZoom(-10)">-</ElButton>
          <ElButton size="small" @click="resetZoom">{{ zoom }}%</ElButton>
          <ElButton size="small" @click="nudgeZoom(10)">+</ElButton>
        </ElButtonGroup>
        <span class="agree-print-designer__hint">
          点表头选整表；点表体列选列，双击开/关相同值合并；表尾格可 Shift
          扩选后点「合并表尾」
          <code v-if="templateCode">{{ templateCode }}</code>
          <span v-if="customSaved" class="text-amber-600">（未保存）</span>
        </span>
      </div>
      <div class="flex flex-wrap gap-2">
        <ElButton size="small" @click="mergeSelectedFooterCells">
          合并表尾
        </ElButton>
        <ElButton size="small" @click="splitSelectedFooterCell">
          拆分表尾
        </ElButton>
        <ElButton size="small" @click="onPreview">快速预览</ElButton>
        <ElButton size="small" @click="openWatermarkDialog">水印</ElButton>
        <ElButton size="small" @click="openJsonEditor">编辑 JSON</ElButton>
        <ElButton size="small" @click="openDataJsonEditor">
          数据源 JSON
        </ElButton>
        <ElButton size="small" @click="onReset">恢复默认</ElButton>
        <ElButton size="small" type="primary" @click="onSave">
          {{ delegateSave ? '保存' : '保存模板' }}
        </ElButton>
      </div>
    </div>

    <div class="agree-print-designer__main">
      <aside class="agree-print-designer__left">
        <div class="agree-print-designer__side-title">元素</div>
        <div class="agree-print-designer__ep-hint">
          拖到纸面；表格也可点一下放置。画布上用表头左上角橙色点拖动表格
        </div>
        <div class="agree-print-ep"></div>
        <PrintDataPanel
          class="print-data-panel-host"
          :data="samplePrintData"
          @pick="onDictionaryPick"
        />
      </aside>

      <div
        class="agree-print-designer__center"
        :class="{ 'is-drop-target': canvasDropActive }"
        @dragover="onCanvasDragOver"
        @dragleave="onCanvasDragLeave"
        @drop="onCanvasDrop"
      >
        <div
          id="agree-print-design-canvas"
          class="agree-print-canvas"
          :style="{ transform: `scale(${zoom / 100})` }"
        ></div>
      </div>

      <aside class="agree-print-designer__right">
        <PrintInspector
          ref="inspectorRef"
          v-model:selected-key="selectedElementKey"
          :template-json="currentTemplateJson"
          :sample-data="samplePrintData"
          :highlight-col-index="inspectorHighlightColIndex"
          @canvas-patch="onCanvasPatch"
          @highlight-col="onInspectorHighlightCol"
        />
        <div class="agree-print-designer__side-title">样式（位置 / 字体）</div>
        <div id="PrintElementOptionSetting"></div>
      </aside>
    </div>

    <PrintWatermarkDialog
      v-model="watermarkOpen"
      :template-json="currentTemplateJson"
      @apply="onWatermarkApply"
    />

    <ElDialog
      v-model="previewOpen"
      title="设计稿预览（含规则 / 过滤 / 二维码）"
      width="920px"
      top="4vh"
      append-to-body
      destroy-on-close
    >
      <div class="agree-print-quick-preview">
        <div
          ref="previewHtmlHost"
          :style="{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top left',
          }"
        ></div>
      </div>
    </ElDialog>

    <ElDialog
      v-model="jsonOpen"
      title="模板 JSON"
      width="720px"
      top="6vh"
      append-to-body
      destroy-on-close
    >
      <ElInput
        v-model="jsonText"
        type="textarea"
        :rows="22"
        class="font-mono text-xs"
      />
      <template #footer>
        <ElButton @click="jsonOpen = false">取消</ElButton>
        <ElButton type="primary" @click="applyJsonEditor">应用到画布</ElButton>
      </template>
    </ElDialog>

    <PrintDataJsonDialog
      v-model="dataJsonOpen"
      :initial-data="samplePrintData"
      @apply="onDataJsonApply"
    />

    <div
      v-if="ctxMenu.open"
      class="agree-print-ctx"
      :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
      @click.stop
      @contextmenu.prevent
    >
      <button type="button" @click="duplicateSelected">复制</button>
      <button type="button" @click="deleteSelected">删除</button>
    </div>
  </div>
</template>

<style scoped>
.agree-print-designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.agree-print-designer__toolbar {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid #e5e7eb;
}

.agree-print-designer__toolbar-left {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.agree-print-designer__hint {
  font-size: 12px;
  color: #6b7280;
}

.agree-print-designer__hint code {
  margin-left: 4px;
}

.agree-print-designer__main {
  display: grid;
  flex: 1;
  grid-template-columns: 280px 1fr 320px;
  min-height: 0;
}

.agree-print-designer__left,
.agree-print-designer__right {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  overflow: auto;
  background: #fafafa;
  border-right: 1px solid #e5e7eb;
}

.agree-print-designer__left {
  overflow: hidden;
}

.agree-print-designer__right {
  border-right: none;
  border-left: 1px solid #e5e7eb;
}

.agree-print-designer__side-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.agree-print-designer__center {
  padding: 20px 24px 28px;
  overflow: auto;
  background:
    radial-gradient(
        circle at 1px 1px,
        rgb(100 116 139 / 28%) 1px,
        transparent 0
      )
      0 0 / 18px 18px,
    #c5ccd4;
}

.agree-print-designer__center.is-drop-target {
  outline: 2px dashed #3b82f6;
  outline-offset: -8px;
  background:
    radial-gradient(circle at 1px 1px, rgb(59 130 246 / 35%) 1px, transparent 0)
      0 0 / 18px 18px,
    #dbeafe;
}

.agree-print-canvas {
  min-height: 520px;
  transform-origin: top left;
}

.agree-print-canvas :deep(.hiprint-printPaper) {
  background: #fff;
  box-shadow:
    0 1px 2px rgb(15 23 42 / 6%),
    0 14px 36px rgb(15 23 42 / 14%);
}

.agree-print-canvas :deep(.agree-print-design-body-overlay) {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 2;
  box-sizing: border-box;
  overflow: hidden auto;
  pointer-events: none;

  /* 隐藏滚动条，避免占宽导致表体列和多行表头错位 */
  scrollbar-width: none;
  background: repeating-linear-gradient(
    -45deg,
    rgb(248 250 252 / 88%),
    rgb(248 250 252 / 88%) 6px,
    rgb(241 245 249 / 88%) 6px,
    rgb(241 245 249 / 88%) 12px
  );
}

.agree-print-canvas :deep(.agree-print-design-body-overlay::-webkit-scrollbar) {
  width: 0;
  height: 0;
}

.agree-print-canvas :deep(.agree-print-design-body-overlay.is-table-active) {
  box-shadow: inset 0 0 0 2px #60a5fa;
}

.agree-print-canvas :deep(.agree-print-design-grid) {
  width: 100%;
}

.agree-print-canvas :deep(.agree-print-design-body),
.agree-print-canvas :deep(.agree-print-design-foot-row) {
  display: grid;
  width: 100%;
  border-top: 1px solid #000;
  border-left: 1px solid #000;
}

.agree-print-canvas :deep(.agree-print-design-body) {
  grid-auto-rows: 16pt;
}

.agree-print-canvas :deep(.agree-print-design-cell) {
  box-sizing: border-box;
  min-height: 16pt;
  padding: 0 4pt;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 9pt;
  font-weight: 400;
  line-height: 16pt;
  color: #111;
  white-space: nowrap;
  pointer-events: auto;
  cursor: pointer;
  background: #fff;
  border: 0;
  border-right: 1px solid #000;
  border-bottom: 1px solid #000;
}

.agree-print-canvas :deep(.agree-print-design-cell.is-col-selected) {
  background: #eff6ff;
  box-shadow: inset 0 0 0 1.5px #3b82f6;
}

.agree-print-canvas :deep(.agree-print-design-cell.is-merge-col) {
  display: flex;
  align-items: center;
  background: #f8fafc;
}

.agree-print-canvas :deep(.agree-print-design-cell.is-footer-selected) {
  background: #fef3c7;
}

.agree-print-canvas :deep(.agree-print-design-cell.is-footer) {
  background: #f8fafc;
}

.agree-print-canvas :deep(.agree-print-design-cell.is-placeholder) {
  color: transparent;
  pointer-events: none;
  cursor: default;
  background: transparent;
  border-color: #d1d5db;
  border-right-style: dashed;
  border-bottom-style: dashed;
}

.agree-print-canvas :deep(.agree-print-design-cell.is-empty) {
  color: #9ca3af;
  cursor: default;
}

/** 引擎表体藏在覆盖层下，避免重影；保留 DOM 给 hiprint 读 columns */
.agree-print-canvas :deep(.hiprint-printElement-tableTarget > tbody),
.agree-print-canvas :deep(.hiprint-printElement-tableTarget > tfoot) {
  visibility: hidden;
}

/** 表头左上角拖动手柄：盖住表体覆盖层，缩小以免挡住「序号」 */
.agree-print-canvas :deep(.design .hiprint-printElement-table-handle) {
  z-index: 6;
  width: 10px;
  height: 10px;
  cursor: move;
  background: #f97316;
}

.agree-print-quick-preview {
  max-height: 70vh;
  padding: 12px;
  overflow: auto;
  background: #f0f2f5;
}

.agree-print-quick-preview :deep(.hiprint-printPaper) {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  background: #fff;
  box-shadow: 0 1px 6px rgb(0 0 0 / 12%);
}

.agree-print-designer__ep-hint {
  margin: -4px 0 6px;
  font-size: 11px;
  line-height: 1.4;
  color: #6b7280;
}

.agree-print-ep {
  flex-shrink: 0;
  margin-bottom: 8px;
}

.print-data-panel-host {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.agree-print-ep :deep(.hiprint-printElement-type) {
  padding: 0;
  margin: 0;
}

.agree-print-ep :deep(.hiprint-printElement-type > li > .title) {
  display: none;
}

.agree-print-ep :deep(.hiprint-printElement-type ul),
.agree-print-ep :deep(ul) {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.agree-print-ep :deep(li) {
  padding: 0 !important;
  margin: 0 !important;
  list-style: none;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.agree-print-ep :deep(.ep-draggable-item) {
  display: inline-block;
  padding: 4px 8px !important;
  font-size: 12px;
  line-height: 1.4;
  color: #374151;
  cursor: move;
  background: #fff !important;
  border: 1px solid #d1d5db !important;
  border-radius: 4px !important;
  box-shadow: none !important;
}

.agree-print-ep :deep(.ep-draggable-item:hover) {
  color: #1d4ed8;
  background: #eff6ff !important;
  border-color: #93c5fd !important;
}

.agree-print-ctx {
  position: fixed;
  z-index: 4000;
  min-width: 120px;
  padding: 4px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
}

.agree-print-ctx button {
  display: block;
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 4px;
}

.agree-print-ctx button:hover {
  background: #f3f4f6;
}
</style>

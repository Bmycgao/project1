<script lang="ts" setup>
/**
 * 协议打印设计器（重构版）
 * - 自绘多页纵向连续画布，越界自动翻页
 * - 复用既有纯逻辑：字段面板 / 检视器 / 预览打印管线 / 元素构造 / 纸张换算
 * - 对外契约与旧设计器一致：props(templateId, delegateSave)、expose(getTemplateJson, markClean)、emit(saveRequested)
 */
import type { AgreePrintFieldItem } from '../fields';
import type { AgreePrintData } from '../types';
import type {
  CanvasFieldDropPayload,
  CanvasToolboxDropPayload,
} from './template-model';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import {
  ElAlert,
  ElButton,
  ElButtonGroup,
  ElDialog,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
} from 'element-plus';

import { getPrintTemplate, updatePrintTemplate } from '#/api';

import { agreePrintTemplate } from '../agreement-template';
import { ensureHiprint } from '../ensure-hiprint';
import { preparePrintTemplate } from '../prepare-template';
import PrintDataJsonDialog from '../print-data-json-dialog.vue';
import PrintDataPanel from '../print-data-panel.vue';
import {
  AGREE_PRINT_TOOLBOX_DND,
  buildBoundPrintElement,
  buildToolboxPrintElement,
  duplicatePrintElement,
  findPrintElementByCanvasKey,
  insertPrintElement,
  listLeafTableCells,
  listPrintElements,
  patchElementOptions,
  removePrintElement,
  sanitizePrintTemplate,
  setAgreePrintHtml5Drag,
} from '../print-element-meta';
import { validatePrintExpr } from '../print-expr';
import PrintInspector from '../print-inspector.vue';
import {
  applyPrintPageSizeFromTemplate,
  fitPrintPreviewHost,
  normalizePrintPreviewPages,
} from '../print-page-css';
import {
  applyPaperToTemplate,
  describePrintPaper,
  insertBlankPanelAfter,
  mmToCssPx,
  previewDialogWidthCss,
  PRINT_PAPER_PRESETS,
  readTemplatePaperSpec,
  removePrintPanel,
  splitPanelAtY,
} from '../print-paper';
import {
  normalizeAgreeBodyCellExprs,
  normalizeAgreeBodyCellMerges,
  normalizeAgreeBodyHMerges,
  removeAgreeBodyCellMergeAt,
  removeAgreeBodyHMerge,
  upsertAgreeBodyCellExpr,
  upsertAgreeBodyCellMerge,
} from '../print-table-runtime';
import { isWatermarkEnabled } from '../print-watermark';
import PrintWatermarkDialog from '../print-watermark-dialog.vue';
import { buildDesignerSamplePrintData } from '../sample-print-data';
import {
  cloneTemplate,
  loadAgreePrintTemplate,
  saveAgreePrintTemplate,
} from '../template-store';
import CanvasStage from './canvas-stage.vue';
import {
  autoPaginate,
  fitElementIntoPaper,
  fitTemplateIntoPaper,
  PAGE_MARGIN_PT,
} from './template-model';

const props = defineProps<{
  /** 委托父页保存（编辑页用） */
  delegateSave?: boolean;
  /** 服务端模板记录 id */
  templateId?: string;
}>();

const emit = defineEmits<{
  /** 委托保存时把 JSON 抛给父页 */
  saveRequested: [json: Record<string, any>];
}>();

/** 选中元素时用于临时定位的标记键 */
const SEL_MARK = '__agreeSel';

/** 左侧可添加的积木 */
const TOOLBOX = [
  { tid: 'staticTitle', label: '标题' },
  { tid: 'dynamicText', label: '文本' },
  { tid: 'longText', label: '长文本' },
  { tid: 'table', label: '表格' },
  { tid: 'qrcode', label: '二维码' },
  { tid: 'barcode', label: '条形码' },
  { tid: 'hline', label: '横线' },
  { tid: 'vline', label: '竖线' },
  { tid: 'rect', label: '矩形' },
  { tid: 'pageBreak', label: '页面隔断' },
];

const templateJson = ref<null | Record<string, any>>(null);
const sampleData = ref<AgreePrintData>(buildDesignerSamplePrintData());
const zoom = ref(100);
const zoomMode = ref<'fit' | 'manual'>('fit');
const loading = ref(false);
const dirty = ref(false);

/** 选中：以「面板下标 / 元素下标」为稳定标识 */
const selPanel = ref(-1);
const selElement = ref(-1);
/** 当前操作页；未选元素时新增/删除以它为准 */
const currentPanel = ref(0);

const stageRef = ref<HTMLElement | null>(null);
const canvasRef = ref<null | { scrollToPanel: (panelIndex: number) => void }>(
  null,
);
const inspectorRef = ref<null | {
  focusColumn: (colIndex: number) => void;
  focusFooterCell: (rowIndex: number, cellIndex: number) => void;
}>(null);
const highlightColIndex = ref(-1);
const highlightTableKey = ref('');
const bodyCellSelection = ref<null | {
  endCol: number;
  endRow: number;
  key: string;
  rawEndRow: Record<string, unknown>;
  rawStartRow: Record<string, unknown>;
  startCol: number;
  startRow: number;
}>(null);
const previewOpen = ref(false);
const previewHost = ref<HTMLElement | null>(null);
const templateCode = ref('PrintAgreement');

/** 水印 / 模板 JSON / 数据源 JSON 弹窗 */
const watermarkOpen = ref(false);
const jsonOpen = ref(false);
const dataJsonOpen = ref(false);
/** 表体单格公式弹窗；逐行列公式仍放在表格结构弹窗中编辑 */
const bodyFormulaOpen = ref(false);
const bodyFormulaExpr = ref('');
/** 当前单格公式对应字段，用于生成不写死业务字段的快捷表达式 */
const bodyFormulaField = ref('');
/** 模板 JSON 编辑器文本 */
const jsonText = ref('');

/** 撤销 / 重做 */
const HISTORY_MAX = 40;
let history: Record<string, any>[] = [];
let historyIndex = -1;
let applyingHistory = false;
/** 上一帧历史指纹，用于跳过重复快照（避免整模板 JSON.stringify） */
let lastHistoryFp = '';
const canUndo = ref(false);
const canRedo = ref(false);

/** 左右侧栏折叠，扩大画布 */
const leftCollapsed = ref(false);
const rightCollapsed = ref(false);

/** 画布右键菜单 */
const ctxMenu = ref({ open: false, x: 0, y: 0 });

const ZOOM_MIN = 25;
const ZOOM_MAX = 200;

/** 当前纸张规格 */
const paperSpec = computed(() => readTemplatePaperSpec(templateJson.value));

/** 纸张说明文案 */
const paperDesc = computed(() => describePrintPaper(paperSpec.value));

/** 画布用选中键：面板:元素 */
const canvasSelectedKey = computed(() =>
  selPanel.value >= 0 ? `${selPanel.value}:${selElement.value}` : '',
);

/** 当前元素信息同时供右侧检视器和左侧数据源说明交互状态。 */
const selectedElement = computed(() => {
  if (selPanel.value < 0) return null;
  return (
    listPrintElements(templateJson.value).find(
      (element) =>
        element.panelIndex === selPanel.value &&
        element.elementIndex === selElement.value,
    ) || null
  );
});

/** 检视器用选中键：与 listPrintElements 的 key 对齐 */
const inspectorKey = computed(() => selectedElement.value?.key || '');

/** 页数 */
const pageCount = computed(() => templateJson.value?.panels?.length || 0);

/** 当前模板是否已启用水印（工具栏提示） */
const watermarkOn = computed(() =>
  isWatermarkEnabled(templateJson.value?.panels?.[0]?.watermarkOptions),
);

/** 越界元素数量（红框提示统计） */
const overflowCount = computed(() => {
  const panels = templateJson.value?.panels || [];
  let n = 0;
  panels.forEach((panel: Record<string, any>) => {
    const heightMm = Number(panel.height) || 297;
    const widthMm = Number(panel.width) || 210;
    (panel.printElements || []).forEach((el: Record<string, any>) => {
      const o = el.options || {};
      const right = (Number(o.left) || 0) + (Number(o.width) || 0);
      const bottom = (Number(o.top) || 0) + (Number(o.height) || 0);
      if (
        right > (widthMm * 72) / 25.4 + 1 ||
        bottom > (heightMm * 72) / 25.4 + 1
      )
        n += 1;
    });
  });
  return n;
});

// ---------------- 加载 ----------------

/** 拉取模板 JSON（有 templateId 走服务端，否则本地） */
async function fetchTemplateJson(): Promise<Record<string, any>> {
  if (props.templateId) {
    const row = await getPrintTemplate(props.templateId);
    templateCode.value = row.templateCode || 'PrintAgreement';
    if (row.templateJson?.panels?.length) {
      return cloneTemplate(row.templateJson);
    }
    return cloneTemplate(agreePrintTemplate);
  }
  return loadAgreePrintTemplate();
}

/** 载入模板：横向历史模板归一为竖向 */
async function loadTemplate() {
  loading.value = true;
  try {
    let tpl = sanitizePrintTemplate(await fetchTemplateJson());
    const spec = readTemplatePaperSpec(tpl);
    if (spec.orientation === 'landscape') {
      tpl = applyPaperToTemplate(tpl, {
        sizeId: spec.sizeId,
        orientation: 'portrait',
        customWidthMm: spec.customWidthMm || spec.heightMm,
        customHeightMm: spec.customHeightMm || spec.widthMm,
      }).template;
    }
    templateJson.value = tpl;
    currentPanel.value = 0;
    clearSelection();
    dirty.value = false;
    resetHistory(tpl);
    fitToWidth();
  } catch (error: any) {
    ElMessage.error(error?.message || '加载模板失败');
  } finally {
    loading.value = false;
  }
}

// ---------------- 选中互转 ----------------

/** 清空选中 */
function clearSelection() {
  selPanel.value = -1;
  selElement.value = -1;
  bodyCellSelection.value = null;
  highlightColIndex.value = -1;
  highlightTableKey.value = '';
}

/** 画布选中回调（key 形如 "面板:元素"） */
function onCanvasSelect(key: string) {
  if (!key) {
    clearSelection();
    return;
  }
  const [p, e] = key.split(':');
  if (bodyCellSelection.value?.key !== key) {
    bodyCellSelection.value = null;
    highlightColIndex.value = -1;
    highlightTableKey.value = '';
  }
  selPanel.value = Number(p);
  selElement.value = Number(e);
  currentPanel.value = Number(p);
}

function onHighlightColumn(colIndex: number) {
  highlightColIndex.value = colIndex;
  highlightTableKey.value = canvasSelectedKey.value;
}

function onTableBodyCellSelect(payload: {
  colIndex: number;
  key: string;
  rawRow: Record<string, unknown>;
  rowIndex: number;
  shiftKey: boolean;
}) {
  onCanvasSelect(payload.key);
  // 表体格选择与“整列编辑”是两种语义：点格只高亮格/矩形，不联动整列。
  highlightColIndex.value = -1;
  highlightTableKey.value = '';
  const current = bodyCellSelection.value;
  if (payload.shiftKey && current?.key === payload.key) {
    bodyCellSelection.value = {
      ...current,
      endCol: payload.colIndex,
      endRow: payload.rowIndex,
      rawEndRow: payload.rawRow,
    };
    return;
  }
  bodyCellSelection.value = {
    endCol: payload.colIndex,
    endRow: payload.rowIndex,
    key: payload.key,
    rawEndRow: payload.rawRow,
    rawStartRow: payload.rawRow,
    startCol: payload.colIndex,
    startRow: payload.rowIndex,
  };
}

function selectedBodyContext() {
  const selection = bodyCellSelection.value;
  const template = templateJson.value;
  if (!selection || !template || selection.startRow < 0) return null;
  const el = findPrintElementByCanvasKey(template, selection.key, 'table');
  if (!el) return null;
  const leaves = listLeafTableCells(el.options.columns);
  return { el, leaves, selection, template };
}

function mergeSelectedBodyCells() {
  const ctx = selectedBodyContext();
  if (!ctx) {
    ElMessage.warning('请在同一表格的表体中拖选，或点起点后按住 Shift 点终点');
    return;
  }
  const startCol = Math.min(ctx.selection.startCol, ctx.selection.endCol);
  const endCol = Math.max(ctx.selection.startCol, ctx.selection.endCol);
  const startRow = Math.min(ctx.selection.startRow, ctx.selection.endRow);
  const endRow = Math.max(ctx.selection.startRow, ctx.selection.endRow);
  if (startCol === endCol && startRow === endRow) {
    ElMessage.warning('请拖选两个以上单元格，或按住 Shift 点选范围终点');
    return;
  }
  const rules = upsertAgreeBodyCellMerge(
    normalizeAgreeBodyCellMerges(
      ctx.el.options.agreeBodyCellMerges,
      ctx.leaves.length,
    ),
    {
      colspan: endCol - startCol + 1,
      rowspan: endRow - startRow + 1,
      startCol,
      startRow,
    },
    ctx.selection.startRow <= ctx.selection.endRow
      ? ctx.selection.rawStartRow
      : ctx.selection.rawEndRow,
    ctx.leaves.length,
  );
  let horizontalRules = normalizeAgreeBodyHMerges(
    ctx.el.options.agreeBodyHMerges,
    ctx.leaves.length,
  );
  for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
    horizontalRules = removeAgreeBodyHMerge(
      horizontalRules,
      rowIndex,
      {},
      ctx.leaves.length,
    );
  }
  commit(
    patchElementOptions(ctx.template, ctx.el, {
      agreeBodyCellMerges: rules,
      agreeBodyHMerges: horizontalRules.length > 0 ? horizontalRules : null,
    }),
    { paginate: false },
  );
}

function splitSelectedBodyCell() {
  const ctx = selectedBodyContext();
  if (!ctx) {
    ElMessage.warning('请先点一个已合并的表体格');
    return;
  }
  const rowIndex = Math.min(ctx.selection.startRow, ctx.selection.endRow);
  const colIndex = Math.min(ctx.selection.startCol, ctx.selection.endCol);
  const cellRules = removeAgreeBodyCellMergeAt(
    normalizeAgreeBodyCellMerges(
      ctx.el.options.agreeBodyCellMerges,
      ctx.leaves.length,
    ),
    rowIndex,
    colIndex,
    ctx.leaves.length,
  );
  const horizontalRules = removeAgreeBodyHMerge(
    normalizeAgreeBodyHMerges(
      ctx.el.options.agreeBodyHMerges,
      ctx.leaves.length,
    ),
    rowIndex,
    ctx.selection.rawStartRow,
    ctx.leaves.length,
  );
  commit(
    patchElementOptions(ctx.template, ctx.el, {
      agreeBodyCellMerges: cellRules.length > 0 ? cellRules : null,
      agreeBodyHMerges: horizontalRules.length > 0 ? horizontalRules : null,
    }),
    { paginate: false },
  );
}

/** 取当前单个表体格；范围选择用于合并，不作为单格计算目标。 */
function selectedBodyFormulaContext() {
  const ctx = selectedBodyContext();
  if (!ctx) return null;
  const { selection } = ctx;
  if (
    selection.startRow !== selection.endRow ||
    selection.startCol !== selection.endCol
  ) {
    return null;
  }
  const leaf = ctx.leaves[selection.startCol];
  if (!leaf?.field) return null;
  return { ...ctx, leaf };
}

/** 单格公式即时校验；与最终保存使用完全相同的样例行上下文。 */
const bodyFormulaValidation = computed(() => {
  const expr = bodyFormulaExpr.value.trim();
  if (!expr) return null;
  const ctx = selectedBodyFormulaContext();
  if (!ctx) return { message: '当前单元格已失去选中状态', ok: false };
  return validatePrintExpr(expr, {
    ...(sampleData.value as unknown as Record<string, unknown>),
    ...ctx.selection.rawStartRow,
    i: ctx.selection.startRow,
    index: ctx.selection.startRow,
    row: ctx.selection.rawStartRow,
  });
});

/** 依据当前字段生成快捷公式，避免示例中的 quantity 等字段误写到别的列。 */
function setBodyFormulaPreset(mode: 'empty-slash' | 'empty-zero-slash') {
  const field = bodyFormulaField.value;
  if (!/^[A-Za-z_$][\w$]*$/.test(field)) {
    ElMessage.warning('当前字段名无法直接用于计算表达式');
    return;
  }
  bodyFormulaExpr.value =
    mode === 'empty-slash'
      ? `IF(EMPTY(${field}), "/", ${field})`
      : `IF(EMPTY(${field}) || NUMBER(${field}, 0) == 0, "/", ${field})`;
}

function ruleMatchesSelectedRow(
  rule: { rowIndex: number; when?: Record<string, string> },
  rowIndex: number,
  row: Record<string, unknown>,
) {
  const when = rule.when || {};
  const keys = Object.keys(when);
  return (
    (keys.length > 0 &&
      keys.every((key) => String(row[key] ?? '').trim() === when[key])) ||
    rule.rowIndex === rowIndex
  );
}

/** 打开当前表体格的公式；列公式继续在「表格结构与计算」中维护。 */
function openBodyCellFormula() {
  const ctx = selectedBodyFormulaContext();
  if (!ctx) {
    ElMessage.warning('单格计算请先只点选一个表体单元格');
    return;
  }
  const rules = normalizeAgreeBodyCellExprs(
    ctx.el.options.agreeBodyCellExprs,
    ctx.leaves.map((leaf) => leaf.field),
  );
  const hit = rules.find(
    (rule) =>
      rule.field === ctx.leaf.field &&
      ruleMatchesSelectedRow(
        rule,
        ctx.selection.startRow,
        ctx.selection.rawStartRow,
      ),
  );
  bodyFormulaField.value = ctx.leaf.field;
  bodyFormulaExpr.value = hit?.expr || '';
  bodyFormulaOpen.value = true;
}

/** 写入或清除当前表体格的计算覆盖。 */
function applyBodyCellFormula() {
  const ctx = selectedBodyFormulaContext();
  if (!ctx) {
    ElMessage.warning('请重新点选一个表体单元格');
    return;
  }
  const expr = bodyFormulaExpr.value.trim();
  const leafFields = ctx.leaves.map((leaf) => leaf.field);
  const existing = normalizeAgreeBodyCellExprs(
    ctx.el.options.agreeBodyCellExprs,
    leafFields,
  );
  if (expr) {
    const check = validatePrintExpr(expr, {
      ...(sampleData.value as unknown as Record<string, unknown>),
      ...ctx.selection.rawStartRow,
      i: ctx.selection.startRow,
      index: ctx.selection.startRow,
      row: ctx.selection.rawStartRow,
    });
    if (!check.ok) {
      ElMessage.error(`单格公式未写入：${check.message}`);
      return;
    }
  }
  const rules = expr
    ? upsertAgreeBodyCellExpr(
        existing,
        {
          colIndex: ctx.selection.startCol,
          expr,
          field: ctx.leaf.field,
          rowIndex: ctx.selection.startRow,
        },
        ctx.selection.rawStartRow,
        leafFields,
      )
    : existing.filter(
        (rule) =>
          !(
            rule.field === ctx.leaf.field &&
            ruleMatchesSelectedRow(
              rule,
              ctx.selection.startRow,
              ctx.selection.rawStartRow,
            )
          ),
      );
  commit(
    patchElementOptions(ctx.template, ctx.el, {
      agreeBodyCellExprs: rules.length > 0 ? rules : null,
    }),
    { paginate: false },
  );
  bodyFormulaOpen.value = false;
  ElMessage.success(expr ? '已写入当前单元格计算' : '已清除当前单元格计算');
}

function onTableFooterCellSelect(payload: {
  cellIndex: number;
  key: string;
  rowIndex: number;
}) {
  onCanvasSelect(payload.key);
  inspectorRef.value?.focusFooterCell(payload.rowIndex, payload.cellIndex);
}

/** 点中页面空白处时切换当前页 */
function onCanvasPageSelect(panelIndex: number) {
  currentPanel.value = panelIndex;
  clearSelection();
}

/** 检视器选中回调（key 为 listPrintElements 的 key） */
function onInspectorSelect(key: string) {
  const found = listPrintElements(templateJson.value).find(
    (el) => el.key === key,
  );
  if (found) {
    onCanvasSelect(`${found.panelIndex}:${found.elementIndex}`);
  } else {
    clearSelection();
  }
}

// ---------------- 历史 / 写回 ----------------

/** 刷新撤销/重做按钮状态 */
function refreshHistoryFlags() {
  canUndo.value = historyIndex > 0;
  canRedo.value = historyIndex >= 0 && historyIndex < history.length - 1;
}

/** 完整模板指纹：列公式、筛选和合并规则也必须能撤销 */
function templateFingerprint(json: Record<string, any>) {
  const raw = JSON.stringify(json || {});
  let hash = 2_166_136_261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.codePointAt(index) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return `${raw.length}:${((hash % 4_294_967_296) + 4_294_967_296) % 4_294_967_296}`;
}

/**
 * 压入撤销栈（相同指纹跳过；撤销回放期间不压）
 * @param json 模板
 */
function pushHistory(json: Record<string, any>) {
  if (applyingHistory) return;
  const fp = templateFingerprint(json);
  if (fp === lastHistoryFp) return;
  const snap = cloneTemplate(json);
  history = history.slice(0, historyIndex + 1);
  history.push(snap);
  if (history.length > HISTORY_MAX) {
    history.shift();
  }
  historyIndex = history.length - 1;
  lastHistoryFp = fp;
  refreshHistoryFlags();
}

/** 用当前模板重置撤销栈（加载 / 恢复默认） */
function resetHistory(json: Record<string, any>) {
  history = [cloneTemplate(json)];
  historyIndex = 0;
  lastHistoryFp = templateFingerprint(json);
  refreshHistoryFlags();
}

/**
 * 提交模板：可选自动翻页 + 保留选中 + 压入历史
 * @param next 新模板
 * @param opts markSelected / paginate / pushHist
 */
function commit(
  next: Record<string, any>,
  opts?: {
    markSelected?: boolean;
    paginate?: boolean;
    pushHist?: boolean;
  },
) {
  let working = next;
  // 标记当前选中元素，翻页/克隆后重新定位
  if (opts?.markSelected && selPanel.value >= 0) {
    const el =
      working?.panels?.[selPanel.value]?.printElements?.[selElement.value];
    if (el?.options) el.options[SEL_MARK] = true;
  }
  if (opts?.paginate !== false) {
    working = autoPaginate(working);
  }
  // 回定位选中并清除标记
  relocateSelection(working);
  templateJson.value = working;
  dirty.value = true;
  if (opts?.pushHist !== false) {
    pushHistory(working);
  }
}

/** 扫描标记，恢复选中并清除标记 */
function relocateSelection(tpl: Record<string, any>) {
  const panels: Record<string, any>[] = tpl?.panels || [];
  for (let p = 0; p < panels.length; p += 1) {
    const els = panels[p]?.printElements || [];
    for (let e = 0; e < els.length; e += 1) {
      if (els[e]?.options?.[SEL_MARK]) {
        const { [SEL_MARK]: _mark, ...rest } = els[e].options as Record<
          string,
          unknown
        >;
        els[e].options = rest;
        selPanel.value = p;
        selElement.value = e;
        currentPanel.value = p;
        return;
      }
    }
  }
}

/** 画布拖拽/缩放结束回写 */
function onCanvasTemplate(next: Record<string, any>) {
  commit(next, { markSelected: true });
}

/** 检视器写回 */
function onInspectorPatch(next: Record<string, any>) {
  commit(next, { markSelected: true });
}

/** 撤销到上一个快照 */
function undo() {
  if (historyIndex <= 0) return;
  applyingHistory = true;
  historyIndex -= 1;
  refreshHistoryFlags();
  const snap = history[historyIndex];
  if (!snap) {
    applyingHistory = false;
    return;
  }
  clearSelection();
  templateJson.value = cloneTemplate(snap);
  lastHistoryFp = templateFingerprint(snap);
  dirty.value = true;
  applyingHistory = false;
}

/** 重做到下一个快照 */
function redo() {
  if (historyIndex >= history.length - 1) return;
  applyingHistory = true;
  historyIndex += 1;
  refreshHistoryFlags();
  const snap = history[historyIndex];
  if (!snap) {
    applyingHistory = false;
    return;
  }
  clearSelection();
  templateJson.value = cloneTemplate(snap);
  lastHistoryFp = templateFingerprint(snap);
  dirty.value = true;
  applyingHistory = false;
}

// ---------------- 添加 / 删除 ----------------

/** 计算某页新元素的落位 top（现有内容底部下方） */
function nextTopOnPanel(panelIndex: number) {
  const els = templateJson.value?.panels?.[panelIndex]?.printElements || [];
  let bottom = PAGE_MARGIN_PT;
  els.forEach((el: Record<string, any>) => {
    const o = el.options || {};
    bottom = Math.max(bottom, (Number(o.top) || 0) + (Number(o.height) || 0));
  });
  return bottom + 8;
}

/** 当前活动页（有选中用选中页，否则用最近点中 / 新建的页） */
function activePanelIndex() {
  if (selPanel.value >= 0) return selPanel.value;
  return Math.min(
    Math.max(0, currentPanel.value),
    Math.max(0, pageCount.value - 1),
  );
}

/** 添加积木元素 */
function addToolbox(tid: string) {
  if (!templateJson.value) return;
  if (toolboxDragging) return;
  if (tid === 'pageBreak') {
    ElMessage.info('请把「页面隔断」拖到纸面需要分页的位置');
    return;
  }
  const panelIndex = activePanelIndex();
  const node = buildToolboxPrintElement(
    tid,
    PAGE_MARGIN_PT,
    nextTopOnPanel(panelIndex),
  );
  (node.options as Record<string, any>)[SEL_MARK] = true;
  const next = insertPrintElement(templateJson.value, panelIndex, -1, node);
  commit(next, { markSelected: true });
}

/** 开始从左侧拖积木；用内存会话兼容 dragover 读不到 dataTransfer 的浏览器 */
function onToolboxDragStart(e: DragEvent, tid: string) {
  toolboxDragging = true;
  setAgreePrintHtml5Drag({ kind: AGREE_PRINT_TOOLBOX_DND, tid });
  e.dataTransfer?.setData(
    'text/plain',
    JSON.stringify({ kind: AGREE_PRINT_TOOLBOX_DND, tid }),
  );
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
}

let toolboxDragging = false;
function onToolboxDragEnd() {
  window.setTimeout(() => {
    toolboxDragging = false;
    setAgreePrintHtml5Drag(null);
  }, 0);
}

/** 字段面板点选：有选中则改绑定，否则新增已绑定元素 */
function onFieldPick(item: AgreePrintFieldItem) {
  if (!templateJson.value) return;
  // 已选中文本元素 → 改字段绑定
  if (selPanel.value >= 0) {
    const cur = listPrintElements(templateJson.value).find(
      (e) =>
        e.panelIndex === selPanel.value && e.elementIndex === selElement.value,
    );
    if (cur && cur.type !== 'table') {
      const next = patchElementOptions(
        templateJson.value,
        { panelIndex: selPanel.value, elementIndex: selElement.value },
        {
          field: item.field,
          title: item.text,
          testData: item.testData ?? '',
        },
      );
      commit(next, { markSelected: true, paginate: false });
      return;
    }
  }
  // 否则新增绑定元素
  const panelIndex = activePanelIndex();
  const node = buildBoundPrintElement(
    item,
    PAGE_MARGIN_PT,
    nextTopOnPanel(panelIndex),
  );
  (node.options as Record<string, any>)[SEL_MARK] = true;
  const next = insertPrintElement(templateJson.value, panelIndex, -1, node);
  commit(next, { markSelected: true });
}

/** 字段拖入纸面：按目标页和落点新建已绑定元素 */
function onCanvasFieldDrop(payload: CanvasFieldDropPayload) {
  if (!templateJson.value) return;
  const panel = templateJson.value.panels?.[payload.panelIndex];
  if (!panel) return;
  currentPanel.value = payload.panelIndex;
  const node = buildBoundPrintElement(payload.item, payload.left, payload.top);
  // 横向越界时沿用现有收纸逻辑，避免在纸张右缘生成不可编辑元素。
  fitElementIntoPaper(node, Number(panel.width) || 210);
  (node.options as Record<string, any>)[SEL_MARK] = true;
  const next = insertPrintElement(
    templateJson.value,
    payload.panelIndex,
    -1,
    node,
  );
  commit(next, { markSelected: true });
}

/** 积木拖入纸面；页面隔断会把线下内容整体搬到紧随其后的新页 */
function onCanvasToolboxDrop(payload: CanvasToolboxDropPayload) {
  if (!templateJson.value) return;
  const panel = templateJson.value.panels?.[payload.panelIndex];
  if (!panel) return;
  currentPanel.value = payload.panelIndex;
  if (payload.tid === 'pageBreak') {
    const result = splitPanelAtY(
      templateJson.value,
      payload.panelIndex,
      payload.top,
    );
    clearSelection();
    currentPanel.value = result.newPanelIndex;
    commit(result.template, { paginate: false });
    void nextTick(() => canvasRef.value?.scrollToPanel(result.newPanelIndex));
    ElMessage.success(
      result.movedCount > 0
        ? `已隔断，${result.movedCount} 个元素移到第 ${result.newPanelIndex + 1} 页`
        : '已在此处隔断并新增空白页',
    );
    return;
  }
  const node = buildToolboxPrintElement(payload.tid, payload.left, payload.top);
  fitElementIntoPaper(node, Number(panel.width) || 210);
  (node.options as Record<string, any>)[SEL_MARK] = true;
  const next = insertPrintElement(
    templateJson.value,
    payload.panelIndex,
    -1,
    node,
  );
  commit(next, { markSelected: true });
}

/** 删除选中元素 */
function deleteSelected() {
  if (selPanel.value < 0 || !templateJson.value) return;
  const next = removePrintElement(templateJson.value, {
    panelIndex: selPanel.value,
    elementIndex: selElement.value,
  });
  clearSelection();
  commit(next, { paginate: false });
}

/** 复制选中元素 */
function duplicateSelected() {
  if (selPanel.value < 0 || !templateJson.value) return;
  const next = duplicatePrintElement(templateJson.value, {
    panelIndex: selPanel.value,
    elementIndex: selElement.value,
  });
  // 选中复制出的下一个
  selElement.value += 1;
  commit(next, { markSelected: false });
}

/**
 * 方向键微调选中元素位置（连按合并为一次撤销）
 * @param dxPt 水平增量（pt）
 * @param dyPt 垂直增量（pt）
 */
let nudgeHistTimer: ReturnType<typeof setTimeout> | undefined;
function nudgeSelected(dxPt: number, dyPt: number) {
  if (selPanel.value < 0 || !templateJson.value) return;
  const next = cloneTemplate(templateJson.value);
  const el = next.panels?.[selPanel.value]?.printElements?.[selElement.value];
  if (!el?.options) return;
  const o = el.options;
  o.left = Math.max(0, Math.round((Number(o.left) || 0) + dxPt));
  o.top = Math.max(0, Math.round((Number(o.top) || 0) + dyPt));
  el.options[SEL_MARK] = true;
  // 连按不立刻压栈，松手后合并为一步
  commit(next, { markSelected: true, pushHist: false });
  if (nudgeHistTimer) clearTimeout(nudgeHistTimer);
  nudgeHistTimer = setTimeout(() => {
    if (templateJson.value) pushHistory(templateJson.value);
  }, 400);
}

/** 新增空白页 */
function addPage() {
  if (!templateJson.value) return;
  const { newPanelIndex, template } = insertBlankPanelAfter(
    templateJson.value,
    activePanelIndex(),
  );
  clearSelection();
  currentPanel.value = newPanelIndex;
  commit(template, { paginate: false });
  void nextTick(() => canvasRef.value?.scrollToPanel(newPanelIndex));
}

/** 删除当前页 */
async function removeCurrentPage() {
  if (!templateJson.value || pageCount.value <= 1) {
    ElMessage.warning('至少保留一页');
    return;
  }
  const idx = activePanelIndex();
  try {
    await ElMessageBox.confirm(`确认删除第 ${idx + 1} 页？`, '删除页', {
      type: 'warning',
    });
  } catch {
    return;
  }
  const { activePanelIndex: nextPanelIndex, template } = removePrintPanel(
    templateJson.value,
    idx,
  );
  clearSelection();
  currentPanel.value = nextPanelIndex;
  commit(template, { paginate: false });
  void nextTick(() => canvasRef.value?.scrollToPanel(nextPanelIndex));
}

// ---------------- 纸张 / 缩放 ----------------

/** 切换纸张（强制竖向），换纸后自动把越界元素收进新纸张 */
function onPaperSizeChange(sizeId: any) {
  if (!templateJson.value) return;
  const { template } = applyPaperToTemplate(templateJson.value, {
    sizeId,
    orientation: 'portrait',
  });
  clearSelection();
  commit(fitTemplateIntoPaper(template), { paginate: false });
  fitToWidth();
}

/** 一键把越界元素收进纸张（横向收宽 + 纵向翻页），保留选中 */
function fitIntoPaper() {
  if (!templateJson.value) return;
  const t = cloneTemplate(templateJson.value);
  // 标记当前选中元素，收纸后回定位
  if (selPanel.value >= 0) {
    const el = t.panels?.[selPanel.value]?.printElements?.[selElement.value];
    if (el?.options) el.options[SEL_MARK] = true;
  }
  commit(fitTemplateIntoPaper(t), { markSelected: true, paginate: false });
  ElMessage.success('已把越界元素收进纸张');
}

/** 手动缩放 */
function nudgeZoom(delta: number) {
  zoomMode.value = 'manual';
  zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom.value + delta));
}

/** 100% */
function resetZoom() {
  zoomMode.value = 'manual';
  zoom.value = 100;
}

/** 适合宽度 */
function fitToWidth() {
  zoomMode.value = 'fit';
  void nextTick(() => requestAnimationFrame(updateFitWidthZoom));
}

/** 按可用宽度计算展示比例 */
function updateFitWidthZoom() {
  if (zoomMode.value !== 'fit') return;
  const stage = stageRef.value;
  if (!stage) return;
  const available = Math.max(1, stage.clientWidth - 48);
  const paperWidth = mmToCssPx(paperSpec.value.widthMm);
  const next = Math.floor((available / paperWidth) * 100);
  zoom.value = Math.min(100, Math.max(ZOOM_MIN, next));
}

let resizeOb: null | ResizeObserver = null;

// ---------------- 预览 / 保存 ----------------

/** 快速预览：复用打印管线 getHtml */
async function onPreview() {
  if (!templateJson.value) return;
  try {
    const { PrintTemplate } = await ensureHiprint();
    const json = cloneTemplate(templateJson.value);
    applyPrintPageSizeFromTemplate(json);
    const { printData: enriched, template: preparedTpl } = preparePrintTemplate(
      json,
      sampleData.value,
    );
    const previewTpl = new PrintTemplate({ template: preparedTpl });
    previewOpen.value = true;
    await nextTick();
    const host = previewHost.value;
    if (!host) return;
    host.innerHTML = '';
    host.style.zoom = '1';
    const $html = previewTpl.getHtml(enriched);
    if ($html?.appendTo) $html.appendTo(host);
    await nextTick();
    normalizePrintPreviewPages(host, paperSpec.value.heightMm);
    fitPrintPreviewHost(host, paperSpec.value.widthMm);
  } catch (error: any) {
    ElMessage.error(error?.message || '预览失败');
  }
}

/** 保存 */
async function onSave() {
  const json = templateJson.value;
  if (!json?.panels?.length) {
    ElMessage.warning('画布为空');
    return;
  }
  if (props.delegateSave) {
    emit('saveRequested', cloneTemplate(json));
    return;
  }
  try {
    if (props.templateId) {
      await updatePrintTemplate(props.templateId, { templateJson: json });
      dirty.value = false;
      ElMessage.success('模板已保存到服务端');
      return;
    }
    saveAgreePrintTemplate(json);
    dirty.value = false;
    ElMessage.success('模板已保存（本地）');
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败');
  }
}

/** 恢复默认版式 */
async function onReset() {
  try {
    await ElMessageBox.confirm('将重新加载默认版式，是否继续？', '恢复默认', {
      type: 'warning',
    });
  } catch {
    return;
  }
  const tpl = cloneTemplate(agreePrintTemplate);
  templateJson.value = tpl;
  sampleData.value = buildDesignerSamplePrintData();
  clearSelection();
  dirty.value = true;
  resetHistory(tpl);
  fitToWidth();
}

/** 打开水印对话框 */
function openWatermarkDialog() {
  if (!templateJson.value?.panels?.length) {
    ElMessage.warning('设计器尚未就绪，请稍后再试');
    return;
  }
  watermarkOpen.value = true;
}

/**
 * 水印写回后更新模板（预览/打印共用 watermarkOptions）
 * @param json 带水印的模板
 */
function onWatermarkApply(json: Record<string, any>) {
  commit(cloneTemplate(json), { paginate: false });
  ElMessage.success('水印已应用到模板，请用「快速预览」确认打印效果');
}

/** 打开模板 JSON 编辑器 */
function openJsonEditor() {
  const j = templateJson.value;
  if (!j?.panels?.length) {
    ElMessage.warning('设计器尚未就绪');
    return;
  }
  jsonText.value = JSON.stringify(j, null, 2);
  jsonOpen.value = true;
}

/** 从 JSON 编辑器应用模板到画布 */
function applyJsonEditor() {
  try {
    const parsed = JSON.parse(jsonText.value);
    if (!parsed?.panels?.length) {
      ElMessage.warning('JSON 缺少 panels');
      return;
    }
    jsonOpen.value = false;
    clearSelection();
    commit(sanitizePrintTemplate(parsed), { paginate: false });
    fitToWidth();
    ElMessage.success('已从 JSON 刷新画布');
  } catch {
    ElMessage.error('JSON 格式不正确');
  }
}

/** 打开数据源 JSON 编辑器 */
function openDataJsonEditor() {
  dataJsonOpen.value = true;
}

/**
 * 用粘贴的业务 JSON 替换设计器样例（影响画布表体与快速预览）
 * @param data 解析后的 printData
 */
function onDataJsonApply(data: AgreePrintData) {
  sampleData.value = data;
  dirty.value = true;
  ElMessage.success('已应用数据源 JSON，画布表体与快速预览会用这份数据');
}

/** 切换左侧栏折叠，并重新适宽 */
function toggleLeftPanel() {
  leftCollapsed.value = !leftCollapsed.value;
  fitToWidth();
}

/** 切换右侧栏折叠，并重新适宽 */
function toggleRightPanel() {
  rightCollapsed.value = !rightCollapsed.value;
  fitToWidth();
}

/**
 * 画布右键：打开复制/删除菜单
 * @param payload 选中 key 与屏幕坐标
 */
function onCanvasContextMenu(payload: {
  clientX: number;
  clientY: number;
  key: string;
}) {
  onCanvasSelect(payload.key);
  ctxMenu.value = {
    open: true,
    x: payload.clientX,
    y: payload.clientY,
  };
}

/** 关闭右键菜单 */
function closeCtxMenu() {
  ctxMenu.value.open = false;
}

/** 右键菜单：复制 */
function ctxDuplicate() {
  closeCtxMenu();
  duplicateSelected();
}

/** 右键菜单：删除 */
function ctxDelete() {
  closeCtxMenu();
  deleteSelected();
}

/**
 * 设计器快捷键：Ctrl+S 保存，Ctrl+Z/Y 撤销重做，Ctrl+D 复制，Delete 删除，方向键微调
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
  if (e.key === 'Escape') {
    closeCtxMenu();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    duplicateSelected();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelected();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }
  if (
    (e.ctrlKey || e.metaKey) &&
    (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
  ) {
    e.preventDefault();
    redo();
    return;
  }
  // 方向键微调：默认 1pt，Shift 5pt
  if (
    e.key === 'ArrowLeft' ||
    e.key === 'ArrowRight' ||
    e.key === 'ArrowUp' ||
    e.key === 'ArrowDown'
  ) {
    if (selPanel.value < 0) return;
    e.preventDefault();
    const step = e.shiftKey ? 5 : 1;
    const dx =
      e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    nudgeSelected(dx, dy);
  }
}

/** 点击页面任意处关闭右键菜单 */
function onDocPointerDown(e: MouseEvent) {
  if (!ctxMenu.value.open) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest('.agree-designer__ctx')) return;
  closeCtxMenu();
}

// ---------------- 生命周期 / 对外 ----------------

onMounted(() => {
  void loadTemplate();
  if (stageRef.value && typeof ResizeObserver !== 'undefined') {
    resizeOb = new ResizeObserver(() => updateFitWidthZoom());
    resizeOb.observe(stageRef.value);
  }
  window.addEventListener('keydown', onDesignerKeydown);
  window.addEventListener('pointerdown', onDocPointerDown, true);
});

onBeforeUnmount(() => {
  resizeOb?.disconnect();
  resizeOb = null;
  window.removeEventListener('keydown', onDesignerKeydown);
  window.removeEventListener('pointerdown', onDocPointerDown, true);
  if (nudgeHistTimer) clearTimeout(nudgeHistTimer);
});

// templateId 变化时重载
watch(
  () => props.templateId,
  () => void loadTemplate(),
);

defineExpose({
  getTemplateJson: () =>
    templateJson.value ? cloneTemplate(templateJson.value) : null,
  markClean: () => {
    dirty.value = false;
  },
});
</script>

<template>
  <div class="agree-designer" v-loading="loading">
    <!-- 顶部工具栏 -->
    <div class="agree-designer__toolbar">
      <div class="agree-designer__group">
        <span class="agree-designer__label">纸张</span>
        <ElSelect
          :model-value="paperSpec.sizeId"
          size="small"
          style="width: 96px"
          @change="onPaperSizeChange"
        >
          <ElOption
            v-for="p in PRINT_PAPER_PRESETS"
            :key="p.id"
            :label="p.label"
            :value="p.id"
          />
        </ElSelect>
        <span class="agree-designer__hint">{{ paperDesc }}（竖向）</span>
      </div>

      <div class="agree-designer__group">
        <ElButton size="small" @click="toggleLeftPanel">
          {{ leftCollapsed ? '展开左栏' : '收起左栏' }}
        </ElButton>
        <ElButton size="small" @click="toggleRightPanel">
          {{ rightCollapsed ? '展开右栏' : '收起右栏' }}
        </ElButton>
        <ElButtonGroup>
          <ElButton size="small" @click="nudgeZoom(-10)">-</ElButton>
          <ElButton size="small" @click="resetZoom">{{ zoom }}%</ElButton>
          <ElButton size="small" @click="nudgeZoom(10)">+</ElButton>
        </ElButtonGroup>
        <ElButton
          size="small"
          :type="zoomMode === 'fit' ? 'primary' : 'default'"
          @click="fitToWidth"
        >
          适合宽度
        </ElButton>
      </div>

      <div class="agree-designer__group">
        <ElButton size="small" @click="addPage">在此页后新增</ElButton>
        <ElButton size="small" @click="removeCurrentPage">删除页</ElButton>
        <span class="agree-designer__hint">
          当前第 {{ activePanelIndex() + 1 }} 页 · 共 {{ pageCount }} 页
        </span>
      </div>

      <div class="agree-designer__group">
        <ElButton size="small" :disabled="!canUndo" @click="undo">
          撤销
        </ElButton>
        <ElButton size="small" :disabled="!canRedo" @click="redo">
          重做
        </ElButton>
        <ElButton
          size="small"
          :disabled="selPanel < 0"
          @click="duplicateSelected"
        >
          复制
        </ElButton>
        <ElButton
          size="small"
          type="danger"
          plain
          :disabled="selPanel < 0"
          @click="deleteSelected"
        >
          删除元素
        </ElButton>
      </div>

      <div class="agree-designer__group agree-designer__group--right">
        <span v-if="overflowCount > 0" class="agree-designer__warn">
          有 {{ overflowCount }} 个元素越界（红框）
        </span>
        <ElButton
          v-if="overflowCount > 0"
          size="small"
          type="warning"
          plain
          @click="fitIntoPaper"
        >
          收进纸张
        </ElButton>
        <span v-if="dirty" class="agree-designer__hint">未保存</span>
        <ElButton
          size="small"
          :type="watermarkOn ? 'primary' : 'default'"
          @click="openWatermarkDialog"
        >
          {{ watermarkOn ? '水印·开' : '水印' }}
        </ElButton>
        <ElButton size="small" @click="openJsonEditor">模板 JSON</ElButton>
        <ElButton size="small" @click="openDataJsonEditor">
          数据源 JSON
        </ElButton>
        <ElButton size="small" @click="onReset">恢复默认</ElButton>
        <ElButton size="small" @click="onPreview">快速预览</ElButton>
        <ElButton size="small" type="primary" @click="onSave">保存</ElButton>
      </div>
    </div>

    <!-- 主体三栏 -->
    <div
      class="agree-designer__body"
      :class="{
        'is-left-collapsed': leftCollapsed,
        'is-right-collapsed': rightCollapsed,
      }"
    >
      <!-- 左：积木 + 字段 -->
      <div class="agree-designer__left">
        <div class="agree-designer__palette">
          <div class="agree-designer__panel-heading">
            <div class="agree-designer__panel-title">添加元素</div>
            <span>单击自动添加 · 拖动精准定位</span>
          </div>
          <div class="agree-designer__toolbox">
            <button
              v-for="t in TOOLBOX"
              :key="t.tid"
              class="agree-designer__tool"
              :class="{ 'is-page-break': t.tid === 'pageBreak' }"
              draggable="true"
              :aria-label="
                t.tid === 'pageBreak'
                  ? '拖到纸面任意纵向位置进行隔断'
                  : `单击添加${t.label}，或拖到纸面指定位置`
              "
              :title="
                t.tid === 'pageBreak'
                  ? '拖到纸面任意纵向位置进行隔断'
                  : `单击添加${t.label}，或拖到纸面指定位置`
              "
              @dragstart="onToolboxDragStart($event, t.tid)"
              @dragend="onToolboxDragEnd"
              @click="addToolbox(t.tid)"
            >
              <span class="agree-designer__tool-grip">⠿</span>
              <span>{{ t.label }}</span>
            </button>
          </div>
        </div>
        <div class="agree-designer__fields">
          <PrintDataPanel
            :data="sampleData"
            :selected-field="selectedElement?.field"
            :selected-type="selectedElement?.type"
            @pick="onFieldPick"
          />
        </div>
      </div>

      <!-- 中：画布 -->
      <div ref="stageRef" class="agree-designer__stage">
        <CanvasStage
          ref="canvasRef"
          :body-cell-selection="bodyCellSelection"
          :highlight-col-index="highlightColIndex"
          :highlight-table-key="highlightTableKey"
          :template-json="templateJson"
          :sample-data="sampleData"
          :zoom="zoom"
          :selected-key="canvasSelectedKey"
          @update:template-json="onCanvasTemplate"
          @update:selected-key="onCanvasSelect"
          @contextmenu="onCanvasContextMenu"
          @body-formula-requested="openBodyCellFormula"
          @body-merge-requested="mergeSelectedBodyCells"
          @body-split-requested="splitSelectedBodyCell"
          @field-drop="onCanvasFieldDrop"
          @page-select="onCanvasPageSelect"
          @table-body-cell-select="onTableBodyCellSelect"
          @table-footer-cell-select="onTableFooterCellSelect"
          @toolbox-drop="onCanvasToolboxDrop"
        />
      </div>

      <!-- 右：检视器 -->
      <div class="agree-designer__right">
        <PrintInspector
          ref="inspectorRef"
          :highlight-col-index="highlightColIndex"
          :template-json="templateJson"
          :sample-data="sampleData"
          :selected-key="inspectorKey"
          @canvas-patch="onInspectorPatch"
          @highlight-col="onHighlightColumn"
          @update:selected-key="onInspectorSelect"
        />
      </div>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="ctxMenu.open"
      class="agree-designer__ctx"
      :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
      @click.stop
      @contextmenu.prevent
    >
      <button type="button" @click="ctxDuplicate">复制</button>
      <button type="button" class="is-danger" @click="ctxDelete">删除</button>
    </div>

    <!-- 预览弹窗 -->
    <ElDialog
      v-model="previewOpen"
      title="快速预览"
      :width="previewDialogWidthCss(paperSpec.widthMm)"
      append-to-body
    >
      <div class="agree-designer__preview">
        <div ref="previewHost" class="agree-designer__preview-host"></div>
      </div>
    </ElDialog>

    <!-- 水印：复用既有对话框，写回 panel.watermarkOptions -->
    <PrintWatermarkDialog
      v-model="watermarkOpen"
      :template-json="templateJson"
      @apply="onWatermarkApply"
    />

    <!-- 模板 JSON：直接编辑 hiprint panels 结构 -->
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

    <!-- 数据源 JSON：只改样例业务数据，不改版式 -->
    <PrintDataJsonDialog
      v-model="dataJsonOpen"
      :initial-data="sampleData"
      @apply="onDataJsonApply"
    />

    <!-- 表体单格计算：只覆盖当前一行当前列；全列公式仍在表格结构弹窗维护 -->
    <ElDialog
      v-model="bodyFormulaOpen"
      title="当前单元格计算"
      width="560px"
      append-to-body
      destroy-on-close
    >
      <ElAlert
        type="info"
        :closable="false"
        title="只覆盖当前选中行的当前格；同一列每一行都要计算时，请在「编辑表格结构与计算」中设置逐行公式。规则优先按行 ID/名称匹配，换排序后仍尽量跟随同一条数据。"
      />
      <div
        class="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600"
      >
        <div>
          当前字段：<code class="font-mono text-gray-800">{{
            bodyFormulaField || '—'
          }}</code>
        </div>
        <div>
          比较请用 <code>==</code> / <code>!=</code>，单个
          <code>=</code> 是赋值；文本结果需加引号，如 <code>"/"</code>。
        </div>
      </div>
      <ElInput
        v-model="bodyFormulaExpr"
        class="mt-3 font-mono"
        clearable
        :placeholder="
          bodyFormulaField
            ? `如 IF(EMPTY(${bodyFormulaField}), &quot;/&quot;, ${bodyFormulaField})`
            : '请输入计算表达式'
        "
      />
      <div class="mt-2 flex flex-wrap gap-2">
        <ElButton size="small" @click="setBodyFormulaPreset('empty-slash')">
          空值显示 /
        </ElButton>
        <ElButton
          size="small"
          @click="setBodyFormulaPreset('empty-zero-slash')"
        >
          空值或 0 显示 /
        </ElButton>
        <ElButton
          size="small"
          @click="bodyFormulaExpr = 'ROUND(quantity * unitPrice, 2)'"
        >
          数量 × 单价
        </ElButton>
        <ElButton
          size="small"
          @click="bodyFormulaExpr = 'IF(quantity > 0, quantity * unitPrice, 0)'"
        >
          IF 条件
        </ElButton>
        <ElButton
          size="small"
          @click="bodyFormulaExpr = 'quantity > 0 ? quantity * unitPrice : 0'"
        >
          三元条件
        </ElButton>
        <ElButton
          size="small"
          @click="bodyFormulaExpr = 'SQRT(POW(NUMBER(quantity), 2))'"
        >
          科学函数
        </ElButton>
      </div>
      <p class="mt-3 text-xs text-gray-500">
        可用当前行字段、row、i / index 与 SUM、IF、ROUND、IFS、SQRT
        等安全计算函数；不支持脚本语句。
      </p>
      <ElAlert
        v-if="bodyFormulaValidation"
        class="mt-3"
        :closable="false"
        :title="
          bodyFormulaValidation.ok
            ? `校验通过；当前样例结果：${bodyFormulaValidation.preview ?? ''}`
            : `表达式有误：${bodyFormulaValidation.message}`
        "
        :type="bodyFormulaValidation.ok ? 'success' : 'error'"
      />
      <template #footer>
        <ElButton @click="bodyFormulaOpen = false">取消</ElButton>
        <ElButton
          @click="
            bodyFormulaExpr = '';
            applyBodyCellFormula();
          "
        >
          清除计算
        </ElButton>
        <ElButton type="primary" @click="applyBodyCellFormula">
          应用计算
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.agree-designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #fff;
  border: 1px solid rgb(0 0 0 / 8%);
  border-radius: 8px;
}

.agree-designer__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid rgb(0 0 0 / 8%);
}

.agree-designer__group {
  display: flex;
  gap: 6px;
  align-items: center;
}

.agree-designer__group + .agree-designer__group {
  padding-left: 12px;
  border-left: 1px solid #e5e7eb;
}

.agree-designer__group--right {
  margin-left: auto;
}

.agree-designer__label {
  font-size: 12px;
  color: #64748b;
}

.agree-designer__hint {
  font-size: 12px;
  color: #94a3b8;
}

.agree-designer__warn {
  font-size: 12px;
  color: #ef4444;
}

.agree-designer__body {
  display: grid;
  flex: 1;
  grid-template-columns: 240px minmax(0, 1fr) 320px;
  min-height: 0;
}

.agree-designer__body.is-left-collapsed {
  grid-template-columns: 0 minmax(0, 1fr) 320px;
}

.agree-designer__body.is-right-collapsed {
  grid-template-columns: 240px minmax(0, 1fr) 0;
}

.agree-designer__body.is-left-collapsed.is-right-collapsed {
  grid-template-columns: 0 minmax(0, 1fr) 0;
}

.agree-designer__left,
.agree-designer__right {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.agree-designer__body.is-left-collapsed > .agree-designer__left,
.agree-designer__body.is-right-collapsed > .agree-designer__right {
  visibility: hidden;
  padding: 0;
  overflow: hidden;
  pointer-events: none;
  border: 0;
}

.agree-designer__left {
  border-right: 1px solid rgb(0 0 0 / 8%);
}

.agree-designer__right {
  border-left: 1px solid rgb(0 0 0 / 8%);
}

.agree-designer__palette {
  padding: 10px;
  border-bottom: 1px solid rgb(0 0 0 / 6%);
}

.agree-designer__panel-heading {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}

.agree-designer__panel-heading > span {
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
}

.agree-designer__panel-title {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.agree-designer__toolbox {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.agree-designer__tool {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  padding: 6px 0;
  font-size: 12px;
  color: #334155;
  cursor: grab;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
}

.agree-designer__tool:active {
  cursor: grabbing;
}

.agree-designer__tool.is-page-break {
  grid-column: 1 / -1;
  color: #92400e;
  background: #fffbeb;
  border-color: #fde68a;
}

.agree-designer__tool-grip {
  font-size: 11px;
  color: #94a3b8;
}

.agree-designer__tool:hover {
  color: #2563eb;
  background: #eff6ff;
  border-color: #bfdbfe;
}

.agree-designer__fields {
  flex: 1;
  min-height: 0;
}

.agree-designer__stage {
  min-height: 0;
  overflow: auto;
}

.agree-designer__preview {
  display: flex;
  justify-content: center;
  max-height: 72vh;
  padding: 12px;
  overflow: auto;
  background: #f0f2f5;
  border-radius: 6px;
}

.agree-designer__preview-host {
  background: transparent;
}

.agree-designer__preview-host :deep(.hiprint-printPaper) {
  outline: 1px solid #d7dce3;
  box-shadow: 0 1px 6px rgb(0 0 0 / 12%);
}

.agree-designer__ctx {
  position: fixed;
  z-index: 4000;
  display: flex;
  flex-direction: column;
  min-width: 120px;
  padding: 4px;
  background: #fff;
  border: 1px solid rgb(0 0 0 / 10%);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
}

.agree-designer__ctx button {
  padding: 6px 12px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 4px;
}

.agree-designer__ctx button:hover {
  background: #f1f5f9;
}

.agree-designer__ctx button.is-danger {
  color: #dc2626;
}
</style>

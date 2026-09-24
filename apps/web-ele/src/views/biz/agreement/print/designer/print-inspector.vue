<script lang="ts" setup>
import type { AgreePrintFieldItem } from '../data/fields';
import type { PrintTextSection } from '../runtime/print-long-text';
import type {
  AgreeFooterCell,
  AgreeFooterRow,
} from '../runtime/print-table-footer';
import type { PrintElementRef } from '../template/print-element-meta';
/**
 * 打印检视器：数据绑定 + 规则（显隐 / 表格筛行）
 */
import type { AgreePrintData } from '../types';
import type {
  PrintFieldPickMode,
  PrintFieldTreeNode,
} from './print-field-tree';

import { computed, nextTick, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElCollapse,
  ElCollapseItem,
  ElColorPicker,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElOptionGroup,
  ElPopover,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElSwitch,
  ElTabPane,
  ElTabs,
  ElTag,
} from 'element-plus';

import { cloneJson } from '../../clone';
import {
  AGREE_PRINT_ALL_FIELDS,
  buildPresetTableColumns,
  PRINT_EXPR_HELP,
  TABLE_COLUMN_PRESETS,
} from '../data/fields';
import { AGREE_PRINT_FORMAT_GROUPS } from '../data/format-print-value';
import { isDocumentTemplate } from '../runtime/document-layout';
import {
  evalPrintExpr,
  normalizeAgreeRowSort,
  validatePrintExpr,
} from '../runtime/print-expr';
import {
  applyPrintExprInsert,
  colorPrintExprFields,
  printExprInputEl,
  protocolPrintExprFields,
  rowPrintExprFields,
} from '../runtime/print-expr-catalog';
import {
  getFlowGroupName,
  getFlowGroupSettings,
  isAutoFlowElement,
} from '../runtime/print-flow';
import {
  listHeaderMerges,
  mergeTableHeaders,
  projectTableHeaders,
  splitTableHeader,
} from '../runtime/print-header-merge';
import {
  resolvePrintTextSections,
  validatePrintTextTemplate,
} from '../runtime/print-long-text';
import {
  collectLeafColumns,
  describeFilterExpr,
  isNumericPrintField,
  listFilterChips,
  listFilterColumns,
  previewFilterRowCount,
  upsertFieldFilter,
} from '../runtime/print-row-filter';
import { resolveTableCellColor } from '../runtime/print-table-color';
import {
  createEmptyFooterRow,
  mergeFooterCells,
  normalizeAgreeFooters,
  splitFooterCell,
} from '../runtime/print-table-footer';
import { resolvePrintTextValue } from '../runtime/print-text-value';
import {
  buildTableHeaderColumns,
  extractTableHeaderGroups,
  flattenTableHeaderColumns,
  groupTableHeaderColumns,
  hasAgreeTableIndexColumn,
  hasMultiRowTableHeader,
  insertLeafTableColumn,
  listLeafTableCells,
  listPrintElements,
  patchElementOptions,
  patchLeafTableColumns,
  patchTableColumnFieldByIndex,
  patchTableColumns,
  setAgreeTableIndexColumnVisible,
  toTableColumnRows,
} from '../template/print-element-meta';
import DocumentLayoutPanel from './document-layout-panel.vue';
import PrintExprHelp from './print-expr-help.vue';
import PrintFieldPicker from './print-field-picker.vue';
import { describePrintField } from './print-field-tree';
import PrintFilterDialog from './print-filter-dialog.vue';
import PrintFilterPanel from './print-filter-panel.vue';
import PrintFormGridEditor from './print-form-grid-editor.vue';
import PrintStylePanel from './print-style-panel.vue';
import PrintTableSample from './print-table-sample.vue';
import { resolveTablePreview } from './template-model';

const props = defineProps<{
  /** 画布高亮的列下标 */
  highlightColIndex?: number;
  sampleData: AgreePrintData;
  selectedKey: string;
  templateJson: null | Record<string, any>;
}>();

const emit = defineEmits<{
  /** 写回模板；筛行可静默，改列/绑定需重绘画布 */
  canvasPatch: [Record<string, any>, { remount?: boolean }?];
  /** 检视器内点列时通知画布高亮 */
  highlightCol: [number];
  'update:selectedKey': [string];
}>();

/** 列 field 名像日期时给格式下拉 */
const DATE_FIELD_RE = /date|time|signDate/i;

/** 列/表尾水平对齐 */
const ALIGN_OPTIONS = [
  { label: '左', value: 'left' },
  { label: '中', value: 'center' },
  { label: '右', value: 'right' },
] as const;

/** 长文本整块显隐：只给口径可见的结构条件，数值门槛请手填 */
const TEXT_BLOCK_CONDITION_PRESETS = [
  { label: '奖励表有数据', value: 'COUNT(rewardItems) > 0' },
  { label: '被征收人不为空', value: '!EMPTY(compensatee)' },
] as const;

const TEXT_EXPR_INSERT_GROUPS = [
  {
    label: '条件',
    options: [
      {
        label: 'IF(条件, 真值, 假值)',
        value: '{{IF(rewardTotal > 0, rewardTotal, 0)}}',
      },
      {
        label: '条件 ? 真值 : 假值',
        value: '{{rewardTotal > 0 ? rewardTotal : 0}}',
      },
      {
        label: 'IFS(条件, 结果, 默认值)',
        value: '{{IFS(amount > 0, amount, 0)}}',
      },
    ],
  },
  {
    label: '格式与文本',
    options: [
      {
        label: '金额千分位',
        value: '{{FORMAT_MONEY(rewardTotal)}}',
      },
      { label: '中文日期', value: '{{FORMAT_DATE(signDate, "dateCn")}}' },
      { label: '空值兜底', value: '{{COALESCE(remark, "无备注")}}' },
      {
        label: '拼接文字',
        value: '{{CONCAT(agreementNo, " / ", compensatee)}}',
      },
    ],
  },
  {
    label: '表格汇总',
    options: [
      { label: '奖励行数', value: '{{COUNT(rewardItems)}}' },
      {
        label: '奖励金额合计',
        value: '{{SUM(rewardItems, "amount")}}',
      },
      {
        label: '奖励平均金额',
        value: '{{AVG(rewardItems, "amount")}}',
      },
    ],
  },
] as const;

const TEXT_EXPR_HELP_GROUPS = [
  {
    title: '比较与逻辑',
    lines: [
      '>、>=、<、<=、==、!=',
      '&&（并且）、||（或者）、!（取反）',
      'rewardTotal > 0、COUNT(rewardItems) > 0、!EMPTY(compensatee)',
    ],
  },
  {
    title: '条件',
    lines: [
      'IF(条件, 真值, 假值)',
      '条件 ? 真值 : 假值',
      'IFS(条件1, 结果1, 条件2, 结果2, 默认值)',
      'AND(...)、OR(...)、NOT(...)、IN(...)、NOT_IN(...)',
    ],
  },
  {
    title: '文本与格式',
    lines: [
      'CONCAT(...)、COALESCE(...)、EMPTY(...)、CONTAINS(...)',
      'LEN(...)、UPPER(...)、LOWER(...)',
      'FORMAT_MONEY(金额, 小数位)、FORMAT_DATE(日期, 格式)',
    ],
  },
  {
    title: '数字与表格',
    lines: [
      'ROUND、ABS、CEIL、FLOOR、MIN、MAX、POW、SQRT、MOD、CLAMP',
      'COUNT(表格)、SUM/AVG/MAX_COL/MIN_COL(表格, "字段")',
    ],
  },
] as const;

const activeTab = ref('data');
const filterDialogOpen = ref(false);
const fieldPickerOpen = ref(false);
const fieldPickerMode = ref<PrintFieldPickMode>('text');
const tableEditorOpen = ref(false);
/** 明细表弹窗里的筛行面板，应用到画布前先提交草稿 */
const tableFilterPanelRef = ref<null | { apply: () => boolean }>(null);
/** 底栏提交时不再为筛行单独弹成功提示 */
let flushingTableFilter = false;
/** 画布点表头后，等弹窗打开再选中对应列 */
const pendingHeaderFocus = ref<null | {
  fromLeaf: number;
  mergeId?: string;
  toLeaf: number;
}>(null);
const tableDraft = ref<null | Record<string, any>>(null);
const editingTemplate = computed(() =>
  tableEditorOpen.value && tableDraft.value
    ? tableDraft.value
    : props.templateJson,
);
const tableScope = ref('columns');
function publishPatch(
  next: Record<string, any>,
  options?: { remount?: boolean },
) {
  if (tableEditorOpen.value && tableDraft.value) tableDraft.value = next;
  else emit('canvasPatch', next, options);
}
watch(
  tableEditorOpen,
  (open) => {
    if (open) {
      tableDraft.value = props.templateJson
        ? cloneJson(props.templateJson)
        : null;
      tableScope.value = selected.value?.options.field ? 'columns' : 'rows';
    } else {
      tableDraft.value = null;
      filterDialogOpen.value = false;
      fieldPickerOpen.value = false;
    }
  },
  { flush: 'sync' },
);
/** 把明细表草稿提交到画布；先落筛选草稿，失败则停在「数据来源」 */
function applyTableDraft() {
  if (!tableDraft.value) return;
  if (tableFilterPanelRef.value && currentTableField.value) {
    flushingTableFilter = true;
    const filterOk = tableFilterPanelRef.value.apply();
    flushingTableFilter = false;
    if (filterOk === false) {
      tableScope.value = 'rows';
      return;
    }
  }
  const invalid = columns.value.findIndex((_, i) => !columnExprCheck(i).ok);
  if (invalid !== -1) {
    editingColIndex.value = invalid;
    tableScope.value = 'columns';
    ElMessage.error('请先修正当前列的计算公式');
    return;
  }
  if (!persistColumns({ silent: true, remount: false })) return;
  persistFooters({ silent: true });
  const next = cloneJson(tableDraft.value);
  const el = selected.value;
  if (!el) return;
  const result = patchElementOptions(next, el, {
    agreeVisibleWhen: agreeVisibleWhen.value.trim(),
  });
  tableEditorOpen.value = false;
  emit('canvasPatch', result, { remount: false });
}
/** 列点选时对应 columns 下标；非列模式为 -1 */
const columnPickIndex = ref(-1);
const headerGroupStart = ref(1);
const headerGroupEnd = ref(2);
const headerGroupTitle = ref('分组标题');
/**
 * 检视器里刚切换的纵向合并模式。
 * 「按条件」时若表达式尚未保存，仍靠草稿露出依据字段 / 条件输入框。
 */
const mergeModeDraftByCol = ref<Record<number, 'condition' | 'none' | 'same'>>(
  {},
);

interface ColDraft {
  rowIndex: number;
  cellIndex: number;
  title: string;
  field: string;
  width: number;
  align: 'center' | 'left' | 'right';
  tableSummary: boolean;
  agreeColExpr: string;
  agreeMergeSame: boolean;
  agreeMergeKey: string;
  agreeMergeWhen: string;
  agreeHMergeEmpty: boolean;
  agreeHideZero: boolean;
  agreeColFormat: string;
  agreeColor?: string;
  agreeHeaderColor?: string;
  agreeColorWhen?: string;
  agreeConditionColor?: string;
}

const bindField = ref('');
const bindTitle = ref('');
const textSectionsOpen = ref(false);
const textSections = ref<PrintTextSection[]>([]);
const textSectionsPreview = computed(() =>
  resolvePrintTextSections(textSections.value, sampleCtx.value),
);
function openTextSections() {
  const stored = selected.value?.options.agreeTextSections;
  textSections.value = Array.isArray(stored)
    ? stored.map((section: PrintTextSection) => ({ ...section }))
    : [];
  if (textSections.value.length === 0)
    textSections.value.push({ content: '', when: '' });
  textSectionsOpen.value = true;
}
function applyTextSections() {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  const invalid = textSections.value.find(
    (section) =>
      section.when.trim() &&
      !validatePrintExpr(section.when, sampleCtx.value).ok,
  );
  if (invalid) {
    ElMessage.warning('请先修正内容块条件');
    return;
  }
  const invalidTemplate = textSections.value.find(
    (section) =>
      !validatePrintTextTemplate(section.content, sampleCtx.value).ok,
  );
  if (invalidTemplate) {
    ElMessage.warning(
      validatePrintTextTemplate(invalidTemplate.content, sampleCtx.value)
        .message,
    );
    return;
  }
  publishPatch(
    patchElementOptions(editingTemplate.value, el, {
      agreeTextSections: textSections.value.map((section) => ({ ...section })),
    }),
  );
  textSectionsOpen.value = false;
}
function appendTextSectionField(index: number, rawField: unknown) {
  const section = textSections.value[index];
  const field = String(rawField || '');
  if (!section || !field) return;
  section.content += `{{${field}}}`;
}
function appendTextSectionExpression(index: number, rawExpression: unknown) {
  const section = textSections.value[index];
  const expression = String(rawExpression || '');
  if (!section || !expression) return;
  section.content += expression;
}
function setTextSectionCondition(index: number, rawCondition: unknown) {
  const section = textSections.value[index];
  const condition = String(rawCondition || '');
  if (!section || !condition) return;
  section.when = condition;
}
const columns = ref<ColDraft[]>([]);
const editingColIndex = ref(0);
const columnTab = ref('basic');
const tableDefaultColor = computed(() =>
  String(selected.value?.options.color || '#000000'),
);
const columnSearch = ref('');
const conditionOpen = ref<Record<number, boolean>>({});
const conditionAdvanced = ref<Record<number, boolean>>({});
const simpleColorOperator = ref('<');
const simpleColorValue = ref('0');
const filteredColumns = computed(() =>
  columns.value
    .map((col, i) => ({ col, i }))
    .filter(({ col }) =>
      `${col.title} ${col.field}`
        .toLowerCase()
        .includes(columnSearch.value.trim().toLowerCase()),
    ),
);
const selectedGroupPosition = ref<null | { cell: number; row: number }>(null);
const selectedGroupHeader = computed(() => {
  const pos = selectedGroupPosition.value;
  return pos
    ? toTableColumnRows(selected.value?.options.columns)[pos.row]?.[pos.cell]
    : undefined;
});
const headerColorTargets = computed(() => {
  if (selectedGroupPosition.value) return [selectedGroupPosition.value];
  if (!headerSelectionActive.value || headerRangeError.value) return [];
  return listLeafTableCells(selected.value?.options.columns)
    .slice(headerRange.value.start, headerRange.value.end + 1)
    .map((leaf) => ({ row: leaf.rowIndex, cell: leaf.cellIndex }));
});
const selectedHeaderColors = computed(() =>
  headerColorTargets.value.map((pos) =>
    String(
      toTableColumnRows(selected.value?.options.columns)[pos.row]?.[pos.cell]
        ?.agreeHeaderColor || '',
    ),
  ),
);
const selectedHeaderColor = computed(() => selectedHeaderColors.value[0] || '');
const headerColorsMixed = computed(
  () => new Set(selectedHeaderColors.value).size > 1,
);
const columnSamples = computed(() => {
  const el = selected.value;
  if (!el) return [];
  const model = resolveTablePreview(el.options, props.sampleData, 3);
  const col = model.leafCols[editingColIndex.value] || {};
  return model.bodyRows
    .map((row) => row.find((cell) => cell.colIndex === editingColIndex.value))
    .filter((cell): cell is NonNullable<typeof cell> => !!cell && !cell.hidden)
    .map((cell) => ({
      text: cell.text,
      color:
        resolveTableCellColor(col, cell.rawRow, sampleCtx.value) ||
        String(el.options.color || '#000000'),
    }));
});
function colorDescription(color?: string) {
  return color
    ? `自定义 · ${color}`
    : `继承整表 · ${selected.value?.options.color || '黑色'}`;
}
function selectGroupHeader(cell: Record<string, any>) {
  selectedGroupPosition.value = {
    row: cell.editorRowIndex,
    cell: cell.editorCellIndex,
  };
  headerSelectionActive.value = false;
  headerSelectionPending.value = false;
  const from = Number(cell.editorGroupFrom);
  const to = Number(cell.editorGroupTo);
  if (Number.isInteger(from) && Number.isInteger(to)) {
    headerMergeStart.value = from + 1;
    headerMergeEnd.value = to + 1;
  }
  headerMergeTitle.value = String(cell.title || '');
}
function setSelectedHeaderColor(color: null | string) {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  const rows = toTableColumnRows(
    JSON.parse(JSON.stringify(el.options.columns)),
  );
  for (const pos of headerColorTargets.value) {
    const target = rows[pos.row]?.[pos.cell];
    if (target) target.agreeHeaderColor = color || '';
  }
  publishPatch(patchTableColumns(editingTemplate.value, el, rows));
}
function parseSimpleColorRule(expression = '') {
  if (expression === 'EMPTY(value)') return { operator: 'empty', value: '' };
  const match = /^value\s*(<=|>=|==|!=|<|>)\s*(.+)$/.exec(expression);
  if (!match) return null;
  try {
    const value = JSON.parse(match[2] || '');
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    return { operator: match[1] || '==', value: String(value) };
  } catch {
    return null;
  }
}
watch(
  () => [
    editingColIndex.value,
    columns.value[editingColIndex.value]?.agreeColorWhen,
  ],
  () => {
    const col = columns.value[editingColIndex.value];
    const parsed = parseSimpleColorRule(col?.agreeColorWhen);
    simpleColorOperator.value =
      parsed?.operator || (col && isNumericDataCol(col) ? '<' : '==');
    simpleColorValue.value = parsed?.value || '';
  },
);
function useAdvancedColor(col: ColDraft, index: number) {
  return (
    conditionAdvanced.value[index] ||
    (!!col.agreeColorWhen && !parseSimpleColorRule(col.agreeColorWhen))
  );
}
function saveSimpleColorRule(col: ColDraft) {
  if (simpleColorOperator.value === 'empty')
    col.agreeColorWhen = 'EMPTY(value)';
  else {
    const value = isNumericDataCol(col)
      ? Number(simpleColorValue.value)
      : simpleColorValue.value;
    if (
      isNumericDataCol(col) &&
      (!simpleColorValue.value.trim() || !Number.isFinite(value))
    ) {
      ElMessage.warning('请输入有效的比较数值');
      return;
    }
    col.agreeColorWhen = `value ${simpleColorOperator.value} ${JSON.stringify(value)}`;
  }
  col.agreeConditionColor ||= '#dc2626';
  onColumnFlagChange();
}
function openAdvancedColor(col: ColDraft, index: number) {
  if (simpleColorOperator.value === 'empty' || simpleColorValue.value !== '')
    saveSimpleColorRule(col);
  conditionAdvanced.value[index] = true;
}
function saveAdvancedColorRule(col: ColDraft) {
  if (col.agreeColorWhen?.trim()) col.agreeConditionColor ||= '#dc2626';
  onColumnFlagChange();
}
function removeColorCondition(col: ColDraft, index: number) {
  col.agreeColorWhen = '';
  col.agreeConditionColor = '';
  conditionOpen.value[index] = false;
  conditionAdvanced.value[index] = false;
  onColumnFlagChange();
}

const columnSections = ref<string[]>([]);
const editingColumns = computed(() => {
  const col = columns.value[editingColIndex.value];
  return col ? [{ col, i: editingColIndex.value }] : [];
});
const editingExprCheck = computed(() => columnExprCheck(editingColIndex.value));
const editorHeaderRows = computed(() =>
  projectTableHeaders(selected.value?.options.columns),
);
const headerMergeStart = ref(1);
const headerMergeEnd = ref(1);
const headerMergeTitle = ref('');
const headerSelectionActive = ref(false);
const headerSelectionPending = ref(false);
const headerMerges = computed(() =>
  listHeaderMerges(selected.value?.options.columns),
);
const headerRange = computed(() => ({
  start: Math.min(headerMergeStart.value, headerMergeEnd.value) - 1,
  end: Math.max(headerMergeStart.value, headerMergeEnd.value) - 1,
}));
const selectedHeaderMerge = computed(() =>
  headerSelectionActive.value
    ? headerMerges.value.find(
        (group) =>
          group.fromLeaf === headerRange.value.start &&
          group.toLeaf === headerRange.value.end,
      )
    : undefined,
);
const headerRangeError = computed(() => {
  if (
    !headerSelectionActive.value ||
    headerRange.value.start === headerRange.value.end
  )
    return '';
  try {
    groupTableHeaderColumns(
      selected.value?.options.columns,
      headerRange.value.start,
      headerRange.value.end,
      '分组标题',
    );
    return '';
  } catch {
    try {
      mergeTableHeaders(
        selected.value?.options.columns,
        headerRange.value.start,
        headerRange.value.end,
      );
      return '';
    } catch (error: any) {
      return error?.message || '请选择同层、同一上级分组内的相邻表头';
    }
  }
});
const selectedHeaderColumns = computed(() =>
  headerSelectionActive.value
    ? columns.value
        .slice(headerRange.value.start, headerRange.value.end + 1)
        .map((col, index) => ({ col, index: headerRange.value.start + index }))
    : [],
);

watch(selectedHeaderMerge, (group) => {
  headerMergeTitle.value = group?.title || '';
});
watch(
  () => props.selectedKey,
  () => {
    clearHeaderSelection();
    columnSearch.value = '';
    conditionOpen.value = {};
    conditionAdvanced.value = {};
  },
);
watch(tableEditorOpen, (open) => {
  if (!open) clearHeaderSelection();
});

function clearHeaderSelection() {
  selectedGroupPosition.value = null;
  headerSelectionActive.value = false;
  headerSelectionPending.value = false;
  headerMergeTitle.value = '';
}
function headerIsSelected(start: number | undefined, end: number) {
  return (
    headerSelectionActive.value &&
    start !== undefined &&
    start >= headerRange.value.start &&
    end <= headerRange.value.end
  );
}
function selectExactHeaderRange() {
  selectedGroupPosition.value = null;
  headerSelectionActive.value = true;
  headerSelectionPending.value = false;
  headerMergeTitle.value = selectedHeaderMerge.value?.title || '';
}

function selectHeaderRange(start: number, end: number, event: MouseEvent) {
  selectedGroupPosition.value = null;
  if (
    headerSelectionActive.value &&
    headerSelectionPending.value &&
    !event.shiftKey &&
    start === headerRange.value.start &&
    end === headerRange.value.end
  ) {
    clearHeaderSelection();
    return;
  }
  if (
    headerSelectionActive.value &&
    (event.shiftKey || (headerSelectionPending.value && start === end))
  ) {
    const from = Math.min(headerRange.value.start, start);
    const to = Math.max(headerRange.value.end, end);
    if (from !== to) {
      try {
        groupTableHeaderColumns(
          selected.value?.options.columns,
          from,
          to,
          '分组标题',
        );
      } catch {
        try {
          mergeTableHeaders(selected.value?.options.columns, from, to);
        } catch (error: any) {
          ElMessage.warning(error?.message || '无法选择此范围');
          return;
        }
      }
    }
    headerMergeStart.value = from + 1;
    headerMergeEnd.value = to + 1;
    headerSelectionPending.value = false;
    headerMergeTitle.value = selectedHeaderMerge.value?.title || '';
  } else {
    headerMergeStart.value = start + 1;
    headerMergeEnd.value = end + 1;
    headerSelectionActive.value = true;
    headerSelectionPending.value = start === end;
    headerMergeTitle.value = selectedHeaderMerge.value?.title || '';
  }
}

/**
 * 把画布点中的表头同步到弹窗点选区
 */
function applyPendingHeaderFocus() {
  const pending = pendingHeaderFocus.value;
  if (!pending) return;
  pendingHeaderFocus.value = null;
  const { fromLeaf, toLeaf, mergeId } = pending;
  const groupCell = editorHeaderRows.value
    .flat()
    .find(
      (cell) =>
        cell.editorLeafIndex === undefined &&
        Number(cell.editorGroupFrom) === fromLeaf &&
        Number(cell.editorGroupTo) === toLeaf,
    );
  if (groupCell) {
    selectGroupHeader(groupCell);
    onColCardClick(fromLeaf, { highlightCanvas: false });
    return;
  }
  selectedGroupPosition.value = null;
  headerMergeStart.value = fromLeaf + 1;
  headerMergeEnd.value = toLeaf + 1;
  headerSelectionActive.value = true;
  headerSelectionPending.value = fromLeaf === toLeaf;
  headerMergeTitle.value =
    headerMerges.value.find(
      (group) =>
        group.id === mergeId ||
        (group.fromLeaf === fromLeaf && group.toLeaf === toLeaf),
    )?.title || '';
  onColCardClick(fromLeaf, { highlightCanvas: false });
}

function applyHeaderMerge() {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  const start = headerRange.value.start;
  const end = headerRange.value.end;
  if (end <= start && !selectedHeaderMerge.value) {
    ElMessage.warning('请点选连续两列以上的表头再合并');
    return;
  }
  const title = headerMergeTitle.value;
  const existedGroup = headerGroups.value.some(
    (group) => group.fromLeaf === start && group.toLeaf === end,
  );
  try {
    if (selectedHeaderMerge.value) {
      const nextColumns = mergeTableHeaders(
        el.options.columns,
        start,
        end,
        title,
      );
      publishPatch(patchTableColumns(editingTemplate.value, el, nextColumns));
      headerSelectionPending.value = false;
      ElMessage.success('表头标题已更新');
      return;
    }
    const grouped = groupTableHeaderColumns(
      el.options.columns,
      start,
      end,
      title,
    );
    publishPatch(patchTableColumns(editingTemplate.value, el, grouped));
    headerSelectionPending.value = false;
    ElMessage.success(
      existedGroup || selectedGroupHeader.value
        ? '表头标题已更新'
        : '已合并为分组表头，下面的数据列保持独立',
    );
  } catch (error: any) {
    try {
      const nextColumns = mergeTableHeaders(
        el.options.columns,
        start,
        end,
        title,
      );
      publishPatch(patchTableColumns(editingTemplate.value, el, nextColumns));
      headerSelectionPending.value = false;
      ElMessage.success('表头已合并，下面的数据列保持独立');
    } catch (error: any) {
      ElMessage.warning(error?.message || error?.message || '表头合并失败');
    }
  }
}

function splitSelectedHeaderStructure() {
  if (selectedHeaderMerge.value) {
    splitHeaderMerge(selectedHeaderMerge.value.id);
    return;
  }
  const index = headerGroups.value.findIndex(
    (group) =>
      group.fromLeaf === headerRange.value.start &&
      group.toLeaf === headerRange.value.end,
  );
  if (index === -1) {
    ElMessage.warning('请先点选已合并或分组的表头再拆分');
    return;
  }
  removeHeaderGroup(index);
  clearHeaderSelection();
  ElMessage.success('已恢复各列原来的表头');
}

function splitHeaderMerge(id: string) {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  publishPatch(
    patchTableColumns(
      editingTemplate.value,
      el,
      splitTableHeader(el.options.columns, id),
    ),
  );
  clearHeaderSelection();
  ElMessage.success('已恢复各列原来的表头');
}

function presetNegativeColor(col: ColDraft) {
  col.agreeColorWhen = 'value < 0';
  col.agreeConditionColor = '#dc2626';
  onColumnFlagChange();
}
function columnRuleLabels(col: ColDraft, index: number) {
  return [
    col.agreeColExpr.trim() ? '公式' : '',
    col.tableSummary ? '合计' : '',
    col.agreeColFormat ? '格式' : '',
    col.agreeColor ? '列颜色' : '',
    col.agreeColorWhen && col.agreeConditionColor ? '条件颜色' : '',
    col.agreeHideZero ? '隐藏零值' : '',
    columnMergeMode(col, index) !== 'none' || col.agreeHMergeEmpty
      ? '合并'
      : '',
  ].filter(Boolean);
}

function columnMergeSummary(col: ColDraft, index: number) {
  const mode = columnMergeMode(col, index);
  const modeLabels = {
    condition: '按条件纵向合并',
    none: '',
    same: '相同值纵向合并',
  };
  return (
    [modeLabels[mode], col.agreeHMergeEmpty ? '空单元格向左合并' : '']
      .filter(Boolean)
      .join(' · ') || '未启用'
  );
}

watch(editingColIndex, () => {
  columnSections.value = [];
});
watch(
  () => props.highlightColIndex,
  (index) => {
    if (index !== undefined && index >= 0 && index < columns.value.length) {
      editingColIndex.value = index;
    }
  },
);
/** 表尾行草稿 */
const footerRows = ref<AgreeFooterRow[]>([]);
/** 表尾编辑焦点 */
const footerFocusRow = ref(0);
const footerFocusCell = ref(0);
const rowFilter = ref('');
const agreeVisibleWhen = ref('');
/** 高级表达式输入框，用于在光标处插入字段 */
const visibleExprInputRef = ref<null | {
  textarea?: HTMLTextAreaElement;
}>(null);
const agreeFlowGroup = ref('');
const agreeFlowMode = ref<'auto' | 'fixed'>('auto');
const agreeFlowFloat = ref<'left' | 'none' | 'right'>('left');
const agreeFlowCollapse = ref(true);
const agreeFlowStretch = ref(false);
const pageFlowGroups = computed(() => {
  const groups = new Map<string, number>();
  for (const element of elements.value) {
    if (
      element.panelIndex !== selected.value?.panelIndex ||
      !isAutoFlowElement(element)
    )
      continue;
    const group = getFlowGroupName(element);
    if (group) groups.set(group, (groups.get(group) || 0) + 1);
  }
  return [...groups].map(([name, count]) => ({ name, count }));
});
const agreeFormat = ref('');
type VisibleEditorMode = 'advanced' | 'simple';
type VisibleOperator =
  | 'contains'
  | 'eq'
  | 'falsy'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'neq'
  | 'notEmpty'
  | 'truthy';
type VisibleDisplayMode = 'always' | 'never' | 'when';
const visibleEditorMode = ref<VisibleEditorMode>('simple');
/** 打不打印：与「常用 / 高级」写法分开 */
const visibleDisplayMode = ref<VisibleDisplayMode>('always');
const visibleField = ref('');
const visibleOperator = ref<VisibleOperator>('truthy');
const visibleValue = ref('');
const visibleValueInputRef = ref<null | { focus?: () => void }>(null);
const VISIBLE_OPERATORS: Array<{
  label: string;
  needsValue?: boolean;
  value: VisibleOperator;
}> = [
  { label: '为真 / 有值', value: 'truthy' },
  { label: '为假 / 无值', value: 'falsy' },
  { label: '不为空', value: 'notEmpty' },
  { label: '等于', needsValue: true, value: 'eq' },
  { label: '不等于', needsValue: true, value: 'neq' },
  { label: '大于', needsValue: true, value: 'gt' },
  { label: '大于等于', needsValue: true, value: 'gte' },
  { label: '小于', needsValue: true, value: 'lt' },
  { label: '小于等于', needsValue: true, value: 'lte' },
  { label: '包含文字', needsValue: true, value: 'contains' },
];
/** 回填列草稿时忽略 InputNumber change，避免写回循环 */
let syncingCols = false;

const elements = computed(() => listPrintElements(editingTemplate.value));

const selected = computed(() => {
  // 改绑会改变展示 key；编辑草稿始终按原模板中的元素位置定位。
  const original = listPrintElements(props.templateJson).find(
    (element) => element.key === props.selectedKey,
  );
  if (tableEditorOpen.value && original) {
    return (
      elements.value.find(
        (element) =>
          element.panelIndex === original.panelIndex &&
          element.elementIndex === original.elementIndex,
      ) || null
    );
  }
  return (
    elements.value.find((element) => element.key === props.selectedKey) || null
  );
});

const isFormGrid = computed(() => !!selected.value?.options.agreeFormGrid);
const isDocument = computed(() => isDocumentTemplate(editingTemplate.value));
const isTable = computed(
  () => selected.value?.type === 'table' && !isFormGrid.value,
);
const isTextLike = computed(
  () => selected.value?.type === 'text' || selected.value?.type === 'longText',
);
const currentBindLabel = computed(() => describePrintField(bindField.value));
const sampleCtx = computed(
  () => props.sampleData as unknown as Record<string, unknown>,
);
const visibleFields = AGREE_PRINT_ALL_FIELDS.filter(
  (item) => item.group !== 'table',
);
/** 整块显隐：协议字段 + 合计 + 整表 */
const visibleHelpFields = protocolPrintExprFields();
/** 列公式 / 颜色：当前行叶子列 */
const columnHelpFields = computed(() => rowPrintExprFields(columns.value));
const colorHelpFields = computed(() => colorPrintExprFields(columns.value));
/** 列公式输入框，芯片按光标插入 */
const columnExprInputRef = ref<null | { textarea?: HTMLTextAreaElement }>(null);
/** 颜色高级表达式输入框 */
const colorExprInputRef = ref<null | {
  input?: HTMLInputElement;
  textarea?: HTMLTextAreaElement;
}>(null);
const visibleOperatorNeedsValue = computed(
  () =>
    VISIBLE_OPERATORS.find((item) => item.value === visibleOperator.value)
      ?.needsValue === true,
);
const textFormatPreview = computed(() => {
  if (!isTextLike.value || !agreeFormat.value) return '';
  return resolvePrintTextValue(
    {
      ...selected.value?.options,
      field: bindField.value,
      agreeFormat: agreeFormat.value,
    },
    sampleCtx.value,
  );
});

const currentTableField = computed(() =>
  String(selected.value?.options?.field || bindField.value || ''),
);

const isMultiRowHeader = computed(() =>
  hasMultiRowTableHeader(selected.value?.options?.columns),
);
const headerGroups = computed(() =>
  extractTableHeaderGroups(selected.value?.options?.columns),
);
const headerLeafOptions = computed(() =>
  columns.value.map((column, index) => ({
    label: `${index + 1} · ${column.title || column.field || '未命名列'}`,
    value: index + 1,
  })),
);
const headerGroupReady = computed(
  () =>
    columns.value.length >= 2 &&
    Number.isInteger(headerGroupStart.value) &&
    Number.isInteger(headerGroupEnd.value) &&
    headerGroupStart.value !== headerGroupEnd.value,
);
const canSplitSelectedHeader = computed(
  () =>
    !!selectedHeaderMerge.value ||
    !!selectedGroupHeader.value ||
    headerGroups.value.some(
      (group) =>
        group.fromLeaf === headerRange.value.start &&
        group.toLeaf === headerRange.value.end,
    ),
);

/** 筛选下拉用叶子列（兼容多行表头） */
const filterColumns = computed(() => {
  const leaf = collectLeafColumns(selected.value?.options?.columns);
  return listFilterColumns(
    currentTableField.value,
    leaf.length > 0 ? leaf : columns.value,
  );
});

const filterRowCount = computed(() =>
  previewFilterRowCount(
    currentTableField.value,
    rowFilter.value,
    props.sampleData,
  ),
);

const filterSummary = computed(() =>
  describeFilterExpr(rowFilter.value, filterColumns.value),
);

/** 规则区芯片：一点关闭对应列，高级表达式整段清除 */
const filterChips = computed(() =>
  listFilterChips(rowFilter.value, filterColumns.value),
);

const rowSortSummary = computed(() =>
  normalizeAgreeRowSort(selected.value?.options.agreeRowSort)
    .map((rule) => {
      const title =
        filterColumns.value.find((col) => col.field === rule.field)?.title ||
        rule.field;
      return `${title}${rule.dir === 'desc' ? ' 降序' : ' 升序'}`;
    })
    .join('，'),
);

/** 表格列字段属于逐行上下文，不能直接用于整表显隐。 */
const visibleRowField = computed(() => {
  if (!isTable.value || !agreeVisibleWhen.value.trim()) return '';
  const code = agreeVisibleWhen.value.replaceAll(
    /(['"])(?:\\.|(?!\1).)*\1/g,
    '',
  );
  return (
    columns.value.find((column) => {
      const field = String(column.field || '').trim();
      return field && new RegExp(`\\b${field}\\b`).test(code);
    })?.field || ''
  );
});

/** 条件显隐校验（样例数据下将打印 / 将隐藏） */
const visibleCheck = computed(() => {
  if (visibleRowField.value) {
    return {
      message: `${visibleRowField.value} 是表体行字段；整表显隐不能直接使用它，请到“数据 → 编辑明细表”设置单元格公式。`,
      ok: false,
    };
  }
  return validatePrintExpr(agreeVisibleWhen.value, sampleCtx.value);
});

/** 样式面板只负责选项；模板写回和画布刷新在此统一处理。 */
function applyStylePatch(patch: Record<string, unknown>) {
  if (!selected.value || !editingTemplate.value) return;
  publishPatch(
    patchElementOptions(editingTemplate.value, selected.value, patch),
    { remount: false },
  );
}

/**
 * 把样例求值说成「将打印 / 将隐藏」
 * @param preview 表达式结果
 */
function visibleSampleLabel(preview: string | undefined) {
  if (preview === 'true') return '当前样例下：将打印';
  if (preview === 'false') return '当前样例下：将隐藏';
  return `当前样例求值 → ${preview}`;
}

/** 条件构建器把用户值安全转成表达式字面量。 */
function visibleLiteral(value: string) {
  const input = value.trim();
  if (/^(?:false|null|true)$/i.test(input)) return input.toLowerCase();
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$|^-?\.\d+$/.test(input)) return input;
  return JSON.stringify(input);
}

/** 从简单表达式回填条件构建器；复杂旧规则继续使用高级模式。 */
function parseSimpleVisibleExpr(expr: string) {
  const source = expr.trim();
  const allowed = new Set(visibleFields.map((item) => item.field));
  if (!source) {
    visibleField.value = '';
    visibleOperator.value = 'truthy';
    visibleValue.value = '';
    return true;
  }
  let match = /^!([A-Za-z_$][\w$]*)$/.exec(source);
  if (match?.[1] && allowed.has(match[1])) {
    visibleField.value = match[1];
    visibleOperator.value = 'falsy';
    visibleValue.value = '';
    return true;
  }
  match = /^!EMPTY\(([A-Za-z_$][\w$]*)\)$/.exec(source);
  if (match?.[1] && allowed.has(match[1])) {
    visibleField.value = match[1];
    visibleOperator.value = 'notEmpty';
    visibleValue.value = '';
    return true;
  }
  match = /^([A-Za-z_$][\w$]*)$/.exec(source);
  if (match?.[1] && allowed.has(match[1])) {
    visibleField.value = match[1];
    visibleOperator.value = 'truthy';
    visibleValue.value = '';
    return true;
  }
  match = /^CONTAINS\(([A-Za-z_$][\w$]*),\s*(.+)\)$/.exec(source);
  if (match?.[1] && match[2] && allowed.has(match[1])) {
    visibleField.value = match[1];
    visibleOperator.value = 'contains';
    visibleValue.value = decodeVisibleLiteral(match[2]);
    return true;
  }
  match = /^([A-Za-z_$][\w$]*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(source);
  if (match?.[1] && match[2] && match[3] && allowed.has(match[1])) {
    const operators: Record<string, VisibleOperator> = {
      '!=': 'neq',
      '<': 'lt',
      '<=': 'lte',
      '==': 'eq',
      '>': 'gt',
      '>=': 'gte',
    };
    visibleField.value = match[1];
    visibleOperator.value = operators[match[2]] || 'eq';
    visibleValue.value = decodeVisibleLiteral(match[3]);
    return true;
  }
  return false;
}

/** 展示表达式字面量时去掉 JSON 引号。 */
function decodeVisibleLiteral(source: string) {
  const input = source.trim();
  try {
    const parsed = JSON.parse(input);
    return String(parsed ?? '');
  } catch {
    if (
      (input.startsWith("'") && input.endsWith("'")) ||
      (input.startsWith('"') && input.endsWith('"'))
    ) {
      return input.slice(1, -1);
    }
    return input;
  }
}

/** 应用可视化条件并立即同步画布。 */
function applySimpleVisibleRule() {
  if (!visibleField.value) {
    ElMessage.warning('请先选择判断字段');
    return;
  }
  if (visibleOperatorNeedsValue.value && !visibleValue.value.trim()) {
    ElMessage.warning('请输入比较值');
    return;
  }
  const field = visibleField.value;
  const value = visibleLiteral(visibleValue.value);
  const operators: Partial<Record<VisibleOperator, string>> = {
    eq: '==',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    neq: '!=',
  };
  if (visibleOperator.value === 'truthy') agreeVisibleWhen.value = field;
  else if (visibleOperator.value === 'falsy')
    agreeVisibleWhen.value = `!${field}`;
  else if (visibleOperator.value === 'notEmpty')
    agreeVisibleWhen.value = `!EMPTY(${field})`;
  else if (visibleOperator.value === 'contains')
    agreeVisibleWhen.value = `CONTAINS(${field}, ${value})`;
  else
    agreeVisibleWhen.value = `${field} ${operators[visibleOperator.value]} ${value}`;
  persistRules({ silent: true });
  visibleDisplayMode.value = 'when';
}

/** 清除条件意味着该元素始终显示。 */
function clearVisibleRule() {
  agreeVisibleWhen.value = '';
  parseSimpleVisibleExpr('');
  visibleEditorMode.value = 'simple';
  visibleDisplayMode.value = 'always';
  persistRules({ silent: true });
}

/** 按表达式回填显示状态（选中元素或写回后） */
function syncVisibleDisplayFromExpr() {
  const expr = agreeVisibleWhen.value.trim();
  if (!expr) visibleDisplayMode.value = 'always';
  else if (expr === 'false') visibleDisplayMode.value = 'never';
  else visibleDisplayMode.value = 'when';
}

/**
 * 切换打不打印。按条件时不立刻写死公式，等用户应用。
 * @param mode always | when | never
 */
function setVisibleDisplayMode(mode: VisibleDisplayMode) {
  if (mode === 'always') {
    clearVisibleRule();
    return;
  }
  if (mode === 'never') {
    agreeVisibleWhen.value = 'false';
    visibleDisplayMode.value = 'never';
    persistRules({ silent: true });
    return;
  }
  visibleDisplayMode.value = 'when';
  if (agreeVisibleWhen.value.trim() === 'false') {
    agreeVisibleWhen.value = '';
    parseSimpleVisibleExpr('');
    visibleEditorMode.value = 'simple';
    persistRules({ silent: true });
  }
}

function setVisibleEditorMode(mode: VisibleEditorMode) {
  visibleEditorMode.value = mode;
  if (mode === 'simple' && !parseSimpleVisibleExpr(agreeVisibleWhen.value)) {
    visibleField.value = '';
    visibleOperator.value = 'truthy';
    visibleValue.value = '';
    ElMessage.info('原高级表达式仍保留；应用新的常用条件后才会替换');
  }
}

const visibleAlertType = computed(() => {
  if (!visibleCheck.value.ok) return 'error' as const;
  if (visibleCheck.value.preview === 'false') return 'warning' as const;
  return 'success' as const;
});

function columnExprCheck(colIndex: number) {
  const source = (props.sampleData as unknown as Record<string, unknown>)[
    currentTableField.value
  ];
  const first = Array.isArray(source)
    ? ({ ...source[0] } as Record<string, unknown>)
    : {};
  const root = props.sampleData as unknown as Record<string, unknown>;
  for (let index = 0; index < colIndex; index += 1) {
    const col = columns.value[index];
    if (!col?.field || !col.agreeColExpr.trim()) continue;
    first[col.field] = evalPrintExpr(
      col.agreeColExpr,
      { ...root, ...first, i: 0, index: 0, row: first },
      { silent: true },
    );
  }
  const expr = columns.value[colIndex]?.agreeColExpr || '';
  return validatePrintExpr(expr, {
    ...root,
    ...first,
    i: 0,
    index: 0,
    row: first,
  });
}

/** 选中元素变化时回填表单（不因画布刷新把 Tab 打回数据） */
watch(
  () => [props.selectedKey, editingTemplate.value] as const,
  (current, previous) => {
    const el = selected.value;
    if (!el) return;
    // 对话框内修改样式或结构时，保留尚未提交的绑定/显示条件输入。
    const draftRefresh =
      tableEditorOpen.value &&
      previous?.[0] === current[0] &&
      previous?.[1] !== props.templateJson;
    if (!draftRefresh) {
      bindField.value = String(el.options.field || '');
      bindTitle.value = String(el.options.title || '');
      rowFilter.value = String(el.options.agreeRowFilter || '');
      agreeVisibleWhen.value = String(el.options.agreeVisibleWhen || '');
    }
    visibleEditorMode.value = parseSimpleVisibleExpr(agreeVisibleWhen.value)
      ? 'simple'
      : 'advanced';
    const selectedChanged = previous?.[0] !== current[0];
    const composingWhen =
      visibleDisplayMode.value === 'when' &&
      !String(el.options.agreeVisibleWhen || '').trim();
    // 点「按条件」会先清空公式；同元素刷新时不要把 UI 打回始终显示
    if (selectedChanged || !composingWhen) syncVisibleDisplayFromExpr();
    agreeFlowGroup.value = String(el.options.agreeFlowGroup || '');
    agreeFlowMode.value = isAutoFlowElement(el) ? 'auto' : 'fixed';
    const settings = getFlowGroupSettings(
      agreeFlowGroup.value
        ? elements.value.filter(
            (item) =>
              isAutoFlowElement(item) &&
              item.panelIndex === el.panelIndex &&
              getFlowGroupName(item) === agreeFlowGroup.value,
          )
        : [el],
    );
    agreeFlowFloat.value = settings.float;
    agreeFlowCollapse.value = isDocument.value
      ? el.options.agreeFlowCollapse !== false
      : settings.collapse;
    agreeFlowStretch.value = settings.stretch;
    agreeFormat.value = String(el.options.agreeFormat || '');
    syncingCols = true;
    mergeModeDraftByCol.value = {};
    columns.value = listLeafTableCells(el.options.columns).map((c) => ({
      rowIndex: c.rowIndex,
      cellIndex: c.cellIndex,
      title: c.title,
      field: c.field,
      width: c.width,
      align: c.align,
      tableSummary: c.tableSummary,
      agreeColExpr: c.agreeColExpr,
      agreeMergeSame: c.agreeMergeSame,
      agreeMergeKey: c.agreeMergeKey,
      agreeMergeWhen: c.agreeMergeWhen,
      agreeHMergeEmpty: c.agreeHMergeEmpty,
      agreeHideZero: c.agreeHideZero,
      agreeColFormat: c.agreeColFormat,
      agreeColor: c.agreeColor,
      agreeHeaderColor: c.agreeHeaderColor,
      agreeColorWhen: c.agreeColorWhen,
      agreeConditionColor: c.agreeConditionColor,
    }));
    const leafCount = columns.value.length;
    headerMergeStart.value = Math.max(
      1,
      Math.min(headerMergeStart.value, leafCount),
    );
    headerMergeEnd.value = Math.max(
      1,
      Math.min(headerMergeEnd.value, leafCount),
    );
    editingColIndex.value = Math.max(
      0,
      Math.min(editingColIndex.value, leafCount - 1),
    );
    headerGroupStart.value = Math.min(
      Math.max(1, headerGroupStart.value || 1),
      Math.max(1, leafCount),
    );
    headerGroupEnd.value = Math.min(
      Math.max(1, headerGroupEnd.value || 2),
      Math.max(1, leafCount),
    );
    if (leafCount >= 2 && headerGroupStart.value === headerGroupEnd.value) {
      headerGroupEnd.value =
        headerGroupStart.value < leafCount
          ? headerGroupStart.value + 1
          : headerGroupStart.value - 1;
    }
    footerRows.value = normalizeAgreeFooters(
      el.options.agreeFooters as AgreeFooterRow[] | undefined,
      columns.value.length,
    );
    void nextTick(() => {
      syncingCols = false;
    });
  },
  { immediate: true },
);

/** 换元素时停在数据 Tab，避免一选表格就跳到筛行 */
watch(
  () => props.selectedKey,
  () => {
    tableEditorOpen.value = false;
    editingColIndex.value = 0;
    columnSections.value = [];
    textSectionsOpen.value = false;
    if (selected.value) activeTab.value = 'data';
  },
);

/**
 * 外部点选字段字典
 * @param item 字段项
 */
function applyDictionaryPick(item: AgreePrintFieldItem) {
  if (item.group === 'derived') {
    void navigator.clipboard?.writeText(item.field).catch(() => undefined);
    ElMessage.info(
      `「${item.text}」(${item.field}) 用于「规则」里的条件显隐，已复制字段名。请不要绑到纸面文本。`,
    );
    return;
  }
  if (!selected.value) {
    ElMessage.warning(
      '单击字段可自动添加，拖到画布可精准定位；选中文本后再点字段可改绑',
    );
    return;
  }
  if (isTable.value) {
    if (item.group === 'table') {
      bindField.value = item.field;
      void applyTableSource(tableColumnsLookLikePlaceholder());
      return;
    }
    ElMessage.info(
      '当前是表格：请点「选择表格」，或左侧数据源里的房屋/补偿/奖励',
    );
    return;
  }
  if (isTextLike.value) {
    if (item.group === 'table') {
      ElMessage.info('文本请绑定主表字段；表格请先拖「表格」组件');
      return;
    }
    bindField.value = item.field;
    if (!bindTitle.value || bindTitle.value === '未绑定') {
      bindTitle.value = item.text;
    }
    void applyTextBind();
    return;
  }
  ElMessage.info('横线/矩形等装饰无需绑定数据');
}

/**
 * 画布点表头：打开明细表弹窗并选中对应列/分组
 * @param opts.fromLeaf 叶子列起点
 * @param opts.toLeaf 叶子列终点
 * @param opts.mergeId 已合并表头 id
 */
function openTableEditor(opts?: {
  fromLeaf?: number;
  mergeId?: string;
  toLeaf?: number;
}) {
  activeTab.value = 'data';
  pendingHeaderFocus.value = Number.isInteger(opts?.fromLeaf)
    ? {
        fromLeaf: Number(opts?.fromLeaf),
        toLeaf: Number.isInteger(opts?.toLeaf)
          ? Number(opts?.toLeaf)
          : Number(opts?.fromLeaf),
        mergeId: opts?.mergeId,
      }
    : null;
  tableEditorOpen.value = true;
  tableScope.value = 'columns';
  void nextTick(() => {
    void nextTick(applyPendingHeaderFocus);
  });
}

defineExpose({
  applyDictionaryPick,
  /**
   * 画布点列后滚到对应列卡片
   * @param colIndex 列下标
   */
  focusColumn(colIndex: number) {
    activeTab.value = 'data';
    onColCardClick(colIndex);
    void nextTick(() => {
      document
        .querySelector(`.print-inspector__col[data-col-index="${colIndex}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  },
  /**
   * 画布点表尾后定位编辑焦点
   * @param rowIndex 表尾行
   * @param cellIndex 表尾格
   */
  focusFooterCell(rowIndex: number, cellIndex: number) {
    activeTab.value = 'data';
    footerFocusRow.value = rowIndex;
    footerFocusCell.value = cellIndex;
    void nextTick(() => {
      document
        .querySelector('.print-inspector__footer')
        ?.scrollIntoView({ block: 'nearest' });
    });
  },
  /** 画布列头「更多条件」打开完整筛行（不套在明细表弹窗里） */
  openFilterDialog,
  openTableEditor,
});

/**
 * 打开点选树：改已有元素绑定（拖放仍负责新建）
 * @param mode 文本 / 整表 / 列
 * @param colIndex 列模式下的列下标
 */
function openFieldPicker(mode: PrintFieldPickMode, colIndex = -1) {
  if (!selected.value) {
    ElMessage.warning('请先点纸面上的文本或表格');
    return;
  }
  fieldPickerMode.value = mode;
  columnPickIndex.value = colIndex;
  fieldPickerOpen.value = true;
}

/**
 * 弹窗点中字段：立即写回画布
 * @param node 树节点
 */
function onFieldPicked(node: PrintFieldTreeNode) {
  const field = String(node.field || '').trim();
  if (!field) return;
  if (fieldPickerMode.value === 'text') {
    bindField.value = field;
    if (!bindTitle.value || bindTitle.value === '未绑定') {
      bindTitle.value = node.text || field;
    }
    void applyTextBind();
    return;
  }
  if (fieldPickerMode.value === 'table') {
    bindField.value = field;
    void applyTableSource(tableColumnsLookLikePlaceholder());
    return;
  }
  const idx = columnPickIndex.value;
  if (idx < 0 || !columns.value[idx]) return;
  const prevField = columns.value[idx].field;
  columns.value[idx].field = field;
  if (!columns.value[idx].title || columns.value[idx].title === '新列') {
    columns.value[idx].title = node.text || field;
  }
  void applyColumnField(idx, prevField);
}

/** 当前列还是占位时，换表才套推荐列，避免冲掉已配的双行表头 */
function tableColumnsLookLikePlaceholder() {
  if (columns.value.length === 0) return true;
  return columns.value.every((c) => {
    const f = c.field.trim();
    return (
      !f ||
      f === 'name' ||
      f === 'amount' ||
      /^列\d+$/.test(f) ||
      /^col\d+$/.test(f) ||
      /^col\d+_\d+$/.test(f)
    );
  });
}

/**
 * 只改一列 field，不重写整表 columns
 * @param index 列下标
 * @param prevField 改之前的 field
 */
function applyColumnField(index: number, prevField: string) {
  const el = selected.value;
  const col = columns.value[index];
  if (!el || !col || !editingTemplate.value) return;
  try {
    const next = patchTableColumnFieldByIndex(
      editingTemplate.value,
      el,
      index,
      prevField,
      { field: col.field.trim(), title: col.title.trim() },
      { rowIndex: col.rowIndex, cellIndex: col.cellIndex },
    );
    publishPatch(next);
    ElMessage.success(`已绑定列「${col.title || col.field}」`);
  } catch (error: any) {
    ElMessage.error(error?.message || '绑定列字段失败');
  }
}

/** 应用文本/码图绑定 */
function applyTextBind() {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  const dict = AGREE_PRINT_ALL_FIELDS.find((f) => f.field === bindField.value);
  const textType = ['barcode', 'qrcode'].includes(String(el.options.textType))
    ? el.options.textType
    : dict?.textType || '';
  const next = patchElementOptions(editingTemplate.value, el, {
    field: bindField.value.trim(),
    title: bindTitle.value.trim() || dict?.text || '文本',
    testData: dict?.testData || '',
    textType,
    ...(textType === 'qrcode'
      ? { hideTitle: true, qrcodeLevel: el.options.qrcodeLevel ?? 1 }
      : {}),
    ...(textType === 'barcode'
      ? {
          hideTitle: true,
          barcodeMode: el.options.barcodeMode || 'CODE128',
          barAutoWidth: true,
        }
      : {}),
  });
  publishPatch(next);
  ElMessage.success('已绑定数据');
}

/**
 * 应用表格数据源
 * @param usePreset 是否套用推荐列（会变成单行表头）
 */
async function applyTableSource(usePreset: boolean) {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  const field = bindField.value.trim();
  if (!field) {
    ElMessage.warning('请选择表格数据源');
    return;
  }
  let next = patchElementOptions(editingTemplate.value, el, {
    field,
    agreeRowFilter: rowFilter.value.trim(),
  });
  const populateColumns =
    usePreset || (!el.options.field && tableColumnsLookLikePlaceholder());
  if (populateColumns && TABLE_COLUMN_PRESETS[field]) {
    if (hasMultiRowTableHeader(el.options.columns)) {
      try {
        await ElMessageBox.confirm(
          '当前表格是多行表头（如「项目信息 / 计价信息」）。套用推荐列会变成单行，分组标题会丢失。是否继续？',
          '套用推荐列',
          { type: 'warning' },
        );
      } catch {
        return;
      }
    }
    next = patchTableColumns(next, el, buildPresetTableColumns(field));
  }
  publishPatch(next);
  ElMessage.success(
    tableEditorOpen.value
      ? '已更新数据源预览，请点击「应用到画布」完成修改'
      : populateColumns && TABLE_COLUMN_PRESETS[field]
        ? '已绑定数据源并套用推荐列'
        : '已绑定表格数据源',
  );
}

/** 保存列映射：按格子补丁，不拍扁多行表头 */
function persistColumns(opts?: { remount?: boolean; silent?: boolean }) {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  const source = (props.sampleData as unknown as Record<string, unknown>)[
    currentTableField.value
  ];
  const firstRow =
    Array.isArray(source) && source[0] && typeof source[0] === 'object'
      ? (source[0] as Record<string, unknown>)
      : {};
  const mergeCheckContext = {
    ...sampleCtx.value,
    ...firstRow,
    i: 0,
    index: 0,
    row: firstRow,
  };
  const invalidColor = columns.value.find(
    (column) =>
      column.agreeColorWhen?.trim() &&
      !validatePrintExpr(column.agreeColorWhen, {
        ...mergeCheckContext,
        value: firstRow[column.field],
      }).ok,
  );
  if (invalidColor) {
    ElMessage.error('颜色条件无效，请检查字段、比较符或函数');
    return;
  }
  const invalidMerge = columns.value.find(
    (column) =>
      column.agreeMergeWhen.trim() &&
      !validatePrintExpr(column.agreeMergeWhen, mergeCheckContext).ok,
  );
  if (invalidMerge) {
    ElMessage.error('纵向合并条件无效，请检查字段、比较符或函数');
    return;
  }
  const unfinishedCondition = columns.value.find((column, index) => {
    return (
      columnMergeMode(column, index) === 'condition' &&
      !column.agreeMergeWhen.trim()
    );
  });
  if (unfinishedCondition) {
    ElMessage.error("按条件合并请填写合并条件，例如 category == 'a1'");
    return;
  }
  const next = patchLeafTableColumns(editingTemplate.value, el, columns.value);
  const withFilter = patchElementOptions(next, el, {
    field: bindField.value.trim(),
    agreeRowFilter: rowFilter.value.trim(),
  });
  publishPatch(withFilter, { remount: opts?.remount !== false });
  if (!opts?.silent)
    ElMessage.success(
      tableEditorOpen.value ? '已更新编辑预览' : '列配置已应用到画布',
    );
  return true;
}

/**
 * 数值列（不含序号）才显示合计 / 零不印
 * @param col 当前列草稿
 */
function isNumericDataCol(col: ColDraft) {
  const field = String(col.field || '').trim();
  if (!field || field === 'index') return false;
  return isNumericPrintField(field, {
    align: col.align,
    tableSummary: col.tableSummary,
  });
}

/**
 * 金额/日期列显示格式下拉；文本列隐藏，已误存格式时仍显示以便清空
 * @param col 当前列草稿
 */
function showColFormat(col: ColDraft) {
  if (String(col.agreeColFormat || '').trim()) return true;
  const field = String(col.field || '').trim();
  if (!field || field === 'index') return false;
  if (DATE_FIELD_RE.test(field)) return true;
  return isNumericPrintField(field, {
    align: col.align,
    tableSummary: col.tableSummary,
  });
}

/** 标题 / field / 宽 / 对齐：写回并刷新表头与预览 */
function onColumnMetaChange() {
  if (syncingCols) return;
  persistColumns({ remount: true, silent: true });
}

/** 合并 / 隐零 / 格式 / 对齐：立刻写回，预览才能读到 */
function onColumnFlagChange() {
  persistColumns({ remount: false, silent: true });
}

/**
 * 读列的纵向合并模式（草稿优先，便于「按条件」尚未填表达式时仍露出输入框）
 * @param col 列草稿
 * @param index 列下标
 */
function columnMergeMode(
  col: ColDraft,
  index: number,
): 'condition' | 'none' | 'same' {
  const draft = mergeModeDraftByCol.value[index];
  if (draft) return draft;
  if (col.agreeMergeWhen.trim()) return 'condition';
  if (col.agreeMergeSame || col.agreeMergeKey.trim()) return 'same';
  return 'none';
}

/**
 * 切换纵向合并模式并写回列配置
 * @param col 列草稿
 * @param index 列下标
 * @param value none | same | condition
 */
function setColumnMergeMode(col: ColDraft, index: number, value: string) {
  const mode =
    value === 'condition' || value === 'same' || value === 'none'
      ? value
      : 'none';
  mergeModeDraftByCol.value = {
    ...mergeModeDraftByCol.value,
    [index]: mode,
  };
  if (mode === 'none') {
    col.agreeMergeSame = false;
    col.agreeMergeKey = '';
    col.agreeMergeWhen = '';
  } else if (mode === 'same') {
    col.agreeMergeSame = true;
    col.agreeMergeWhen = '';
  } else {
    // 条件合并：挂在列上，不要求每个单元格单独绑字段
    col.agreeMergeSame = false;
    if (!col.agreeMergeWhen.trim()) {
      const field = col.field.trim() || 'category';
      col.agreeMergeWhen = `${field} == 'a1'`;
    }
  }
  onColumnFlagChange();
}

function onColumnExprChange(colIndex: number) {
  const check = columnExprCheck(colIndex);
  if (!check.ok) {
    ElMessage.error(`列公式未写入：${check.message}`);
    return;
  }
  persistColumns({ remount: false, silent: true });
}

function applyColumnExprPreset(colIndex: number, expr: string) {
  const col = columns.value[colIndex];
  if (!col) return;
  col.agreeColExpr = expr;
  onColumnExprChange(colIndex);
}

/** 当前列空值显示为斜杠 */
function emptySlashColumnExpr(field: string) {
  const name = field.trim() || 'amount';
  return `IF(EMPTY(${name}), "/", ${name})`;
}

function createHeaderGroup() {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  if (!headerGroupReady.value) {
    ElMessage.warning('请选择两个不同的叶子列作为分组起点和终点');
    return;
  }
  try {
    const from = Math.min(headerGroupStart.value, headerGroupEnd.value);
    const to = Math.max(headerGroupStart.value, headerGroupEnd.value);
    if (
      headerMerges.value.some(
        (group) =>
          group.toLeaf >= from - 1 &&
          group.fromLeaf <= to - 1 &&
          (group.fromLeaf < from - 1 || group.toLeaf > to - 1),
      )
    ) {
      ElMessage.warning('分组边界不能穿过已合并表头，请先拆分表头');
      return;
    }
    const grouped = groupTableHeaderColumns(
      el.options.columns,
      from - 1,
      to - 1,
      headerGroupTitle.value,
    );
    publishPatch(patchTableColumns(editingTemplate.value, el, grouped));
    ElMessage.success(
      `已将第 ${from}–${to} 列设为“${headerGroupTitle.value.trim() || '分组标题'}”分组`,
    );
  } catch (error: any) {
    ElMessage.error(error?.message || '创建分组表头失败');
  }
}

function flattenHeader() {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  const flattened = flattenTableHeaderColumns(el.options.columns);
  publishPatch(patchTableColumns(editingTemplate.value, el, flattened));
  ElMessage.success('已转为单行表头，叶子列字段与公式保持不变');
}

function removeHeaderGroup(groupIndex: number) {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  const groups = extractTableHeaderGroups(el.options.columns).filter(
    (_, index) => index !== groupIndex,
  );
  const leaves = flattenTableHeaderColumns(el.options.columns)[0] || [];
  const nextColumns = buildTableHeaderColumns(leaves, groups);
  publishPatch(patchTableColumns(editingTemplate.value, el, nextColumns));
}

/**
 * 写入显隐 / 回流 / 文本格式，不改筛行，不重绘画布
 * @param opts.silent 不弹成功提示（失焦、点预设）
 */
function persistRules(opts?: { silent?: boolean }) {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  const next = patchElementOptions(editingTemplate.value, el, {
    agreeVisibleWhen: agreeVisibleWhen.value.trim(),
    ...(isTextLike.value ? { agreeFormat: agreeFormat.value.trim() } : {}),
  });
  publishPatch(next, { remount: false });
  if (!opts?.silent) {
    ElMessage.success('规则已应用到画布和打印预览');
  }
}

/** 失焦 / 下拉变更时静默写回（避免 ElSelect 把值当成 opts） */
function persistRulesSilent() {
  persistRules({ silent: true });
}

/** 排版方式与分组独立；固定位置无需退出或重新创建组。 */
function persistFlowMode() {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  publishPatch(
    patchElementOptions(editingTemplate.value, el, {
      agreeFlowMode: agreeFlowMode.value,
    }),
    { remount: false },
  );
}

/** 加入已有组时继承其设置；退出组仍参与正文自动补位。 */
function persistFlowGroup() {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  const group = String(agreeFlowGroup.value || '').trim();
  const settings = getFlowGroupSettings(
    elements.value.filter(
      (item) =>
        isAutoFlowElement(item) &&
        item.key !== el.key &&
        item.panelIndex === el.panelIndex &&
        getFlowGroupName(item) === group,
    ),
  );
  publishPatch(
    patchElementOptions(editingTemplate.value, el, {
      agreeFlowGroup: group,
      agreeFlowFloat: group ? settings.float : null,
      agreeFlowCollapse: group ? settings.collapse : agreeFlowCollapse.value,
      agreeFlowStretch: group ? settings.stretch : null,
    }),
    { remount: false },
  );
}

/** 组级设置一次同步到当前页的全部同组元素。 */
function persistFlowFloat() {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  const group = agreeFlowGroup.value.trim();
  const targets =
    group && !isDocument.value
      ? elements.value.filter(
          (item) =>
            item.panelIndex === el.panelIndex &&
            isAutoFlowElement(item) &&
            String(item.options.agreeFlowGroup || '').trim() === group,
        )
      : [el];
  let next = editingTemplate.value;
  for (const target of targets) {
    next = patchElementOptions(next, target, {
      agreeFlowFloat: agreeFlowFloat.value,
      agreeFlowCollapse: agreeFlowCollapse.value,
      agreeFlowStretch: agreeFlowStretch.value,
    });
  }
  publishPatch(next, { remount: false });
}

/**
 * 在高级表达式光标处插入字段或运算符片段
 * @param token 插入文本，如 rewardTotal、 &&
 */
function insertVisibleExprToken(token: string) {
  agreeVisibleWhen.value = applyPrintExprInsert(
    agreeVisibleWhen.value || '',
    token,
    printExprInputEl(visibleExprInputRef.value),
  );
  persistRulesSilent();
  syncVisibleDisplayFromExpr();
}

/**
 * 把帮助芯片插入当前列逐行公式
 * @param token 字段名或函数骨架
 */
function insertColumnExprToken(token: string) {
  const col = columns.value[editingColIndex.value];
  if (!col) return;
  col.agreeColExpr = applyPrintExprInsert(
    col.agreeColExpr || '',
    token,
    printExprInputEl(columnExprInputRef.value),
  );
}

/**
 * 把帮助芯片插入当前列颜色条件
 * @param token 字段名或函数骨架
 */
function insertColorExprToken(token: string) {
  const col = columns.value[editingColIndex.value];
  if (!col) return;
  col.agreeColorWhen = applyPrintExprInsert(
    col.agreeColorWhen || '',
    token,
    printExprInputEl(colorExprInputRef.value),
  );
}

/** 高级表达式失焦：空公式视为始终显示 */
function onVisibleExprBlur() {
  persistRulesSilent();
  syncVisibleDisplayFromExpr();
}

/**
 * 打开筛选弹窗（表格主操作）
 */
function openFilterDialog() {
  if (!isTable.value) {
    ElMessage.warning('请先选中一张表格');
    return;
  }
  if (!currentTableField.value) {
    ElMessage.warning('请先在「数据」里绑定房屋 / 补偿 / 奖励');
    return;
  }
  filterDialogOpen.value = true;
}

/**
 * 只写入 agreeRowFilter，不改列定义，避免把合并表头拍扁
 * @param expr 过滤表达式，空串表示清除
 */
function applyFilterExpr(expr: string) {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  rowFilter.value = expr;
  const next = patchElementOptions(editingTemplate.value, el, {
    agreeRowFilter: expr.trim(),
  });
  publishPatch(next, { remount: false });
  if (flushingTableFilter) return;
  ElMessage.success(
    expr.trim()
      ? tableEditorOpen.value
        ? '已更新筛选预览'
        : '已筛选打印行，画布已同步显示筛选后的样例'
      : '已清除筛选，将打印全部行',
  );
}

/** 关掉一颗芯片：去掉该列条件，高级表达式则整段清空 */
function removeFilterChip(chip: { advanced: boolean; field: string }) {
  if (chip.advanced || !chip.field) {
    applyFilterExpr('');
    return;
  }
  const next = upsertFieldFilter(rowFilter.value, chip.field, null);
  applyFilterExpr(next.blocked ? '' : next.expr);
}

/** 在指定列右侧加列；多层表头会同步扩展所属分组。 */
function addEmptyColumn(afterIndex = columns.value.length - 1) {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  try {
    const newColumn = {
      align: 'center',
      field: '',
      title: '新列',
      width: 80,
    } as const;
    const next =
      columns.value.length > 0
        ? insertLeafTableColumn(
            editingTemplate.value,
            el,
            afterIndex,
            newColumn,
          )
        : patchTableColumns(editingTemplate.value, el, [[newColumn]]);
    publishPatch(next);
    editingColIndex.value = afterIndex + 1;
    ElMessage.success('已在右侧新增一列，请设置表头、字段或公式');
  } catch (error: any) {
    ElMessage.error(error?.message || '新增列失败');
  }
}

function removeColumn(index: number) {
  if (columns.value.length <= 1) {
    ElMessage.info('表格至少需要保留一列');
    return;
  }
  columns.value.splice(index, 1);
  mergeModeDraftByCol.value = {};
  editingColIndex.value = Math.max(
    0,
    Math.min(index, columns.value.length - 1),
  );
  persistColumns({ remount: true, silent: true });
}

/** 当前表格是否已配置序号列 */
const showIndexColumn = computed(() =>
  hasAgreeTableIndexColumn(selected.value?.options?.columns),
);

/**
 * 开关表格自增序号列（最左侧 field=index）
 * @param visible 是否显示
 */
function onToggleIndexColumn(visible: boolean | number | string) {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  try {
    const next = setAgreeTableIndexColumnVisible(
      editingTemplate.value,
      el,
      Boolean(visible),
    );
    publishPatch(next);
    ElMessage.success(
      visible
        ? '已显示自增序号列'
        : '已隐藏序号列（数据仍保留 index，仅不打印）',
    );
  } catch (error: any) {
    ElMessage.error(error?.message || '切换序号列失败');
  }
}

/**
 * 写回表尾行 agreeFooters（不重挂，画布覆盖层刷新即可）
 */
function persistFooters(opts?: { silent?: boolean }) {
  const el = selected.value;
  if (!el || !editingTemplate.value) return;
  const normalized = normalizeAgreeFooters(
    footerRows.value,
    columns.value.length || 1,
  );
  footerRows.value = normalized;
  const next = patchElementOptions(editingTemplate.value, el, {
    /** 空则用 null 触发清除（patch 对 ''/null 会删 key） */
    agreeFooters: normalized.length > 0 ? normalized : null,
  });
  publishPatch(next, { remount: false });
  if (!opts?.silent) ElMessage.success('表尾行已写入');
}

function addNoteFooter() {
  footerRows.value = [
    ...footerRows.value,
    {
      cells: [
        {
          text: '备注：',
          colspan: Math.max(1, columns.value.length),
          align: 'left',
        },
      ],
    },
  ];
  footerFocusRow.value = footerRows.value.length - 1;
  footerFocusCell.value = 0;
  persistFooters({ silent: true });
}

/** 添加一行「每列一格」的表尾 */
function addFooterRow() {
  const n = Math.max(1, columns.value.length);
  footerRows.value = [...footerRows.value, createEmptyFooterRow(n)];
  persistFooters({ silent: true });
  ElMessage.success('已添加表尾行，可编辑文案或合并格子');
}

/**
 * 删除表尾行
 * @param rowIndex 行下标
 */
function removeFooterRow(rowIndex: number) {
  footerRows.value = footerRows.value.filter((_, i) => i !== rowIndex);
  persistFooters({ silent: true });
}

/**
 * 与右侧一格合并（结构 colspan）
 * @param rowIndex 行
 * @param cellIndex 格
 */
function mergeFooterWithNext(rowIndex: number, cellIndex: number) {
  const row = footerRows.value[rowIndex];
  if (!row || cellIndex >= row.cells.length - 1) {
    ElMessage.warning('右侧没有可合并的格子');
    return;
  }
  const nextRows = footerRows.value.map((r, i) =>
    i === rowIndex
      ? mergeFooterCells(r, cellIndex, cellIndex + 1)
      : { cells: r.cells.map((c) => ({ ...c })) },
  );
  footerRows.value = nextRows;
  footerFocusRow.value = rowIndex;
  footerFocusCell.value = cellIndex;
  persistFooters({ silent: true });
}

/**
 * 拆分当前格
 * @param rowIndex 行
 * @param cellIndex 格
 */
function splitFooterAt(rowIndex: number, cellIndex: number) {
  const row = footerRows.value[rowIndex];
  if (!row) return;
  const cell = row.cells[cellIndex];
  if (!cell || cell.colspan <= 1) {
    ElMessage.warning('该格未合并，无需拆分');
    return;
  }
  const nextRows = footerRows.value.map((r, i) =>
    i === rowIndex
      ? splitFooterCell(r, cellIndex)
      : { cells: r.cells.map((c) => ({ ...c })) },
  );
  footerRows.value = nextRows;
  persistFooters({ silent: true });
}

/**
 * 表尾格失焦写回
 * @param cell 格子
 */
function onFooterCellBlur(_cell: AgreeFooterCell) {
  persistFooters({ silent: true });
}

/**
 * 点列卡片时选中该列；画布点表头时不要连带高亮整列数据格
 * @param colIndex 列下标
 * @param options.highlightCanvas 为 false 时只改弹窗焦点，不通知画布涂列
 */
function onColCardClick(
  colIndex: number,
  options?: { highlightCanvas?: boolean },
) {
  editingColIndex.value = colIndex;
  if (options?.highlightCanvas !== false) emit('highlightCol', colIndex);
}

function onSelectElement(key: string) {
  emit('update:selectedKey', key);
}

function elementTypeLabel(el: PrintElementRef) {
  return el.label;
}
</script>

<template>
  <div class="print-inspector">
    <div class="print-inspector__title">元素属性</div>
    <ElSelect
      :model-value="selectedKey"
      filterable
      class="mb-2 w-full"
      placeholder="选择要编辑的画布元素"
      @update:model-value="onSelectElement"
    >
      <ElOption
        v-for="el in elements"
        :key="el.key"
        :label="elementTypeLabel(el)"
        :value="el.key"
      />
    </ElSelect>

    <div v-if="selected" class="mb-2 flex flex-wrap gap-1">
      <ElTag size="small">
        {{
          selected.type === 'table'
            ? isFormGrid
              ? '自由表单'
              : '明细表'
            : selected.type
        }}
      </ElTag>
      <ElTag v-if="selected.field" size="small" type="info">
        {{ selected.field }}
      </ElTag>
      <ElTag v-else-if="isFormGrid" size="small" type="info">
        按单元格绑定
      </ElTag>
      <ElTag v-else size="small" type="warning">未绑定</ElTag>
    </div>
    <ElAlert
      v-else
      type="info"
      :closable="false"
      title="请先选中画布元素。新建可从左侧单击添加或拖入画布；改绑请点「选择字段」。"
      class="mb-2"
    />

    <ElTabs v-if="selected" v-model="activeTab" class="print-inspector__tabs">
      <ElTabPane label="数据" name="data">
        <PrintFormGridEditor
          v-if="isFormGrid"
          :key="selected.key"
          :model-value="selected.options.agreeFormGrid"
          :element="selected"
          :sample-data="sampleCtx"
          @apply="
            ({ grid, options }) =>
              publishPatch(
                patchElementOptions(editingTemplate!, selected!, {
                  ...options,
                  agreeFormGrid: grid,
                }),
                { remount: false },
              )
          "
        />
        <ElForm v-if="isTextLike" label-position="top" size="small">
          <ElFormItem label="显示标题">
            <ElInput
              v-model="bindTitle"
              placeholder="画布上的标签，如 征收人"
            />
          </ElFormItem>
          <ElFormItem label="绑定字段">
            <div class="print-inspector__bind-row">
              <ElInput
                v-model="bindField"
                clearable
                placeholder="field，或点「选择字段」"
              />
              <ElButton size="small" @click="openFieldPicker('text')">
                选择字段
              </ElButton>
            </div>
            <p v-if="currentBindLabel" class="print-inspector__hint">
              {{ currentBindLabel }}
            </p>
          </ElFormItem>
          <ElButton type="primary" size="small" @click="applyTextBind">
            应用到画布
          </ElButton>
          <div v-if="selected.type === 'longText'" class="mt-3">
            <ElButton @click="openTextSections">
              编辑正文模板与条件内容
            </ElButton>
            <p class="print-inspector__hint">
              一句话可插入多个参数，也可按条件切换整段内容；设置后优先使用正文模板。
            </p>
          </div>
          <ElDialog
            v-model="textSectionsOpen"
            title="长文本 · 正文模板与条件内容"
            width="760px"
            append-to-body
          >
            <ElAlert type="info" :closable="false" class="mb-3">
              <template #title>
                同一个内容块可以是一句话或多行正文，并插入多个参数。多个内容块之间按空行拼接。
              </template>
              <div>
                直接参数：<code v-pre>{{ compensatee }}</code>；行内条件：<code v-pre>{{
                  IF(rewardTotal > 0, rewardTotal, 0)
                }}</code>。内容块的“显示条件”用于控制整块是否出现。
              </div>
            </ElAlert>
            <ElCollapse class="mb-3">
              <ElCollapseItem
                title="支持哪些表达式？点击查看完整操作范围"
                name="text-expression-help"
              >
                <div class="print-inspector__text-expr-help">
                  <div
                    v-for="group in TEXT_EXPR_HELP_GROUPS"
                    :key="group.title"
                  >
                    <strong>{{ group.title }}</strong>
                    <code v-for="line in group.lines" :key="line">{{
                      line
                    }}</code>
                  </div>
                </div>
                <p class="print-inspector__hint mt-2">
                  有无奖励、是否高额请用 rewardTotal &gt; 阈值 或
                  COUNT(rewardItems) &gt;
                  0，不要写死派生布尔。只支持安全计算，不支持赋值、脚本、属性链和数组下标。
                </p>
              </ElCollapseItem>
            </ElCollapse>
            <div
              v-for="(section, index) in textSections"
              :key="index"
              class="mb-3"
            >
              <div class="flex items-center justify-between">
                <strong>内容块 {{ index + 1 }}</strong><ElButton
                  text
                  type="danger"
                  @click="textSections.splice(index, 1)"
                >
                  移除
                </ElButton>
              </div>
              <div class="print-inspector__text-condition-row">
                <ElInput
                  v-model="section.when"
                  placeholder="整块显示条件（可选），例如 COUNT(rewardItems) > 0 或 rewardTotal > 0"
                />
                <ElSelect
                  model-value=""
                  placeholder="插入结构条件"
                  @change="setTextSectionCondition(index, $event)"
                >
                  <ElOption
                    v-for="preset in TEXT_BLOCK_CONDITION_PRESETS"
                    :key="preset.value"
                    :label="preset.label"
                    :value="preset.value"
                  />
                </ElSelect>
              </div>
              <ElAlert
                v-if="
                  section.when && !validatePrintExpr(section.when, sampleCtx).ok
                "
                :title="validatePrintExpr(section.when, sampleCtx).message"
                type="error"
                :closable="false"
              />
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <ElSelect
                  model-value=""
                  filterable
                  placeholder="插入字段"
                  style="width: 210px"
                  @change="appendTextSectionField(index, $event)"
                >
                  <ElOption
                    v-for="field in visibleFields"
                    :key="field.field"
                    :label="`${field.text} (${field.field})`"
                    :value="field.field"
                  />
                </ElSelect>
                <ElSelect
                  model-value=""
                  placeholder="插入表达式模板"
                  style="width: 250px"
                  @change="appendTextSectionExpression(index, $event)"
                >
                  <ElOptionGroup
                    v-for="group in TEXT_EXPR_INSERT_GROUPS"
                    :key="group.label"
                    :label="group.label"
                  >
                    <ElOption
                      v-for="preset in group.options"
                      :key="preset.value"
                      :label="preset.label"
                      :value="preset.value"
                    />
                  </ElOptionGroup>
                </ElSelect>
              </div>
              <ElInput
                v-model="section.content"
                class="mt-2"
                type="textarea"
                :rows="5"
                placeholder="例如：甲方 {{compensatee}}，奖励金额 {{IF(rewardTotal > 0, rewardTotal, 0)}} 元。"
              />
              <ElAlert
                v-if="!validatePrintTextTemplate(section.content, sampleCtx).ok"
                class="mt-2"
                :title="
                  validatePrintTextTemplate(section.content, sampleCtx).message
                "
                type="error"
                :closable="false"
              />
            </div>
            <ElButton @click="textSections.push({ content: '', when: '' })">
              添加内容块
            </ElButton>
            <div class="mt-3">
              <strong>当前样例预览</strong>
              <pre style="overflow-wrap: anywhere; white-space: pre-wrap">{{
                textSectionsPreview || '当前没有可显示的正文'
              }}</pre>
            </div>
            <template #footer>
              <ElButton @click="textSectionsOpen = false">取消</ElButton><ElButton type="primary" @click="applyTextSections">
                应用到画布
              </ElButton>
            </template>
          </ElDialog>
        </ElForm>

        <ElForm v-else-if="isTable" label-position="top" size="small">
          <p class="print-inspector__hint">
            明细表 · 数据源：{{ currentBindLabel || bindField || '未选择' }}
          </p>
          <div class="print-inspector__table-summary">
            <div>
              <strong>{{ columns.length }} 个数据列</strong>
              <span> · {{ isMultiRowHeader ? '多层表头' : '单层表头' }}</span>
              <span> · {{ footerRows.length }} 行表尾</span>
            </div>
            <p>编辑数据来源、列内容、合计与备注。</p>
            <ElButton type="primary" plain @click="tableEditorOpen = true">
              编辑明细表
            </ElButton>
          </div>

          <ElDialog
            v-model="tableEditorOpen"
            body-class="print-inspector__table-dialog-body"
            title="编辑表格 · 明细表"
            width="min(1180px, 94vw)"
            top="5vh"
            append-to-body
            destroy-on-close
          >
            <ElAlert
              type="info"
              :closable="false"
              title="先选择数据来源，再设置列内容。整表外观在右侧「样式」修改，显示条件在「规则」修改。"
              class="mb-3"
            />

            <PrintTableSample
              v-if="selected"
              :options="{ ...selected.options, agreeVisibleWhen }"
              :sample-data="sampleCtx"
            />
            <ElTabs v-model="tableScope" aria-label="明细表设置范围">
              <ElTabPane label="数据来源" name="rows">
                <p class="print-inspector__hint">
                  数据源和筛选影响整段重复明细，不只影响当前格。
                </p>
                <ElFormItem label="表格数据源">
                  <div class="print-inspector__bind-row">
                    <ElInput
                      v-model="bindField"
                      clearable
                      placeholder="houses / compensationItems / rewardItems"
                    />
                    <ElButton size="small" @click="openFieldPicker('table')">
                      选择表格
                    </ElButton>
                  </div>
                  <p v-if="currentBindLabel" class="print-inspector__hint">
                    {{ currentBindLabel }}
                  </p>
                </ElFormItem>
                <div class="mb-2 flex flex-wrap gap-1">
                  <ElButton
                    type="primary"
                    size="small"
                    @click="applyTableSource(false)"
                  >
                    绑定数据源
                  </ElButton>
                  <ElButton size="small" @click="applyTableSource(true)">
                    套用推荐列
                  </ElButton>
                </div>

                <p class="print-inspector__hint">
                  点画布表头 ▾
                  可筛单列。多列条件在下面改，随底栏「应用到画布」一起提交。
                </p>
                <PrintFilterPanel
                  ref="tableFilterPanelRef"
                  dense
                  show-actions
                  :show-apply="false"
                  :columns="filterColumns"
                  :filter-expr="rowFilter"
                  :sample-data="sampleData"
                  :table-field="currentTableField"
                  @apply="applyFilterExpr"
                />
              </ElTabPane>
              <ElTabPane label="列与表头" name="columns">
                <div class="print-inspector__col-head">
                  <span>列配置</span>
                  <div class="print-inspector__col-head-actions">
                    <span class="print-inspector__index-toggle">
                      显示序号
                      <ElSwitch
                        :model-value="showIndexColumn"
                        size="small"
                        @change="onToggleIndexColumn"
                      />
                    </span>
                    <ElButton size="small" text @click="addEmptyColumn()">
                      添加数据列
                    </ElButton>
                  </div>
                </div>
                <p class="print-inspector__hint mb-2">
                  点表头起点和终点即可合并成分组；点已有分组或合并格可改标题、拆分。当前列设置应用于所有明细记录。
                </p>
                <section
                  v-if="columns.length"
                  class="print-inspector__structure-preview"
                  aria-label="表头结构预览"
                  @click.self="clearHeaderSelection"
                  @keydown.esc.stop="clearHeaderSelection"
                >
                  <div class="print-inspector__section-heading">
                    <strong>点选表头编辑</strong>
                    <span>依次点起点和终点合并；点分组或已合并格可改标题或拆分</span>
                  </div>
                  <div
                    class="print-inspector__header-scroll"
                    @click.self="clearHeaderSelection"
                  >
                    <table>
                      <thead>
                        <tr
                          v-for="(row, rowIndex) in editorHeaderRows"
                          :key="rowIndex"
                        >
                          <th
                            v-for="(cell, cellIndex) in row"
                            :key="cellIndex"
                            :colspan="cell.colspan"
                            :rowspan="cell.rowspan"
                            :class="{
                              'is-selected':
                                headerIsSelected(
                                  cell.editorLeafIndex,
                                  cell.editorLeafEnd,
                                ) ||
                                (selectedGroupPosition?.row ===
                                  cell.editorRowIndex &&
                                  selectedGroupPosition?.cell ===
                                    cell.editorCellIndex),
                            }"
                          >
                            <button
                              v-if="cell.editorLeafIndex !== undefined"
                              type="button"
                              :aria-pressed="
                                headerIsSelected(
                                  cell.editorLeafIndex,
                                  cell.editorLeafEnd,
                                )
                              "
                              @click="
                                selectHeaderRange(
                                  cell.editorLeafIndex,
                                  cell.editorLeafEnd,
                                  $event,
                                )
                              "
                            >
                              <small>第 {{ cell.editorLeafIndex + 1
                                }}<template
                                  v-if="
                                    cell.editorLeafEnd > cell.editorLeafIndex
                                  "
                                  >–{{ cell.editorLeafEnd + 1 }}</template>
                                列</small>
                              {{ cell.title || cell.field || '未命名列' }}
                            </button>
                            <button
                              v-else
                              type="button"
                              :aria-pressed="
                                selectedGroupPosition?.row ===
                                  cell.editorRowIndex &&
                                selectedGroupPosition?.cell ===
                                  cell.editorCellIndex
                              "
                              @click="selectGroupHeader(cell)"
                            >
                              {{ cell.title }}
                            </button>
                          </th>
                        </tr>
                      </thead>
                    </table>
                  </div>
                  <div
                    v-if="headerSelectionActive || selectedGroupHeader"
                    class="print-inspector__header-actions"
                    aria-label="所选表头操作"
                  >
                    <div class="print-inspector__section-heading">
                      <strong v-if="selectedGroupHeader" aria-live="polite">已选择分组：{{ selectedGroupHeader.title }}</strong>
                      <strong v-else aria-live="polite">已选择第 {{ headerRange.start + 1
                        }}<template v-if="headerRange.end > headerRange.start">–{{ headerRange.end + 1 }}</template>
                        列</strong>
                      <ElButton size="small" text @click="clearHeaderSelection">
                        清空选择
                      </ElButton>
                    </div>
                    <div class="print-inspector__header-tools">
                      <span>表头文字颜色</span>
                      <ElColorPicker
                        :model-value="selectedHeaderColor || tableDefaultColor"
                        aria-label="所选表头文字颜色"
                        size="small"
                        :disabled="!headerColorTargets.length"
                        @change="setSelectedHeaderColor"
                      />
                      <span>{{
                        headerColorsMixed
                          ? '多种颜色'
                          : colorDescription(selectedHeaderColor)
                      }}</span>
                      <ElButton
                        v-if="selectedHeaderColors.some(Boolean)"
                        size="small"
                        text
                        @click="setSelectedHeaderColor(null)"
                      >
                        恢复继承
                      </ElButton>
                    </div>
                    <p
                      v-if="!selectedGroupHeader && headerRangeError"
                      class="print-inspector__selection-error"
                      role="alert"
                    >
                      {{ headerRangeError }}
                    </p>
                    <div
                      v-else-if="
                        selectedGroupHeader ||
                        headerRange.end > headerRange.start
                      "
                      class="print-inspector__header-tools"
                    >
                      <label for="selected-header-title">{{
                        selectedHeaderMerge || selectedGroupHeader
                          ? '表头标题'
                          : '合并后的标题'
                      }}</label>
                      <ElInput
                        id="selected-header-title"
                        v-model="headerMergeTitle"
                        aria-label="合并后的表头标题"
                        class="print-inspector__header-title"
                        size="small"
                        placeholder="留空沿用左侧表头标题"
                        @keydown.enter="applyHeaderMerge"
                      />
                      <ElButton
                        type="primary"
                        size="small"
                        @click="applyHeaderMerge"
                      >
                        {{
                          selectedHeaderMerge || selectedGroupHeader
                            ? '保存标题'
                            : '合并'
                        }}
                      </ElButton>
                      <ElButton
                        v-if="canSplitSelectedHeader"
                        size="small"
                        @click="splitSelectedHeaderStructure"
                      >
                        拆分
                      </ElButton>
                    </div>
                    <p
                      v-else-if="!selectedGroupHeader"
                      class="print-inspector__hint"
                    >
                      再点击一个同层表头，选定结束位置。
                    </p>
                    <div
                      v-if="!selectedGroupHeader"
                      class="print-inspector__covered-columns"
                    >
                      <span>对应数据列（独立设置）：</span>
                      <ElButton
                        v-for="item in selectedHeaderColumns"
                        :key="item.index"
                        size="small"
                        text
                        type="primary"
                        @click="onColCardClick(item.index)"
                      >
                        第 {{ item.index + 1 }} 列 ·
                        {{ item.col.title || '未命名列' }}
                      </ElButton>
                    </div>
                  </div>
                  <p v-else class="print-inspector__hint">
                    请选择要调整的表头。按 Esc 或点击空白处可清空选择，Shift
                    点击也可扩展选区。
                  </p>
                  <details class="print-inspector__exact-range">
                    <summary>更多（按列号分组 / 全部转单行）</summary>
                    <div class="print-inspector__header-tools mt-2">
                      <ElSelect
                        v-model="headerGroupStart"
                        class="print-inspector__header-leaf-select"
                        size="small"
                        placeholder="选择起始列"
                      >
                        <ElOption
                          v-for="option in headerLeafOptions"
                          :key="`start-${option.value}`"
                          :label="option.label"
                          :value="option.value"
                        />
                      </ElSelect>
                      <span>至</span>
                      <ElSelect
                        v-model="headerGroupEnd"
                        class="print-inspector__header-leaf-select"
                        size="small"
                        placeholder="选择结束列"
                      >
                        <ElOption
                          v-for="option in headerLeafOptions"
                          :key="`end-${option.value}`"
                          :label="option.label"
                          :value="option.value"
                        />
                      </ElSelect>
                      <ElInput
                        v-model="headerGroupTitle"
                        class="print-inspector__header-title"
                        size="small"
                        placeholder="分组标题"
                      />
                      <ElButton
                        size="small"
                        type="primary"
                        :disabled="!headerGroupReady"
                        @click="createHeaderGroup"
                      >
                        {{ isMultiRowHeader ? '继续分组' : '按列号分组' }}
                      </ElButton>
                      <ElButton
                        v-if="isMultiRowHeader"
                        size="small"
                        @click="flattenHeader"
                      >
                        全部转单行
                      </ElButton>
                    </div>
                    <div
                      v-if="headerGroups.length"
                      class="mb-2 mt-2 flex flex-wrap gap-1"
                    >
                      <ElTag
                        v-for="(group, groupIndex) in headerGroups"
                        :key="`${group.fromLeaf}-${group.toLeaf}-${group.title}`"
                        closable
                        @close="removeHeaderGroup(groupIndex)"
                      >
                        {{ group.title }}（第 {{ group.fromLeaf + 1 }}–{{
                          group.toLeaf + 1
                        }}
                        列）
                      </ElTag>
                    </div>
                  </details>
                  <p class="print-inspector__hint">
                    合并只改表头结构，下面的数据列保持独立。各列字段、公式和格式分别设置。
                  </p>
                </section>

                <div
                  v-if="columns.length"
                  class="print-inspector__column-workspace"
                >
                  <nav
                    class="print-inspector__column-list"
                    aria-label="选择要编辑的数据列"
                  >
                    <div class="print-inspector__section-heading">
                      <strong>数据列</strong>
                      <span>{{ columns.length }} 列</span>
                    </div>
                    <ElInput
                      v-if="columns.length > 6"
                      v-model="columnSearch"
                      aria-label="搜索数据列"
                      placeholder="搜索列名或字段"
                      clearable
                      size="small"
                      class="mb-2"
                    />
                    <p
                      v-if="!filteredColumns.length"
                      class="print-inspector__hint"
                    >
                      没有匹配的数据列
                    </p>
                    <button
                      v-for="{ col, i } in filteredColumns"
                      :key="i"
                      type="button"
                      class="print-inspector__column-item"
                      :class="{ 'is-selected': editingColIndex === i }"
                      :aria-pressed="editingColIndex === i"
                      @click="onColCardClick(i)"
                    >
                      <span class="print-inspector__column-number">{{
                        i + 1
                      }}</span>
                      <span class="print-inspector__column-info">
                        <strong>{{ col.title || '未命名列' }}</strong>
                        <small>{{ col.field || '未绑定字段' }}</small>
                        <span
                          v-if="columnRuleLabels(col, i).length"
                          class="print-inspector__column-badges"
                        >
                          <span
                            v-for="label in columnRuleLabels(col, i)"
                            :key="label"
                            >{{ label }}</span>
                        </span>
                      </span>
                    </button>
                  </nav>

                  <div
                    v-for="{ col, i } in editingColumns"
                    :key="i"
                    class="print-inspector__col"
                    :data-col-index="i"
                  >
                    <div class="print-inspector__column-heading">
                      <div>
                        <span class="print-inspector__hint">正在编辑 · 第 {{ i + 1 }} 列</span>
                        <h3>{{ col.title || '未命名列' }}</h3>
                      </div>
                      <div class="print-inspector__column-actions">
                        <ElButton size="small" plain @click="addEmptyColumn(i)">
                          在此列后插入
                        </ElButton>
                        <ElButton
                          size="small"
                          text
                          type="danger"
                          @click="removeColumn(i)"
                        >
                          删除此列
                        </ElButton>
                      </div>
                    </div>

                    <ElTabs
                      v-model="columnTab"
                      class="print-inspector__column-tabs"
                    >
                      <ElTabPane label="基础" name="basic">
                        <section class="print-inspector__column-section">
                          <h4>基础信息</h4>
                          <div class="print-inspector__column-form">
                            <ElFormItem label="列标题">
                              <ElInput
                                v-model="col.title"
                                aria-label="列标题"
                                placeholder="例如：金额"
                                @blur="onColumnMetaChange"
                              />
                            </ElFormItem>
                            <ElFormItem label="绑定字段">
                              <div class="print-inspector__col-field">
                                <ElInput
                                  v-model="col.field"
                                  aria-label="绑定字段"
                                  placeholder="例如：amount"
                                  @blur="onColumnMetaChange"
                                />
                                <ElButton @click="openFieldPicker('column', i)">
                                  选择字段
                                </ElButton>
                              </div>
                            </ElFormItem>
                            <ElFormItem label="列宽">
                              <ElInputNumber
                                v-model="col.width"
                                aria-label="列宽"
                                :min="24"
                                :max="400"
                                :step="1"
                                :precision="0"
                                controls-position="right"
                                @change="onColumnMetaChange"
                              />
                            </ElFormItem>
                            <ElFormItem label="水平对齐">
                              <ElSelect
                                v-model="col.align"
                                aria-label="水平对齐"
                                @change="onColumnMetaChange"
                              >
                                <ElOption
                                  v-for="p in ALIGN_OPTIONS"
                                  :key="p.value"
                                  :label="p.label"
                                  :value="p.value"
                                />
                              </ElSelect>
                            </ElFormItem>
                          </div>
                        </section>
                      </ElTabPane>
                      <ElTabPane label="样式" name="style">
                        <section
                          v-if="showColFormat(col) || isNumericDataCol(col)"
                          class="print-inspector__column-section"
                        >
                          <h4>显示格式</h4>
                          <ElFormItem
                            v-if="showColFormat(col)"
                            label="单元格显示格式"
                          >
                            <ElSelect
                              v-model="col.agreeColFormat"
                              aria-label="单元格显示格式"
                              clearable
                              filterable
                              placeholder="原值"
                              @change="onColumnFlagChange"
                            >
                              <ElOptionGroup
                                v-for="group in AGREE_PRINT_FORMAT_GROUPS"
                                :key="group.label"
                                :label="group.label"
                              >
                                <ElOption
                                  v-for="p in group.options"
                                  :key="p.value"
                                  :label="p.label"
                                  :value="p.value"
                                />
                              </ElOptionGroup>
                            </ElSelect>
                          </ElFormItem>
                        </section>

                        <section class="print-inspector__column-section">
                          <ElFormItem label="本列正文颜色">
                            <ElColorPicker
                              :model-value="col.agreeColor || tableDefaultColor"
                              aria-label="本列正文颜色"
                              @change="
                                (color) => {
                                  col.agreeColor = color || '';
                                  onColumnFlagChange();
                                }
                              "
                            />
                            <span class="print-inspector__hint">{{
                              colorDescription(col.agreeColor)
                            }}</span>
                            <ElButton
                              v-if="col.agreeColor"
                              size="small"
                              text
                              @click="
                                col.agreeColor = '';
                                onColumnFlagChange();
                              "
                            >
                              恢复继承
                            </ElButton>
                          </ElFormItem>
                          <div
                            class="print-inspector__style-samples"
                            aria-label="本列显示样例"
                          >
                            <span>样例</span>
                            <span
                              v-for="(sample, sampleIndex) in columnSamples"
                              :key="sampleIndex"
                              :style="{ color: sample.color }"
                              >{{ sample.text || '（空值）' }}</span>
                            <span v-if="!columnSamples.length">暂无样例数据</span>
                          </div>
                          <p class="print-inspector__hint">
                            正文颜色不影响表头；命中条件时，样例优先显示条件颜色。
                          </p>
                        </section>
                      </ElTabPane>
                      <ElTabPane label="规则" name="rules">
                        <section class="print-inspector__column-section">
                          <div class="print-inspector__section-heading">
                            <strong>条件颜色</strong>
                            <ElButton
                              v-if="
                                !conditionOpen[i] &&
                                !col.agreeColorWhen &&
                                !col.agreeConditionColor
                              "
                              size="small"
                              @click="conditionOpen[i] = true"
                            >
                              添加条件颜色
                            </ElButton>
                            <ElButton
                              v-else
                              size="small"
                              text
                              @click="removeColorCondition(col, i)"
                            >
                              移除条件
                            </ElButton>
                          </div>
                          <p
                            v-if="
                              !conditionOpen[i] &&
                              !col.agreeColorWhen &&
                              !col.agreeConditionColor
                            "
                            class="print-inspector__hint"
                          >
                            未设置，正文沿用列颜色或整表颜色。
                          </p>
                          <template v-else>
                            <ElButton
                              v-if="isNumericDataCol(col)"
                              size="small"
                              class="mb-2"
                              @click="
                                conditionAdvanced[i] = false;
                                presetNegativeColor(col);
                              "
                            >
                              负数标红
                            </ElButton>
                            <div
                              v-if="!useAdvancedColor(col, i)"
                              class="print-inspector__condition-form"
                            >
                              <span>本列{{
                                  isNumericDataCol(col) ? '数值' : '内容'
                                }}</span>
                              <ElSelect
                                v-model="simpleColorOperator"
                                aria-label="颜色比较方式"
                                @change="
                                  simpleColorOperator === 'empty' ||
                                  simpleColorValue !== ''
                                    ? saveSimpleColorRule(col)
                                    : undefined
                                "
                              >
                                <ElOption label="等于" value="==" /><ElOption
                                  label="不等于"
                                  value="!="
                                />
                                <template v-if="isNumericDataCol(col)">
                                  <ElOption label="小于" value="<" /><ElOption
                                    label="小于等于"
                                    value="<="
                                  /><ElOption label="大于" value=">" /><ElOption
                                    label="大于等于"
                                    value=">="
                                  />
                                </template>
                                <ElOption label="为空" value="empty" />
                              </ElSelect>
                              <ElInput
                                v-if="simpleColorOperator !== 'empty'"
                                v-model="simpleColorValue"
                                aria-label="颜色比较值"
                                :placeholder="
                                  isNumericDataCol(col)
                                    ? '输入数值'
                                    : '输入文本'
                                "
                                @blur="saveSimpleColorRule(col)"
                                @keydown.enter="saveSimpleColorRule(col)"
                              />
                            </div>
                            <ElInput
                              v-else
                              ref="colorExprInputRef"
                              v-model="col.agreeColorWhen"
                              type="textarea"
                              :autosize="{ minRows: 2, maxRows: 4 }"
                              aria-label="文字颜色条件"
                              placeholder="例如 amount < 0 或 status == '异常'"
                              @blur="saveAdvancedColorRule(col)"
                              @keydown.enter="saveAdvancedColorRule(col)"
                            />
                            <PrintExprHelp
                              v-if="useAdvancedColor(col, i)"
                              scene="color"
                              :fields="colorHelpFields"
                              @insert="insertColorExprToken"
                            />
                            <div class="print-inspector__header-tools mt-2">
                              <span>满足条件后显示</span>
                              <ElColorPicker
                                :model-value="
                                  col.agreeConditionColor || '#dc2626'
                                "
                                aria-label="条件文字颜色"
                                @change="
                                  (color) => {
                                    col.agreeConditionColor = color || '';
                                    onColumnFlagChange();
                                  }
                                "
                              />
                              <span>{{
                                col.agreeConditionColor ||
                                '红色（保存条件后生效）'
                              }}</span>
                              <ElButton
                                v-if="!useAdvancedColor(col, i)"
                                size="small"
                                text
                                @mousedown.prevent
                                @click="openAdvancedColor(col, i)"
                              >
                                高级表达式
                              </ElButton>
                              <ElButton
                                v-else-if="
                                  !col.agreeColorWhen ||
                                  parseSimpleColorRule(col.agreeColorWhen)
                                "
                                size="small"
                                text
                                @click="conditionAdvanced[i] = false"
                              >
                                简单条件
                              </ElButton>
                            </div>
                            <p class="print-inspector__hint">
                              命中后覆盖正文颜色，未命中时恢复继承。{{
                                useAdvancedColor(col, i)
                                  ? 'value 为本列计算后的值，其他字段名引用当前行数据。'
                                  : ''
                              }}
                            </p>
                          </template>
                        </section>
                        <div
                          v-if="isNumericDataCol(col)"
                          class="print-inspector__column-switches"
                        >
                          <div>
                            <span>隐藏零值</span><ElSwitch
                              v-model="col.agreeHideZero"
                              aria-label="隐藏零值"
                              @change="onColumnFlagChange"
                            />
                          </div>
                        </div>
                        <ElCollapse
                          v-model="columnSections"
                          class="print-inspector__column-advanced"
                        >
                          <ElCollapseItem name="formula">
                            <template #title>
                              <div class="print-inspector__advanced-title">
                                <strong>本列计算公式（逐行）</strong>
                                <span :title="col.agreeColExpr">{{
                                  col.agreeColExpr || '未设置 · 显示字段原值'
                                }}</span>
                              </div>
                            </template>
                            <div class="print-inspector__formula">
                              <p class="print-inspector__hint">
                                使用当前行数据计算，结果显示在「{{
                                  col.title || '当前列'
                                }}」列的每一行；留空显示绑定字段原值。整列求和请在“合计与备注”中选择需要合计的列。
                              </p>
                              <ElInput
                                ref="columnExprInputRef"
                                v-model="col.agreeColExpr"
                                aria-label="本列计算公式（逐行）"
                                type="textarea"
                                :autosize="{ minRows: 2, maxRows: 5 }"
                                placeholder="例如：quantity * unitPrice"
                                @blur="onColumnExprChange(i)"
                              />
                              <PrintExprHelp
                                scene="column"
                                :fields="columnHelpFields"
                                @insert="insertColumnExprToken"
                              />
                              <span class="print-inspector__hint">快捷示例（点击替换当前公式）</span>
                              <div class="flex flex-wrap gap-1">
                                <ElButton
                                  size="small"
                                  text
                                  @click="
                                    applyColumnExprPreset(
                                      i,
                                      emptySlashColumnExpr(col.field),
                                    )
                                  "
                                >
                                  空值显示 /
                                </ElButton>
                                <ElButton
                                  size="small"
                                  text
                                  @click="
                                    applyColumnExprPreset(
                                      i,
                                      `ROUND(${col.field || 'amount'}, 2)`,
                                    )
                                  "
                                >
                                  四舍五入
                                </ElButton>
                              </div>
                              <ElAlert
                                v-if="col.agreeColExpr"
                                :closable="false"
                                :type="
                                  editingExprCheck.ok ? 'success' : 'error'
                                "
                                :title="
                                  editingExprCheck.ok
                                    ? `首行样例计算结果：${editingExprCheck.preview}`
                                    : editingExprCheck.message
                                "
                              />
                            </div>
                          </ElCollapseItem>
                          <ElCollapseItem name="merge">
                            <template #title>
                              <div class="print-inspector__advanced-title">
                                <strong>单元格合并规则</strong>
                                <span>{{ columnMergeSummary(col, i) }}</span>
                              </div>
                            </template>
                            <div class="print-inspector__merge-settings">
                              <ElFormItem label="纵向合并">
                                <ElSelect
                                  :model-value="columnMergeMode(col, i)"
                                  aria-label="纵向合并"
                                  @change="
                                    (value: string) =>
                                      setColumnMergeMode(col, i, value)
                                  "
                                >
                                  <ElOption label="不合并" value="none" />
                                  <ElOption label="相同值合并" value="same" />
                                  <ElOption
                                    label="按条件合并"
                                    value="condition"
                                  />
                                </ElSelect>
                              </ElFormItem>
                              <ElFormItem
                                v-if="columnMergeMode(col, i) !== 'none'"
                                label="合并依据字段"
                              >
                                <ElInput
                                  v-model="col.agreeMergeKey"
                                  aria-label="合并依据字段"
                                  placeholder="留空使用本列绑定字段"
                                  @blur="onColumnFlagChange"
                                />
                                <p class="print-inspector__hint">
                                  例如按 householdId
                                  合并，避免姓名相同的不同家庭被合并。
                                </p>
                              </ElFormItem>
                              <ElFormItem
                                v-if="columnMergeMode(col, i) === 'condition'"
                                label="合并条件"
                              >
                                <ElInput
                                  v-model="col.agreeMergeWhen"
                                  aria-label="合并条件"
                                  type="textarea"
                                  :autosize="{ minRows: 2, maxRows: 4 }"
                                  placeholder="例如：calcType == '定额'"
                                  @blur="onColumnFlagChange"
                                />
                                <p class="print-inspector__hint">
                                  只合并满足条件的连续行，不满足的行保持独立。
                                </p>
                              </ElFormItem>
                              <div
                                v-if="i > 0"
                                class="print-inspector__column-switches"
                              >
                                <div>
                                  <span>空单元格向左合并</span><ElSwitch
                                    v-model="col.agreeHMergeEmpty"
                                    aria-label="空单元格向左合并"
                                    @change="onColumnFlagChange"
                                  />
                                </div>
                              </div>
                              <p v-if="i > 0" class="print-inspector__hint">
                                本列单元格为空时并入左侧单元格，适用于本列所有空行。
                              </p>
                            </div>
                          </ElCollapseItem>
                        </ElCollapse>
                      </ElTabPane>
                    </ElTabs>
                  </div>
                </div>
                <div v-else class="print-inspector__columns-empty">
                  <p>还没有数据列，添加第一列开始配置。</p>
                  <ElButton type="primary" @click="addEmptyColumn()">
                    添加数据列
                  </ElButton>
                </div>
              </ElTabPane>
              <ElTabPane label="合计与备注" name="footer">
                <div class="print-inspector__footer mt-3">
                  <div class="print-inspector__col-head">
                    <span>合计与备注（可选）</span>
                    <ElButton size="small" @click="addNoteFooter">
                      添加备注行
                    </ElButton>
                  </div>
                  <p class="print-inspector__hint mb-2">
                    合计按当前筛选后的全部明细计算，不是协议总金额。备注只在表格最后显示一次；签字盖章请在画布中单独添加。
                  </p>
                  <div
                    class="mb-3 flex flex-wrap gap-3"
                    aria-label="选择合计列"
                  >
                    <span>需要合计的列：</span>
                    <template v-for="(col, index) in columns" :key="index">
                      <ElCheckbox
                        v-if="isNumericDataCol(col)"
                        v-model="col.tableSummary"
                        @change="onColumnFlagChange"
                      >
                        {{ col.title || col.field }}
                      </ElCheckbox>
                    </template>
                    <span
                      v-if="!columns.some(isNumericDataCol)"
                      class="print-inspector__hint"
                      >请先绑定数值列。</span>
                  </div>
                  <details class="mb-3">
                    <summary class="cursor-pointer">高级：自定义表尾</summary>
                    <p class="print-inspector__hint">
                      适合需要多格绑定或合并的旧模板。新增后点选格子，下面只编辑当前格。
                    </p>
                    <ElButton size="small" @click="addFooterRow">
                      添加自定义行
                    </ElButton>
                  </details>
                  <div
                    v-for="(row, ri) in footerRows"
                    :key="ri"
                    class="print-inspector__footer-row mb-2"
                  >
                    <div class="mb-1 flex items-center justify-between">
                      <span class="text-xs text-gray-500">第 {{ ri + 1 }} 行</span>
                      <ElButton
                        size="small"
                        text
                        type="danger"
                        @click="removeFooterRow(ri)"
                      >
                        删行
                      </ElButton>
                    </div>
                    <div
                      class="print-inspector__footer-grid"
                      :style="{
                        gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`,
                      }"
                    >
                      <button
                        v-for="(cell, ci) in row.cells"
                        :key="ci"
                        type="button"
                        :style="{ gridColumn: `span ${cell.colspan}` }"
                        :class="{
                          'is-focus':
                            footerFocusRow === ri && footerFocusCell === ci,
                        }"
                        :aria-label="`编辑表尾第 ${ri + 1} 行第 ${ci + 1} 格`"
                        @click="
                          footerFocusRow = ri;
                          footerFocusCell = ci;
                        "
                      >
                        {{ cell.text || cell.field || '空白 · 点击编辑' }}
                      </button>
                    </div>
                    <template
                      v-for="(cell, ci) in row.cells"
                      :key="`${ri}-${ci}`"
                    >
                      <div
                        v-if="footerFocusRow === ri && footerFocusCell === ci"
                        class="print-inspector__footer-cell"
                        :class="{
                          'is-focus':
                            footerFocusRow === ri && footerFocusCell === ci,
                        }"
                        @click="
                          footerFocusRow = ri;
                          footerFocusCell = ci;
                        "
                      >
                        <ElInput
                          v-model="cell.text"
                          size="small"
                          placeholder="文案"
                          @blur="onFooterCellBlur(cell)"
                        />
                        <ElColorPicker
                          v-model="cell.color"
                          :aria-label="`表尾第 ${ri + 1} 行第 ${ci + 1} 格文字颜色`"
                          size="small"
                          @change="onFooterCellBlur(cell)"
                        />
                        <ElInput
                          v-model="cell.field"
                          size="small"
                          placeholder="绑定主表字段（可选）"
                          @blur="onFooterCellBlur(cell)"
                        />
                        <span class="print-inspector__col-label">
                          跨{{ cell.colspan }}列
                        </span>
                        <span class="print-inspector__col-label">对齐</span>
                        <ElSelect
                          v-model="cell.align"
                          class="print-inspector__col-align"
                          size="small"
                          @change="onFooterCellBlur(cell)"
                        >
                          <ElOption
                            v-for="p in ALIGN_OPTIONS"
                            :key="p.value"
                            :label="p.label"
                            :value="p.value"
                          />
                        </ElSelect>
                        <ElButton
                          size="small"
                          :disabled="ci >= row.cells.length - 1"
                          @click.stop="mergeFooterWithNext(ri, ci)"
                        >
                          与右合并
                        </ElButton>
                        <ElButton
                          size="small"
                          :disabled="cell.colspan <= 1"
                          @click.stop="splitFooterAt(ri, ci)"
                        >
                          拆分
                        </ElButton>
                      </div>
                    </template>
                  </div>
                  <p
                    v-if="footerRows.length === 0"
                    class="print-inspector__hint"
                  >
                    未添加备注或自定义表尾，无需填写。
                  </p>
                </div>
              </ElTabPane>
            </ElTabs>
            <template #footer>
              <span class="print-inspector__hint">应用后一次性更新画布（含筛选），可一步撤销；完成后请保存模板。</span>
              <ElButton @click="tableEditorOpen = false">取消</ElButton>
              <ElButton type="primary" @click="applyTableDraft">
                应用到画布
              </ElButton>
            </template>
          </ElDialog>
        </ElForm>

        <div v-else-if="!isFormGrid" class="text-xs text-gray-500">
          装饰元素无需绑定数据。
        </div>
      </ElTabPane>

      <ElTabPane label="样式" name="style">
        <PrintStylePanel :selected="selected" @patch="applyStylePatch" />
      </ElTabPane>

      <ElTabPane label="规则" name="rules">
        <ElCollapse class="mb-2">
          <ElCollapseItem title="表达式怎么写" name="help">
            <div
              v-for="block in PRINT_EXPR_HELP"
              :key="block.title"
              class="print-inspector__help-block"
            >
              <div class="print-inspector__help-title">{{ block.title }}</div>
              <ul>
                <li v-for="(line, i) in block.lines" :key="i">{{ line }}</li>
              </ul>
            </div>
          </ElCollapseItem>
        </ElCollapse>

        <div class="print-inspector__hint mb-2 flex items-center gap-1">
          <span>
            {{
              isTable ? '控制整张表格的显示或隐藏' : '控制当前元素的显示或隐藏'
            }}
          </span>
          <ElPopover
            v-if="isTable"
            trigger="click"
            placement="top"
            title="整表显隐说明"
            :width="280"
          >
            <template #reference>
              <ElButton size="small" text circle aria-label="查看整表显隐说明">
                ?
              </ElButton>
            </template>
            <p>支持主表字段、派生字段和整表统计结果。</p>
            <p class="mt-2">单元格计算请前往「数据 → 编辑明细表」设置。</p>
            <ElButton
              class="mt-2"
              size="small"
              type="primary"
              link
              @click="tableEditorOpen = true"
            >
              设置单元格计算
            </ElButton>
          </ElPopover>
        </div>
        <ElForm label-position="top" size="small">
          <ElFormItem label="条件显隐">
            <ElRadioGroup
              class="print-inspector__visible-display"
              :model-value="visibleDisplayMode"
              size="small"
            >
              <ElRadioButton
                value="always"
                @click="setVisibleDisplayMode('always')"
              >
                始终显示
              </ElRadioButton>
              <ElRadioButton
                value="when"
                @click="setVisibleDisplayMode('when')"
              >
                按条件
              </ElRadioButton>
              <ElRadioButton
                value="never"
                @click="setVisibleDisplayMode('never')"
              >
                始终隐藏
              </ElRadioButton>
            </ElRadioGroup>
            <template v-if="visibleDisplayMode === 'when'">
              <ElRadioGroup
                class="print-inspector__visible-mode"
                :model-value="visibleEditorMode"
                size="small"
              >
                <ElRadioButton
                  value="simple"
                  @click="setVisibleEditorMode('simple')"
                >
                  常用条件
                </ElRadioButton>
                <ElRadioButton
                  value="advanced"
                  @click="setVisibleEditorMode('advanced')"
                >
                  高级表达式
                </ElRadioButton>
              </ElRadioGroup>
              <template v-if="visibleEditorMode === 'simple'">
                <div class="print-inspector__visible-builder">
                  <ElSelect
                    v-model="visibleField"
                    filterable
                    placeholder="选择字段"
                  >
                    <ElOption
                      v-for="item in visibleFields"
                      :key="item.field"
                      :label="`${item.text} (${item.field})`"
                      :value="item.field"
                    />
                  </ElSelect>
                  <ElSelect v-model="visibleOperator" placeholder="判断方式">
                    <ElOption
                      v-for="item in VISIBLE_OPERATORS"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                    />
                  </ElSelect>
                  <ElInput
                    v-if="visibleOperatorNeedsValue"
                    ref="visibleValueInputRef"
                    v-model="visibleValue"
                    placeholder="本项目比较值，如 0 或 已签约"
                    @keyup.enter="applySimpleVisibleRule"
                  />
                  <ElButton type="primary" @click="applySimpleVisibleRule">
                    应用条件
                  </ElButton>
                </div>
              </template>
              <template v-else>
                <ElInput
                  ref="visibleExprInputRef"
                  v-model="agreeVisibleWhen"
                  type="textarea"
                  :rows="3"
                  placeholder="例如 COUNT(rewardItems) > 0"
                  @blur="onVisibleExprBlur"
                />
                <PrintExprHelp
                  scene="visible"
                  :fields="visibleHelpFields"
                  @insert="insertVisibleExprToken"
                />
              </template>
            </template>
            <ElAlert
              class="mt-2"
              :type="agreeVisibleWhen ? visibleAlertType : 'info'"
              :closable="false"
              :title="
                visibleDisplayMode === 'never'
                  ? '当前元素始终隐藏'
                  : visibleDisplayMode === 'when' && !agreeVisibleWhen
                    ? '请填写并应用条件，否则始终显示'
                    : !agreeVisibleWhen
                      ? '未设置条件：当前元素始终显示'
                      : visibleCheck.ok
                        ? visibleSampleLabel(visibleCheck.preview)
                        : visibleCheck.message
              "
            />
          </ElFormItem>
          <DocumentLayoutPanel
            v-if="isDocument"
            :template="editingTemplate!"
            :selected="selected"
            @change="(next) => publishPatch(next, { remount: false })"
          />
          <ElFormItem v-else label="排版方式">
            <ElSelect
              v-model="agreeFlowMode"
              class="w-full"
              @change="persistFlowMode"
            >
              <ElOption label="正文自动补位（默认）" value="auto" />
              <ElOption label="固定位置" value="fixed" />
            </ElSelect>
            <div class="print-inspector__advanced-caption">
              {{
                agreeFlowMode === 'auto'
                  ? '上方正文隐藏后自动上移，无需分组；仅在本页内补位。'
                  : '保留设计位置，不跟随上方内容移动。'
              }}
            </div>
          </ElFormItem>
          <ElFormItem
            v-if="isDocument || agreeFlowMode === 'auto'"
            label="隐藏后"
          >
            <ElSelect
              v-model="agreeFlowCollapse"
              class="w-full"
              @change="persistFlowFloat"
            >
              <ElOption label="移除空位，同行向左收、下面上移" :value="true" />
              <ElOption label="保留空位" :value="false" />
            </ElSelect>
          </ElFormItem>
          <ElCollapse
            v-if="!isDocument && agreeFlowMode === 'auto'"
            class="mb-3"
          >
            <ElCollapseItem title="高级排版设置" name="flow">
              <ElFormItem label="内容分组（可选）">
                <ElSelect
                  v-model="agreeFlowGroup"
                  clearable
                  filterable
                  allow-create
                  default-first-option
                  class="w-full"
                  placeholder="不分组也会自动补位"
                  @change="persistFlowGroup"
                >
                  <ElOption
                    v-for="group in pageFlowGroups"
                    :key="group.name"
                    :value="group.name"
                    :label="`${group.name} · 本页 ${group.count} 个元素`"
                  />
                </ElSelect>
                <div class="print-inspector__advanced-caption">
                  同组共享隐藏后的空位处理和同行排列设置；各元素的显隐条件独立。
                </div>
              </ElFormItem>
              <ElFormItem
                v-if="agreeFlowGroup && agreeFlowCollapse"
                label="同行排列"
              >
                <ElSelect
                  v-model="agreeFlowFloat"
                  class="mt-1 w-full"
                  placeholder="同行隐藏后的排列"
                  @change="persistFlowFloat"
                >
                  <ElOption label="同行向左收拢（默认）" value="left" />
                  <ElOption label="同行向右收拢" value="right" />
                  <ElOption label="保持原横向位置" value="none" />
                </ElSelect>
                <ElSwitch
                  v-if="agreeFlowFloat !== 'none'"
                  v-model="agreeFlowStretch"
                  class="mt-1"
                  active-text="同行只剩一个元素时拉宽"
                  @change="persistFlowFloat"
                />
              </ElFormItem>
            </ElCollapseItem>
          </ElCollapse>
          <ElFormItem v-if="isTextLike" label="文本格式">
            <ElSelect
              v-model="agreeFormat"
              clearable
              filterable
              placeholder="原值"
              class="w-full"
              @change="persistRulesSilent"
            >
              <ElOptionGroup
                v-for="group in AGREE_PRINT_FORMAT_GROUPS"
                :key="group.label"
                :label="group.label"
              >
                <ElOption
                  v-for="p in group.options"
                  :key="p.value"
                  :label="p.label"
                  :value="p.value"
                />
              </ElOptionGroup>
            </ElSelect>
            <div
              v-if="textFormatPreview"
              class="print-inspector__format-preview"
            >
              当前样例：{{ textFormatPreview }}
            </div>
            <p class="print-inspector__advanced-caption">
              格式只改变显示，不修改原始数值。数字与无符号金额的小数格式效果相同；金额还可选择
              ¥、$ 或人民币大写，货币符号不进行汇率换算。
            </p>
          </ElFormItem>
        </ElForm>

        <template v-if="isTable">
          <div class="print-inspector__rule-split">筛哪些行</div>
          <ElAlert
            class="mb-2"
            type="success"
            :closable="false"
            :title="`当前表：${currentTableField || '未绑定数据源'}`"
          />
          <ElButton
            v-if="!currentTableField"
            class="mb-2"
            size="small"
            type="primary"
            @click="activeTab = 'data'"
          >
            去绑定数据源
          </ElButton>
          <p class="print-inspector__desc">
            筛行只决定这张表保留哪些记录；列公式负责每条保留记录中单元格的值。两者分开配置。点画布表头可改单列，芯片展示当前规则。
          </p>
          <div class="print-inspector__filter-brief mb-2">
            <div class="print-inspector__filter-chips">
              <template v-if="filterChips.length">
                <span
                  v-for="chip in filterChips"
                  :key="`${chip.field}-${chip.label}`"
                  class="print-inspector__filter-chip"
                >
                  <span
                    v-if="chip.joinBefore"
                    class="print-inspector__filter-join"
                  >
                    {{ chip.joinBefore }}
                  </span>
                  <ElTag
                    size="small"
                    type="warning"
                    closable
                    @click="openFilterDialog"
                    @close="removeFilterChip(chip)"
                  >
                    {{ chip.label }}
                  </ElTag>
                </span>
              </template>
              <ElTag v-else size="small" type="info">
                {{ filterSummary }}
              </ElTag>
            </div>
            <span v-if="currentTableField" class="text-xs text-gray-500">
              样例将打印 {{ filterRowCount.kept }} /
              {{ filterRowCount.total }} 行
            </span>
            <span v-if="rowSortSummary" class="text-xs text-gray-500">
              打印顺序：{{ rowSortSummary }}
            </span>
          </div>
          <div class="mb-2 flex flex-wrap gap-1">
            <ElButton type="primary" size="small" @click="openFilterDialog">
              更多条件
            </ElButton>
            <ElButton
              v-if="rowFilter"
              size="small"
              @click="applyFilterExpr('')"
            >
              清除筛选
            </ElButton>
          </div>
        </template>
      </ElTabPane>
    </ElTabs>

    <PrintFilterDialog
      v-model="filterDialogOpen"
      :table-field="currentTableField"
      :columns="filterColumns"
      :filter-expr="rowFilter"
      :sample-data="sampleData"
      @apply="applyFilterExpr"
    />
    <PrintFieldPicker
      v-model="fieldPickerOpen"
      :mode="fieldPickerMode"
      :table-field="currentTableField"
      @pick="onFieldPicked"
    />
  </div>
</template>

<style scoped>
.print-inspector {
  min-width: 0;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--el-text-color-primary);
}

.print-inspector__title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.print-inspector__tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}

.print-inspector__bind-row {
  display: flex;
  gap: 6px;
  min-width: 0;
}

.print-inspector__bind-row :deep(.el-input) {
  flex: 1;
  min-width: 0;
}

.print-inspector__hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.print-inspector__table-summary {
  padding: 10px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}

.print-inspector__index-toggle {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  margin: 4px 0;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-regular);
}

.print-inspector__col-head-actions {
  display: inline-flex;
  gap: 10px;
  align-items: center;
}

.print-inspector__table-summary p {
  margin: 5px 0 9px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.print-inspector__col-field {
  display: flex;
  gap: 4px;
  min-width: 0;
}

.print-inspector__col-field :deep(.el-input) {
  flex: 1;
  min-width: 0;
}

.print-inspector__col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 0 4px;
  font-weight: 600;
}

.print-inspector__header-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  padding: 6px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}

.print-inspector__header-title {
  flex: 1;
  min-width: 160px;
}

.print-inspector__header-leaf-select {
  flex: 0 1 180px;
  width: 180px;
}

.print-inspector__text-condition-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px;
  gap: 8px;
}

.print-inspector__text-expr-help {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.print-inspector__text-expr-help > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px;
  background: var(--el-fill-color-light);
  border-radius: 5px;
}

.print-inspector__text-expr-help code {
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
  white-space: normal;
}

@media (max-width: 700px) {
  .print-inspector__text-condition-row,
  .print-inspector__text-expr-help {
    grid-template-columns: 1fr;
  }
}

.print-inspector__structure-preview {
  padding: 12px;
  margin: 12px 0;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.print-inspector__covered-columns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
  font-size: 12px;
}

.print-inspector__header-actions {
  padding: 12px;
  margin-top: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 6px;
}

.print-inspector__selection-error {
  font-size: 12px;
  color: var(--el-color-danger);
}

.print-inspector__exact-range {
  margin-top: 12px;
  font-size: 12px;
}

.print-inspector__exact-range summary {
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

.print-inspector__section-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.print-inspector__section-heading span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.print-inspector__header-scroll {
  overflow-x: auto;
}

.print-inspector__header-scroll table {
  width: 100%;
  border-collapse: collapse;
  background: var(--el-bg-color);
}

.print-inspector__header-scroll th {
  min-width: 96px;
  padding: 0;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--el-border-color);
}

.print-inspector__header-scroll th > span {
  display: block;
  padding: 8px 12px;
}

.print-inspector__header-scroll button {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  padding: 6px 10px;
  color: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.print-inspector__style-samples,
.print-inspector__condition-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
}

.print-inspector__header-scroll small {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.7;
}

.print-inspector__header-scroll .is-selected,
.print-inspector__header-scroll button[aria-pressed='true'] {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.print-inspector__column-workspace {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.print-inspector__column-list {
  position: sticky;
  top: 12px;
  max-height: 65vh;
  padding: 12px;
  overflow-y: auto;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.print-inspector__column-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  width: 100%;
  padding: 7px 10px;
  margin-top: 4px;
  text-align: left;
  cursor: pointer;
  background: var(--el-bg-color);
  border: 1px solid transparent;
  border-radius: 6px;
}

.print-inspector__column-item:hover,
.print-inspector__header-scroll button:hover {
  background: var(--el-color-primary-light-9);
}

.print-inspector__column-item.is-selected {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
}

.print-inspector__column-item:focus-visible,
.print-inspector__header-scroll button:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}

.print-inspector__column-number {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  font-size: 12px;
  line-height: 24px;
  text-align: center;
  background: var(--el-fill-color);
  border-radius: 5px;
}

.print-inspector__column-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.print-inspector__column-info strong {
  font-size: 13px;
}

.print-inspector__column-info small {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.print-inspector__column-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}

.print-inspector__column-badges > span {
  padding: 1px 5px;
  font-size: 10px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-8);
  border-radius: 3px;
}

.print-inspector__col {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.print-inspector__column-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.print-inspector__column-heading h3 {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.print-inspector__column-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.print-inspector__column-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

:global(.print-inspector__table-dialog-body) {
  max-height: calc(90vh - 140px);
  overflow-y: auto;
}

.print-inspector__column-tabs {
  margin-top: 12px;
}

.print-inspector__condition-form :deep(.el-select) {
  width: 140px;
}

.print-inspector__condition-form :deep(.el-input) {
  max-width: 220px;
}

.print-inspector__column-section {
  padding: 10px 0;
}

.print-inspector__column-section h4 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
}

.print-inspector__column-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 0 16px;
}

.print-inspector__column-form :deep(.el-form-item) {
  min-width: 0;
}

.print-inspector__column-form .print-inspector__col-field,
.print-inspector__column-form :deep(.el-input-number) {
  width: 100%;
}

.print-inspector__column-switches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
}

.print-inspector__column-switches > div {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 13px;
}

.print-inspector__column-advanced :deep(.el-collapse-item__header) {
  height: auto;
  min-height: 64px;
  padding: 8px 0;
  line-height: 1.5;
}

.print-inspector__advanced-title {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding-right: 12px;
  text-align: left;
}

.print-inspector__advanced-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.print-inspector__formula {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.print-inspector__merge-settings {
  padding: 8px 0;
}

.print-inspector__columns-empty {
  padding: 32px;
  text-align: center;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

@media (max-width: 760px) {
  .print-inspector__column-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .print-inspector__column-list {
    position: static;
    max-height: 200px;
  }

  .print-inspector__column-form {
    grid-template-columns: minmax(0, 1fr);
  }
}

.print-inspector__col-label {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.print-inspector__col-align {
  flex-shrink: 0;
  width: 72px;
}

.print-inspector__desc {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.print-inspector__filter-brief {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-primary);
}

.print-inspector__filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.print-inspector__filter-chip {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.print-inspector__filter-join {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.print-inspector__rule-split {
  padding-top: 12px;
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  border-top: 1px solid var(--el-border-color);
}

.print-inspector__visible-display,
.print-inspector__visible-mode {
  display: flex;
  width: 100%;
  margin-bottom: 8px;
}

.print-inspector__visible-display :deep(.el-radio-button),
.print-inspector__visible-mode :deep(.el-radio-button) {
  flex: 1;
}

.print-inspector__visible-display :deep(.el-radio-button__inner),
.print-inspector__visible-mode :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 5px 8px;
}

.print-inspector__visible-builder {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(96px, 0.8fr);
  gap: 6px;
  width: 100%;
  padding: 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}

.print-inspector__visible-builder > :deep(.el-input),
.print-inspector__visible-builder > :deep(.el-select),
.print-inspector__visible-builder > :deep(.el-button) {
  width: 100%;
}

.print-inspector__visible-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  width: 100%;
  margin-top: 6px;
}

.print-inspector__visible-toolbar :deep(.el-select) {
  width: 128px;
}

.print-inspector__advanced-caption,
.print-inspector__format-preview {
  width: 100%;
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.print-inspector__format-preview {
  padding: 5px 7px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-radius: 4px;
}

.print-inspector__help-block {
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.print-inspector__help-title {
  margin-bottom: 4px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.print-inspector__help-block ul {
  padding-left: 16px;
  margin: 0;
}

.print-inspector__footer-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  padding: 6px;
  margin-bottom: 4px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}

.print-inspector__footer-cell.is-focus {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning);
}

.print-inspector__footer-cell :deep(.el-input) {
  width: 96px;
}
</style>

<style scoped>
.print-inspector__footer-grid {
  display: grid;
  margin: 8px 0;
  border-top: 1px solid var(--el-border-color);
  border-left: 1px solid var(--el-border-color);
}

.print-inspector__footer-grid button {
  min-height: 36px;
  padding: 6px;
  overflow-wrap: anywhere;
  cursor: pointer;
  border-right: 1px solid var(--el-border-color);
  border-bottom: 1px solid var(--el-border-color);
}

.print-inspector__footer-grid button.is-focus {
  outline: 2px solid var(--el-color-primary-light-3);
  outline-offset: -2px;
  background: var(--el-color-primary-light-9);
}
</style>

<script lang="ts" setup>
import type { AgreePrintFieldItem } from './fields';
import type { PrintElementRef } from './print-element-meta';
import type {
  PrintFieldPickMode,
  PrintFieldTreeNode,
} from './print-field-tree';
/**
 * 打印检视器：数据绑定 + 规则（显隐 / 表格筛行）
 */
import type { AgreePrintData } from './types';

import { computed, nextTick, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElCollapse,
  ElCollapseItem,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTabPane,
  ElTabs,
  ElTag,
} from 'element-plus';

import {
  AGREE_PRINT_ALL_FIELDS,
  buildPresetTableColumns,
  PRINT_EXPR_HELP,
  PRINT_EXPR_PRESETS,
  TABLE_COLUMN_PRESETS,
} from './fields';
import { AGREE_PRINT_FORMAT_PRESETS } from './format-print-value';
import {
  hasMultiRowTableHeader,
  listLeafTableCells,
  listPrintElements,
  patchElementOptions,
  patchLeafTableColumns,
  patchTableColumnFieldByIndex,
  patchTableColumns,
} from './print-element-meta';
import { validatePrintExpr } from './print-expr';
import PrintFieldPicker from './print-field-picker.vue';
import { describePrintField } from './print-field-tree';
import PrintFilterDialog from './print-filter-dialog.vue';
import {
  collectLeafColumns,
  describeFilterExpr,
  isNumericPrintField,
  listFilterColumns,
  previewFilterRowCount,
} from './print-row-filter';

const props = defineProps<{
  sampleData: AgreePrintData;
  selectedKey: string;
  templateJson: null | Record<string, any>;
}>();

const emit = defineEmits<{
  /** 写回模板；筛行可静默，改列/绑定需重绘画布 */
  canvasPatch: [Record<string, any>, { remount?: boolean }?];
  'update:selectedKey': [string];
}>();

/** 列 field 名像日期时给格式下拉 */
const DATE_FIELD_RE = /date|time|signDate/i;

const activeTab = ref('data');
const filterDialogOpen = ref(false);
const fieldPickerOpen = ref(false);
const fieldPickerMode = ref<PrintFieldPickMode>('text');
/** 列点选时对应 columns 下标；非列模式为 -1 */
const columnPickIndex = ref(-1);

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
  agreeHideZero: boolean;
  agreeColFormat: string;
}

const bindField = ref('');
const bindTitle = ref('');
const rowFilter = ref('');
const agreeVisibleWhen = ref('');
const agreeFlowGroup = ref('');
const agreeFormat = ref('');
const columns = ref<ColDraft[]>([]);
/** 回填列草稿时忽略 InputNumber change，避免写回循环 */
let syncingCols = false;

const elements = computed(() => listPrintElements(props.templateJson));

const selected = computed(
  () => elements.value.find((e) => e.key === props.selectedKey) || null,
);

const isTable = computed(() => selected.value?.type === 'table');
const isTextLike = computed(
  () => selected.value?.type === 'text' || selected.value?.type === 'longText',
);

const currentBindLabel = computed(() => describePrintField(bindField.value));

const currentTableField = computed(() =>
  String(selected.value?.options?.field || bindField.value || ''),
);

const isMultiRowHeader = computed(() =>
  hasMultiRowTableHeader(selected.value?.options?.columns),
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

const sampleCtx = computed(
  () => props.sampleData as unknown as Record<string, unknown>,
);

/** 条件显隐校验（样例数据下将打印 / 将隐藏） */
const visibleCheck = computed(() =>
  validatePrintExpr(agreeVisibleWhen.value, sampleCtx.value),
);

/**
 * 把样例求值说成「将打印 / 将隐藏」
 * @param preview 表达式结果
 */
function visibleSampleLabel(preview: string | undefined) {
  if (preview === 'true') return '当前样例下：将打印';
  if (preview === 'false') return '当前样例下：将隐藏';
  return `当前样例求值 → ${preview}`;
}

const visibleAlertType = computed(() => {
  if (!visibleCheck.value.ok) return 'error' as const;
  if (visibleCheck.value.preview === 'false') return 'warning' as const;
  return 'success' as const;
});

/** 选中元素变化时回填表单（不因画布刷新把 Tab 打回数据） */
watch(
  () => [props.selectedKey, props.templateJson] as const,
  () => {
    const el = selected.value;
    if (!el) return;
    bindField.value = String(el.options.field || '');
    bindTitle.value = String(el.options.title || '');
    rowFilter.value = String(el.options.agreeRowFilter || '');
    agreeVisibleWhen.value = String(el.options.agreeVisibleWhen || '');
    agreeFlowGroup.value = String(el.options.agreeFlowGroup || '');
    agreeFormat.value = String(el.options.agreeFormat || '');
    syncingCols = true;
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
      agreeHideZero: c.agreeHideZero,
      agreeColFormat: c.agreeColFormat,
    }));
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
      '把字段拖到纸面可直接生成，或先点纸面元素再点数据源改绑定',
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

defineExpose({ applyDictionaryPick });

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
  if (!el || !col || !props.templateJson) return;
  try {
    const next = patchTableColumnFieldByIndex(
      props.templateJson,
      el,
      index,
      prevField,
      { field: col.field.trim(), title: col.title.trim() },
      { rowIndex: col.rowIndex, cellIndex: col.cellIndex },
    );
    emit('canvasPatch', next);
    ElMessage.success(`已绑定列「${col.title || col.field}」`);
  } catch (error: any) {
    ElMessage.error(error?.message || '绑定列字段失败');
  }
}

/** 应用文本/码图绑定 */
function applyTextBind() {
  const el = selected.value;
  if (!el || !props.templateJson) return;
  const dict = AGREE_PRINT_ALL_FIELDS.find((f) => f.field === bindField.value);
  const next = patchElementOptions(props.templateJson, el, {
    field: bindField.value.trim(),
    title: bindTitle.value.trim() || dict?.text || '文本',
    testData: dict?.testData || '',
    textType: dict?.textType || '',
    ...(dict?.textType === 'qrcode' ? { hideTitle: true, qrcodeLevel: 1 } : {}),
    ...(dict?.textType === 'barcode'
      ? {
          hideTitle: true,
          barcodeMode: 'CODE128',
          barAutoWidth: true,
        }
      : {}),
  });
  emit('canvasPatch', next);
  ElMessage.success('已绑定数据');
}

/**
 * 应用表格数据源
 * @param usePreset 是否套用推荐列（会变成单行表头）
 */
async function applyTableSource(usePreset: boolean) {
  const el = selected.value;
  if (!el || !props.templateJson) return;
  const field = bindField.value.trim();
  if (!field) {
    ElMessage.warning('请选择表格数据源');
    return;
  }
  let next = patchElementOptions(props.templateJson, el, {
    field,
    agreeRowFilter: rowFilter.value.trim(),
  });
  if (usePreset && TABLE_COLUMN_PRESETS[field]) {
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
  emit('canvasPatch', next);
  ElMessage.success(
    usePreset && TABLE_COLUMN_PRESETS[field]
      ? '已绑定数据源并套用推荐列'
      : '已绑定表格数据源',
  );
}

/** 保存列映射：按格子补丁，不拍扁多行表头 */
function persistColumns(opts?: { remount?: boolean; silent?: boolean }) {
  const el = selected.value;
  if (!el || !props.templateJson) return;
  const next = patchLeafTableColumns(props.templateJson, el, columns.value);
  const withFilter = patchElementOptions(next, el, {
    field: bindField.value.trim(),
    agreeRowFilter: rowFilter.value.trim(),
  });
  emit('canvasPatch', withFilter, { remount: opts?.remount !== false });
  if (!opts?.silent) {
    ElMessage.success('列配置已应用到画布');
  }
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

/** 标题 / field / 宽：写回并刷新表头 */
function onColumnMetaChange() {
  if (syncingCols) return;
  persistColumns({ remount: true, silent: true });
}

/** 合并 / 隐零 / 格式：立刻写回，预览才能读到 */
function onColumnFlagChange() {
  persistColumns({ remount: false, silent: true });
}

/**
 * 写入显隐 / 回流 / 文本格式，不改筛行，不重绘画布
 * @param opts.silent 不弹成功提示（失焦、点预设）
 */
function persistRules(opts?: { silent?: boolean }) {
  const el = selected.value;
  if (!el || !props.templateJson) return;
  const next = patchElementOptions(props.templateJson, el, {
    agreeVisibleWhen: agreeVisibleWhen.value.trim(),
    agreeFlowGroup: agreeFlowGroup.value.trim(),
    ...(isTextLike.value ? { agreeFormat: agreeFormat.value.trim() } : {}),
  });
  emit('canvasPatch', next, { remount: false });
  if (!opts?.silent) {
    ElMessage.success('规则已写入，请用快速预览查看显隐效果');
  }
}

/** 失焦 / 下拉变更时静默写回（避免 ElSelect 把值当成 opts） */
function persistRulesSilent() {
  persistRules({ silent: true });
}

/**
 * 填入显隐预设并立刻写回
 * @param value 表达式
 */
function applyVisiblePreset(value: string) {
  agreeVisibleWhen.value = value;
  persistRules({ silent: true });
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
  if (!el || !props.templateJson) return;
  rowFilter.value = expr;
  const next = patchElementOptions(props.templateJson, el, {
    agreeRowFilter: expr.trim(),
  });
  emit('canvasPatch', next, { remount: false });
  ElMessage.success(
    expr.trim()
      ? '已筛选打印行，请用快速预览核对（画布仍显示全部样例行）'
      : '已清除筛选，将打印全部行',
  );
}

function addEmptyColumn() {
  columns.value.push({
    rowIndex: -1,
    cellIndex: -1,
    title: '新列',
    field: '',
    width: 80,
    align: 'left',
    tableSummary: false,
    agreeColExpr: '',
    agreeMergeSame: false,
    agreeHideZero: false,
    agreeColFormat: '',
  });
  persistColumns({ remount: true, silent: true });
}

function removeColumn(index: number) {
  columns.value.splice(index, 1);
  persistColumns({ remount: true, silent: true });
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
    <div class="print-inspector__title">数据 / 规则</div>
    <ElSelect
      :model-value="selectedKey"
      filterable
      class="mb-2 w-full"
      placeholder="选择要编辑的纸面元素"
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
      <ElTag size="small">{{ selected.type }}</ElTag>
      <ElTag v-if="selected.field" size="small" type="info">
        {{ selected.field }}
      </ElTag>
      <ElTag v-else size="small" type="warning">未绑定</ElTag>
    </div>
    <ElAlert
      v-else
      type="info"
      :closable="false"
      title="先选纸面元素。新建请把左侧字段拖到纸面；改绑请点「选择字段」。"
      class="mb-2"
    />

    <ElTabs v-if="selected" v-model="activeTab" class="print-inspector__tabs">
      <ElTabPane label="数据" name="data">
        <ElForm v-if="isTextLike" label-position="top" size="small">
          <ElFormItem label="显示标题">
            <ElInput
              v-model="bindTitle"
              placeholder="纸面上的标签，如 征收人"
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
        </ElForm>

        <ElForm v-else-if="isTable" label-position="top" size="small">
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

          <div class="print-inspector__col-head">
            <span>列映射</span>
            <ElButton size="small" text @click="addEmptyColumn">加列</ElButton>
          </div>
          <p v-if="isMultiRowHeader" class="print-inspector__hint mb-2">
            多行表头：下列为数据列。分组标题请在画布修改；加列会追加到末行。
          </p>
          <p class="print-inspector__hint mb-2">
            合并 / 隐零 /
            格式只在<strong>快速预览</strong>里看。标题、字段失焦即写入。
          </p>
          <div
            v-for="(col, i) in columns"
            :key="i"
            class="print-inspector__col"
          >
            <div class="print-inspector__col-id">
              <ElInput
                v-model="col.title"
                size="small"
                placeholder="表头"
                @blur="onColumnMetaChange"
              />
              <div class="print-inspector__col-field">
                <ElInput
                  v-model="col.field"
                  size="small"
                  placeholder="field"
                  @blur="onColumnMetaChange"
                />
                <ElButton size="small" @click="openFieldPicker('column', i)">
                  选
                </ElButton>
              </div>
              <ElButton
                size="small"
                text
                type="danger"
                @click="removeColumn(i)"
              >
                删
              </ElButton>
            </div>
            <div class="print-inspector__col-ops">
              <span class="print-inspector__col-label">宽</span>
              <ElInputNumber
                v-model="col.width"
                class="print-inspector__col-width"
                size="small"
                :min="24"
                :max="400"
                :step="1"
                :precision="0"
                controls-position="right"
                @change="onColumnMetaChange"
              />
              <template v-if="showColFormat(col)">
                <span class="print-inspector__col-label">格式</span>
                <ElSelect
                  v-model="col.agreeColFormat"
                  class="print-inspector__col-format"
                  size="small"
                  clearable
                  placeholder="原值"
                  @change="onColumnFlagChange"
                >
                  <ElOption
                    v-for="p in AGREE_PRINT_FORMAT_PRESETS"
                    :key="p.value"
                    :label="p.label"
                    :value="p.value"
                  />
                </ElSelect>
              </template>
              <template v-if="isNumericDataCol(col)">
                <span class="print-inspector__col-label">合计</span>
                <ElSwitch
                  v-model="col.tableSummary"
                  size="small"
                  @change="onColumnFlagChange"
                />
                <span class="print-inspector__col-label">隐零</span>
                <ElSwitch
                  v-model="col.agreeHideZero"
                  size="small"
                  @change="onColumnFlagChange"
                />
              </template>
              <span class="print-inspector__col-label">合并</span>
              <ElSwitch
                v-model="col.agreeMergeSame"
                size="small"
                @change="onColumnFlagChange"
              />
            </div>
          </div>
        </ElForm>

        <div v-else class="text-xs text-gray-500">装饰元素无需绑定数据。</div>
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

        <p class="print-inspector__hint mb-2">
          显隐控制<strong>整块印不印</strong>。画布仍显示全部元素，请用<strong>快速预览</strong>核对。
        </p>
        <ElForm label-position="top" size="small">
          <ElFormItem label="条件显隐">
            <ElInput
              v-model="agreeVisibleWhen"
              type="textarea"
              :rows="2"
              placeholder="如 hasRewards、amount > 500000；空则始终打印"
              @blur="persistRulesSilent"
            />
            <div class="mt-1 flex flex-wrap gap-1">
              <ElButton
                v-for="p in PRINT_EXPR_PRESETS.visibleWhen"
                :key="p.value"
                size="small"
                @click="applyVisiblePreset(p.value)"
              >
                {{ p.label }}
              </ElButton>
            </div>
            <ElAlert
              v-if="agreeVisibleWhen"
              class="mt-2"
              :type="visibleAlertType"
              :closable="false"
              :title="
                visibleCheck.ok
                  ? visibleSampleLabel(visibleCheck.preview)
                  : visibleCheck.message
              "
            />
          </ElFormItem>
          <ElFormItem label="回流组">
            <ElInput
              v-model="agreeFlowGroup"
              placeholder="页眉 header；房屋 houses；奖励 rewards"
              @blur="persistRulesSilent"
            />
          </ElFormItem>
          <ElFormItem v-if="isTextLike" label="文本格式">
            <ElSelect
              v-model="agreeFormat"
              clearable
              placeholder="原值"
              class="w-full"
              @change="persistRulesSilent"
            >
              <ElOption
                v-for="p in AGREE_PRINT_FORMAT_PRESETS"
                :key="p.value"
                :label="p.label"
                :value="p.value"
              />
            </ElSelect>
          </ElFormItem>
          <ElButton type="primary" size="small" @click="persistRules()">
            写入规则
          </ElButton>
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
            筛行只决定这张表印哪些行，和上面「整块隐藏」不是一回事。画布仍显示全部样例行，请用<strong>快速预览</strong>看过滤结果。
          </p>
          <div class="print-inspector__filter-brief mb-2">
            <ElTag size="small" :type="rowFilter ? 'warning' : 'info'">
              {{ filterSummary }}
            </ElTag>
            <span v-if="currentTableField" class="text-xs text-gray-500">
              样例将打印 {{ filterRowCount.kept }} /
              {{ filterRowCount.total }} 行
            </span>
          </div>
          <div class="mb-2 flex flex-wrap gap-1">
            <ElButton type="primary" size="small" @click="openFilterDialog">
              筛选打印行
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
}

.print-inspector__title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
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
  color: #6b7280;
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

.print-inspector__col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px dashed #e5e7eb;
}

.print-inspector__col-id {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) auto;
  gap: 4px;
  align-items: center;
}

.print-inspector__col-ops {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px 6px;
  align-items: center;
  overflow-x: auto;
}

.print-inspector__col-label {
  flex-shrink: 0;
  font-size: 11px;
  color: #6b7280;
}

.print-inspector__col-width {
  flex-shrink: 0;
  width: 88px;
}

.print-inspector__col-width :deep(.el-input-number) {
  width: 88px;
}

.print-inspector__col-format {
  flex: 1;
  min-width: 104px;
}

.print-inspector__desc {
  margin: 0 0 8px;
  font-size: 11px;
  color: #6b7280;
}

.print-inspector__filter-brief {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #374151;
}

.print-inspector__rule-split {
  padding-top: 12px;
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  border-top: 1px solid #e5e7eb;
}

.print-inspector__help-block {
  margin-bottom: 10px;
  font-size: 12px;
  color: #4b5563;
}

.print-inspector__help-title {
  margin-bottom: 4px;
  font-weight: 600;
  color: #374151;
}

.print-inspector__help-block ul {
  padding-left: 16px;
  margin: 0;
}
</style>

<script lang="ts" setup>
import type {
  PrintFilterColumn,
  PrintFilterCond,
  PrintFilterOp,
  PrintFilterPreset,
} from '../runtime/print-row-filter';
/**
 * 筛选打印行编辑器：可视化拼 agreeRowFilter，弹窗和明细表内嵌共用
 */
import type { AgreePrintData } from '../types';

import { computed, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElSwitch,
} from 'element-plus';

import { AGREE_PRINT_TABLE_FIELDS } from '../data/fields';
import { validatePrintExpr } from '../runtime/print-expr';
import {
  applyPrintExprInsert,
  filterPrintExprFields,
  printExprInputEl,
} from '../runtime/print-expr-catalog';
import {
  buildFilterPresets,
  compileFilterConds,
  describeFilterExpr,
  emptyCond,
  filterOpNeedsValue,
  listFilterColumns,
  parseFilterExpr,
  previewFilterRowCount,
  PRINT_FILTER_OP_OPTIONS,
} from '../runtime/print-row-filter';
import PrintExprHelp from './print-expr-help.vue';

const props = defineProps<{
  /** 画布列（没有则用预设列） */
  columns: PrintFilterColumn[];
  /** 收起说明，给明细表内嵌用 */
  dense?: boolean;
  /** 当前 agreeRowFilter */
  filterExpr: string;
  sampleData: AgreePrintData;
  /** 内嵌时自己带清除按钮 */
  showActions?: boolean;
  /** 为 false 时不显示「应用到模板」，改由外层底栏一次性提交 */
  showApply?: boolean;
  /** 表格数据源 field，如 houses */
  tableField: string;
}>();

const emit = defineEmits<{
  /** 应用筛选表达式；空字符串表示清除 */
  apply: [string];
}>();

const join = ref<'and' | 'or'>('and');
const conds = ref<PrintFilterCond[]>([emptyCond()]);
const advanced = ref(false);
const advancedExpr = ref('');
/** 高级表达式输入框，供芯片按光标插入 */
const advancedInputRef = ref<null | { textarea?: HTMLTextAreaElement }>(null);

const tableLabel = computed(
  () =>
    AGREE_PRINT_TABLE_FIELDS.find((t) => t.field === props.tableField)?.text ||
    props.tableField ||
    '未绑定数据源',
);

const columnOptions = computed(() =>
  listFilterColumns(props.tableField, props.columns),
);
/** 筛行高级表达式可点插入的字段 */
const advancedHelpFields = computed(() =>
  filterPrintExprFields(columnOptions.value),
);

/**
 * 把帮助芯片插入高级表达式当前光标
 * @param token 字段名或函数骨架
 */
function insertAdvancedExpr(token: string) {
  advancedExpr.value = applyPrintExprInsert(
    advancedExpr.value,
    token,
    printExprInputEl(advancedInputRef.value),
  );
}

const presets = computed(() => buildFilterPresets(columnOptions.value));

/** 当前可视化/高级编辑将写出的表达式 */
const draftExpr = computed(() => {
  if (advanced.value) return advancedExpr.value.trim();
  return compileFilterConds(conds.value, join.value);
});

const rowCount = computed(() =>
  previewFilterRowCount(props.tableField, draftExpr.value, props.sampleData),
);

const summary = computed(() =>
  describeFilterExpr(draftExpr.value, columnOptions.value),
);

const expressionCheck = computed(() => {
  const rows = (props.sampleData as unknown as Record<string, unknown>)[
    props.tableField
  ];
  const row = Array.isArray(rows) ? rows[0] || {} : {};
  return validatePrintExpr(draftExpr.value, {
    ...(props.sampleData as unknown as Record<string, unknown>),
    ...row,
    i: 0,
    index: 0,
    row,
  });
});

/**
 * 按已保存表达式回填可视化条件
 * @param expr 已保存的 agreeRowFilter
 */
function hydrateFromExpr(expr: string) {
  const parsed = parseFilterExpr(expr);
  join.value = parsed.join;
  if (parsed.advanced && expr.trim()) {
    advanced.value = true;
    advancedExpr.value = expr.trim();
    conds.value = [emptyCond()];
    return;
  }
  advanced.value = false;
  advancedExpr.value = '';
  conds.value =
    parsed.conds.length > 0
      ? parsed.conds.map((c) => ({ ...c }))
      : [emptyCond()];
}

watch(
  () => props.filterExpr,
  (expr) => hydrateFromExpr(expr),
  { immediate: true },
);

function addCond() {
  conds.value.push(emptyCond());
}

function removeCond(index: number) {
  conds.value.splice(index, 1);
  if (conds.value.length === 0) conds.value.push(emptyCond());
}

/**
 * 套用快捷筛选：只预填规则，点「应用」才写入模板
 * @param preset 预填项
 */
function applyPreset(preset: PrintFilterPreset) {
  advanced.value = false;
  join.value = preset.join;
  conds.value = preset.conds.map((c) => ({ ...c }));
}

/** 校验并写出筛选表达式；失败返回 false，供弹窗底栏一次性提交 */
function apply() {
  if (!props.tableField) {
    ElMessage.warning('请先绑定表格数据源');
    return false;
  }
  if (advanced.value) {
    if (!expressionCheck.value.ok) {
      ElMessage.error(`筛选表达式未写入：${expressionCheck.value.message}`);
      return false;
    }
    emit('apply', advancedExpr.value.trim());
    return true;
  }
  const incomplete = conds.value.filter(
    (c) => c.field && filterOpNeedsValue(c.op) && !String(c.value || '').trim(),
  );
  if (incomplete.length > 0) {
    ElMessage.warning('请把已选列的筛选值填完整，或删掉空条件');
    return false;
  }
  emit('apply', draftExpr.value);
  return true;
}

function clearFilter() {
  emit('apply', '');
}

function needsValue(op: PrintFilterOp) {
  return filterOpNeedsValue(op);
}

/**
 * 高级开关：打开时把可视化条件编译进去；关闭时尝试拆回条件
 * @param val 开关值
 */
function onAdvancedToggle(val: boolean | number | string) {
  const on = Boolean(val);
  if (on) {
    advanced.value = true;
    advancedExpr.value =
      compileFilterConds(conds.value, join.value) || props.filterExpr;
    return;
  }
  const parsed = parseFilterExpr(advancedExpr.value);
  if (parsed.advanced) {
    ElMessage.info('当前表达式较复杂，已保留高级编辑');
    advanced.value = true;
    return;
  }
  advanced.value = false;
  join.value = parsed.join;
  conds.value = parsed.conds;
}

defineExpose({ apply, clearFilter });
</script>

<template>
  <div class="print-filter-panel">
    <ElAlert
      v-if="!dense"
      class="mb-3"
      type="info"
      :closable="false"
      :title="`当前表：${tableLabel}${tableField ? ` (${tableField})` : ''}。决定打印哪些行，不是合计。快捷项只预填「金额为 0 / 名称为空」，比较值可改。样例行数仅设计器预览，正式打印走接口 JSON。`"
    />

    <ElAlert
      v-if="draftExpr && !expressionCheck.ok"
      class="mb-2"
      type="error"
      :closable="false"
      :title="expressionCheck.message"
    />

    <div v-if="presets.length" class="mb-3 flex flex-wrap gap-1">
      <ElButton
        v-for="p in presets"
        :key="`${p.conds[0]?.field}-${p.conds[0]?.op}-${p.label}`"
        size="small"
        @click="applyPreset(p)"
      >
        {{ p.label }}
      </ElButton>
    </div>

    <div class="mb-3 flex items-center justify-between gap-2">
      <span class="text-xs text-gray-500">条件关系</span>
      <div class="flex items-center gap-2">
        <ElRadioGroup v-model="join" size="small" :disabled="advanced">
          <ElRadioButton value="and">同时满足（且）</ElRadioButton>
          <ElRadioButton value="or">满足其一（或）</ElRadioButton>
        </ElRadioGroup>
        <span class="text-xs text-gray-500">高级表达式</span>
        <ElSwitch v-model="advanced" @change="onAdvancedToggle" />
      </div>
    </div>

    <ElInput
      v-if="advanced"
      ref="advancedInputRef"
      v-model="advancedExpr"
      type="textarea"
      :rows="3"
      placeholder="复杂条件可手写，如 amount > 0 && !EMPTY(name)"
    />
    <PrintExprHelp
      v-if="advanced"
      scene="filter"
      :fields="advancedHelpFields"
      @insert="insertAdvancedExpr"
    />

    <div v-else class="print-filter-panel__conds">
      <div v-for="(cond, i) in conds" :key="i" class="print-filter-panel__row">
        <ElSelect
          v-model="cond.field"
          filterable
          placeholder="列"
          class="print-filter-panel__col"
        >
          <ElOption
            v-for="c in columnOptions"
            :key="c.field"
            :label="`${c.title} (${c.field})`"
            :value="c.field"
          />
        </ElSelect>
        <ElSelect v-model="cond.op" class="print-filter-panel__op">
          <ElOption
            v-for="op in PRINT_FILTER_OP_OPTIONS"
            :key="op.value"
            :label="op.label"
            :value="op.value"
          />
        </ElSelect>
        <ElInput
          v-if="needsValue(cond.op)"
          v-model="cond.value"
          :placeholder="
            cond.op === 'in' || cond.op === 'notIn' ? '多个值用逗号分隔' : '值'
          "
        />
        <span v-else class="print-filter-panel__na">无需填值</span>
        <ElButton size="small" text type="danger" @click="removeCond(i)">
          删
        </ElButton>
      </div>
      <ElButton size="small" @click="addCond">加条件</ElButton>
    </div>

    <ElAlert
      class="mt-3"
      :type="rowCount.kept === 0 && rowCount.total > 0 ? 'warning' : 'success'"
      :closable="false"
      :title="
        tableField
          ? `样例将打印 ${rowCount.kept} / ${rowCount.total} 行（仅设计器预览）。${summary}`
          : '请先绑定表格数据源后再筛选'
      "
    />

    <ElFormItem v-if="draftExpr" class="mt-2" label="将写入">
      <code class="text-xs break-all">{{ draftExpr }}</code>
    </ElFormItem>

    <div v-if="showActions" class="print-filter-panel__actions">
      <ElButton size="small" @click="clearFilter">清除筛选</ElButton>
      <ElButton
        v-if="showApply !== false"
        type="primary"
        size="small"
        @click="apply"
      >
        应用到模板
      </ElButton>
    </div>
  </div>
</template>

<style scoped>
.print-filter-panel__conds {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.print-filter-panel__row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1.4fr auto;
  gap: 6px;
  align-items: center;
}

.print-filter-panel__na {
  font-size: 12px;
  color: #9ca3af;
}

.print-filter-panel__col,
.print-filter-panel__op {
  width: 100%;
}

.print-filter-panel__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>

<script lang="ts" setup>
import type { PrintFilterColumn } from '../runtime/print-row-filter';
import type { AgreePrintData } from '../types';

import { computed, ref, watch } from 'vue';

import { ElAlert, ElButton, ElMessage } from 'element-plus';

import { AGREE_PRINT_TABLE_FIELDS } from '../data/fields';
import { evalPrintExpr, validatePrintExpr } from '../runtime/print-expr';
import { filterPrintExprFields } from '../runtime/print-expr-catalog';
import {
  describeFilterExpr,
  listFilterColumns,
  previewFilterRowCount,
} from '../runtime/print-row-filter';
import PrintConditionEditor from './print-condition-editor.vue';

const props = defineProps<{
  columns: PrintFilterColumn[];
  dense?: boolean;
  filterExpr: string;
  sampleData: AgreePrintData;
  showActions?: boolean;
  showApply?: boolean;
  tableField: string;
}>();
const emit = defineEmits<{ apply: [string] }>();
const draftExpr = ref('');
const ready = ref(true);
const tableLabel = computed(
  () =>
    AGREE_PRINT_TABLE_FIELDS.find((item) => item.field === props.tableField)
      ?.text ||
    props.tableField ||
    '未绑定数据源',
);
const columnOptions = computed(() =>
  listFilterColumns(props.tableField, props.columns),
);
const fields = computed(() => filterPrintExprFields(columnOptions.value));
const rowCount = computed(() =>
  previewFilterRowCount(props.tableField, draftExpr.value, props.sampleData),
);
const summary = computed(() =>
  describeFilterExpr(draftExpr.value, columnOptions.value),
);
const expressionContext = computed(() => {
  const rows = (props.sampleData as unknown as Record<string, unknown>)[
    props.tableField
  ];
  const row = Array.isArray(rows) ? rows[0] || {} : {};
  return {
    ...(props.sampleData as unknown as Record<string, unknown>),
    ...row,
    i: 0,
    index: 0,
    row,
  };
});
const check = computed(() =>
  validatePrintExpr(draftExpr.value, expressionContext.value),
);
const nonBoolean = computed(
  () =>
    ready.value &&
    check.value.ok &&
    draftExpr.value.trim() &&
    typeof evalPrintExpr(draftExpr.value, expressionContext.value) !==
      'boolean',
);
watch(
  () => props.filterExpr,
  (value) => {
    draftExpr.value = value;
  },
  { immediate: true },
);
function apply() {
  if (!props.tableField) {
    ElMessage.warning('请先绑定表格数据源');
    return false;
  }
  if (!ready.value) {
    ElMessage.warning('请填完整条件，或移除未完成的条件');
    return false;
  }
  if (!check.value.ok) {
    ElMessage.error(`筛选未应用：${check.value.message}`);
    return false;
  }
  emit('apply', draftExpr.value.trim());
  return true;
}
function clearFilter() {
  emit('apply', '');
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
      :title="`正在筛选：${tableLabel} · 全部明细行。条件成立的记录会打印；下方结果根据当前样例数据计算。`"
    />
    <PrintConditionEditor
      v-model="draftExpr"
      scene="filter"
      :context="expressionContext"
      :fields="fields"
      @ready="ready = $event"
    />
    <ElAlert
      class="mt-3"
      :type="
        !ready || !check.ok
          ? 'error'
          : rowCount.kept === 0 && rowCount.total > 0
            ? 'warning'
            : 'success'
      "
      :closable="false"
      :title="
        !ready
          ? '请填完整条件后再应用'
          : !check.ok
            ? check.message
            : tableField
              ? `样例将打印 ${rowCount.kept} / ${rowCount.total} 行。${summary}`
              : '请先绑定表格数据源后再筛选'
      "
    />
    <ElAlert
      v-if="nonBoolean"
      class="mt-3"
      type="warning"
      :closable="false"
      title="筛选条件通常应返回真 / 假。当前结果将按真假判断，建议使用比较符或 EMPTY 等函数。"
    />
    <details v-if="draftExpr" class="print-filter-panel__formula">
      <summary>查看生成的公式</summary>
      <code>{{ draftExpr }}</code>
    </details>
    <div v-if="showActions" class="print-filter-panel__actions">
      <ElButton size="small" @click="clearFilter">清除筛选</ElButton>
      <ElButton
        v-if="showApply !== false"
        type="primary"
        size="small"
        :disabled="!ready || !check.ok"
        @click="apply"
      >
        应用筛选
      </ElButton>
    </div>
  </div>
</template>

<style scoped>
.print-filter-panel__formula {
  margin-top: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.print-filter-panel__formula summary {
  cursor: pointer;
}

.print-filter-panel__formula code {
  display: block;
  margin-top: 6px;
  overflow-wrap: anywhere;
}

.print-filter-panel__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>

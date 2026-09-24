<script lang="ts" setup>
import type { PrintFilterColumn } from '../runtime/print-row-filter';
/**
 * 筛选打印行弹窗：包一层面板，画布「更多条件」用；明细表内嵌不再套它
 */
import type { AgreePrintData } from '../types';

import { ref } from 'vue';

import { ElButton, ElDialog } from 'element-plus';

import PrintFilterPanel from './print-filter-panel.vue';

const props = defineProps<{
  columns: PrintFilterColumn[];
  filterExpr: string;
  modelValue: boolean;
  sampleData: AgreePrintData;
  tableField: string;
}>();

const emit = defineEmits<{
  apply: [string];
  'update:modelValue': [boolean];
}>();

const panelRef = ref<null | { apply: () => void; clearFilter: () => void }>(
  null,
);

function close() {
  emit('update:modelValue', false);
}

/** 面板写入后关掉弹窗，避免套在明细表里再叠一层 */
function onApply(expr: string) {
  emit('apply', expr);
  close();
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    title="筛选打印行"
    width="640px"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <PrintFilterPanel
      v-if="modelValue"
      ref="panelRef"
      :columns="props.columns"
      :filter-expr="props.filterExpr"
      :sample-data="props.sampleData"
      :table-field="props.tableField"
      @apply="onApply"
    />
    <template #footer>
      <ElButton @click="panelRef?.clearFilter()">
清除筛选（打印全部行）
</ElButton>
      <ElButton @click="close">取消</ElButton>
      <ElButton type="primary" @click="panelRef?.apply()">应用到模板</ElButton>
    </template>
  </ElDialog>
</template>

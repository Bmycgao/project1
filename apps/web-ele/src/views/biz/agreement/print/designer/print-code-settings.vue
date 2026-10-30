<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

import { ElAlert, ElFormItem, ElOption, ElSelect } from 'element-plus';

import { buildPrintBarcode } from '../runtime/print-barcode';
import { resolvePrintTextValue } from '../runtime/print-text-value';

const props = defineProps<{
  options: Record<string, any>;
  sampleData: Record<string, unknown>;
}>();
const emit = defineEmits<{ patch: [Record<string, unknown>] }>();
const isBarcode = computed(() => props.options.textType === 'barcode');
const value = computed(() =>
  resolvePrintTextValue(props.options, props.sampleData as any),
);
const errorMessage = ref('');
const warning = ref('');
let generation = 0;
watch(
  () => [
    value.value,
    props.options.barcodeMode,
    props.options.width,
    isBarcode.value,
  ],
  async () => {
    const version = ++generation;
    errorMessage.value = '';
    warning.value = '';
    if (!isBarcode.value) return;
    try {
      const result = await buildPrintBarcode(value.value, props.options);
      if (version === generation) warning.value = result.warning;
    } catch (error) {
      if (version === generation)
        errorMessage.value =
          error instanceof Error ? error.message : String(error);
    }
  },
  { immediate: true },
);
</script>

<template>
  <ElFormItem v-if="isBarcode" label="条形码码制">
    <ElSelect
      :model-value="options.barcodeMode || 'CODE128'"
      filterable
      allow-create
      @change="emit('patch', { barcodeMode: $event, barAutoWidth: false })"
    >
      <ElOption
        v-for="mode in [
          'CODE128',
          'CODE39',
          'EAN13',
          'EAN8',
          'ITF14',
          'ITF',
          'UPC',
          'codabar',
        ]"
        :key="mode"
        :label="mode"
        :value="mode"
      />
    </ElSelect>
  </ElFormItem>
  <ElFormItem label="当前样例编码内容">
    <p class="print-code-settings__value">{{ value || '（空）' }}</p>
  </ElFormItem>
  <ElAlert
    v-if="errorMessage"
    :title="errorMessage"
    type="error"
    :closable="false"
    class="mb-2"
  />
  <ElAlert
    v-else-if="warning"
    :title="warning"
    type="warning"
    :closable="false"
    class="mb-2"
  />
  <p class="mb-3 text-xs text-gray-500">
    打印尺寸在「外观」中设置。更换字段保持尺寸；条形码内容变化会改变条纹密度。
  </p>
</template>

<style scoped>
.print-code-settings__value {
  width: 100%;
  padding: 8px;
  font-size: 12px;
  overflow-wrap: anywhere;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}
</style>

<script lang="ts" setup>
/**
 * 粘贴数据源 JSON：只改预览/打印用的业务数据，不改模板版式
 */
import type { AgreePrintData } from './types';

import { ref, watch } from 'vue';

import { ElAlert, ElButton, ElDialog, ElInput, ElMessage } from 'element-plus';

import {
  buildDesignerSamplePrintData,
  parseAgreePrintDataJson,
} from './sample-print-data';

const props = defineProps<{
  /** 打开时填入编辑器的当前数据 */
  initialData: AgreePrintData;
  modelValue: boolean;
}>();

const emit = defineEmits<{
  apply: [AgreePrintData];
  'update:modelValue': [boolean];
}>();

const jsonText = ref('');

/** 打开时带入当前数据，方便改几个字段再应用 */
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      jsonText.value = JSON.stringify(props.initialData, null, 2);
    }
  },
);

function close() {
  emit('update:modelValue', false);
}

/** 用设计器内置样例覆盖编辑器（不立刻应用） */
function fillSample() {
  jsonText.value = JSON.stringify(buildDesignerSamplePrintData(), null, 2);
}

/** 解析并交给父级替换 printData */
function onApply() {
  const result = parseAgreePrintDataJson(jsonText.value, props.initialData);
  if (!result.ok) {
    ElMessage.warning(result.message);
    return;
  }
  emit('apply', result.data);
  emit('update:modelValue', false);
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    title="数据源 JSON"
    width="640px"
    top="8vh"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElAlert
      class="mb-2"
      type="info"
      :closable="false"
      title="贴的是业务数据（compensatee、houses 等），不是带 panels 的模板。缺的字段用当前数据补齐。请勿粘贴生产库真实姓名/证号。画布格子可能仍显示元素 testData，请用快速预览核对。"
    />
    <ElInput
      v-model="jsonText"
      type="textarea"
      :rows="18"
      class="print-data-json__input font-mono text-xs"
    />
    <template #footer>
      <ElButton @click="fillSample">填入样例</ElButton>
      <ElButton @click="close">取消</ElButton>
      <ElButton type="primary" @click="onApply">应用</ElButton>
    </template>
  </ElDialog>
</template>

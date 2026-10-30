<script lang="ts" setup>
import type { PrintSamplePreset } from './data/sample-print-data';
import type { AgreePrintData } from './types';

import { computed, ref, watch } from 'vue';

import { ElAlert, ElButton, ElDialog, ElInput, ElMessage } from 'element-plus';

import {
  buildDesignerSamplePrintData,
  parseAgreePrintDataJson,
} from './data/sample-print-data';

const props = defineProps<{
  initialData: AgreePrintData;
  initialPreset?: 'custom' | PrintSamplePreset;
  modelValue: boolean;
  usage?: 'designer' | 'preview';
}>();
const emit = defineEmits<{
  apply: [AgreePrintData, 'custom' | PrintSamplePreset];
  'update:modelValue': [boolean];
}>();
const jsonText = ref('');
const source = ref<'custom' | PrintSamplePreset>('custom');
const jsonExpanded = ref(false);
const summary = computed(() => {
  try {
    const draft = JSON.parse(jsonText.value);
    return [
      ['房屋', draft.houses],
      ['补偿', draft.compensationItems],
      ['奖励', draft.rewardItems],
    ]
      .map(
        ([label, rows]) =>
          `${label} ${Array.isArray(rows) ? rows.length : 0} 条`,
      )
      .join(' · ');
  } catch {
    return 'JSON 格式有误，请修改后应用';
  }
});
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      jsonText.value = JSON.stringify(props.initialData, null, 2);
      source.value = props.initialPreset || 'custom';
      jsonExpanded.value = source.value === 'custom';
    }
  },
);
function fillSample() {
  jsonText.value = JSON.stringify(buildDesignerSamplePrintData(), null, 2);
  source.value = 'example';
}
function onApply() {
  const result = parseAgreePrintDataJson(jsonText.value, props.initialData);
  if (!result.ok) {
    ElMessage.warning(result.message);
    jsonExpanded.value = true;
    return;
  }
  emit('apply', result.data, source.value);
  emit('update:modelValue', false);
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    title="编辑预览数据"
    width="min(680px, 94vw)"
    top="8vh"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElAlert
      type="info"
      :closable="false"
      :title="
        usage === 'designer'
          ? '默认使用一套完整示例数据，包含多条补偿明细，可直接检查分页。自定义修改仅用于本次画布和预览，不随模板保存；重新打开恢复完整示例。'
          : '数据仅用于本次预览，不修改业务记录。恢复示例数据会替换当前预览内容；正式打印前请检查使用的数据。'
      "
    />
    <div class="print-data-json__summary">
      <strong>{{
        source === 'example' ? '完整示例数据' : '当前预览数据'
      }}</strong>
      <span>{{ summary }}</span>
    </div>
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <ElButton @click="fillSample">恢复示例数据</ElButton>
      <ElButton
        :aria-expanded="jsonExpanded"
        @click="jsonExpanded = !jsonExpanded"
      >
        {{ jsonExpanded ? '收起 JSON' : '编辑 JSON' }}
      </ElButton>
      <span class="text-xs text-gray-500">点击「应用到预览」后更新画布</span>
    </div>
    <template v-if="jsonExpanded">
      <p class="mb-2 text-xs text-gray-500">
        可修改记录、金额或填入空数组。缺少的字段沿用当前数据；请输入完整 JSON
        以替换对应字段。
      </p>
      <ElInput
        v-model="jsonText"
        aria-label="预览数据 JSON"
        type="textarea"
        :rows="16"
        class="print-data-json__input font-mono text-xs"
        @input="source = 'custom'"
      />
    </template>
    <template #footer>
      <ElButton @click="emit('update:modelValue', false)">取消</ElButton>
      <ElButton type="primary" @click="onApply">应用到预览</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.print-data-json__summary {
  display: grid;
  gap: 6px;
  padding: 16px 0;
}

.print-data-json__summary span {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>

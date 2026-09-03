<script lang="ts" setup>
import type { AgreePrintWatermark } from './print-watermark';

/**
 * 打印水印对话框：写入 panel.watermarkOptions，预览/打印共用
 */
import { ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElColorPicker,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElSelect,
  ElSwitch,
} from 'element-plus';

import {
  applyWatermarkToTemplate,
  DEFAULT_AGREE_WATERMARK,
  readTemplateWatermark,
  WATERMARK_TIME_FORMATS,
} from './print-watermark';

const props = defineProps<{
  modelValue: boolean;
  /** 当前模板 JSON */
  templateJson: null | Record<string, any>;
}>();

const emit = defineEmits<{
  /** 写回带水印的模板 */
  apply: [Record<string, any>];
  'update:modelValue': [boolean];
}>();

const enabled = ref(false);
const content = ref(DEFAULT_AGREE_WATERMARK.content);
const rotate = ref(DEFAULT_AGREE_WATERMARK.rotate);
const fontSize = ref(16);
const fillStyle = ref(DEFAULT_AGREE_WATERMARK.fillStyle);
const timestamp = ref(false);
const timeFormat = ref(DEFAULT_AGREE_WATERMARK.format);

/**
 * 从模板回填表单
 * @param json 模板
 */
function fillFromTemplate(json: null | Record<string, any>) {
  const { draft, enabled: on } = readTemplateWatermark(json);
  enabled.value = on;
  content.value = draft.content;
  rotate.value = draft.rotate;
  fontSize.value = Number.parseInt(draft.fontSize, 10) || 16;
  fillStyle.value = draft.fillStyle;
  timestamp.value = draft.timestamp;
  timeFormat.value = draft.format;
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) fillFromTemplate(props.templateJson);
  },
);

function close() {
  emit('update:modelValue', false);
}

/** 组装表单为水印草稿 */
function toDraft(): AgreePrintWatermark {
  return {
    content: content.value.trim(),
    rotate: rotate.value,
    fontSize: `${fontSize.value}px`,
    fillStyle: fillStyle.value,
    width: DEFAULT_AGREE_WATERMARK.width,
    height: DEFAULT_AGREE_WATERMARK.height,
    timestamp: timestamp.value,
    format: timeFormat.value,
  };
}

/** 写回模板并关窗 */
function apply() {
  if (!props.templateJson?.panels?.length) {
    ElMessage.warning('设计器尚未就绪');
    return;
  }
  if (enabled.value && !content.value.trim()) {
    ElMessage.warning('请填写水印文字，或关闭水印');
    return;
  }
  emit(
    'apply',
    applyWatermarkToTemplate(props.templateJson, enabled.value, toDraft()),
  );
  close();
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    title="打印水印"
    width="480px"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElAlert
      type="info"
      :closable="false"
      class="mb-3"
      title="水印打在纸面上，设计器画布和快速预览都会看到。关闭后需保存模板才会进正式打印。"
    />
    <ElForm label-width="88px">
      <ElFormItem label="启用水印">
        <ElSwitch v-model="enabled" />
      </ElFormItem>
      <ElFormItem label="水印文字">
        <ElInput
          v-model="content"
          :disabled="!enabled"
          maxlength="40"
          show-word-limit
          placeholder="例如：内部资料"
        />
      </ElFormItem>
      <ElFormItem label="旋转角度">
        <ElInputNumber
          v-model="rotate"
          :disabled="!enabled"
          :min="0"
          :max="90"
          :step="5"
        />
      </ElFormItem>
      <ElFormItem label="字号">
        <ElInputNumber
          v-model="fontSize"
          :disabled="!enabled"
          :min="10"
          :max="36"
        />
      </ElFormItem>
      <ElFormItem label="颜色">
        <ElColorPicker v-model="fillStyle" :disabled="!enabled" show-alpha />
      </ElFormItem>
      <ElFormItem label="打印时间">
        <ElSwitch v-model="timestamp" :disabled="!enabled" />
      </ElFormItem>
      <ElFormItem v-if="timestamp" label="时间格式">
        <ElSelect v-model="timeFormat" :disabled="!enabled">
          <ElOption
            v-for="item in WATERMARK_TIME_FORMATS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </ElSelect>
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="close">取消</ElButton>
      <ElButton type="primary" @click="apply">应用到画布</ElButton>
    </template>
  </ElDialog>
</template>

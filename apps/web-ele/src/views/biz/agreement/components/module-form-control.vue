<script lang="ts" setup>
/**
 * 模块表单控件：按 controlType 渲染输入 / 下拉 / 日期 / 单选 / 多行
 * @param field 字段配置
 * @param modelValue 当前值
 * @param disabled 只读
 */
import type { ModuleInnerFieldItem } from '../module-inner-config';

import {
  ElDatePicker,
  ElInput,
  ElOption,
  ElRadio,
  ElRadioGroup,
  ElSelect,
} from 'element-plus';

const props = defineProps<{
  disabled?: boolean;
  field: ModuleInnerFieldItem;
  modelValue: unknown;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: number | string];
}>();

/**
 * 归一化控件类型
 */
function kindOf(field: ModuleInnerFieldItem) {
  const t = field.controlType || 'input';
  if (t === 'select' || t === 'yesno') return 'select';
  return t;
}

/**
 * 下拉/单选选项
 */
function optionsOf(field: ModuleInnerFieldItem) {
  if (field.options?.length) return field.options;
  if (field.controlType === 'yesno') {
    return [
      { label: '是', value: '是' },
      { label: '否', value: '否' },
    ];
  }
  return [];
}

const text = () => String(props.modelValue ?? '');
</script>

<template>
  <ElSelect
    v-if="kindOf(field) === 'select'"
    class="w-full"
    :disabled="disabled"
    :model-value="text()"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  >
    <ElOption
      v-for="opt in optionsOf(field)"
      :key="opt.value"
      :label="opt.label"
      :value="opt.value"
    />
  </ElSelect>
  <ElRadioGroup
    v-else-if="kindOf(field) === 'radio'"
    :disabled="disabled"
    :model-value="text()"
    @update:model-value="
      (v: string | number | boolean | undefined) =>
        emit('update:modelValue', String(v ?? ''))
    "
  >
    <ElRadio
      v-for="opt in optionsOf(field)"
      :key="opt.value"
      :value="opt.value"
    >
      {{ opt.label }}
    </ElRadio>
  </ElRadioGroup>
  <ElDatePicker
    v-else-if="kindOf(field) === 'date'"
    class="w-full"
    style="width: 100%"
    type="date"
    value-format="YYYY-MM-DD"
    :disabled="disabled"
    :placeholder="field.placeholder || '选择日期'"
    :model-value="text() || undefined"
    @update:model-value="(v: string) => emit('update:modelValue', v || '')"
  />
  <ElInput
    v-else-if="kindOf(field) === 'textarea'"
    type="textarea"
    :rows="3"
    :disabled="disabled"
    :placeholder="field.placeholder"
    :model-value="text()"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  />
  <ElInput
    v-else
    :disabled="disabled"
    :placeholder="field.placeholder"
    :model-value="text()"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  />
</template>

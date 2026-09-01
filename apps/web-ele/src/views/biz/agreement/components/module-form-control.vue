<script lang="ts" setup>
/**
 * 模块表单控件：按 controlType 渲染，合并 FC 模板只读/禁用与页面编辑态
 * @param field 字段配置
 * @param modelValue 当前值
 * @param pageEditable 详情是否编辑态
 * @param fieldEditable 角色字段是否可编辑
 */
import type { ModuleInnerFieldItem } from '../module-inner-config';

import { computed } from 'vue';

import {
  ElDatePicker,
  ElInput,
  ElOption,
  ElRadio,
  ElRadioGroup,
  ElSelect,
} from 'element-plus';

import { resolveModuleFieldControlState } from '../fc/field-lock';

const props = defineProps<{
  /** 兼容：直接整字段禁用 */
  disabled?: boolean;
  field: ModuleInnerFieldItem;
  /** 角色字段是否可编辑 */
  fieldEditable?: boolean;
  modelValue: unknown;
  /** 详情是否编辑态 */
  pageEditable?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: number | string];
}>();

/** 控件禁用/只读（含 FC 模板配置） */
const controlState = computed(() => {
  if (props.disabled) {
    return { disabled: true, readonly: false };
  }
  return resolveModuleFieldControlState(
    props.field,
    props.pageEditable ?? false,
    props.fieldEditable ?? false,
  );
});

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
    :disabled="controlState.disabled"
    :clearable="field.clearable"
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
    :disabled="controlState.disabled"
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
    :disabled="controlState.disabled"
    :readonly="controlState.readonly"
    :placeholder="field.placeholder || '选择日期'"
    :model-value="text() || undefined"
    @update:model-value="(v: string) => emit('update:modelValue', v || '')"
  />
  <ElInput
    v-else-if="kindOf(field) === 'textarea'"
    type="textarea"
    :rows="3"
    :disabled="controlState.disabled"
    :readonly="controlState.readonly"
    :maxlength="field.maxlength"
    :show-word-limit="field.maxlength != null"
    :placeholder="field.placeholder"
    :model-value="text()"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  />
  <ElInput
    v-else
    :disabled="controlState.disabled"
    :readonly="controlState.readonly"
    :maxlength="field.maxlength"
    :show-word-limit="field.maxlength != null"
    :clearable="field.clearable"
    :placeholder="field.placeholder"
    :model-value="text()"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  />
</template>

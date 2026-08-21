<script lang="ts" setup>
/**
 * FormCreate 运行时：按场景 rule 渲染表单或表格表单
 * 详情模块保存时通过 getValues / validate 取值
 */
import type { FcFormOption, FcRule } from '../fc/types';

import { ref, watch } from 'vue';

import { ElMessage } from 'element-plus';

import { buildFcFormOption, cloneFcRule } from '../fc/types';

const props = defineProps<{
  /** 整页浏览态：表单禁用 */
  disabled?: boolean;
  /** 回填值（表单 KV 或含表格数组的对象） */
  modelValue?: Record<string, unknown>;
  /** 设计器导出的 rule */
  rule: FcRule[];
}>();

const emit = defineEmits<{
  change: [];
  'update:modelValue': [val: Record<string, unknown>];
}>();

const fapi = ref<any>(null);
const formData = ref<Record<string, unknown>>({ ...props.modelValue });
const option = ref<FcFormOption>(buildFcFormOption());
const innerRule = ref<FcRule[]>(cloneFcRule(props.rule || []));

/**
 * 同步整页禁用到 FormCreate option
 * @param disabled 是否禁用
 */
function applyDisabled(disabled?: boolean) {
  const base = buildFcFormOption();
  option.value = {
    ...base,
    form: {
      ...base.form,
      disabled: !!disabled,
    },
  };
}

applyDisabled(props.disabled);

watch(
  () => props.disabled,
  (disabled) => {
    applyDisabled(disabled);
  },
);
watch(
  () => props.rule,
  (rule) => {
    innerRule.value = cloneFcRule(rule || []);
  },
  { deep: true },
);

watch(
  () => props.modelValue,
  (val) => {
    formData.value = { ...val };
    if (!fapi.value || !val) return;
    try {
      fapi.value.coverValue?.(val);
    } catch {
      fapi.value.setValue?.(val);
    }
  },
  { deep: true },
);

function onChange() {
  emit('change');
  const data = fapi.value?.formData?.() || formData.value;
  emit('update:modelValue', data);
}

/**
 * 校验必填
 */
async function validate() {
  if (!fapi.value?.validate) return true;
  try {
    await fapi.value.validate();
    return true;
  } catch {
    ElMessage.warning('请完善必填项');
    return false;
  }
}

/**
 * 取出当前表单值
 */
function getValues(): Record<string, unknown> {
  return fapi.value?.formData?.() || { ...formData.value };
}

defineExpose({ validate, getValues });
</script>

<template>
  <form-create
    v-model="formData"
    v-model:api="fapi"
    :rule="innerRule"
    :option="option"
    @change="onChange"
  />
</template>

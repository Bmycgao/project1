<script lang="ts" setup>
/**
 * FormCreate 运行时：完整渲染设计器 rule，合并只读/禁用与字段权限
 * 详情模块保存时通过 expose validate / getValues
 */
import type { FcFormOption, FcRule } from '../fc/types';

import { computed, ref, watch } from 'vue';

import { ElMessage } from 'element-plus';

import { prepareFcRuntimeRule } from '../fc/apply-runtime';
import { buildFcFormOption, cloneFcRule } from '../fc/types';
import { useAgreeFieldAccess } from '../use-field-access';

const props = defineProps<{
  /** 兼容旧 prop：整表单禁用 */
  disabled?: boolean;
  /** 详情是否可编辑（优先于 disabled） */
  editable?: boolean;
  /** 回填值 */
  modelValue?: Record<string, unknown>;
  /** 设计器导出的 rule */
  rule: FcRule[];
}>();

const emit = defineEmits<{
  change: [];
  'update:modelValue': [val: Record<string, unknown>];
}>();

const { fieldVisible, fieldEditable, isDetailPageEditable } =
  useAgreeFieldAccess();

const fapi = ref<any>(null);
const formData = ref<Record<string, unknown>>({ ...props.modelValue });
const option = ref<FcFormOption>(buildFcFormOption());

/** 页面是否处于可编辑态 */
const pageEditable = computed(() => {
  if (typeof props.editable === 'boolean') return props.editable;
  if (typeof props.disabled === 'boolean') return !props.disabled;
  return isDetailPageEditable();
});

/** 叠加权限与设计器 props 后的 rule */
const runtimeRule = computed(() =>
  prepareFcRuntimeRule(props.rule || [], {
    pageEditable: pageEditable.value,
    fieldVisible,
    fieldEditable,
  }),
);

const innerRule = ref<FcRule[]>(cloneFcRule(runtimeRule.value));

watch(
  runtimeRule,
  (rule) => {
    innerRule.value = cloneFcRule(rule);
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
 * 校验必填（走 FormCreate 校验）
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
    class="agree-fc-runtime"
    :rule="innerRule"
    :option="option"
    @change="onChange"
  />
</template>

<style scoped>
.agree-fc-runtime :deep(.el-form-item) {
  margin-bottom: 16px;
}

.agree-fc-runtime :deep(.el-form-item__label) {
  color: #606266;
}
</style>

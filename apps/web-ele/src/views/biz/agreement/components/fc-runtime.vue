<script lang="ts" setup>
/**
 * FormCreate 运行时：完整渲染设计器 rule，合并只读/禁用与字段权限
 * 详情模块保存时通过 expose validate / getValues
 */
import type { FcFormOption, FcRule } from '../fc/types';

import { computed, ref } from 'vue';

import { ElMessage } from 'element-plus';

import FormRuntime from '#/components/form-runtime/index.vue';

import { useAgreeFieldAccess } from '../access/use-field-access';
import { prepareFcRuntimeRule } from '../fc/apply-runtime';
import { buildFcFormOption } from '../fc/types';

const props = defineProps<{
  agreementNoEditable?: boolean;
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

const runtime = ref<InstanceType<typeof FormRuntime>>();
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
    agreementNoEditable: props.agreementNoEditable,
    pageEditable: pageEditable.value,
    fieldVisible,
    fieldEditable,
  }),
);

/**
 * 校验必填（走 FormCreate 校验）
 */
async function validate() {
  const valid = await runtime.value?.validate();
  if (!valid) ElMessage.warning('请完善必填项');
  return !!valid;
}

/**
 * 取出当前表单值
 */
function getValues(): Record<string, unknown> {
  return runtime.value?.getValues() || { ...props.modelValue };
}

defineExpose({ validate, getValues });
</script>

<template>
  <div class="agree-fc-container">
    <FormRuntime
      ref="runtime"
      :model-value="modelValue"
      class="agree-fc-runtime"
      :rule="runtimeRule"
      :option="option"
      @update:model-value="emit('update:modelValue', $event)"
      @change="emit('change')"
    />
  </div>
</template>

<style scoped>
.agree-fc-container {
  min-width: 0;
  container-type: inline-size;
}

.agree-fc-runtime :deep(.el-form-item) {
  margin-bottom: 16px;
}

.agree-fc-runtime :deep(.el-form-item__label) {
  color: #606266;
}

/* Use the module's available width, including half-width cards and preview frames. */
@container (max-width: 600px) {
  .agree-fc-runtime :deep(.el-row > .el-col) {
    flex: 0 0 100%;
    max-width: 100%;
    margin-left: 0;
  }

  .agree-fc-runtime :deep(.el-form-item__content) {
    min-width: 0;
  }

  .agree-fc-runtime :deep(.el-date-editor.el-input) {
    width: 100%;
  }
}
</style>

<script lang="ts" setup>
import type { Ref } from 'vue';

import type { FcRuleMap } from '../fc/types';
import type {
  ModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';
/**
 * 自定义表单：绑 FC 模板时用完整 FormCreate 渲染
 */
import type { AgreementDetail } from '../types';

import { computed, inject, reactive, ref, watch } from 'vue';

import { ElCol, ElForm, ElFormItem, ElMessage, ElRow } from 'element-plus';

import { cloneJson } from '../clone';
import FcRuntime from '../components/fc-runtime.vue';
import ModuleFormControl from '../components/module-form-control.vue';
import { isFcRule } from '../fc/types';
import {
  normalizeCustomFormInner,
  normalizeFieldSpan,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';
import { useAgreeFieldAccess } from '../use-field-access';

const props = defineProps<{
  detail: AgreementDetail | null;
  /** 本块是否可编辑 */
  editable?: boolean;
  /** 显示名（缺省配置时用） */
  label?: string;
  /** 自定义模块 key */
  moduleKey: string;
}>();
const emit = defineEmits<{ dirty: [] }>();

const { isDetailPageEditable: injectPageEditable } = useAgreeFieldAccess();

function isDetailPageEditable() {
  if (typeof props.editable === 'boolean') return props.editable;
  return injectPageEditable();
}

const customInners = inject<Ref<Record<string, ModuleInnerConfig>>>(
  'agreeModuleInnerCustom',
  ref({}),
);
const injectedFcRules = inject<Ref<FcRuleMap>>('agreeFcRules', ref({}));

const fcRule = computed(() => injectedFcRules.value?.[props.moduleKey]);
const useFcRuntime = computed(() => isFcRule(fcRule.value));
const fcRuntimeRef = ref<InstanceType<typeof FcRuntime> | null>(null);

const innerConfig = computed(() => {
  if (useFcRuntime.value) {
    return { sections: [] };
  }
  return normalizeCustomFormInner(
    customInners.value[props.moduleKey],
    props.label || '自定义表单',
  );
});
const sections = computed(() => resolveEnabledSections(innerConfig.value));

const model = reactive<Record<string, unknown>>({});
const dirty = ref(false);

watch(
  () => [props.detail, props.moduleKey] as const,
  () => {
    for (const k of Object.keys(model)) {
      model[k] = undefined;
    }
    const src = props.detail?.extraForms?.[props.moduleKey] || {};
    Object.assign(model, cloneJson(src));
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
  if (dirty.value) return;
  dirty.value = true;
  emit('dirty');
}

function onFcModelUpdate(val: Record<string, unknown>) {
  Object.assign(model, val);
  markDirty();
}

function isFieldShown(field: ModuleInnerFieldItem) {
  return field.enabled;
}

function visibleFields(section: ModuleInnerSection) {
  return resolveEnabledFields(section).filter((f) => isFieldShown(f));
}

async function validate() {
  if (useFcRuntime.value && fcRuntimeRef.value) {
    return await fcRuntimeRef.value.validate();
  }
  for (const sec of sections.value) {
    for (const field of visibleFields(sec)) {
      if (!field.required) continue;
      if (!String(model[field.key] ?? '').trim()) {
        ElMessage.warning(`请完善「${field.label}」`);
        return false;
      }
    }
  }
  return true;
}

function getValues() {
  const data =
    useFcRuntime.value && fcRuntimeRef.value
      ? cloneJson(fcRuntimeRef.value.getValues())
      : cloneJson(model);
  return {
    extraForms: { [props.moduleKey]: data },
  };
}

defineExpose({ validate, getValues, isDirty: () => dirty.value });
</script>

<template>
  <div>
    <FcRuntime
      v-if="useFcRuntime && fcRule"
      ref="fcRuntimeRef"
      :rule="fcRule"
      :editable="isDetailPageEditable()"
      :model-value="model"
      @change="markDirty"
      @update:model-value="onFcModelUpdate"
    />

    <template v-for="sec in sections" :key="sec.key">
      <ElForm
        class="agree-kv-form"
        :class="{ 'is-browse': !isDetailPageEditable() }"
        label-width="100px"
      >
        <ElRow :gutter="24">
          <ElCol
            v-for="field in visibleFields(sec)"
            :key="field.key"
            :xs="24"
            :md="normalizeFieldSpan(field.span)"
          >
            <ElFormItem :label="field.label" :required="!!field.required">
              <ModuleFormControl
                :field="field"
                :page-editable="isDetailPageEditable()"
                :field-editable="true"
                :model-value="model[field.key]"
                @update:model-value="
                  (v) => {
                    if (model[field.key] === v) return;
                    model[field.key] = v;
                    markDirty();
                  }
                "
              />
            </ElFormItem>
          </ElCol>
        </ElRow>
      </ElForm>
    </template>
  </div>
</template>

<style scoped>
.agree-kv-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.agree-kv-form :deep(.el-form-item__label) {
  color: #606266;
}

.agree-kv-form.is-browse :deep(.el-input__wrapper),
.agree-kv-form.is-browse :deep(.el-select__wrapper),
.agree-kv-form.is-browse :deep(.el-textarea__inner) {
  background-color: #f5f7fa;
  box-shadow: 0 0 0 1px #e4e7ed inset;
}
</style>

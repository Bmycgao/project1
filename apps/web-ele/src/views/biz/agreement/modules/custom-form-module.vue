<script lang="ts" setup>
import type { Ref } from 'vue';

import type { FcRuleMap } from '../fc/types';
import type {
  ModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';
/**
 * 配置台新建的自定义表单：字段来自 moduleInner，值落在 detail.extraForms[moduleKey]
 */
import type { AgreementDetail } from '../types';

import { computed, inject, reactive, ref, watch } from 'vue';

import { ElCol, ElForm, ElFormItem, ElMessage, ElRow } from 'element-plus';

import { cloneJson } from '../clone';
import ModuleFormControl from '../components/module-form-control.vue';
import { buildSectionFromFcForm } from '../fc/rule-to-inner';
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
/** 本块是否可改 */
function isDetailPageEditable() {
  if (typeof props.editable === 'boolean') return props.editable;
  return injectPageEditable();
}
const customInners = inject<Ref<Record<string, ModuleInnerConfig>>>(
  'agreeModuleInnerCustom',
  ref({}),
);
const injectedFcRules = inject<Ref<FcRuleMap>>('agreeFcRules', ref({}));

const innerConfig = computed(() => {
  const fcRule = injectedFcRules.value?.[props.moduleKey];
  const fcSection = isFcRule(fcRule)
    ? buildSectionFromFcForm(fcRule, props.label || '自定义表单')
    : null;
  if (fcSection) {
    return { sections: [fcSection] };
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

function isFieldShown(field: ModuleInnerFieldItem) {
  return field.enabled;
}

function visibleFields(section: ModuleInnerSection) {
  return resolveEnabledFields(section).filter((f) => isFieldShown(f));
}

async function validate() {
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
  return {
    extraForms: { [props.moduleKey]: cloneJson(model) },
  };
}

defineExpose({ validate, getValues, isDirty: () => dirty.value });
</script>

<template>
  <div>
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
                :disabled="!isDetailPageEditable()"
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

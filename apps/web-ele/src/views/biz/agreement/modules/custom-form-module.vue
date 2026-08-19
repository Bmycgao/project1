<script lang="ts" setup>
/**
 * 配置台新建的自定义表单：字段来自 moduleInner，值落在 detail.extraForms[moduleKey]
 */
import type { AgreementDetail } from '../types';
import type {
  ModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';

import { computed, inject, reactive, ref, watch, type Ref } from 'vue';

import { ElCol, ElForm, ElFormItem, ElMessage, ElRow } from 'element-plus';

import ModuleFormControl from '../components/module-form-control.vue';
import { cloneJson } from '../clone';
import {
  normalizeCustomFormInner,
  normalizeFieldSpan,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';

const props = defineProps<{
  detail: AgreementDetail | null;
  /** 自定义模块 key */
  moduleKey: string;
  /** 显示名（缺省配置时用） */
  label?: string;
}>();
const emit = defineEmits<{ dirty: [] }>();

const customInners = inject<Ref<Record<string, ModuleInnerConfig>>>(
  'agreeModuleInnerCustom',
  ref({}),
);

const innerConfig = computed(() =>
  normalizeCustomFormInner(
    customInners.value[props.moduleKey],
    props.label || '自定义表单',
  ),
);
const sections = computed(() => resolveEnabledSections(innerConfig.value));

const model = reactive<Record<string, unknown>>({});
const dirty = ref(false);

watch(
  () => [props.detail, props.moduleKey] as const,
  () => {
    Object.keys(model).forEach((k) => delete model[k]);
    const src = props.detail?.extraForms?.[props.moduleKey] || {};
    Object.assign(model, cloneJson(src));
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
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
  <div @change="markDirty" @input="markDirty">
    <template v-for="sec in sections" :key="sec.key">
      <ElForm label-width="120px">
        <ElRow :gutter="16">
          <ElCol
            v-for="field in visibleFields(sec)"
            :key="field.key"
            :xs="24"
            :md="normalizeFieldSpan(field.span)"
          >
            <ElFormItem :label="field.label">
              <ModuleFormControl
                :field="field"
                :model-value="model[field.key]"
                @update:model-value="
                  (v) => {
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

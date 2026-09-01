<script lang="ts" setup>
import type { Ref } from 'vue';

import type { FcRuleMap } from '../fc/types';
import type {
  ModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';
/**
 * 协议人口信息：绑 FC 模板时用完整 FormCreate 渲染
 */
import type { AgreementDetail, PopulationInfo } from '../types';

import { computed, inject, reactive, ref, watch } from 'vue';

import { ElCol, ElForm, ElFormItem, ElMessage, ElRow } from 'element-plus';

import { cloneJson } from '../clone';
import FcRuntime from '../components/fc-runtime.vue';
import ModuleFormControl from '../components/module-form-control.vue';
import { isFcRule } from '../fc/types';
import {
  normalizeFieldSpan,
  normalizePopulationModuleInner,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';
import { useAgreeFieldAccess } from '../use-field-access';

const props = defineProps<{
  detail: AgreementDetail | null;
  /** 是否处于本块编辑态 */
  editable?: boolean;
}>();
const emit = defineEmits<{ dirty: [] }>();

const {
  fieldVisible,
  fieldEditable,
  isDetailPageEditable: injectPageEditable,
} = useAgreeFieldAccess();

/** 本块是否可改 */
function isDetailPageEditable() {
  if (typeof props.editable === 'boolean') return props.editable;
  return injectPageEditable();
}

const injectedInner = inject<Ref<ModuleInnerConfig | null>>(
  'agreeModuleInnerPopulation',
  ref(null),
);
const injectedFcRules = inject<Ref<FcRuleMap>>('agreeFcRules', ref({}));

const fcRule = computed(() => injectedFcRules.value?.population);
const useFcRuntime = computed(() => isFcRule(fcRule.value));
const fcRuntimeRef = ref<InstanceType<typeof FcRuntime> | null>(null);

const innerConfig = computed(() => {
  if (useFcRuntime.value) {
    return { sections: [] };
  }
  return normalizePopulationModuleInner(injectedInner.value);
});
const sections = computed(() => resolveEnabledSections(innerConfig.value));

const form = reactive<PopulationInfo>({
  headName: '',
  idNo: '',
  familySize: '',
  phone: '',
  hukouAddress: '',
  remark: '',
});
const dirty = ref(false);
const model = form as unknown as Record<string, unknown>;

watch(
  () => props.detail,
  (val) => {
    if (!val) return;
    const p = val.population;
    const holder = val.rightHolders?.[0];
    Object.assign(form, {
      ...p,
      headName: p?.headName || holder?.name || val.basic?.compensatee || '',
      idNo: p?.idNo || holder?.idNo || '',
      familySize: p?.familySize || val.rightHolders?.length || '',
      phone: p?.phone || holder?.phone || '',
      hukouAddress: p?.hukouAddress || '',
      remark: p?.remark || '',
    });
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
  Object.assign(form, val);
  markDirty();
}

function isFieldShown(field: ModuleInnerFieldItem) {
  if (!field.enabled) return false;
  if (field.accessField) return fieldVisible(field.accessField);
  return true;
}

function isFieldEditable(field: ModuleInnerFieldItem) {
  if (!isDetailPageEditable()) return false;
  if (field.accessField) return fieldEditable(field.accessField);
  return true;
}

function visibleFields(section: ModuleInnerSection) {
  return resolveEnabledFields(section).filter((f) => isFieldShown(f));
}

/** 校验人口信息必填项 */
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
  const population =
    useFcRuntime.value && fcRuntimeRef.value
      ? (cloneJson(fcRuntimeRef.value.getValues()) as PopulationInfo)
      : cloneJson(form);
  return { population };
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
                :field-editable="isFieldEditable(field)"
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

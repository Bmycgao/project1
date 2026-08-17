<script lang="ts" setup>
/**
 * 协议人口信息：户维度 KV 表单（可增删字段）
 */
import type { AgreementDetail, PopulationInfo } from '../types';
import type {
  ModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';

import { computed, inject, reactive, ref, type Ref, watch } from 'vue';

import { ElCol, ElForm, ElFormItem, ElMessage, ElRow } from 'element-plus';

import ModuleFormControl from '../components/module-form-control.vue';
import { cloneJson } from '../clone';
import {
  normalizeFieldSpan,
  normalizePopulationModuleInner,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';
import { useAgreeFieldAccess } from '../use-field-access';

const props = defineProps<{ detail: AgreementDetail | null }>();
const emit = defineEmits<{ dirty: [] }>();

const { fieldVisible, fieldEditable } = useAgreeFieldAccess();

const injectedInner = inject<Ref<ModuleInnerConfig | null>>(
  'agreeModuleInnerPopulation',
  ref(null),
);

const innerConfig = computed(() =>
  normalizePopulationModuleInner(injectedInner.value),
);
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
    Object.keys(model).forEach((k) => {
      if (
        ![
          'headName',
          'idNo',
          'familySize',
          'phone',
          'hukouAddress',
          'remark',
        ].includes(k)
      ) {
        delete model[k];
      }
    });
    if (!val) return;
    const p = val.population;
    const holder = val.rightHolders?.[0];
    Object.assign(form, {
      headName: p?.headName || holder?.name || val.basic?.compensatee || '',
      idNo: p?.idNo || holder?.idNo || '',
      familySize: p?.familySize || val.rightHolders?.length || '',
      phone: p?.phone || holder?.phone || '',
      hukouAddress: p?.hukouAddress || '',
      remark: p?.remark || '',
      ...(p || {}),
    });
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
  dirty.value = true;
  emit('dirty');
}

function isFieldShown(field: ModuleInnerFieldItem) {
  if (!field.enabled) return false;
  if (field.accessField) return fieldVisible(field.accessField);
  return true;
}

function isFieldEditable(field: ModuleInnerFieldItem) {
  if (field.accessField) return fieldEditable(field.accessField);
  return true;
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
  return { population: cloneJson(form) };
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
                v-if="isFieldEditable(field)"
                :field="field"
                :model-value="model[field.key]"
                @update:model-value="
                  (v) => {
                    model[field.key] = v;
                    markDirty();
                  }
                "
              />
              <div v-else class="text-sm text-gray-800">
                {{ model[field.key] ?? '' }}
              </div>
            </ElFormItem>
          </ElCol>
        </ElRow>
      </ElForm>
    </template>
  </div>
</template>

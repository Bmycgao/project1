<script lang="ts" setup>
/**
 * 签约信息模块：签约表单 + 通讯信息
 * 子块/字段由场景 moduleInner.signing 配置驱动（可挂卸、可排序）
 */
import type { AgreementDetail, ContactInfo, SigningInfo } from '../types';
import type {
  ModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';

import { computed, inject, reactive, ref, type Ref, watch } from 'vue';

import { ElCol, ElForm, ElFormItem, ElMessage, ElRow } from 'element-plus';

import ModuleFormControl from '../components/module-form-control.vue';
import SectionCard from '../components/section-card.vue';
import { cloneJson } from '../clone';
import {
  normalizeSigningModuleInner,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';
import { useAgreeFieldAccess } from '../use-field-access';

const props = defineProps<{ detail: AgreementDetail | null }>();
const emit = defineEmits<{ dirty: [] }>();

const { fieldVisible, fieldEditable, fieldFormat } = useAgreeFieldAccess();

/** 详情页注入的签约内部配置 */
const injectedSigningInner = inject<Ref<ModuleInnerConfig | null>>(
  'agreeModuleInnerSigning',
  ref(null),
);

const innerConfig = computed(() =>
  normalizeSigningModuleInner(injectedSigningInner.value),
);

const sections = computed(() => resolveEnabledSections(innerConfig.value));

const signing = reactive<SigningInfo>({
  houseAddress: '',
  compensateMethod: '',
  decorateEval: '否',
  hasMortgage: '否',
  mortgagee: '',
  debtAmount: 0,
  hasSeal: '否',
  sealCourt: '',
  signDate: '',
});

const contact = reactive<ContactInfo>({
  address: '',
  contact: '',
  phone: '',
  emergency: '',
});

const dirty = ref(false);

watch(
  () => props.detail,
  (val) => {
    if (!val) return;
    Object.assign(signing, cloneJson(val.signing));
    Object.assign(contact, cloneJson(val.contact));
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
  dirty.value = true;
  emit('dirty');
}

/**
 * 取子块对应的数据对象
 * @param sectionKey 子块 key
 */
function modelOf(sectionKey: string): Record<string, unknown> {
  if (sectionKey === 'contact') {
    return contact as unknown as Record<string, unknown>;
  }
  return signing as unknown as Record<string, unknown>;
}

/**
 * 字段最终是否展示：配置启用 ∩ 字段权限
 * @param field 字段配置
 */
function isFieldShown(field: ModuleInnerFieldItem) {
  if (!field.enabled) return false;
  if (field.accessField) {
    return fieldVisible(field.accessField);
  }
  return true;
}

/**
 * 字段是否可编辑
 * @param field 字段配置
 */
function isFieldEditable(field: ModuleInnerFieldItem) {
  if (field.accessField) {
    return fieldEditable(field.accessField);
  }
  return true;
}

/**
 * 栅格占比
 * @param field 字段
 */
function colSpan(field: ModuleInnerFieldItem) {
  const n = Number(field.span);
  if ([8, 12, 16, 24].includes(n)) return n;
  return 12;
}

/**
 * 是否展示格式化预览（金额/日期）
 * @param field 字段
 */
function showFormatPreview(field: ModuleInnerFieldItem) {
  return field.accessField === 'debtAmount' || field.accessField === 'signDate';
}

/**
 * 读字段值
 * @param sectionKey 子块
 * @param key 字段
 */
function readValue(sectionKey: string, key: string) {
  return modelOf(sectionKey)[key];
}

/**
 * 写字段值
 * @param sectionKey 子块
 * @param key 字段
 * @param val 值
 */
function writeValue(sectionKey: string, key: string, val: string | number) {
  modelOf(sectionKey)[key] = val;
  markDirty();
}

/**
 * 某子块启用且可见的字段
 * @param section 子块
 */
function visibleFields(section: ModuleInnerSection) {
  return resolveEnabledFields(section).filter((f) => isFieldShown(f));
}

async function validate() {
  for (const sec of sections.value) {
    for (const field of visibleFields(sec)) {
      if (!field.required) continue;
      const raw = readValue(sec.key, field.key);
      const text = raw == null ? '' : String(raw).trim();
      if (!text) {
        ElMessage.warning(`请完善「${field.label}」`);
        return false;
      }
    }
  }
  return true;
}

function getValues() {
  return {
    signing: cloneJson(signing),
    contact: cloneJson(contact),
  };
}

function isDirty() {
  return dirty.value;
}

defineExpose({ validate, getValues, isDirty });
</script>

<template>
  <div @change="markDirty" @input="markDirty">
    <template v-for="sec in sections" :key="sec.key">
      <SectionCard :title="sec.label" :subtitle="sec.subtitle">
        <ElForm
          :label-width="sec.key === 'contact' ? '120px' : '140px'"
          class="max-w-4xl"
        >
          <ElRow :gutter="16">
            <ElCol
              v-for="field in visibleFields(sec)"
              :key="field.key"
              :xs="24"
              :md="colSpan(field)"
            >
              <ElFormItem :label="field.label">
                <template v-if="isFieldEditable(field)">
                  <ModuleFormControl
                    :field="field"
                    :model-value="readValue(sec.key, field.key)"
                    @update:model-value="
                      (v) => writeValue(sec.key, field.key, v)
                    "
                  />
                  <div
                    v-if="
                      showFormatPreview(field) && field.accessField
                    "
                    class="mt-1 text-xs text-gray-400"
                  >
                    展示预览：{{
                      fieldFormat(
                        field.accessField,
                        readValue(sec.key, field.key),
                      )
                    }}
                  </div>
                </template>
                <div v-else class="text-sm text-gray-800">
                  <template v-if="showFormatPreview(field) && field.accessField">
                    {{
                      fieldFormat(
                        field.accessField,
                        readValue(sec.key, field.key),
                      )
                    }}
                  </template>
                  <template v-else>
                    {{ readValue(sec.key, field.key) ?? '' }}
                  </template>
                </div>
              </ElFormItem>
            </ElCol>
          </ElRow>
        </ElForm>
      </SectionCard>
    </template>

    <div
      v-if="!sections.length"
      class="py-8 text-center text-xs text-gray-400"
    >
      当前场景未挂载签约信息子块，请在页面配置「签约信息 · 内部字段」中启用
    </div>
  </div>
</template>

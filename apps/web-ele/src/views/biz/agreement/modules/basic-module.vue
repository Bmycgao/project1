<script lang="ts" setup>
/**
 * 基础信息：协议头 KV 表单（order + span 驱动栅格）
 * 配置台自定义表格仍渲染在表单下方，数据落在 detail.basicTables
 */
import type {
  AgreementDetail,
  BasicInfo,
  BasicTableRow,
} from '../types';
import type {
  BasicModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';

import { computed, inject, reactive, ref, type Ref, watch } from 'vue';

import { ElButton, ElCol, ElForm, ElFormItem, ElInput, ElMessage, ElRow, ElTable, ElTableColumn } from 'element-plus';

import ModuleFormControl from '../components/module-form-control.vue';
import SectionCard from '../components/section-card.vue';
import { cloneJson } from '../clone';
import {
  isCustomBasicSection,
  normalizeBasicModuleInner,
  normalizeFieldSpan,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';
import { useAgreeFieldAccess } from '../use-field-access';

const props = defineProps<{ detail: AgreementDetail | null }>();
const emit = defineEmits<{ dirty: [] }>();

const { fieldVisible, fieldEditable, fieldFormat } = useAgreeFieldAccess();

const injectedBasicInner = inject<Ref<BasicModuleInnerConfig | null>>(
  'agreeModuleInnerBasic',
  ref(null),
);

const innerConfig = computed(() =>
  normalizeBasicModuleInner(injectedBasicInner.value),
);

const sections = computed(() => resolveEnabledSections(innerConfig.value));
const formSections = computed(() =>
  sections.value.filter((s) => !isCustomBasicSection(s)),
);
const customSections = computed(() =>
  sections.value.filter((s) => isCustomBasicSection(s)),
);

const form = reactive<BasicInfo>({
  agreementNo: '',
  agreementName: '',
  department: '',
  acquirer: '',
  compensatee: '',
  amount: '',
  signDate: '',
  statusValue: '',
  remark: '',
});

const basicTables = reactive<Record<string, BasicTableRow[]>>({});
const dirty = ref(false);

watch(
  () => props.detail,
  (val) => {
    const next = emptyBasic(val);
    Object.assign(form, next);
    const tables = val?.basicTables ? cloneJson(val.basicTables) : {};
    Object.keys(basicTables).forEach((k) => delete basicTables[k]);
    Object.assign(basicTables, tables);
    dirty.value = false;
  },
  { immediate: true },
);

watch(
  customSections,
  (secs) => {
    for (const sec of secs) {
      if (!Array.isArray(basicTables[sec.key])) {
        basicTables[sec.key] = [];
      }
    }
  },
  { immediate: true },
);

/**
 * 从详情拼协议头；缺 basic 时用顶栏字段兜底
 * @param val 详情
 */
function emptyBasic(val: AgreementDetail | null): BasicInfo {
  if (!val) {
    return {
      agreementNo: '',
      agreementName: '',
      department: '',
      acquirer: '',
      compensatee: '',
      amount: '',
      signDate: '',
      statusValue: '',
      remark: '',
    };
  }
  const b = val.basic;
  return {
    ...(b || {}),
    agreementNo: b?.agreementNo || val.agreementNo || '',
    agreementName: b?.agreementName || '',
    department: b?.department || '',
    acquirer: b?.acquirer || '',
    compensatee: b?.compensatee || val.rightHolders?.[0]?.name || '',
    amount: b?.amount ?? val.compensation?.amount ?? '',
    signDate: b?.signDate || val.signing?.signDate || '',
    statusValue: b?.statusValue || val.statusValue || '',
    remark: b?.remark || val.compensation?.remark || '',
  };
}

function markDirty() {
  dirty.value = true;
  emit('dirty');
}

const model = form as unknown as Record<string, unknown>;

function isFieldShown(field: ModuleInnerFieldItem) {
  if (!field.enabled) return false;
  if (field.accessField) return fieldVisible(field.accessField);
  return true;
}

function isFieldEditable(field: ModuleInnerFieldItem) {
  if (field.accessField) return fieldEditable(field.accessField);
  return true;
}

function colSpan(field: ModuleInnerFieldItem) {
  return normalizeFieldSpan(field.span);
}

function visibleFields(section: ModuleInnerSection) {
  return resolveEnabledFields(section).filter((f) => isFieldShown(f));
}

function showFormatPreview(field: ModuleInnerFieldItem) {
  return field.accessField === 'amount' || field.accessField === 'signDate';
}

function addCustomRow(section: ModuleInnerSection) {
  const row: BasicTableRow = { id: `bt-${Date.now()}` };
  for (const f of resolveEnabledFields(section)) {
    if (f.key === '_selection') continue;
    row[f.key] = '';
  }
  if (!basicTables[section.key]) basicTables[section.key] = [];
  basicTables[section.key]!.push(row);
  markDirty();
}

function removeCustomRow(sectionKey: string, index: number) {
  basicTables[sectionKey]?.splice(index, 1);
  markDirty();
}

function customRows(sectionKey: string) {
  return basicTables[sectionKey] || [];
}

function setCellValue(row: Record<string, unknown>, key: string, val: string) {
  row[key] = val;
  markDirty();
}

async function validate() {
  for (const sec of formSections.value) {
    for (const field of visibleFields(sec)) {
      if (!field.required) continue;
      const text = String(model[field.key] ?? '').trim();
      if (!text) {
        ElMessage.warning(`请完善「${field.label}」`);
        return false;
      }
    }
  }
  return true;
}

function getValues() {
  const basic = cloneJson(form);
  return {
    basic,
    agreementNo: basic.agreementNo,
    statusValue: basic.statusValue,
    basicTables: cloneJson(basicTables),
  };
}

function isDirty() {
  return dirty.value;
}

defineExpose({ validate, getValues, isDirty });
</script>

<template>
  <div @change="markDirty" @input="markDirty">
    <template v-for="sec in formSections" :key="sec.key">
      <ElForm label-width="120px">
        <ElRow :gutter="16">
          <ElCol
            v-for="field in visibleFields(sec)"
            :key="field.key"
            :xs="24"
            :md="colSpan(field)"
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
                <template v-if="showFormatPreview(field) && field.accessField">
                  {{ fieldFormat(field.accessField, model[field.key]) }}
                </template>
                <template v-else>{{ model[field.key] ?? '' }}</template>
              </div>
              <div
                v-if="
                  isFieldEditable(field) &&
                  showFormatPreview(field) &&
                  field.accessField
                "
                class="mt-1 text-xs text-gray-400"
              >
                展示预览：{{
                  fieldFormat(field.accessField, model[field.key])
                }}
              </div>
            </ElFormItem>
          </ElCol>
        </ElRow>
      </ElForm>
    </template>

    <template v-for="sec in customSections" :key="sec.key">
      <SectionCard :title="sec.label" :subtitle="sec.subtitle">
        <template #extra>
          <ElButton size="small" type="primary" link @click="addCustomRow(sec)">
            新增
          </ElButton>
        </template>
        <ElTable :data="customRows(sec.key)" border size="small" row-key="id">
          <ElTableColumn
            v-for="col in resolveEnabledFields(sec)"
            :key="col.key"
            :label="col.label"
            :min-width="col.minWidth || 100"
          >
            <template #default="{ row }">
              <ElInput
                size="small"
                :placeholder="col.placeholder || ''"
                :model-value="
                  String((row as Record<string, unknown>)[col.key] ?? '')
                "
                @update:model-value="
                  (v: string) =>
                    setCellValue(row as Record<string, unknown>, col.key, v)
                "
              />
            </template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="72" fixed="right" align="center">
            <template #default="{ $index }">
              <ElButton
                type="danger"
                link
                size="small"
                @click="removeCustomRow(sec.key, $index)"
              >
                删除
              </ElButton>
            </template>
          </ElTableColumn>
        </ElTable>
        <div
          v-if="!customRows(sec.key).length"
          class="py-3 text-center text-xs text-gray-400"
        >
          暂无数据，请点击右上角「新增」添加行
        </div>
      </SectionCard>
    </template>

    <div
      v-if="!formSections.length && !customSections.length"
      class="py-8 text-center text-xs text-gray-400"
    >
      当前场景未挂载基础信息字段，请在页面配置中启用
    </div>
  </div>
</template>

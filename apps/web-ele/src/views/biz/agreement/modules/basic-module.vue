<script lang="ts" setup>
import type { Ref } from 'vue';

import type {
  BasicModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';
/**
 * 基础信息：按场景 moduleInner 栅格渲染；自定义表格子块落在 detail.basicTables
 */
import type { AgreementDetail, BasicInfo, BasicTableRow } from '../types';

import { computed, inject, reactive, ref, watch } from 'vue';

import {
  ElButton,
  ElCol,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElRow,
  ElTable,
  ElTableColumn,
} from 'element-plus';

import { cloneJson } from '../clone';
import ModuleFormControl from '../components/module-form-control.vue';
import SectionCard from '../components/section-card.vue';
import {
  isCustomBasicSection,
  normalizeBasicModuleInner,
  normalizeFieldSpan,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';
import { useAgreeFieldAccess } from '../use-field-access';

const props = defineProps<{
  detail: AgreementDetail | null;
  /** 是否处于本块编辑态（由详情壳块级编辑控制） */
  editable?: boolean;
}>();
const emit = defineEmits<{ dirty: [] }>();

const {
  fieldVisible,
  fieldEditable,
  isDetailPageEditable: injectPageEditable,
} = useAgreeFieldAccess();

/** 本块是否可改：优先 props.editable */
function isDetailPageEditable() {
  if (typeof props.editable === 'boolean') return props.editable;
  return injectPageEditable();
}

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
    for (const k of Object.keys(basicTables)) {
      basicTables[k] = tables[k] ?? [];
    }
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
    ...b,
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
  if (dirty.value) return;
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
  if (!isDetailPageEditable()) return false;
  if (field.accessField) return fieldEditable(field.accessField);
  return true;
}

function colSpan(field: ModuleInnerFieldItem) {
  return normalizeFieldSpan(field.span);
}

function visibleFields(section: ModuleInnerSection) {
  return resolveEnabledFields(section).filter((f) => isFieldShown(f));
}

function addCustomRow(section: ModuleInnerSection) {
  const row: BasicTableRow = { id: `bt-${Date.now()}` };
  for (const f of resolveEnabledFields(section)) {
    if (f.key === '_selection') continue;
    row[f.key] = '';
  }
  if (!basicTables[section.key]) basicTables[section.key] = [];
  const list = basicTables[section.key] ?? [];
  list.push(row);
  basicTables[section.key] = list;
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

/**
 * 浏览态单元格文案
 * @param row 表格行
 * @param key 列字段
 */
function displayCustomCell(row: unknown, key: string) {
  const rec = (row ?? {}) as Record<string, unknown>;
  const text = String(rec[key] ?? '');
  return text || '—';
}

/** 校验基础信息必填项 */
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

/** 取出本块表单与自定义子表数据 */
async function getValues() {
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
  <div>
    <!-- 浏览/编辑共用三列表单栅格：浏览为标签+文字，编辑换成控件 -->
    <template v-for="sec in formSections" :key="sec.key">
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
            :md="colSpan(field)"
          >
            <ElFormItem :label="field.label" :required="!!field.required">
              <ModuleFormControl
                :field="field"
                :disabled="!isDetailPageEditable() || !isFieldEditable(field)"
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

    <template v-for="sec in customSections" :key="sec.key">
      <SectionCard :title="sec.label" :subtitle="sec.subtitle">
        <template v-if="isDetailPageEditable()" #extra>
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
            show-overflow-tooltip
          >
            <template #default="{ row }">
              <ElInput
                v-if="isDetailPageEditable()"
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
              <span v-else>{{ displayCustomCell(row, col.key) }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn
            v-if="isDetailPageEditable()"
            label="操作"
            width="72"
            fixed="right"
            align="center"
          >
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
          暂无数据
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

<style scoped>
.agree-kv-form {
  padding-top: 4px;
}

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

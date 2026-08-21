<script lang="ts" setup>
import type { Ref } from 'vue';

import type { EpicPageSchema } from '../epic/types';
import type { FcRuleMap } from '../fc/types';
import type {
  BasicModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';
/**
 * 基础信息：优先 FormCreate 按场景 fcRules.basic 渲染；否则 Epic / 旧栅格
 * 自定义表格子块仍落在 detail.basicTables
 */
import type { AgreementDetail, BasicInfo, BasicTableRow } from '../types';

import { computed, inject, nextTick, reactive, ref, watch } from 'vue';

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
import { buildDefaultBasicEpicPageSchema } from '../epic/basic-page-schema';
import { cloneEpicPageSchema, isEpicPageSchema } from '../epic/types';
import { buildDefaultBasicFcRule } from '../fc/default-rules';
import { isFcRule } from '../fc/types';
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
/** 场景级 Epic 表单 Schema（历史兼容） */
const injectedEpicSchema = inject<Ref<EpicPageSchema | null>>(
  'agreeEpicBasicSchema',
  ref(null),
);
/** 场景级 FormCreate rule */
const injectedFcRules = inject<Ref<FcRuleMap>>('agreeFcRules', ref({}));

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

/** 实际用于渲染的 Epic Schema（缺省用内置模板） */
const epicPageSchema = computed<EpicPageSchema>(() => {
  if (isEpicPageSchema(injectedEpicSchema.value)) {
    return cloneEpicPageSchema(injectedEpicSchema.value);
  }
  return buildDefaultBasicEpicPageSchema();
});

/** FormCreate 优先；无 rule 时再走 Epic */
const fcRule = computed(() =>
  isFcRule(injectedFcRules.value?.basic)
    ? injectedFcRules.value.basic
    : buildDefaultBasicFcRule(),
);
const useFc = computed(() => isFcRule(fcRule.value));

/** 有注入 Epic 或默认模板时走 EBuilder */
const useEpic = computed(
  () => !useFc.value && isEpicPageSchema(epicPageSchema.value),
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
const fcRef = ref<null | {
  getValues: () => Record<string, unknown>;
  validate: () => Promise<boolean>;
}>(null);
const epicBuilderRef = ref<null | {
  getData: () => Promise<Record<string, unknown>>;
  setData: (data: Record<string, unknown>) => void;
  validate: () => Promise<Record<string, unknown>>;
}>(null);

watch(
  () => props.detail,
  async (val) => {
    const next = emptyBasic(val);
    Object.assign(form, next);
    const tables = val?.basicTables ? cloneJson(val.basicTables) : {};
    for (const k of Object.keys(basicTables)) {
      basicTables[k] = tables[k] ?? [];
    }
    Object.assign(basicTables, tables);
    dirty.value = false;
    await nextTick();
    syncEpicFormData();
  },
  { immediate: true },
);

watch(
  epicPageSchema,
  async () => {
    await nextTick();
    syncEpicFormData();
  },
  { deep: true },
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
 * 把当前 form 回写到 EBuilder
 */
function syncEpicFormData() {
  if (!useEpic.value || !epicBuilderRef.value) return;
  try {
    epicBuilderRef.value.setData({ ...form } as Record<string, unknown>);
  } catch {
    // 设计器未就绪时忽略
  }
}

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

/**
 * 从 EBuilder 拉表单值合并进 form
 */
async function pullEpicIntoForm() {
  if (!epicBuilderRef.value) return;
  const data = await epicBuilderRef.value.getData();
  Object.assign(form, data || {});
}

async function validate() {
  if (useFc.value && fcRef.value) {
    return fcRef.value.validate();
  }
  if (useEpic.value && epicBuilderRef.value) {
    try {
      const data = await epicBuilderRef.value.validate();
      Object.assign(form, data || {});
      return true;
    } catch {
      ElMessage.warning('请完善基础信息必填项');
      return false;
    }
  }
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

async function getValues() {
  if (useFc.value && fcRef.value) {
    Object.assign(form, fcRef.value.getValues() || {});
  } else if (useEpic.value && epicBuilderRef.value) {
    await pullEpicIntoForm();
  }
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

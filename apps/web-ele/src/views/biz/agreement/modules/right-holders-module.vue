<script lang="ts" setup>
/**
 * 权利人表格模块（详情 Tab）
 * 列配置来自 moduleInner.rightHolders
 */
import type { AgreementDetail, RightHolderRow } from '../types';
import type {
  ModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';

import { computed, inject, ref, type Ref, watch } from 'vue';

import {
  ElButton,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
} from 'element-plus';

import SectionCard from '../components/section-card.vue';
import { cloneJson } from '../clone';
import {
  normalizeRightHoldersModuleInner,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';
import { useAgreeFieldAccess } from '../use-field-access';

const props = defineProps<{ detail: AgreementDetail | null }>();
const emit = defineEmits<{ dirty: [] }>();

const { fieldVisible, fieldEditable } = useAgreeFieldAccess();

const injectedInner = inject<Ref<ModuleInnerConfig | null>>(
  'agreeModuleInnerRightHolders',
  ref(null),
);

const innerConfig = computed(() =>
  normalizeRightHoldersModuleInner(injectedInner.value),
);

const section = computed(() => {
  const secs = resolveEnabledSections(innerConfig.value);
  return secs.find((s) => s.key === 'rightHolders') || secs[0] || null;
});

const rows = ref<RightHolderRow[]>([]);
const dirty = ref(false);

watch(
  () => props.detail,
  (val) => {
    rows.value = val ? cloneJson(val.rightHolders) : [];
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
  dirty.value = true;
  emit('dirty');
}

function columnVisible(field: ModuleInnerFieldItem) {
  if (!field.enabled) return false;
  if (field.accessField) return fieldVisible(field.accessField);
  return true;
}

function columnEditable(field: ModuleInnerFieldItem) {
  if (field.accessField) return fieldEditable(field.accessField);
  return true;
}

function sectionFields(sec: ModuleInnerSection) {
  return resolveEnabledFields(sec).filter((f) => columnVisible(f));
}

function isSelectCol(field: ModuleInnerFieldItem) {
  const cell = field.cellType || field.controlType;
  return cell === 'select' || cell === 'yesno';
}

function addRow() {
  if (section.value?.tableOptions?.allowAdd === false) return;
  rows.value.push({
    id: `rh-${Date.now()}`,
    agreementNo: props.detail?.agreementNo || '',
    name: '',
    idNo: '',
    phone: '',
  });
  markDirty();
}

function removeRow(index: number) {
  if (section.value?.tableOptions?.allowRemove === false) return;
  const minRows = section.value?.tableOptions?.minRows ?? 1;
  if (rows.value.length <= minRows) {
    ElMessage.warning(`至少保留 ${minRows} 位权利人`);
    return;
  }
  rows.value.splice(index, 1);
  markDirty();
}

function cellValue(row: RightHolderRow, key: string) {
  return (row as unknown as Record<string, unknown>)[key];
}

function setCell(row: RightHolderRow, key: string, val: string) {
  (row as unknown as Record<string, unknown>)[key] = val;
  markDirty();
}

async function validate() {
  if (!section.value) return true;
  const required = sectionFields(section.value).filter((f) => f.required);
  for (const col of required) {
    if (rows.value.some((r) => !String(cellValue(r, col.key) ?? '').trim())) {
      ElMessage.warning(`请填写「${col.label}」`);
      return false;
    }
  }
  return true;
}

function getValues() {
  return { rightHolders: cloneJson(rows.value) };
}

function isDirty() {
  return dirty.value;
}

defineExpose({ validate, getValues, isDirty });
</script>

<template>
  <div @input="markDirty">
    <SectionCard
      v-if="section"
      :title="section.label"
      :subtitle="section.subtitle"
    >
      <template #extra>
        <ElButton
          v-if="section.tableOptions?.allowAdd !== false"
          size="small"
          type="primary"
          link
          @click="addRow"
        >
          新增
        </ElButton>
      </template>
      <ElTable :data="rows" border size="small" row-key="id">
        <ElTableColumn
          v-for="col in sectionFields(section)"
          :key="col.key"
          :label="col.label"
          :min-width="col.minWidth || 100"
        >
          <template #default="{ row }">
            <ElSelect
              v-if="isSelectCol(col)"
              size="small"
              class="w-full"
              :disabled="!columnEditable(col)"
              :model-value="String(cellValue(row, col.key) ?? '')"
              @update:model-value="(v: string) => setCell(row, col.key, v)"
            >
              <ElOption
                v-for="opt in col.options || [
                  { label: '是', value: '是' },
                  { label: '否', value: '否' },
                ]"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </ElSelect>
            <ElInput
              v-else
              size="small"
              :disabled="!columnEditable(col)"
              :placeholder="col.placeholder"
              :model-value="String(cellValue(row, col.key) ?? '')"
              @update:model-value="(v: string) => setCell(row, col.key, v)"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn
          v-if="section.tableOptions?.allowRemove !== false"
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
              @click="removeRow($index)"
            >
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </SectionCard>
    <div v-else class="py-8 text-center text-xs text-gray-400">
      当前场景未挂载权利人列，请在页面配置中启用
    </div>
  </div>
</template>
